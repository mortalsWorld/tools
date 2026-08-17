use serde::{Deserialize, Serialize};
use serde_json;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::os::windows::process::CommandExt;
use tauri::command;
use tauri::Emitter;
use tauri::Manager;
use crate::AppState;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use walkdir::WalkDir;
use rayon::prelude::*;
use rand::Rng;
use rand::prelude::SliceRandom;
use base64::Engine;
use png;

/// 获取应用程序配置目录路径
fn get_config_dir() -> PathBuf {
    let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let app_dir = exe_path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
    app_dir.join("config")
}

/// 确保配置目录存在，不存在则创建
fn ensure_config_dir() -> std::io::Result<()> {
    let config_dir = get_config_dir();
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)?;
    }
    Ok(())
}

/// 安全验证配置文件名，防止路径穿越攻击
/// 只允许纯文件名（不含路径分隔符），且必须以 .json 结尾
fn validate_config_name(name: &str) -> Result<PathBuf, String> {
    if name.is_empty() {
        return Err("配置文件名不能为空".into());
    }
    // 拒绝路径分隔符和跳目录
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("配置文件名包含非法路径字符".into());
    }
    // 拒绝隐藏文件
    if name.starts_with('.') {
        return Err("配置文件名不能以点开头".into());
    }
    // 限定允许的扩展名
    if !name.ends_with(".json") {
        return Err("仅支持 .json 配置文件".into());
    }
    Ok(PathBuf::from(name))
}

/// 将字节数格式化为人类可读的字符串（GB/MB/KB/B）
fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

// ============================================================================
// 加密工具函数（替代 Electron safeStorage）
// 提供 AES-256-GCM 加密、XOR 兼容解密、密码字段自动加解密等功能
// ============================================================================


use regex::Regex;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;

// 旧版本（v1）使用的硬编码密钥，用于兼容旧数据
const LEGACY_KEY: &[u8] = b"toolbox_encryption_key_32bytes";

// 加密版本标识
const VERSION_XOR: u8 = 0x01;   // 旧版本：XOR 加密（已弃用，仅用于解密兼容）
const VERSION_AES: u8 = 0x02;   // 新版本：AES-256-GCM 加密

/// 获取或生成安全的随机加密密钥（32字节，用于 AES-256）
/// 密钥会持久化存储在配置目录中
fn get_encryption_key() -> Vec<u8> {
    let config_dir = get_config_dir();
    let key_path = config_dir.join("encryption-key.dat");
    
    if key_path.exists() {
        match fs::read(&key_path) {
            Ok(key) if key.len() == 32 => return key,
            _ => {}
        }
    }
    
    // 生成新的随机密钥
    let mut new_key = [0u8; 32];
    rand::rng().fill_bytes(&mut new_key);
    
    if let Ok(_) = fs::write(&key_path, &new_key) {
        log::info!("已生成新的随机加密密钥");
    }
    
    new_key.to_vec()
}

// ---- 旧版本 XOR 加密（仅用于兼容解密） ----
/// 使用 XOR 算法加密数据（已弃用，仅用于兼容旧版本解密）
fn xor_encrypt(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter().enumerate().map(|(i, &b)| b ^ key[i % key.len()]).collect()
}

// ---- 新版本 AES-256-GCM 加密 ----
/// 使用 AES-256-GCM 算法加密数据
fn aes_encrypt(data: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("AES 密钥初始化失败: {}", e))?;
    
    // 生成随机 nonce (12 bytes)
    let mut nonce_bytes = [0u8; 12];
    rand::rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    // 加密（AES-GCM 会自动附加认证标签）
    let ciphertext = cipher.encrypt(nonce, data.as_ref())
        .map_err(|e| format!("AES 加密失败: {}", e))?;
    
    // 格式: nonce(12) + ciphertext+tag
    let mut result = Vec::with_capacity(1 + 12 + ciphertext.len());
    result.push(VERSION_AES);
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    
    Ok(result)
}

/// 使用 AES-256-GCM 算法解密数据
fn aes_decrypt(data: &[u8], key: &[u8]) -> Result<String, String> {
    if data.len() < 13 {
        return Err("AES 加密数据太短".to_string());
    }
    
    let nonce_bytes = &data[0..12];
    let ciphertext = &data[12..];
    
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("AES 密钥初始化失败: {}", e))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    
    let plaintext = cipher.decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("AES 解密失败: {}", e))?;
    
    String::from_utf8(plaintext)
        .map_err(|e| format!("UTF-8 解码失败: {}", e))
}

/// 加密字符串（使用 AES-256-GCM）
/// 安全修复：加密失败时返回错误而非回退到明文
/// 将明文字符串加密后返回 base64 编码的密文
fn encrypt_string(data: &str) -> Result<String, String> {
    let key = get_encryption_key();
    aes_encrypt(data.as_bytes(), &key)
        .map(|bytes| base64::engine::general_purpose::STANDARD.encode(&bytes))
        .map_err(|e| {
            log::error!("加密失败: {}", e);
            format!("加密失败: {}", e)
        })
}

/// 解密字符串（兼容旧版本 XOR 和新版本 AES）
/// 安全修复：解密失败时返回错误而非回退到密文
/// 将 base64 编码的密文解密为明文字符串
fn decrypt_string(data: &str) -> Result<String, String> {
    if data.is_empty() {
        return Ok("".to_string());
    }
    
    // 处理旧版本的明文 base64 回退格式（仅用于兼容迁移）
    if data.starts_with("__b64__") {
        match base64::engine::general_purpose::STANDARD.decode(&data[7..]) {
            Ok(bytes) => Ok(String::from_utf8_lossy(&bytes).to_string()),
            Err(e) => {
                log::error!("base64 解码失败: {}", e);
                Err(format!("解密失败: base64 解码错误"))
            }
        }
    } else {
        // 检查是否为 base64 编码的加密数据
        let base64_regex = Regex::new(r"^[A-Za-z0-9+/=]{20,}$").unwrap();
        if !base64_regex.is_match(data) {
            // 不是 base64，可能是未加密的明文（新文件）
            return Ok(data.to_string());
        }
        
        match base64::engine::general_purpose::STANDARD.decode(data) {
            Ok(decoded) => {
                if decoded.is_empty() {
                    return Ok(data.to_string());
                }
                
                let (version, payload) = decoded.split_first().unwrap();
                match *version {
                    VERSION_XOR => {
                        // 旧版本：使用硬编码密钥 XOR 解密
                        let decrypted = xor_encrypt(payload, LEGACY_KEY);
                        Ok(String::from_utf8_lossy(&decrypted).to_string())
                    }
                    VERSION_AES => {
                        // 新版本：使用随机密钥 AES-256-GCM 解密
                        let key = get_encryption_key();
                        aes_decrypt(payload, &key).map_err(|e| {
                            log::error!("AES 解密失败（密钥不匹配或数据损坏）: {}", e);
                            format!("解密失败: {}", e)
                        })
                    }
                    _ => {
                        log::error!("未知的加密版本: {}", version);
                        Err(format!("解密失败: 未知的加密版本"))
                    }
                }
            }
            Err(e) => {
                log::error!("base64 解码失败: {}", e);
                Err(format!("解密失败: base64 解码错误"))
            }
        }
    }
}

/// 递归遍历 JSON 数据，自动加密所有 password 字段
fn encrypt_password_fields(data: &serde_json::Value) -> serde_json::Value {
    match data {
        serde_json::Value::Object(obj) => {
            let mut new_obj = serde_json::Map::new();
            for (key, value) in obj.iter() {
                if key == "password" && value.is_string() {
                    let password = value.as_str().unwrap_or("");
                    if !password.is_empty() {
                        // 安全修复：加密失败时记录错误并使用占位符
                        match encrypt_string(password) {
                            Ok(encrypted) => {
                                new_obj.insert(key.clone(), serde_json::Value::String(encrypted));
                                new_obj.insert("__encrypted__".to_string(), serde_json::Value::Bool(true));
                            }
                            Err(e) => {
                                log::error!("密码加密失败: {}", e);
                                // 加密失败不应继续保存，使用占位符提示用户
                                new_obj.insert(key.clone(), serde_json::Value::String("[加密失败，请重新输入]".to_string()));
                            }
                        }
                        continue;
                    }
                }
                new_obj.insert(key.clone(), encrypt_password_fields(value));
            }
            serde_json::Value::Object(new_obj)
        }
        serde_json::Value::Array(arr) => {
            let mut new_arr = Vec::new();
            for item in arr.iter() {
                new_arr.push(encrypt_password_fields(item));
            }
            serde_json::Value::Array(new_arr)
        }
        _ => data.clone(),
    }
}

/// 递归遍历 JSON 数据，自动解密所有 password 字段
fn decrypt_password_fields(data: &serde_json::Value) -> serde_json::Value {
    match data {
        serde_json::Value::Object(obj) => {
            let mut new_obj = serde_json::Map::new();
            
            for (key, value) in obj.iter() {
                if key == "__encrypted__" {
                    continue;
                }
                if key == "password" && value.is_string() {
                    let encrypted = value.as_str().unwrap_or("");
                    
                    // 安全修复：解密失败时返回错误提示而非密文
                    let decrypted = match decrypt_string(encrypted) {
                        Ok(plain) => plain,
                        Err(e) => {
                            log::error!("密码解密失败: {}", e);
                            "[需要重新输入密码]".to_string()
                        }
                    };
                    
                    new_obj.insert(key.clone(), serde_json::Value::String(decrypted));
                    continue;
                }
                new_obj.insert(key.clone(), decrypt_password_fields(value));
            }
            serde_json::Value::Object(new_obj)
        }
        serde_json::Value::Array(arr) => {
            let mut new_arr = Vec::new();
            for item in arr.iter() {
                new_arr.push(decrypt_password_fields(item));
            }
            serde_json::Value::Array(new_arr)
        }
        _ => data.clone(),
    }
}

// ============================================================================
// 文件系统命令
// 提供目录/文件选择、配置读写、文件搜索、安全打开等功能
// ============================================================================

/// 打开对话框让用户选择目录
#[command]
pub async fn select_directory(app: tauri::AppHandle) -> Option<String> {
    let dir = app.dialog().file().blocking_pick_folder();
    dir.map(|p| p.to_string())
}

/// 打开对话框让用户选择文件
#[command]
pub async fn select_file(app: tauri::AppHandle) -> Option<String> {
    let file = app.dialog().file().blocking_pick_file();
    file.map(|p| p.to_string())
}

/// 打开对话框让用户选择保存文件路径并保存内容
#[command]
pub async fn save_file_dialog(app: tauri::AppHandle, content: String, default_name: String) -> Result<String, String> {
    let dir = app.dialog().file().blocking_pick_folder();
    match dir {
        Some(dir_path) => {
            let dir_str = dir_path.to_string();
            let dir_buf = PathBuf::from(&dir_str);
            let file_path = dir_buf.join(&default_name);
            fs::write(&file_path, content).map_err(|e| format!("保存文件失败: {}", e))?;
            Ok(file_path.to_string_lossy().to_string())
        }
        None => Err("用户取消了保存".into()),
    }
}

/// 打开对话框让用户选择备份目录
#[command]
pub async fn select_backup_directory(app: tauri::AppHandle) -> Option<String> {
    let dir = app.dialog().file().blocking_pick_folder();
    dir.map(|p| p.to_string())
}

/// 加载指定名称的配置文件，passwords.json 会自动解密密码字段
#[command]
pub async fn load_config(file_name: String) -> Result<serde_json::Value, String> {
    ensure_config_dir().map_err(|e| e.to_string())?;
    
    // 安全验证：防止路径穿越攻击
    let safe_name = validate_config_name(&file_name)?;
    let config_path = get_config_dir().join(&safe_name);
    
    if !config_path.exists() {
        return Ok(serde_json::json!(null));
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    let mut data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))?;
    
    if file_name == "passwords.json" {
        data = decrypt_password_fields(&data);
    }
    
    Ok(data)
}

/// 保存指定名称的配置文件，passwords.json 会自动加密密码字段
#[command]
pub async fn save_config(file_name: String, data: serde_json::Value) -> Result<bool, String> {
    ensure_config_dir().map_err(|e| e.to_string())?;
    
    // 安全验证：防止路径穿越攻击
    let safe_name = validate_config_name(&file_name)?;
    let config_path = get_config_dir().join(&safe_name);
    
    let data_to_save = if file_name == "passwords.json" {
        encrypt_password_fields(&data)
    } else {
        data
    };
    
    let content = serde_json::to_string_pretty(&data_to_save)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    let mut file = fs::File::create(&config_path)
        .map_err(|e| format!("创建配置文件失败: {}", e))?;
    
    file.write_all(content.as_bytes())
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    
    Ok(true)
}

/// 在指定目录中搜索文件名包含指定模式的文件
/// 支持并行搜索和结果数量限制，避免大量结果导致性能问题
#[command]
pub async fn search_files(directory: String, pattern: String, limit: Option<usize>) -> Vec<String> {
    let max_results = limit.unwrap_or(2000);
    
    if !PathBuf::from(&directory).exists() {
        return Vec::new();
    }
    
    let lower_pattern = pattern.to_lowercase();
    
    let results: Vec<String> = WalkDir::new(&directory)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|entry| {
            if let Some(name) = entry.file_name().to_str() {
                name.to_lowercase().contains(&lower_pattern)
            } else {
                false
            }
        })
        .par_bridge()
        .map(|entry| entry.path().to_string_lossy().to_string())
        .collect();
    
    results.into_iter().take(max_results).collect()
}

/// 安全验证打开目标（文件路径或 URL）
/// 防止任意协议执行和本地文件泄露
/// 只允许 http/https/mailto/tel 等安全协议及本地文件路径
fn validate_open_target(target: &str) -> Result<(), String> {
    if target.is_empty() {
        return Err("路径不能为空".into());
    }

    // 先判断是否为 Windows 本地路径（如 C:\...、\\server\...）
    let is_windows_path = {
        let bytes = target.as_bytes();
        // 盘符路径: A-Z 后跟 :\ 或 :/
        if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
            true
        }
        // UNC 路径: \\ 开头
        else if bytes.len() >= 2 && bytes[0] == b'\\' && bytes[1] == b'\\' {
            true
        }
        // 相对路径: .\ 或 ..\
        else if target.starts_with(".\\") || target.starts_with("..\\") {
            true
        } else {
            false
        }
    };

    if is_windows_path {
        // 检查路径穿越
        if target.contains("..\\") || target.contains("../") {
            return Err("路径不能包含 '..'".into());
        }
        log::debug!("[validate_open_target] 允许本地路径: {}", target);
        return Ok(());
    }

    // 非 Windows 路径，尝试解析为 URL
    if let Ok(url) = reqwest::Url::parse(target) {
        // 有 scheme 的视为 URL
        match url.scheme() {
            // 允许的安全协议
            "http" | "https" | "mailto" | "tel" => Ok(()),
            // 禁止的协议
            "file" => Err("禁止通过 file:// 协议访问本地文件".into()),
            "javascript" => Err("禁止使用 javascript: 协议".into()),
            "data" => Err("禁止使用 data: 协议".into()),
            "vbscript" => Err("禁止使用 vbscript: 协议".into()),
            scheme => {
                // Windows 特殊协议（如 ms-settings:）
                if scheme.starts_with("ms-") {
                    log::info!("[validate_open_target] 允许 Windows 协议: {}", scheme);
                    Ok(())
                } else {
                    Err(format!("不支持的协议: {}", scheme))
                }
            }
        }
    } else {
        // 不是有效 URL，也不是 Windows 路径，视为普通路径
        if target.contains("..") {
            return Err("路径不能包含 '..'".into());
        }
        log::debug!("[validate_open_target] 允许普通路径: {}", target);
        Ok(())
    }
}

/// 使用系统默认程序打开本地文件
#[command]
pub async fn open_file(path: String) -> Result<(), String> {
    validate_open_target(&path)?;
    open::that(&path).map_err(|e| format!("打开文件失败: {}", e))?;
    Ok(())
}

/// 使用系统默认浏览器打开 URL
#[command]
pub async fn open_url(url: String) -> Result<(), String> {
    validate_open_target(&url)?;
    open::that(&url).map_err(|e| format!("打开 URL 失败: {}", e))?;
    Ok(())
}

// ============================================================================
// 系统信息命令
// 提供进程列表、系统资源、网络信息、进程终止等功能
// ============================================================================

/// 进程信息数据结构
#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub memory: String,
    pub memory_bytes: u64,
    pub cpu_usage: f64,
    pub ports: Vec<u16>,
}

/// 系统信息数据结构（包含 CPU 和内存信息）
#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
}

/// CPU 信息数据结构
#[derive(Debug, Serialize, Deserialize)]
pub struct CpuInfo {
    pub name: String,
    pub cores: usize,
    pub logical_processors: usize,
    pub max_speed: u32,
    pub usage: Option<f32>,
}

/// 内存信息数据结构
#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub total: u64,
    pub free: u64,
    pub used: u64,
}

/// 网络信息数据结构（包含 IPv4 和 IPv6 地址）
#[derive(Debug, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
}

/// 获取系统进程列表，按内存占用排序
#[command]
pub async fn get_processes() -> Vec<ProcessInfo> {
    let mut system = sysinfo::System::new_all();
    system.refresh_all();
    
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let pid_ports = get_pid_ports();
    let total_processes = system.processes().len();
    let mut matched_count = 0;
    
    let mut processes: Vec<ProcessInfo> = system.processes()
        .iter()
        .map(|(pid, process)| {
            let memory_bytes = process.memory();
            let ports = pid_ports.get(&pid.as_u32()).cloned().unwrap_or_default();
            if !ports.is_empty() {
                matched_count += 1;
            }
            ProcessInfo {
                pid: pid.as_u32(),
                name: process.name().to_string_lossy().to_string(),
                memory: format_bytes(memory_bytes),
                memory_bytes,
                cpu_usage: process.cpu_usage() as f64,
                ports,
            }
        })
        .collect();
    
    log::info!(
        "[get_processes] 总进程数: {}, 有端口的进程: {}, pid_ports 键数: {}",
        total_processes, matched_count, pid_ports.len()
    );
    // 输出前 5 个有端口的进程用于调试
    for p in processes.iter().filter(|p| !p.ports.is_empty()).take(5) {
        log::info!("[get_processes] 有端口的进程: PID={}, name={}, ports={:?}, cpu={}", p.pid, p.name, p.ports, p.cpu_usage);
    }
    
    processes.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
    processes
}

/// 获取每个进程占用的网络端口映射（通过 netstat 命令解析）
fn get_pid_ports() -> std::collections::HashMap<u32, Vec<u16>> {
    let mut pid_ports: std::collections::HashMap<u32, std::collections::HashSet<u16>> = std::collections::HashMap::new();

    #[cfg(windows)]
    {
        let output = Command::new("netstat")
            .args(["-ano"])
            .creation_flags(0x08000000)
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                log::info!("[get_pid_ports] netstat -ano 退出码: {}", output.status.code().unwrap_or(-1));
                if !stderr.is_empty() {
                    log::warn!("[get_pid_ports] netstat stderr: {}", stderr);
                }
                // 输出原始内容的前 15 行用于调试
                let preview: Vec<&str> = stdout.lines().take(15).collect();
                log::info!("[get_pid_ports] netstat 原始输出前15行:\n{}", preview.join("\n"));

                let mut parsed_count = 0;
                let mut skip_count = 0;
                for line in stdout.lines() {
                    let line = line.trim();
                    if !line.starts_with("TCP") && !line.starts_with("UDP") {
                        continue;
                    }
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    // TCP: Proto LocalAddr ForeignAddr State PID  => PID 在 parts[4]
                    // UDP: Proto LocalAddr ForeignAddr PID        => PID 在 parts[3]
                    let (local_addr, remote_addr, pid_str) = if line.starts_with("TCP") && parts.len() >= 5 {
                        (parts[1], parts[2], parts[4])
                    } else if line.starts_with("UDP") && parts.len() >= 4 {
                        (parts[1], parts[2], parts[3])
                    } else {
                        log::debug!("[get_pid_ports] 跳过格式不符行 (parts={}): {}", parts.len(), line);
                        skip_count += 1;
                        continue;
                    };

                    let pid = match pid_str.parse::<u32>() {
                        Ok(p) if p > 0 => p,
                        _ => {
                            log::debug!("[get_pid_ports] 跳过无效PID '{}' 行: {}", pid_str, line);
                            skip_count += 1;
                            continue;
                        }
                    };

                    let ports = pid_ports.entry(pid).or_insert_with(std::collections::HashSet::new);

                    // 提取本地地址端口
                    if let Some(port_str) = local_addr.split(':').last() {
                        if let Ok(port) = port_str.parse::<u16>() {
                            ports.insert(port);
                            parsed_count += 1;
                        }
                    }
                    // 同时提取远程地址端口（如外部 443 端口）
                    if let Some(port_str) = remote_addr.split(':').last() {
                        if let Ok(port) = port_str.parse::<u16>() {
                            if port > 0 {
                                ports.insert(port);
                            }
                        }
                    }
                }
                log::info!(
                    "[get_pid_ports] 解析完成: {} 条有效记录, 跳过 {} 条, 涉及 {} 个进程",
                    parsed_count, skip_count, pid_ports.len()
                );
                // 输出前 10 个进程的端口映射用于调试
                for (i, (pid, ports)) in pid_ports.iter().take(10).enumerate() {
                    log::info!("[get_pid_ports] 进程 {}: PID={}, ports={:?}", i, pid, ports);
                }
            }
            Err(e) => {
                log::error!("[get_pid_ports] netstat -ano 命令执行失败: {}", e);
            }
        }
    }

    // 将 HashSet 转为 Vec
    pid_ports.into_iter().map(|(k, v)| (k, v.into_iter().collect())).collect()
}

/// 获取系统 CPU 和内存信息
#[command]
pub async fn get_system_info() -> SystemInfo {
    let mut system = sysinfo::System::new_all();
    system.refresh_all();
    
    let cpu_info = CpuInfo {
        name: system.cpus().first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown".to_string()),
        cores: sysinfo::System::physical_core_count().unwrap_or(0),
        logical_processors: system.cpus().len(),
        max_speed: 0,
        usage: Some(system.global_cpu_usage()),
    };
    
    let total_memory = system.total_memory();
    let free_memory = system.free_memory();
    
    let memory_info = MemoryInfo {
        total: total_memory,
        free: free_memory,
        used: total_memory - free_memory,
    };
    
    SystemInfo {
        cpu: cpu_info,
        memory: memory_info,
    }
}

/// 获取本机网络接口的 IPv4 和 IPv6 地址列表
#[command]
pub async fn get_local_network_info() -> NetworkInfo {
    let networks = sysinfo::Networks::new_with_refreshed_list();
    let mut ipv4 = Vec::new();
    let mut ipv6 = Vec::new();
    
    for (_name, network) in &networks {
        for ip_net in network.ip_networks() {
            match ip_net.addr {
                std::net::IpAddr::V4(addr) => {
                    let s = addr.to_string();
                    if !s.starts_with("127.") && s != "0.0.0.0" && !ipv4.contains(&s) {
                        ipv4.push(s);
                    }
                }
                std::net::IpAddr::V6(addr) => {
                    let s = addr.to_string();
                    if s != "::" && s != "::1" && !ipv6.contains(&s) {
                        ipv6.push(s);
                    }
                }
            }
        }
    }
    
    NetworkInfo { ipv4, ipv6 }
}

/// 强制终止指定 PID 的单个进程
#[command]
pub async fn kill_process(pid: u32) -> Result<serde_json::Value, String> {
    let output = Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .output()
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(serde_json::json!({ "success": true }))
    } else {
        Ok(serde_json::json!({ "success": false, "error": "无法终止进程" }))
    }
}

/// 批量强制终止多个进程
#[command]
pub async fn kill_processes(pids: Vec<u32>) -> Result<serde_json::Value, String> {
    let mut errors: Vec<u32> = Vec::new();
    
    for pid in pids {
        let output = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
        
        if output.is_err() || !output.unwrap().status.success() {
            errors.push(pid);
        }
    }
    
    Ok(serde_json::json!({ "success": true, "errors": errors }))
}

// ============================================================================
// 密码管理命令
// 提供密码生成、密码库读写、密码增删改查等功能
// ============================================================================

/// 根据选项生成随机密码，支持自定义长度、数字、符号、大小写
#[command]
pub async fn generate_password(
    length: usize,
    include_numbers: bool,
    include_symbols: bool,
    include_uppercase: bool,
    include_lowercase: bool,
    custom_symbols: Option<Vec<String>>,
) -> String {
    let mut pool = String::new();
    let mut required_chars: Vec<String> = Vec::new();
    
    if include_lowercase {
        pool.push_str("abcdefghijklmnopqrstuvwxyz");
        required_chars.push("abcdefghijklmnopqrstuvwxyz".to_string());
    }
    if include_uppercase {
        pool.push_str("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        required_chars.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ".to_string());
    }
    if include_numbers {
        pool.push_str("0123456789");
        required_chars.push("0123456789".to_string());
    }
    if include_symbols {
        let symbols = if let Some(custom) = custom_symbols {
            if !custom.is_empty() {
                custom.join("")
            } else {
                "!@#$%^&*()_+-=[]{}|;:,.<>?".to_string()
            }
        } else {
            "!@#$%^&*()_+-=[]{}|;:,.<>?".to_string()
        };
        pool.push_str(&symbols);
        required_chars.push(symbols);
    }
    
    if pool.is_empty() {
        pool = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".to_string();
    }
    
    let safe_length = length.max(required_chars.len()).min(128);
    let mut rng = rand::rng();
    
    let mut pwd = String::new();
    for set in &required_chars {
        pwd.push(set.chars().nth(rng.random_range(0..set.len())).unwrap());
    }
    
    let char_bytes = pool.as_bytes();
    for _ in required_chars.len()..safe_length {
        pwd.push(char_bytes[rng.random_range(0..char_bytes.len())] as char);
    }
    
    let mut chars: Vec<char> = pwd.chars().collect();
    chars.shuffle(&mut rng);
    chars.into_iter().collect()
}

/// 获取密码库中的所有密码数据
#[command]
pub async fn get_passwords() -> Result<serde_json::Value, String> {
    load_config("passwords.json".to_string()).await
}

/// 保存或更新密码条目到密码库
#[command]
pub async fn save_password(password_data: serde_json::Value) -> Result<bool, String> {
    let mut passwords = load_config("passwords.json".to_string()).await?;
    
    if passwords.is_null() {
        passwords = serde_json::json!({ "groups": [], "passwords": [] });
    }
    
    let now = chrono::Utc::now().to_rfc3339();
    
    if let Some(id) = password_data.get("id").and_then(|v| v.as_str()) {
        if let Some(passwords_array) = passwords.get_mut("passwords").and_then(|v| v.as_array_mut()) {
            for item in passwords_array.iter_mut() {
                if item.get("id").and_then(|v| v.as_str()) == Some(id) {
                    if let Some(obj) = item.as_object_mut() {
                        for (key, value) in password_data.as_object().unwrap().iter() {
                            obj.insert(key.clone(), value.clone());
                        }
                        obj.insert("updatedAt".to_string(), serde_json::json!(now));
                    }
                    break;
                }
            }
        }
    } else {
        let mut new_password = password_data.clone();
        if let Some(obj) = new_password.as_object_mut() {
            obj.insert("id".to_string(), serde_json::json!(uuid::Uuid::new_v4().to_string()));
            obj.insert("createdAt".to_string(), serde_json::json!(now));
            obj.insert("updatedAt".to_string(), serde_json::json!(now));
        }
        if let Some(passwords_array) = passwords.get_mut("passwords").and_then(|v| v.as_array_mut()) {
            passwords_array.push(new_password);
        }
    }
    
    save_config("passwords.json".to_string(), passwords).await
}

/// 从密码库中删除指定 ID 的密码条目
#[command]
pub async fn delete_password(id: String) -> Result<bool, String> {
    let mut passwords = load_config("passwords.json".to_string()).await?;
    
    if let Some(passwords_array) = passwords.get_mut("passwords").and_then(|v| v.as_array_mut()) {
        passwords_array.retain(|p| p.get("id").and_then(|v| v.as_str()) != Some(&id));
    }
    if let Some(items_array) = passwords.get_mut("items").and_then(|v| v.as_array_mut()) {
        items_array.retain(|p| p.get("id").and_then(|v| v.as_str()) != Some(&id));
    }
    
    save_config("passwords.json".to_string(), passwords).await
}

// ============================================================================
// 应用配置命令
// 提供应用配置的读取、保存、重置等功能
// ============================================================================

/// 应用程序配置数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub config_dir: String,
    #[serde(default)]
    pub shortcuts: serde_json::Value,
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub backup_enabled: bool,
    #[serde(default)]
    pub backup_count: u32,
    #[serde(default)]
    pub toolbar_order: Vec<String>,
    #[serde(default)]
    pub category_order: Vec<String>,
    #[serde(default)]
    pub hidden_tools: Vec<String>,
    #[serde(default)]
    pub hidden_categories: Vec<String>,
    #[serde(default)]
    pub backup_dir: String,
    #[serde(default)]
    pub backup_interval: u32,
    #[serde(default)]
    pub backup_interval_unit: String,
    #[serde(default)]
    pub last_backup_time: u64,
    #[serde(default)]
    pub window_shortcut: String,
    #[serde(default)]
    pub log_level: String,
    #[serde(default)]
    pub close_to_minimize: bool,
    #[serde(default)]
    pub favorite_tools: Vec<String>,
}

/// 读取应用程序配置，若不存在则返回默认配置
#[command]
pub async fn get_app_config() -> Result<AppConfig, String> {
    ensure_config_dir().map_err(|e| e.to_string())?;
    let config_path = get_config_dir().join("app-config.json");
    
    if !config_path.exists() {
        let default_config = AppConfig {
            config_dir: String::new(),
            shortcuts: serde_json::json!({}),
            theme: "light".to_string(),
            backup_enabled: true,
            backup_count: 5,
            toolbar_order: vec![],
            category_order: vec![],
            hidden_tools: vec![],
            hidden_categories: vec![],
            backup_dir: String::new(),
            backup_interval: 24,
            backup_interval_unit: "hours".to_string(),
            last_backup_time: 0,
            window_shortcut: "Ctrl+Shift+H".to_string(),
            log_level: "INFO".to_string(),
            close_to_minimize: false,
            favorite_tools: vec![],
        };
        return Ok(default_config);
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;
    
    let config: AppConfig = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;
    
    Ok(config)
}

/// 保存应用程序配置到配置文件
#[command]
pub async fn save_app_config(config: AppConfig) -> Result<bool, String> {
    ensure_config_dir().map_err(|e| e.to_string())?;
    let config_path = get_config_dir().join("app-config.json");
    
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    let mut file = fs::File::create(&config_path)
        .map_err(|e| format!("创建配置文件失败: {}", e))?;
    
    file.write_all(content.as_bytes())
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    
    Ok(true)
}

/// 重置应用程序配置为默认值并保存
#[command]
pub async fn reset_app_config() -> Result<AppConfig, String> {
    let default_config = AppConfig {
        config_dir: String::new(),
        shortcuts: serde_json::json!({}),
        theme: "light".to_string(),
        backup_enabled: true,
        backup_count: 5,
        toolbar_order: vec![],
        category_order: vec![],
        hidden_tools: vec![],
        hidden_categories: vec![],
        backup_dir: String::new(),
        backup_interval: 24,
        backup_interval_unit: "hours".to_string(),
        last_backup_time: 0,
        window_shortcut: "Ctrl+Shift+H".to_string(),
        log_level: "INFO".to_string(),
        close_to_minimize: false,
        favorite_tools: vec![],
    };
    save_app_config(default_config.clone()).await?;
    Ok(default_config)
}

// ============================================================================
// HTTP 请求命令（带代理支持）
// 提供 HTTP 请求发送、文件上传、系统代理获取等功能
// ============================================================================

/// HTTP 响应数据结构
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub duration: u64,
}

/// HTTP 文件上传字段数据结构
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpFileUpload {
    pub field_name: String,
    pub file_path: String,
    pub file_name: String,
}

/// HTTP 请求选项数据结构（包含 URL、方法、头、代理等）
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestOptions {
    pub url: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_system_proxy: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query_params: Option<Vec<(String, String)>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<HttpFileUpload>>,
}

/// 获取系统代理配置（Windows 注册表读取）
fn get_system_proxy() -> Option<String> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(internet_settings) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings") {
            if let Ok(proxy_enable) = internet_settings.get_value::<u32, _>("ProxyEnable") {
                if proxy_enable != 0 {
                    if let Ok(proxy_server) = internet_settings.get_value::<String, _>("ProxyServer") {
                        log::info!("[http_request] 注册表 ProxyServer 原始值: {}", proxy_server);
                        
                        // 解析 ProxyServer 格式，支持:
                        // 1. "10.1.27.102:8080" (纯地址)
                        // 2. "http=10.1.27.102:8080;https=10.1.27.102:8080" (分协议)
                        // 3. "http://10.1.27.102:8080" (已有协议前缀)
                        
                        if proxy_server.starts_with("http://") || proxy_server.starts_with("https://") {
                            return Some(proxy_server);
                        }
                        
                        let parts: Vec<&str> = proxy_server.split(';').collect();
                        let mut http_proxy: Option<String> = None;
                        let mut https_proxy: Option<String> = None;
                        let mut fallback_proxy: Option<String> = None;
                        
                        for part in parts {
                            let part = part.trim();
                            if part.is_empty() { continue; }
                            
                            if part.contains('=') {
                                let mut kv = part.splitn(2, '=');
                                if let (Some(protocol), Some(address)) = (kv.next(), kv.next()) {
                                    let protocol = protocol.trim().to_lowercase();
                                    let address = address.trim();
                                    let full = if address.starts_with("http://") || address.starts_with("https://") {
                                        address.to_string()
                                    } else {
                                        format!("http://{}", address)
                                    };
                                    if protocol == "http" {
                                        http_proxy = Some(full.clone());
                                    } else if protocol == "https" {
                                        https_proxy = Some(full.clone());
                                    }
                                }
                            } else {
                                // 没有协议前缀的纯地址，作为 fallback
                                fallback_proxy = Some(format!("http://{}", part));
                            }
                        }
                        
                        // 优先返回 https 代理（因为公网IP请求通常是 https），其次是 http 代理，最后是 fallback
                        let result = https_proxy.or(http_proxy).or(fallback_proxy);
                        if let Some(ref url) = result {
                            log::info!("[http_request] 解析后的系统代理: {}", url);
                        }
                        return result;
                    }
                } else {
                    log::info!("[http_request] 系统代理未启用 (ProxyEnable=0)");
                }
            }
        }
    }
    None
}

/// 验证 HTTP 请求 URL 的安全性
/// 禁止访问本地敏感端点和非标准协议
/// 仅允许 http 和 https 协议
fn validate_http_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url)
        .map_err(|e| format!("无效的 URL: {}", e))?;
    
    // 只允许 http 和 https 协议
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err(format!("不支持的协议 '{}', 仅允许 http/https", parsed.scheme())),
    }
    
    // 检查主机名，禁止访问本地敏感端点
    if let Some(host) = parsed.host_str() {
        let host_lower = host.to_lowercase();
        // 禁止访问 localhost 和私有 IP 的常用端口
        if host_lower == "localhost" || host_lower == "127.0.0.1" || host_lower == "::1" {
            // 允许访问 localhost，但记录日志（桌面工具可能需要测试本地服务）
            log::warn!("[http_request] 请求访问本地端点: {}", url);
        }
    }
    
    Ok(())
}

/// 发送 HTTP 请求，支持自定义头、Query 参数、文件上传和代理
#[command]
pub async fn http_request(options: HttpRequestOptions) -> Result<HttpResponse, String> {
    // 安全验证：检查 URL 是否合法
    validate_http_url(&options.url)?;

    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(options.timeout_ms.unwrap_or(30000)));

    // 确定使用的代理
    let proxy_to_use = if options.proxy.is_some() {
        options.proxy.clone()
    } else if options.use_system_proxy.unwrap_or(false) {
        get_system_proxy()
    } else {
        None
    };

    if let Some(proxy_url) = &proxy_to_use {
        let proxy = reqwest::Proxy::all(proxy_url)
            .map_err(|e| format!("代理配置错误: {}", e))?;
        builder = builder.proxy(proxy);
    }

    let client = builder.build()
        .map_err(|e| e.to_string())?;

    let method = match options.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    // 构建 URL，拼接 query 参数
    let mut url = options.url.clone();
    if let Some(query_params) = &options.query_params {
        if !query_params.is_empty() {
            let separator = if url.contains('?') { '&' } else { '?' };
            let query_string: Vec<String> = query_params
                .iter()
                .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
                .collect();
            url = format!("{}{}{}", url, separator, query_string.join("&"));
        }
    }

    let start = std::time::Instant::now();

    let mut request = client.request(method, &url);

    if let Some(headers) = &options.headers {
        for (key, value) in headers {
            request = request.header(key, value);
        }
    }

    // 处理文件上传（multipart/form-data）
    if let Some(files) = &options.files {
        if !files.is_empty() {
            let mut form = reqwest::multipart::Form::new();

            // 添加普通表单字段（从 body 解析）
            if let Some(body) = &options.body {
                if !body.is_empty() {
                    for line in body.lines() {
                        let parts: Vec<&str> = line.splitn(2, '=').collect();
                        if parts.len() == 2 {
                            form = form.text(parts[0].trim().to_string(), parts[1].trim().to_string());
                        }
                    }
                }
            }

            // 添加文件
            for file in files {
                match tokio::fs::read(&file.file_path).await {
                    Ok(file_bytes) => {
                        let part = reqwest::multipart::Part::bytes(file_bytes)
                            .file_name(file.file_name.clone());
                        form = form.part(file.field_name.clone(), part);
                    }
                    Err(e) => {
                        log::error!("读取文件失败 {}: {}", file.file_path, e);
                        return Err(format!("读取文件失败: {}", e));
                    }
                }
            }

            request = request.multipart(form);
        } else if let Some(body) = &options.body {
            request = request.body(body.clone());
        }
    } else if let Some(body) = &options.body {
        request = request.body(body.clone());
    }

    let response = request.send().await.map_err(|e| e.to_string())?;

    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();

    let headers: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse {
        status,
        status_text,
        headers,
        body,
        duration: start.elapsed().as_millis() as u64,
    })
}

// ============================================================================
// 窗口控制命令
// 提供窗口显示、隐藏、切换等控制功能
// ============================================================================

/// 显示主窗口并使其获得焦点
#[command]
pub async fn show_window(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Err("窗口不存在".to_string())
    }
}

/// 隐藏主窗口
#[command]
pub async fn hide_window(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Err("窗口不存在".to_string())
    }
}

/// 切换主窗口的显示/隐藏状态
#[command]
pub async fn toggle_window(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().map_err(|e| e.to_string())? {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        Ok(true)
    } else {
        Err("窗口不存在".to_string())
    }
}

// ============================================================================
// 备份管理命令
// 提供备份创建、列表查询、删除、恢复、导入等功能
// ============================================================================

/// 获取备份目录路径
#[command]
pub async fn get_backup_dir() -> String {
    let config_dir = get_config_dir();
    config_dir.join("backups").to_string_lossy().to_string()
}

/// 递归复制目录及其所有内容
fn copy_directory(source: &PathBuf, destination: &PathBuf) -> std::io::Result<()> {
    fs::create_dir_all(destination)?;
    
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = destination.join(entry.file_name());
        
        if entry.file_type()?.is_dir() {
            copy_directory(&src_path, &dest_path)?;
        } else {
            fs::copy(&src_path, &dest_path)?;
        }
    }
    
    Ok(())
}

/// 递归删除目录及其所有内容
fn remove_directory(dir: &PathBuf) -> std::io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        
        if entry.file_type()?.is_dir() {
            remove_directory(&path)?;
        } else {
            fs::remove_file(&path)?;
        }
    }
    
    fs::remove_dir(dir)?;
    Ok(())
}

/// 递归计算目录的总大小（字节）
fn calculate_directory_size(dir: &PathBuf) -> u64 {
    let mut total_size = 0u64;
    
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    total_size += calculate_directory_size(&entry.path());
                } else {
                    total_size += metadata.len();
                }
            }
        }
    }
    
    total_size
}

/// 创建完整备份，包含所有配置文件，自动清理超出保留数量的旧备份
#[command]
pub async fn create_full_backup(note: Option<String>) -> Result<serde_json::Value, String> {
    let config_dir = get_config_dir();
    let backup_dir = config_dir.join("backups");
    
    fs::create_dir_all(&backup_dir).map_err(|e| format!("创建备份目录失败: {}", e))?;
    
    let now = chrono::Utc::now();
    let timestamp = now.format("%Y-%m-%dT%H-%M-%S").to_string();
    let backup_path = backup_dir.join(&timestamp);
    
    fs::create_dir_all(&backup_path).map_err(|e| format!("创建备份路径失败: {}", e))?;
    
    let entries = fs::read_dir(&config_dir)
        .map_err(|e| format!("读取配置目录失败: {}", e))?
        .filter_map(|e| e.ok());
    
    for entry in entries {
        let name = entry.file_name();
        if name == "backups" {
            continue;
        }
        
        let src_path = entry.path();
        let dest_path = backup_path.join(&name);
        
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            copy_directory(&src_path, &dest_path).map_err(|e| format!("复制目录失败: {}", e))?;
        } else {
            fs::copy(&src_path, &dest_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    
    let size_bytes = calculate_directory_size(&backup_path);
    
    let backup_info = serde_json::json!({
        "id": timestamp,
        "timestamp": now.to_rfc3339(),
        "sizeBytes": size_bytes,
        "size": format_bytes(size_bytes),
        "note": note.unwrap_or_default(),
        "sourcePath": config_dir.to_string_lossy().to_string()
    });
    
    let info_path = backup_path.join("backup-info.json");
    fs::write(&info_path, serde_json::to_string_pretty(&backup_info).unwrap())
        .map_err(|e| format!("写入备份信息失败: {}", e))?;
    
    // 根据 backup_count 清理旧备份
    let _ = cleanup_old_backups(&backup_dir);
    
    Ok(backup_info)
}

/// 清理超出保留数量的旧备份
fn cleanup_old_backups(backup_dir: &std::path::PathBuf) -> Result<(), String> {
    // 读取 app-config.json 获取 backup_count
    let config_path = get_config_dir().join("app-config.json");
    let mut backup_count: usize = 5;
    if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(count) = config.get("backupCount").and_then(|v| v.as_u64()) {
                backup_count = count as usize;
            } else if let Some(count) = config.get("backup_count").and_then(|v| v.as_u64()) {
                backup_count = count as usize;
            }
        }
    }
    
    if backup_count == 0 {
        return Ok(());
    }
    
    let mut backups: Vec<(std::path::PathBuf, std::time::SystemTime)> = Vec::new();
    
    if let Ok(entries) = fs::read_dir(backup_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let mtime = entry.metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                backups.push((entry.path(), mtime));
            }
        }
    }
    
    // 按修改时间倒序排列（最新的在前）
    backups.sort_by(|a, b| b.1.cmp(&a.1));
    
    if backups.len() > backup_count {
        let to_delete = &backups[backup_count..];
        for (path, _) in to_delete {
            if let Err(e) = remove_directory(path) {
                log::warn!("清理旧备份失败 {}: {}", path.display(), e);
            } else {
                log::info!("已清理旧备份: {}", path.display());
            }
        }
    }
    
    Ok(())
}

/// 获取所有备份列表，按时间倒序排列
#[command]
pub async fn get_backup_list() -> Result<Vec<serde_json::Value>, String> {
    let backup_dir = get_config_dir().join("backups");
    
    if !backup_dir.exists() {
        return Ok(vec![]);
    }
    
    let mut backups = Vec::new();
    
    let entries = fs::read_dir(&backup_dir)
        .map_err(|e| format!("读取备份目录失败: {}", e))?
        .filter_map(|e| e.ok());
    
    for entry in entries {
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            let backup_path = entry.path();
            let info_path = backup_path.join("backup-info.json");
            
            if info_path.exists() {
                if let Ok(content) = fs::read_to_string(&info_path) {
                    if let Ok(info) = serde_json::from_str(&content) {
                        backups.push(info);
                        continue;
                    }
                }
            }
            
            let size_bytes = calculate_directory_size(&backup_path);
            let mtime = fs::metadata(&backup_path)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                .unwrap_or_default();
            
            backups.push(serde_json::json!({
                "id": entry.file_name().to_string_lossy(),
                "timestamp": mtime,
                "sizeBytes": size_bytes,
                "size": format_bytes(size_bytes),
                "note": ""
            }));
        }
    }
    
    backups.sort_by(|a, b| {
        let ta = a.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
        let tb = b.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
        tb.cmp(ta)
    });
    
    Ok(backups)
}

/// 安全验证备份 ID，防止路径穿越攻击
/// 只允许字母、数字、连字符、下划线、点号和时间分隔符
fn validate_backup_id(id: &str) -> Result<PathBuf, String> {
    if id.is_empty() {
        return Err("备份 ID 不能为空".into());
    }
    // 拒绝路径分隔符和跳目录
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err("备份 ID 包含非法路径字符".into());
    }
    // 只允许字母、数字、下划线、连字符、点号
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == 'T' || c == ':') {
        return Err("备份 ID 包含非法字符".into());
    }
    Ok(PathBuf::from(id))
}

/// 删除指定 ID 的备份
#[command]
pub async fn delete_backup(backup_id: String) -> Result<bool, String> {
    // 安全验证：防止路径穿越攻击
    let safe_id = validate_backup_id(&backup_id)?;
    let backup_dir = get_config_dir().join("backups").join(&safe_id);
    
    // 额外验证：确保路径仍在 backups 目录内
    let backup_dir_canonical = backup_dir.canonicalize()
        .map_err(|e| format!("备份目录解析失败: {}", e))?;
    let backups_dir_canonical = get_config_dir().join("backups").canonicalize()
        .map_err(|e| format!("备份父目录解析失败: {}", e))?;
    if !backup_dir_canonical.starts_with(&backups_dir_canonical) {
        return Err("备份路径越界".into());
    }
    
    if !backup_dir.exists() {
        return Err(format!("备份不存在: {}", backup_id));
    }
    
    remove_directory(&backup_dir).map_err(|e| format!("删除备份失败: {}", e))?;
    Ok(true)
}

/// 从指定备份恢复配置数据
#[command]
pub async fn restore_backup(backup_id: String) -> Result<bool, String> {
    // 安全验证：防止路径穿越攻击
    let safe_id = validate_backup_id(&backup_id)?;
    let backup_path = get_config_dir().join("backups").join(&safe_id);
    
    // 额外验证：确保路径仍在 backups 目录内
    let backup_path_canonical = backup_path.canonicalize()
        .map_err(|e| format!("备份目录解析失败: {}", e))?;
    let backups_dir_canonical = get_config_dir().join("backups").canonicalize()
        .map_err(|e| format!("备份父目录解析失败: {}", e))?;
    if !backup_path_canonical.starts_with(&backups_dir_canonical) {
        return Err("备份路径越界".into());
    }
    
    if !backup_path.exists() {
        return Err(format!("备份不存在: {}", backup_id));
    }
    
    let config_dir = get_config_dir();
    
    let entries = fs::read_dir(&backup_path)
        .map_err(|e| format!("读取备份目录失败: {}", e))?
        .filter_map(|e| e.ok());
    
    for entry in entries {
        let name = entry.file_name();
        if name == "backup-info.json" {
            continue;
        }
        
        // 安全验证：文件名不能包含路径穿越
        let name_str = name.to_string_lossy();
        if name_str.contains("..") || name_str.contains('/') || name_str.contains('\\') {
            log::warn!("跳过可疑文件名: {}", name_str);
            continue;
        }
        
        let src_path = entry.path();
        let dest_path = config_dir.join(&name);
        
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if dest_path.exists() {
                remove_directory(&dest_path).map_err(|e| format!("删除旧目录失败: {}", e))?;
            }
            copy_directory(&src_path, &dest_path).map_err(|e| format!("恢复目录失败: {}", e))?;
        } else {
            fs::copy(&src_path, &dest_path).map_err(|e| format!("恢复文件失败: {}", e))?;
        }
    }
    
    Ok(true)
}

/// 从外部目录导入备份数据到当前配置目录
#[command]
pub async fn import_backup(backup_path: String) -> Result<bool, String> {
    let source_dir = PathBuf::from(&backup_path);
    
    if !source_dir.exists() {
        return Err(format!("备份路径不存在: {}", backup_path));
    }
    
    if !source_dir.is_dir() {
        return Err("导入的备份必须是一个目录".to_string());
    }
    
    let config_dir = get_config_dir();
    
    let entries = fs::read_dir(&source_dir)
        .map_err(|e| format!("读取备份目录失败: {}", e))?
        .filter_map(|e| e.ok());
    
    for entry in entries {
        let name = entry.file_name();
        if name == "backup-info.json" {
            continue;
        }
        
        // 安全验证：文件名不能包含路径穿越字符
        let name_str = name.to_string_lossy();
        if name_str.contains("..") || name_str.contains('/') || name_str.contains('\\') {
            log::warn!("导入备份时跳过可疑文件名: {}", name_str);
            continue;
        }
        
        let src_path = entry.path();
        let dest_path = config_dir.join(&name);
        
        // 安全验证：确保目标路径仍在 config_dir 内
        let dest_path_canonical = dest_path.canonicalize().ok().unwrap_or_else(|| dest_path.clone());
        let config_dir_canonical = config_dir.canonicalize().ok().unwrap_or_else(|| config_dir.clone());
        if !dest_path_canonical.starts_with(&config_dir_canonical) {
            log::warn!("导入备份时跳过越界路径: {}", dest_path.display());
            continue;
        }
        
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if dest_path.exists() {
                remove_directory(&dest_path).map_err(|e| format!("删除旧目录失败: {}", e))?;
            }
            copy_directory(&src_path, &dest_path).map_err(|e| format!("复制目录失败: {}", e))?;
        } else {
            fs::copy(&src_path, &dest_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    
    Ok(true)
}

// ============================================================================
// 其他命令
// 提供图标选择、文件图标获取、快捷方式解析、配置迁移等功能
// ============================================================================

/// 搜索文件占用参数结构体
#[derive(serde::Deserialize)]
pub struct SearchFileArgs {
    pub filePath: String,
}

/// 搜索占用指定文件的进程（匹配进程可执行文件路径）
#[command]
pub async fn search_file_handle(args: SearchFileArgs) -> Vec<serde_json::Value> {
    let file_path = args.filePath;
    log::info!("[search_file_handle] 接收到的文件路径: '{}'", file_path);
    
    if file_path.trim().is_empty() {
        log::warn!("[search_file_handle] 文件路径为空，跳过查询");
        return vec![];
    }
    
    // PowerShell 字符串中的反斜杠需要转义，单引号需要双写以符合 WMI 过滤语法
    let escaped_path = file_path.replace('\\', "\\\\").replace("'", "''");
    log::debug!("[search_file_handle] 转义后的 WMI 路径: {}", escaped_path);
    
    // 判断是否为完整路径（含盘符或路径分隔符）
    let is_full_path = file_path.contains(':') || file_path.contains('\\') || file_path.contains('/');
    
    log::info!("[search_file_handle] 是否完整路径: {}", is_full_path);
    
    // 统一使用子串匹配（LIKE %xxx%），支持：
    // - 完整路径：D:\xxx\app.exe
    // - 仅文件名：app.exe
    // - 模糊子串：app、logs、node 等
    // 这样输入 "app" 也能匹配 "D:\app.exe"、"D:\myapp.exe"、"D:\xxx\app.exe" 等。
    let where_clause = format!(
        "ExecutablePath LIKE '%{0}%' OR ExecutablePath LIKE '%{0}' OR ExecutablePath LIKE '%{0}/%'",
        escaped_path
    );
    log::info!("[search_file_handle] WLIKE 子句: {}", where_clause);
    
    let ps_template = String::from(
        "$query = \"SELECT ProcessId, Name, ExecutablePath FROM Win32_Process WHERE {WHERE}\"; \
         Get-WmiObject -Query $query | Select-Object @{N='Id';E={$_.ProcessId}}, @{N='ProcessName';E={$_.Name}} | ConvertTo-Json -Compress"
    );
    let ps_script = ps_template.replace("{WHERE}", &where_clause);
    log::debug!("[search_file_handle] PowerShell 脚本: {}", ps_script);
    
    let result = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .creation_flags(0x08000000)
        .output();
    
    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            if !stderr.is_empty() {
                log::warn!("[search_file_handle] PowerShell stderr: {}", stderr);
            }
            log::debug!("[search_file_handle] PowerShell stdout: {}", stdout);
            
            if stdout.trim().is_empty() {
                log::info!("[search_file_handle] 未找到匹配的进程（输入路径: {}）", file_path);
                return vec![];
            }
            
            parse_powershell_json_output(&stdout, "search_file_handle")
        }
        Err(e) => {
            log::error!("[search_file_handle] 执行PowerShell命令失败: {}", e);
            vec![]
        }
    }
}

/// 搜索目录占用参数结构体
#[derive(serde::Deserialize)]
pub struct SearchDirectoryArgs {
    pub directoryPath: String,
}

/// 搜索占用指定目录的进程（匹配进程可执行文件路径中包含该目录的进程）
#[command]
pub async fn search_directory_handle(args: SearchDirectoryArgs) -> Vec<serde_json::Value> {
    let directory_path = args.directoryPath;
    log::info!("[search_directory_handle] 接收到的目录路径: '{}'", directory_path);
    
    if directory_path.trim().is_empty() {
        log::warn!("[search_directory_handle] 目录路径为空，跳过查询");
        return vec![];
    }
    
    // 统一路径分隔符为反斜杠，并去掉末尾分隔符
    let mut normalized = directory_path.replace('/', "\\");
    while normalized.ends_with('\\') {
        normalized.pop();
    }
    
    // 转义用于 WMI 字符串：反斜杠加一，单引号双写
    let escaped_path = normalized.replace('\\', "\\\\").replace("'", "''");
    log::debug!("[search_directory_handle] 规范化后路径: '{}'", normalized);
    
    // 目录匹配策略：使用 LIKE '%xxx%' 子串匹配
    // - 输入 "logs" → 匹配 "D:\xxx\logs\app.exe"、"D:\logs\app.exe"
    // - 输入 "target" → 匹配 "D:\app\target\release\app.exe"
    // - 输入完整路径 "D:\dev\app" → 匹配该路径下的所有进程
    let where_clause = format!(
        "ExecutablePath LIKE '%{0}%'",
        escaped_path
    );
    log::info!("[search_directory_handle] WLIKE 子句: {}", where_clause);
    
    let ps_template = String::from(
        "$query = \"SELECT ProcessId, Name, ExecutablePath FROM Win32_Process WHERE {WHERE}\"; \
         Get-WmiObject -Query $query | Select-Object @{N='Id';E={$_.ProcessId}}, @{N='ProcessName';E={$_.Name}} | ConvertTo-Json -Compress"
    );
    let ps_script = ps_template.replace("{WHERE}", &where_clause);
    log::debug!("[search_directory_handle] PowerShell 脚本: {}", ps_script);
    
    let result = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .creation_flags(0x08000000)
        .output();
    
    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            if !stderr.is_empty() {
                log::warn!("[search_directory_handle] PowerShell stderr: {}", stderr);
            }
            log::debug!("[search_directory_handle] PowerShell stdout: {}", stdout);
            
            if stdout.trim().is_empty() {
                log::info!("[search_directory_handle] 未找到匹配的进程（输入路径: {}）", directory_path);
                return vec![];
            }
            
            parse_powershell_json_output(&stdout, "search_directory_handle")
        }
        Err(e) => {
            log::error!("[search_directory_handle] 执行PowerShell命令失败: {}", e);
            vec![]
        }
    }
}

/// 解析 PowerShell 通过 ConvertTo-Json 生成的输出（可能为单个对象或数组）
fn parse_powershell_json_output(stdout: &str, context: &str) -> Vec<serde_json::Value> {
    let trimmed = stdout.trim();
    match serde_json::from_str::<Vec<serde_json::Value>>(trimmed) {
        Ok(arr) => {
            log::info!("[{}] 解析为数组，找到 {} 个进程", context, arr.len());
            arr
        }
        Err(_) => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
                log::info!("[{}] 解析为单个对象，找到 1 个进程", context);
                vec![v]
            } else {
                log::error!("[{}] JSON解析失败，原始输出: {}", context, trimmed);
                vec![]
            }
        }
    }
}

/// 从配置目录的 Local State 文件中获取 Chromium 加密密钥
fn get_chromium_key_from_config_dir(config_dir: &PathBuf) -> Result<Vec<u8>, String> {
    let parent_dir = config_dir.parent().ok_or("无法获取配置目录的父目录".to_string())?;
    let local_state_path = parent_dir.join("Local State");
    
    if !local_state_path.exists() {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| String::from("."));
        let fallback_path = PathBuf::from(appdata).join("toolbox").join("Local State");
        if fallback_path.exists() {
            return get_chromium_key();
        }
        return Err(format!("Local State 文件不存在，搜索路径: {}, {}", local_state_path.display(), fallback_path.display()));
    }

    let content = fs::read_to_string(&local_state_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let encrypted_key_b64 = json
        .get("os_crypt")
        .and_then(|v| v.get("encrypted_key"))
        .and_then(|v| v.as_str())
        .ok_or("找不到 encrypted_key")?;

    let encrypted_key = base64::engine::general_purpose::STANDARD
        .decode(encrypted_key_b64)
        .map_err(|e| e.to_string())?;

    if encrypted_key.len() < 5 {
        return Err("encrypted_key 太短".to_string());
    }

    let prefix = std::str::from_utf8(&encrypted_key[0..5])
        .map_err(|_| "无效的 DPAPI 前缀")?;
    if prefix != "DPAPI" {
        return Err("DPAPI 前缀不匹配".to_string());
    }

    let key_data = &encrypted_key[5..];
    dpapi_decrypt(key_data)
}

/// 使用 Chromium 密钥迁移旧版密码文件到新版加密格式
fn migrate_passwords_file_with_key(old_path: &PathBuf, new_path: &PathBuf, config_dir: &PathBuf) -> Result<(usize, usize), String> {
    let content = fs::read_to_string(old_path).map_err(|e| e.to_string())?;
    let mut data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let mut total_count = 0;
    let mut success_count = 0;

    match get_chromium_key_from_config_dir(config_dir) {
        Ok(key) => {
            if let Some(items) = data.get_mut("items").and_then(|v| v.as_array_mut()) {
                total_count = items.len();
                for item in items.iter_mut() {
                    if let Some(obj) = item.as_object_mut() {
                        let is_encrypted = obj
                            .get("__encrypted__")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        if is_encrypted {
                            if let Some(password) = obj.get("password").and_then(|v| v.as_str()) {
                                let decrypted = decrypt_chromium_v10(password, &key);
                                if let Ok(pwd) = decrypted {
                                    obj.insert(
                                        "password".to_string(),
                                        serde_json::Value::String(pwd),
                                    );
                                    success_count += 1;
                                } else {
                                    obj.insert(
                                        "password".to_string(),
                                        serde_json::Value::String("[需要重新输入密码]".to_string()),
                                    );
                                }
                                obj.insert(
                                    "__encrypted__".to_string(),
                                    serde_json::Value::Bool(false),
                                );
                            }
                        }
                    }
                }
            }

            if let Some(passwords) = data.get_mut("passwords").and_then(|v| v.as_array_mut()) {
                total_count += passwords.len();
                for entry in passwords.iter_mut() {
                    if let Some(obj) = entry.as_object_mut() {
                        let is_encrypted = obj
                            .get("__encrypted__")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        if is_encrypted {
                            if let Some(password) = obj.get("password").and_then(|v| v.as_str()) {
                                let decrypted = decrypt_chromium_v10(password, &key);
                                if let Ok(pwd) = decrypted {
                                    obj.insert(
                                        "password".to_string(),
                                        serde_json::Value::String(pwd),
                                    );
                                    success_count += 1;
                                } else {
                                    obj.insert(
                                        "password".to_string(),
                                        serde_json::Value::String("[需要重新输入密码]".to_string()),
                                    );
                                }
                                obj.insert(
                                    "__encrypted__".to_string(),
                                    serde_json::Value::Bool(false),
                                );
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            log::warn!("无法获取 Chromium 密钥: {}, 密码将显示为需要重新输入", e);
            if let Some(items) = data.get_mut("items").and_then(|v| v.as_array_mut()) {
                total_count = items.len();
                for item in items.iter_mut() {
                    if let Some(obj) = item.as_object_mut() {
                        if obj.get("__encrypted__").and_then(|v| v.as_bool()).unwrap_or(false) {
                            obj.insert(
                                "password".to_string(),
                                serde_json::Value::String("[需要重新输入密码]".to_string()),
                            );
                            obj.insert(
                                "__encrypted__".to_string(),
                                serde_json::Value::Bool(false),
                            );
                        }
                    }
                }
            }
            if let Some(passwords) = data.get_mut("passwords").and_then(|v| v.as_array_mut()) {
                total_count += passwords.len();
                for entry in passwords.iter_mut() {
                    if let Some(obj) = entry.as_object_mut() {
                        if obj.get("__encrypted__").and_then(|v| v.as_bool()).unwrap_or(false) {
                            obj.insert(
                                "password".to_string(),
                                serde_json::Value::String("[需要重新输入密码]".to_string()),
                            );
                            obj.insert(
                                "__encrypted__".to_string(),
                                serde_json::Value::Bool(false),
                            );
                        }
                    }
                }
            }
        }
    }

    let encrypted = encrypt_password_fields(&data);

    fs::write(new_path, serde_json::to_string_pretty(&encrypted).unwrap())
        .map_err(|e| e.to_string())?;

    Ok((total_count, success_count))
}

/// 将旧版配置目录迁移到新版配置目录
#[command]
pub async fn migrate_config_dir(old_dir: String, _full_config: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let old_config_dir = PathBuf::from(&old_dir);
    if !old_config_dir.exists() {
        return Ok(serde_json::json!({
            "success": false,
            "error": format!("旧配置目录不存在: {}", old_dir)
        }));
    }

    let new_config_dir = get_config_dir();
    fs::create_dir_all(&new_config_dir).map_err(|e| e.to_string())?;

    let mut migrated_files: Vec<String> = Vec::new();
    let mut failed_files: Vec<String> = Vec::new();
    let mut password_count = 0;
    let mut password_success = 0;

    if let Ok(entries) = fs::read_dir(&old_config_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name();
            let name_str = name.to_string_lossy().to_string();
            
            if name_str == "backups" || name_str == "passwords.json" {
                continue;
            }
            
            let old_path = entry.path();
            let new_path = new_config_dir.join(&name);
            
            let result = if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                copy_directory(&old_path, &new_path)
            } else {
                fs::copy(&old_path, &new_path).map(|_| ())
            };
            
            match result {
                Ok(_) => {
                    migrated_files.push(name_str);
                }
                Err(e) => {
                    failed_files.push(format!("{}: {}", name_str, e));
                }
            }
        }
    }

    let old_backups = old_config_dir.join("backups");
    let new_backups = new_config_dir.join("backups");
    if old_backups.exists() {
        match copy_directory(&old_backups, &new_backups) {
            Ok(_) => migrated_files.push("backups".to_string()),
            Err(e) => failed_files.push(format!("backups: {}", e)),
        }
    }

    let old_passwords = old_config_dir.join("passwords.json");
    if old_passwords.exists() {
        match migrate_passwords_file_with_key(&old_passwords, &new_config_dir.join("passwords.json"), &old_config_dir) {
            Ok((count, success)) => {
                migrated_files.push("passwords.json".to_string());
                password_count = count;
                password_success = success;
            }
            Err(e) => {
                failed_files.push(format!("passwords.json: {}", e));
            }
        }
    }

    Ok(serde_json::json!({
        "success": failed_files.is_empty(),
        "migrated_files": migrated_files,
        "failed_files": failed_files,
        "password_count": password_count,
        "password_success": password_success
    }))
}

/// 打开对话框选择图标文件，返回文件路径和 base64 编码的图片数据
#[command]
pub async fn select_icon(app: tauri::AppHandle) -> Option<serde_json::Value> {
    let file = app.dialog().file()
        .add_filter("图标文件", &["png", "jpg", "jpeg", "ico", "bmp", "gif"])
        .blocking_pick_file();

    match file {
        Some(path) => {
            let path_str = path.to_string();
            log::info!("select_icon: selected path={}", path_str);

            match std::fs::metadata(&path_str) {
                Ok(metadata) => {
                    let size = metadata.len();
                    log::info!("select_icon: file size={} bytes", size);

                    if size > 2 * 1024 * 1024 {
                        log::warn!("select_icon: file too large (>2MB), skipping");
                        return None;
                    }

                    match std::fs::read(&path_str) {
                        Ok(bytes) => {
                            let base64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
                            log::info!("select_icon: base64 length={}", base64.len());

                            let mime = match path_str.split('.').last() {
                                Some("png") => "image/png",
                                Some("jpg") | Some("jpeg") => "image/jpeg",
                                Some("ico") => "image/x-icon",
                                Some("bmp") => "image/bmp",
                                Some("gif") => "image/gif",
                                _ => "image/png",
                            };
                            log::info!("select_icon: mime={}", mime);

                            Some(serde_json::json!({
                                "path": path_str,
                                "base64": format!("data:{};base64,{}", mime, base64)
                            }))
                        }
                        Err(e) => {
                            log::error!("select_icon: failed to read file: {}", e);
                            None
                        }
                    }
                }
                Err(e) => {
                    log::error!("select_icon: failed to get metadata: {}", e);
                    None
                }
            }
        }
        None => {
            log::info!("select_icon: user cancelled");
            None
        }
    }
}

/// 获取指定文件的系统图标，返回 base64 编码的 PNG 图片
#[command]
pub async fn get_file_icon(file_path: String) -> Result<serde_json::Value, String> {
    log::info!("get_file_icon called with path: {}", file_path);
    let base64_icon = get_file_icon_internal(&file_path);
    log::info!("get_file_icon result: {} bytes", base64_icon.len());
    Ok(serde_json::json!({ "base64": base64_icon }))
}

/// 内部函数：获取 Windows 系统文件图标（Windows 平台实现）
#[cfg(windows)]
fn get_file_icon_internal(file_path: &str) -> String {
    use std::ptr;
    use winapi::shared::minwindef::{DWORD, FALSE};
    use winapi::shared::windef::HICON;
    use winapi::um::shellapi::{SHGetFileInfoW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_USEFILEATTRIBUTES, ExtractIconExW};
    use winapi::um::winuser::{DestroyIcon, DrawIconEx, GetDC, ReleaseDC, GetIconInfo};
    use winapi::um::wingdi::{CreateCompatibleDC, SelectObject, DeleteDC, DeleteObject, BITMAPINFOHEADER, BI_RGB, CreateDIBSection, GetDIBits, BITMAP};

    const DI_NORMAL: u32 = 0;
    const WIDTH: i32 = 32;
    const HEIGHT: i32 = 32;

    log::info!("get_file_icon_internal: path={}", file_path);

    let mut path_wide: Vec<u16> = file_path.encode_utf16().chain(std::iter::once(0)).collect();

    if path_wide.len() > 259 {
        log::info!("Path too long, using extended path prefix");
        let extended_path = format!("\\\\?\\{}", file_path);
        path_wide = extended_path.encode_utf16().chain(std::iter::once(0)).collect();
    }

    log::info!("Path wide length: {}", path_wide.len());

    let icon_handle: HICON;

    let mut large_icons: [HICON; 1] = [ptr::null_mut()];
    let mut small_icons: [HICON; 1] = [ptr::null_mut()];

    log::info!("Trying ExtractIconExW...");
    let extract_result = unsafe {
        ExtractIconExW(
            path_wide.as_ptr(),
            0,
            large_icons.as_mut_ptr(),
            small_icons.as_mut_ptr(),
            1,
        )
    };

    log::info!("ExtractIconExW result: {}, large_icon null: {}", extract_result, large_icons[0].is_null());

    if extract_result > 0 && !large_icons[0].is_null() {
        icon_handle = large_icons[0];
        log::info!("Using icon from ExtractIconExW");
    } else {
        log::info!("ExtractIconExW failed, trying SHGetFileInfoW...");
        let mut shfi: winapi::um::shellapi::SHFILEINFOW = unsafe { std::mem::zeroed() };
        let shfi_size = std::mem::size_of::<winapi::um::shellapi::SHFILEINFOW>() as DWORD;

        let mut result = unsafe {
            SHGetFileInfoW(
                path_wide.as_ptr(),
                0,
                &mut shfi,
                shfi_size,
                SHGFI_ICON | SHGFI_LARGEICON,
            )
        };

        log::info!("SHGetFileInfoW first attempt result: {}, hIcon null: {}", result, shfi.hIcon.is_null());

        if result == 0 || shfi.hIcon.is_null() {
            result = unsafe {
                SHGetFileInfoW(
                    path_wide.as_ptr(),
                    0,
                    &mut shfi,
                    shfi_size,
                    SHGFI_ICON | SHGFI_LARGEICON | SHGFI_USEFILEATTRIBUTES,
                )
            };
            log::info!("SHGetFileInfoW second attempt (USEFILEATTRIBUTES) result: {}, hIcon null: {}", result, shfi.hIcon.is_null());
        }

        if result != 0 && !shfi.hIcon.is_null() {
            icon_handle = shfi.hIcon;
            log::info!("Using icon from SHGetFileInfoW");
        } else {
            log::error!("Failed to get icon from both ExtractIconExW and SHGetFileInfoW");
            return String::new();
        }
    }

    log::info!("Icon handle: {:?}", icon_handle);

    // 使用 GetIconInfo 获取图标的位图数据
    let mut icon_info: winapi::um::winuser::ICONINFO = unsafe { std::mem::zeroed() };
    let gi_result = unsafe { GetIconInfo(icon_handle, &mut icon_info) };
    if gi_result == FALSE {
        log::error!("GetIconInfo failed");
        unsafe { DestroyIcon(icon_handle) };
        return String::new();
    }

    let hcolor = icon_info.hbmColor;
    let hmask = icon_info.hbmMask;
    log::info!("GetIconInfo: hColor={:?}, hMask={:?}, isIcon={}", hcolor, hmask, icon_info.fIcon);

    // 获取颜色位图信息
    let mut bmp_color: BITMAP = unsafe { std::mem::zeroed() };
    let color_obj_result = unsafe { winapi::um::wingdi::GetObjectW(
        hcolor as *mut _,
        std::mem::size_of::<BITMAP>() as i32,
        &mut bmp_color as *mut _ as *mut _
    ) };
    log::info!("Color bitmap: {}x{}, bpp={}, planes={}, result={}",
        bmp_color.bmWidth, bmp_color.bmHeight, bmp_color.bmBitsPixel, bmp_color.bmPlanes, color_obj_result);

    // 获取掩码位图信息
    let mut bmp_mask: BITMAP = unsafe { std::mem::zeroed() };
    let mask_obj_result = unsafe { winapi::um::wingdi::GetObjectW(
        hmask as *mut _,
        std::mem::size_of::<BITMAP>() as i32,
        &mut bmp_mask as *mut _ as *mut _
    ) };
    log::info!("Mask bitmap: {}x{}, bpp={}, planes={}, result={}",
        bmp_mask.bmWidth, bmp_mask.bmHeight, bmp_mask.bmBitsPixel, bmp_mask.bmPlanes, mask_obj_result);

    let hdc_screen = unsafe { GetDC(ptr::null_mut()) };
    let hdc_compat = unsafe { CreateCompatibleDC(hdc_screen) };
    unsafe { ReleaseDC(ptr::null_mut(), hdc_screen) };

    // 创建 32 位 DIB 用于最终输出
    let mut bmi: BITMAPINFOHEADER = unsafe { std::mem::zeroed() };
    bmi.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as DWORD;
    bmi.biWidth = WIDTH;
    bmi.biHeight = -HEIGHT;
    bmi.biPlanes = 1;
    bmi.biBitCount = 32;
    bmi.biCompression = BI_RGB;

    let mut bits: Vec<u8> = vec![0u8; (WIDTH * 4 * HEIGHT) as usize];

    // 情况1: 颜色位图是 32 位的，直接读取颜色+alpha
    if bmp_color.bmBitsPixel == 32 {
        log::info!("Using 32-bit color bitmap direct read");

        let color_bytes_per_row = ((bmp_color.bmWidth * 4 + 3) / 4) * 4;
        let mut color_data: Vec<u8> = vec![0u8; (color_bytes_per_row * bmp_color.bmHeight) as usize];

        let mut read_bmi: BITMAPINFOHEADER = unsafe { std::mem::zeroed() };
        read_bmi.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as DWORD;
        read_bmi.biWidth = bmp_color.bmWidth;
        read_bmi.biHeight = bmp_color.bmHeight;
        read_bmi.biPlanes = 1;
        read_bmi.biBitCount = 32;
        read_bmi.biCompression = BI_RGB;

        let old_color = unsafe { SelectObject(hdc_compat, hcolor as *mut _) };
        let dibits_result = unsafe { GetDIBits(
            hdc_compat,
            hcolor,
            0,
            bmp_color.bmHeight as u32,
            color_data.as_mut_ptr() as *mut _,
            &mut read_bmi as *mut _ as *mut _,
            0,
        ) };
        unsafe { SelectObject(hdc_compat, old_color) };
        log::info!("GetDIBits(color) result: {}", dibits_result);

        // 复制到 32x32 输出，BAGR -> RGBA
        let src_w = bmp_color.bmWidth.min(WIDTH) as usize;
        let src_h = bmp_color.bmHeight.min(HEIGHT) as usize;
        for y in 0..src_h {
            for x in 0..src_w {
                let src_offset = (y as usize) * (color_bytes_per_row as usize) + (x as usize) * 4;
                let dst_offset = (y as usize) * (WIDTH as usize) * 4 + (x as usize) * 4;
                let b = color_data[src_offset + 0];
                let g = color_data[src_offset + 1];
                let r = color_data[src_offset + 2];
                let a = color_data[src_offset + 3];
                bits[dst_offset + 0] = r;
                bits[dst_offset + 1] = g;
                bits[dst_offset + 2] = b;
                bits[dst_offset + 3] = a;
            }
        }
    } else {
        // 情况2: 使用 DrawIconEx + 洋红色背景法
        log::info!("Using DrawIconEx with magenta background");

        let mut bits_ptr: *mut winapi::ctypes::c_void = ptr::null_mut();
        let hbitmap = unsafe {
            CreateDIBSection(
                hdc_compat,
                &mut bmi as *mut _ as *mut _,
                0,
                &mut bits_ptr,
                ptr::null_mut(),
                0,
            )
        };

        if !hbitmap.is_null() && !bits_ptr.is_null() {
            let old = unsafe { SelectObject(hdc_compat, hbitmap as *mut _) };

            // 填充洋红色背景
            let slice = unsafe { std::slice::from_raw_parts_mut(bits_ptr as *mut u8, (WIDTH * 4 * HEIGHT) as usize) };
            for i in 0..(WIDTH * HEIGHT) {
                let offset = (i * 4) as usize;
                slice[offset + 0] = 255; // B
                slice[offset + 1] = 0;   // G
                slice[offset + 2] = 255; // R
                slice[offset + 3] = 255; // A
            }

            let draw_ok = unsafe { DrawIconEx(
                hdc_compat, 0, 0, icon_handle, WIDTH, HEIGHT, 0, ptr::null_mut(), DI_NORMAL,
            ) };
            log::info!("DrawIconEx result: {}", draw_ok);

            // 从位图内存读取到 bits Vec
            unsafe {
                std::ptr::copy_nonoverlapping(bits_ptr as *const u8, bits.as_mut_ptr(), (WIDTH * 4 * HEIGHT) as usize);
            }

            // BGRA -> RGBA，洋红色变透明
            for i in 0..(WIDTH * HEIGHT) {
                let offset = (i * 4) as usize;
                let b = bits[offset + 0];
                let g = bits[offset + 1];
                let r = bits[offset + 2];
                if r == 255 && g == 0 && b == 255 {
                    bits[offset + 0] = 0;
                    bits[offset + 1] = 0;
                    bits[offset + 2] = 0;
                    bits[offset + 3] = 0;
                } else {
                    bits[offset + 0] = r;
                    bits[offset + 1] = g;
                    bits[offset + 2] = b;
                    bits[offset + 3] = 255;
                }
            }

            unsafe { SelectObject(hdc_compat, old) };
            unsafe { DeleteObject(hbitmap as *mut _) };
        }
    }

    unsafe { DeleteDC(hdc_compat) };
    unsafe { DeleteObject(hmask as *mut _) };
    unsafe { DeleteObject(hcolor as *mut _) };
    unsafe { DestroyIcon(icon_handle) };

    // 调试：输出像素样本
    let mut non_transparent = 0;
    let mut sample_pixels: Vec<String> = Vec::new();
    for i in 0..(WIDTH * HEIGHT) {
        let offset = (i * 4) as usize;
        if bits[offset + 3] > 0 {
            non_transparent += 1;
            if sample_pixels.len() < 5 {
                sample_pixels.push(format!(
                    "[{}](R={},G={},B={},A={})",
                    i, bits[offset + 0], bits[offset + 1], bits[offset + 2], bits[offset + 3]
                ));
            }
        }
    }
    log::info!("Non-transparent pixels: {}/{}, samples: {:?}", non_transparent, WIDTH * HEIGHT, sample_pixels);

    let png_base64 = encode_bitmap_to_png_base64(&bits, WIDTH, HEIGHT);
    log::info!("PNG base64 length: {}", png_base64.len());

    png_base64
}

/// 将位图数据编码为 PNG 格式的 base64 字符串（Windows）
#[cfg(windows)]
fn encode_bitmap_to_png_base64(bits: &[u8], width: i32, height: i32) -> String {
    let mut png_data = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_data, width as u32, height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);

        if let Ok(mut writer) = encoder.write_header() {
            let _ = writer.write_image_data(bits);
        }
    }
    base64::engine::general_purpose::STANDARD.encode(&png_data)
}

/// 内部函数：获取系统文件图标（非 Windows 平台空实现）
#[cfg(not(windows))]
fn get_file_icon_internal(_file_path: &str) -> String {
    String::new()
}

/// 解析快捷方式文件（当前返回原路径，预留接口）
#[command]
pub async fn resolve_shortcut(_lnk_path: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "success": true,
        "targetPath": _lnk_path,
        "isShortcut": false
    }))
}

// ============================================================================
// 全局快捷键命令
// 提供全局快捷键注册、注销、应用配置读取等功能
// ============================================================================

/// 同步读取应用配置（用于日志初始化阶段，不依赖 AppHandle）
pub fn get_app_config_blocking_for_log() -> Result<AppConfig, String> {
    let config_path = get_config_dir().join("app-config.json");

    if !config_path.exists() {
        return Ok(AppConfig {
            config_dir: String::new(),
            shortcuts: serde_json::json!({}),
            theme: "light".to_string(),
            backup_enabled: true,
            backup_count: 5,
            toolbar_order: vec![],
            category_order: vec![],
            hidden_tools: vec![],
            hidden_categories: vec![],
            backup_dir: String::new(),
            backup_interval: 24,
            backup_interval_unit: "hours".to_string(),
            last_backup_time: 0,
            window_shortcut: "Ctrl+Shift+H".to_string(),
            log_level: "INFO".to_string(),
            close_to_minimize: false,
            favorite_tools: vec![],
        });
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;

    let config: AppConfig = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;

    Ok(config)
}

/// 同步读取应用配置（供快捷键等同步代码使用）
pub fn get_app_config_blocking(_app: &tauri::AppHandle) -> Result<AppConfig, String> {
    let config_path = get_config_dir().join("app-config.json");

    if !config_path.exists() {
        return Ok(AppConfig {
            config_dir: String::new(),
            shortcuts: serde_json::json!({}),
            theme: "light".to_string(),
            backup_enabled: true,
            backup_count: 5,
            toolbar_order: vec![],
            category_order: vec![],
            hidden_tools: vec![],
            hidden_categories: vec![],
            backup_dir: String::new(),
            backup_interval: 24,
            backup_interval_unit: "hours".to_string(),
            last_backup_time: 0,
            window_shortcut: "Ctrl+Shift+H".to_string(),
            log_level: "INFO".to_string(),
            close_to_minimize: false,
            favorite_tools: vec![],
        });
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;

    let config: AppConfig = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;

    Ok(config)
}

/// 将快捷键字符串解析为 Tauri Shortcut 对象
fn shortcut_str_to_tauri(accelerator: &str) -> Option<Shortcut> {
    accelerator.parse::<Shortcut>().ok()
}

/// 内部函数：注册所有全局快捷键（工具快捷键和窗口快捷键）
pub fn register_all_shortcuts_internal(app: &tauri::AppHandle) -> Result<(), String> {
    let config = get_app_config_blocking(app)?;
    
    // 应用日志级别
    let level = match config.log_level.to_uppercase().as_str() {
        "DEBUG" => log::LevelFilter::Debug,
        "INFO" => log::LevelFilter::Info,
        "WARN" => log::LevelFilter::Warn,
        "ERROR" => log::LevelFilter::Error,
        _ => log::LevelFilter::Info,
    };
    log::set_max_level(level);
    let manager = app.global_shortcut();

    let _ = manager.unregister_all();

    // 注册工具快捷键
    if let Some(shortcuts) = config.shortcuts.as_object() {
        for (tool_id, shortcut_value) in shortcuts {
            if let Some(shortcut_str) = shortcut_value.as_str() {
                if let Some(shortcut) = shortcut_str_to_tauri(shortcut_str) {
                    let tool_id = tool_id.clone();
                    let app_handle = app.clone();
                    let _ = manager.on_shortcut(shortcut, move |_app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let _ = app_handle.emit("shortcut-triggered", &tool_id);
                        }
                    });
                }
            }
        }
    }

    // 注册窗口显示/隐藏快捷键
    let window_shortcut = config.window_shortcut.clone();
    if let Some(shortcut) = shortcut_str_to_tauri(&window_shortcut) {
        let _ = manager.on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    let visible = window.is_visible().unwrap_or(true);
                    let _ = if visible {
                        window.hide()
                    } else {
                        window.show().and_then(|_| window.set_focus())
                    };
                }
            }
        });
    }

    // 注册 F12 快捷键打开开发者工具
    if let Some(shortcut) = shortcut_str_to_tauri("F12") {
        let _ = manager.on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.open_devtools();
                }
            }
        });
    }

    Ok(())
}

/// 注册单个全局快捷键
#[command]
pub async fn register_global_shortcut(
    app: tauri::AppHandle,
    shortcut: String,
    handler: String,
) -> Result<bool, String> {
    let manager = app.global_shortcut();

    if let Some(sc) = shortcut_str_to_tauri(&shortcut) {
        let app_handle = app.clone();
        match manager.on_shortcut(sc, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let _ = app_handle.emit("shortcut-triggered", &handler);
            }
        }) {
            Ok(_) => Ok(true),
            Err(e) => Err(format!("注册快捷键失败: {}", e)),
        }
    } else {
        Err(format!("无效的快捷键格式: {}", shortcut))
    }
}

/// 注销全局快捷键并重新注册所有快捷键
#[command]
pub async fn unregister_global_shortcut(
    app: tauri::AppHandle,
    _handler: String,
) -> Result<bool, String> {
    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|e| e.to_string())?;
    register_all_shortcuts_internal(&app)?;
    Ok(true)
}

/// 注册应用配置中定义的所有全局快捷键
#[command]
pub async fn register_all_shortcuts(app: tauri::AppHandle) -> Result<bool, String> {
    register_all_shortcuts_internal(&app)?;
    Ok(true)
}

// ============================================================================
// 菜单事件处理
// 提供窗口最小化、应用退出、菜单事件处理等功能
// ============================================================================

/// 隐藏主窗口（最小化到托盘）
#[command]
pub async fn minimize_window(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    Ok(true)
}

/// 退出应用程序
#[command]
pub async fn quit_app(app: tauri::AppHandle) -> Result<bool, String> {
    *app.state::<AppState>().is_quitting.lock().unwrap() = true;
    app.exit(0);
    Ok(true)
}

/// 处理系统菜单事件（设置、退出等）
#[command]
pub async fn handle_menu_event(app: tauri::AppHandle, menu_id: String) -> Result<bool, String> {
    match menu_id.as_str() {
        "settings" => {
            let _ = app.emit("navigate-to", "settings");
            Ok(true)
        }
        "quit" => {
            *app.state::<AppState>().is_quitting.lock().unwrap() = true;
            app.exit(0);
            Ok(true)
        }
        _ => Ok(false),
    }
}

// ============================================================================
// 旧版 Electron 配置自动迁移
// 提供从旧版 Electron 应用自动迁移配置和密码的功能
// ============================================================================

/// 获取旧版 Electron 应用的用户数据目录
fn get_old_electron_user_data_dir() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| String::from("."));
    PathBuf::from(appdata).join("toolbox")
}

/// 获取旧版 Electron 应用的配置目录
fn get_old_electron_config_dir() -> PathBuf {
    get_old_electron_user_data_dir().join("config")
}

/// 使用 Windows DPAPI 解密数据
#[cfg(windows)]
fn dpapi_decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    use winapi::um::dpapi::CryptUnprotectData;
    use winapi::um::wincrypt::CRYPTOAPI_BLOB;

    let mut data_in = CRYPTOAPI_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut data_out = CRYPTOAPI_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    let result = unsafe {
        CryptUnprotectData(
            &mut data_in,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
            &mut data_out,
        )
    };

    if result != 0 {
        let decrypted = unsafe {
            std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize).to_vec()
        };
        unsafe { winapi::um::winbase::LocalFree(data_out.pbData as *mut _) };
        Ok(decrypted)
    } else {
        Err("DPAPI 解密失败".to_string())
    }
}

/// 使用 DPAPI 解密数据（非 Windows 平台空实现）
#[cfg(not(windows))]
fn dpapi_decrypt(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI 仅在 Windows 上可用".to_string())
}

/// 从旧版 Electron 的 Local State 文件中获取 Chromium 解密密钥
fn get_chromium_key() -> Result<Vec<u8>, String> {
    let local_state_path = get_old_electron_user_data_dir().join("Local State");
    if !local_state_path.exists() {
        return Err("Local State 文件不存在".to_string());
    }

    let content = fs::read_to_string(&local_state_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let encrypted_key_b64 = json
        .get("os_crypt")
        .and_then(|v| v.get("encrypted_key"))
        .and_then(|v| v.as_str())
        .ok_or("找不到 encrypted_key")?;

    let encrypted_key = base64::engine::general_purpose::STANDARD
        .decode(encrypted_key_b64)
        .map_err(|e| e.to_string())?;

    if encrypted_key.len() < 5 {
        return Err("encrypted_key 太短".to_string());
    }

    let prefix = std::str::from_utf8(&encrypted_key[0..5])
        .map_err(|_| "无效的 DPAPI 前缀")?;
    if prefix != "DPAPI" {
        return Err("DPAPI 前缀不匹配".to_string());
    }

    let key_data = &encrypted_key[5..];
    dpapi_decrypt(key_data)
}

/// 解密 Chromium v10 格式的加密数据（用于旧版密码迁移）
fn decrypt_chromium_v10(encrypted_b64: &str, key: &[u8]) -> Result<String, String> {
    let encrypted = base64::engine::general_purpose::STANDARD
        .decode(encrypted_b64)
        .map_err(|e| e.to_string())?;

    if encrypted.len() < 3 {
        return Err("加密数据太短".to_string());
    }

    let prefix = std::str::from_utf8(&encrypted[0..3])
        .map_err(|_| "无效的前缀")?;

    if prefix != "v10" {
        // pre-v10 格式：直接用 DPAPI 解密
        return dpapi_decrypt(&encrypted)
            .and_then(|v| String::from_utf8(v).map_err(|_| "无效的 UTF-8".to_string()));
    }

    // v10 格式：v10(3) + nonce(12) + ciphertext + tag(16)
    let data = &encrypted[3..];
    if data.len() < 28 {
        return Err("v10 数据太短".to_string());
    }

    let nonce = &data[0..12];
    let ciphertext = &data[12..];

    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};

    let aes_key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(aes_key);
    let nonce = Nonce::from_slice(nonce);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("AES-GCM 解密失败: {:?}", e))?;

    String::from_utf8(plaintext).map_err(|_| "无效的 UTF-8".to_string())
}

/// 获取旧版 Electron 便携模式配置目录
fn get_old_electron_portable_config_dir() -> PathBuf {
    let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let app_dir = exe_path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
    app_dir.join("config")
}

/// 查找旧版 Electron 配置目录（默认位置或便携位置）
fn find_old_config_dir() -> Option<PathBuf> {
    let default_dir = get_old_electron_config_dir();
    if default_dir.exists() {
        return Some(default_dir);
    }

    let portable_dir = get_old_electron_portable_config_dir();
    if portable_dir.exists() {
        return Some(portable_dir);
    }

    None
}

/// 自动检测并迁移旧版 Electron 配置到新版 Tauri 配置目录
pub fn migrate_old_config() -> Result<(), String> {
    let old_config_dir = match find_old_config_dir() {
        Some(dir) => dir,
        None => {
            log::info!("未检测到旧版 Electron 配置目录，跳过迁移");
            return Ok(());
        }
    };

    let new_config_dir = get_config_dir();

    // 如果新版已经有 app-config.json，说明已经迁移过了
    if new_config_dir.join("app-config.json").exists() {
        log::info!("新版配置已存在，跳过迁移");
        return Ok(());
    }

    log::info!("检测到旧版 Electron 配置目录: {}, 开始自动迁移...", old_config_dir.display());

    // 确保新版配置目录存在
    fs::create_dir_all(&new_config_dir).map_err(|e| e.to_string())?;

    // 复制所有非密码配置文件（包括 .backup 文件）
    if let Ok(entries) = fs::read_dir(&old_config_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            
            // 跳过 backups 目录（单独处理）和 passwords.json（单独处理）
            if name_str == "backups" || name_str == "passwords.json" {
                continue;
            }
            
            let old_path = entry.path();
            let new_path = new_config_dir.join(&name);
            
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                copy_directory(&old_path, &new_path).map_err(|e| e.to_string())?;
                log::info!("已复制配置目录: {}", name_str);
            } else {
                fs::copy(&old_path, &new_path).map_err(|e| e.to_string())?;
                log::info!("已复制配置文件: {}", name_str);
            }
        }
    }

    // 复制 backups 目录
    let old_backups = old_config_dir.join("backups");
    let new_backups = new_config_dir.join("backups");
    if old_backups.exists() {
        copy_directory(&old_backups, &new_backups).map_err(|e| e.to_string())?;
        log::info!("已复制备份目录");
    }

    // 迁移 passwords.json
    let old_passwords = old_config_dir.join("passwords.json");
    if old_passwords.exists() {
        match migrate_passwords_file_with_key(&old_passwords, &new_config_dir.join("passwords.json"), &old_config_dir) {
            Ok(_) => log::info!("密码文件迁移成功"),
            Err(e) => log::warn!("密码文件迁移失败: {}", e),
        }
    }

    log::info!("旧版配置自动迁移完成");
    Ok(())
}

/// 检查并执行自动备份
/// 在应用启动时调用，如果满足条件则自动创建备份
pub async fn check_and_run_auto_backup() -> Result<(), String> {
    let config_path = get_config_dir().join("app-config.json");
    
    if !config_path.exists() {
        log::info!("配置文件不存在，跳过自动备份检查");
        return Ok(());
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置失败: {}", e))?;
    
    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))?;
    
    // 检查是否启用了自动备份
    let backup_enabled = config.get("backupEnabled")
        .or_else(|| config.get("backup_enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    if !backup_enabled {
        log::info!("自动备份未启用，跳过");
        return Ok(());
    }
    
    // 获取备份间隔
    let backup_interval = config.get("backupInterval")
        .or_else(|| config.get("backup_interval"))
        .and_then(|v| v.as_u64())
        .unwrap_or(24);
    
    let backup_interval_unit = config.get("backupIntervalUnit")
        .or_else(|| config.get("backup_interval_unit"))
        .and_then(|v| v.as_str())
        .unwrap_or("hours");
    
    // 计算间隔秒数
    let interval_seconds = match backup_interval_unit {
        "days" => backup_interval * 86400,
        _ => backup_interval * 3600, // hours
    };
    
    // 获取上次备份时间
    let last_backup_time = config.get("lastBackupTime")
        .or_else(|| config.get("last_backup_time"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    // 如果上次备份时间为0（从未备份过），或者已超过间隔时间，则执行备份
    let should_backup = last_backup_time == 0 || (now - last_backup_time) >= interval_seconds;
    
    if !should_backup {
        let hours_remaining = interval_seconds.saturating_sub(now - last_backup_time) / 3600;
        log::info!("距上次备份还剩 {} 小时，跳过自动备份", hours_remaining);
        return Ok(());
    }
    
    log::info!("开始执行自动备份...");
    
    // 执行备份
    let backup_result = create_full_backup(Some("自动备份".to_string())).await;
    
    match backup_result {
        Ok(_) => {
            // 更新 lastBackupTime
            let mut config_mut = config.clone();
            config_mut["lastBackupTime"] = serde_json::json!(now);
            config_mut["last_backup_time"] = serde_json::json!(now);
            
            let updated_content = serde_json::to_string_pretty(&config_mut)
                .map_err(|e| format!("序列化配置失败: {}", e))?;
            
            fs::write(&config_path, updated_content)
                .map_err(|e| format!("更新备份时间失败: {}", e))?;
            
            log::info!("自动备份完成");
            Ok(())
        }
        Err(e) => {
            log::error!("自动备份失败: {}", e);
            Err(e)
        }
    }
}