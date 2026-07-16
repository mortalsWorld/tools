use serde::{Deserialize, Serialize};
use serde_json;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use tauri::command;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use walkdir::WalkDir;
use rand::Rng;
use rand::prelude::SliceRandom;
use base64::Engine;

fn get_config_dir() -> PathBuf {
    let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let app_dir = exe_path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
    app_dir.join("config")
}

fn ensure_config_dir() -> std::io::Result<()> {
    let config_dir = get_config_dir();
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)?;
    }
    Ok(())
}

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
// ============================================================================


use regex::Regex;

fn get_encryption_key() -> Vec<u8> {
    let config_dir = get_config_dir();
    let key_path = config_dir.join("encryption-key.dat");
    
    if key_path.exists() {
        match fs::read(&key_path) {
            Ok(key) if key.len() == 32 => return key,
            _ => {}
        }
    }
    
    let default_key = b"toolbox_encryption_key_32bytes";
    
    if let Ok(_) = fs::write(&key_path, default_key) {
    }
    
    default_key.to_vec()
}

fn xor_encrypt(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter().enumerate().map(|(i, &b)| b ^ key[i % key.len()]).collect()
}

fn encrypt_string(data: &str) -> String {
    let key = get_encryption_key();
    let encrypted = xor_encrypt(data.as_bytes(), &key);
    let mut result = Vec::new();
    result.push(0x01);
    result.extend(encrypted);
    base64::engine::general_purpose::STANDARD.encode(&result)
}

fn decrypt_string(data: &str) -> String {
    if data.is_empty() {
        return "".to_string();
    }
    
    if data.starts_with("__b64__") {
        match base64::engine::general_purpose::STANDARD.decode(&data[7..]) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(_) => data.to_string(),
        }
    } else {
        let base64_regex = Regex::new(r"^[A-Za-z0-9+/=]{20,}$").unwrap();
        if !base64_regex.is_match(data) {
            return data.to_string();
        }
        
        match base64::engine::general_purpose::STANDARD.decode(data) {
            Ok(decoded) => {
                if decoded.is_empty() {
                    return data.to_string();
                }
                
                let (version, encrypted) = decoded.split_first().unwrap();
                if *version == 0x01 {
                    let key = get_encryption_key();
                    let decrypted = xor_encrypt(encrypted, &key);
                    String::from_utf8_lossy(&decrypted).to_string()
                } else {
                    String::from_utf8_lossy(&decoded).to_string()
                }
            }
            Err(_) => data.to_string(),
        }
    }
}

fn encrypt_password_fields(data: &serde_json::Value) -> serde_json::Value {
    match data {
        serde_json::Value::Object(obj) => {
            let mut new_obj = serde_json::Map::new();
            for (key, value) in obj.iter() {
                if key == "password" && value.is_string() {
                    let password = value.as_str().unwrap_or("");
                    if !password.is_empty() {
                        new_obj.insert(key.clone(), serde_json::Value::String(encrypt_string(password)));
                        new_obj.insert("__encrypted__".to_string(), serde_json::Value::Bool(true));
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

fn decrypt_password_fields(data: &serde_json::Value) -> serde_json::Value {
    match data {
        serde_json::Value::Object(obj) => {
            let mut new_obj = serde_json::Map::new();
            let is_encrypted = obj.get("__encrypted__").and_then(|v| v.as_bool()).unwrap_or(false);
            
            for (key, value) in obj.iter() {
                if key == "__encrypted__" {
                    continue;
                }
                if key == "password" && value.is_string() {
                    let encrypted = value.as_str().unwrap_or("");
                    let decrypted = decrypt_string(encrypted);
                    
                    if is_encrypted && decrypted == encrypted {
                        new_obj.insert(key.clone(), serde_json::Value::String("[需要重新输入密码]".to_string()));
                    } else {
                        new_obj.insert(key.clone(), serde_json::Value::String(decrypted));
                    }
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
// ============================================================================

#[command]
pub async fn select_directory(app: tauri::AppHandle) -> Option<String> {
    let dir = app.dialog().file().blocking_pick_folder();
    dir.map(|p| p.to_string())
}

#[command]
pub async fn select_file(app: tauri::AppHandle) -> Option<String> {
    let file = app.dialog().file().blocking_pick_file();
    file.map(|p| p.to_string())
}

#[command]
pub async fn select_backup_directory(app: tauri::AppHandle) -> Option<String> {
    let dir = app.dialog().file().blocking_pick_folder();
    dir.map(|p| p.to_string())
}

#[command]
pub async fn load_config(file_name: String) -> Result<serde_json::Value, String> {
    ensure_config_dir().map_err(|e| e.to_string())?;
    let config_path = get_config_dir().join(&file_name);
    
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

#[command]
pub async fn save_config(file_name: String, data: serde_json::Value) -> Result<bool, String> {
    ensure_config_dir().map_err(|e| e.to_string())?;
    let config_path = get_config_dir().join(&file_name);
    
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

#[command]
pub async fn search_files(directory: String, pattern: String) -> Vec<String> {
    let mut results = Vec::new();
    
    if !PathBuf::from(&directory).exists() {
        return results;
    }
    
    for entry in WalkDir::new(&directory).into_iter().filter_map(|e| e.ok()) {
        if let Some(name) = entry.file_name().to_str() {
            if name.to_lowercase().contains(&pattern.to_lowercase()) {
                results.push(entry.path().to_string_lossy().to_string());
            }
        }
    }
    
    results
}

#[command]
pub async fn open_file(path: String) -> Result<(), String> {
    let _ = open::that(&path);
    Ok(())
}

#[command]
pub async fn open_url(url: String) -> Result<(), String> {
    let _ = open::that(&url);
    Ok(())
}

// ============================================================================
// 系统信息命令
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub memory: String,
    pub memory_bytes: u64,
    pub cpu_usage: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CpuInfo {
    pub name: String,
    pub cores: usize,
    pub logical_processors: usize,
    pub max_speed: u32,
    pub usage: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub total: u64,
    pub free: u64,
    pub used: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
}

#[command]
pub async fn get_processes() -> Vec<ProcessInfo> {
    let mut system = sysinfo::System::new_all();
    system.refresh_all();
    
    let mut processes: Vec<ProcessInfo> = system.processes()
        .iter()
        .map(|(pid, process)| {
            let memory_bytes = process.memory();
            ProcessInfo {
                pid: pid.as_u32(),
                name: process.name().to_string_lossy().to_string(),
                memory: format_bytes(memory_bytes),
                memory_bytes,
                cpu_usage: process.cpu_usage() as f64,
            }
        })
        .collect();
    
    processes.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
    processes
}

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
// ============================================================================

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

#[command]
pub async fn get_passwords() -> Result<serde_json::Value, String> {
    load_config("passwords.json".to_string()).await
}

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
// ============================================================================

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
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub duration: u64,
}

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
}

// 获取系统代理配置（Windows）
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

#[command]
pub async fn http_request(options: HttpRequestOptions) -> Result<HttpResponse, String> {
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
    
    let start = std::time::Instant::now();
    
    let mut request = client.request(method, &options.url);
    
    if let Some(headers) = &options.headers {
        for (key, value) in headers {
            request = request.header(key, value);
        }
    }
    
    if let Some(body) = &options.body {
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
// ============================================================================

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

#[command]
pub async fn hide_window(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Err("窗口不存在".to_string())
    }
}

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
// ============================================================================

#[command]
pub async fn get_backup_dir() -> String {
    let config_dir = get_config_dir();
    config_dir.join("backups").to_string_lossy().to_string()
}

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

// 清理超出保留数量的旧备份
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

#[command]
pub async fn delete_backup(backup_id: String) -> Result<bool, String> {
    let backup_dir = get_config_dir().join("backups").join(&backup_id);
    
    if !backup_dir.exists() {
        return Err(format!("备份不存在: {}", backup_id));
    }
    
    remove_directory(&backup_dir).map_err(|e| format!("删除备份失败: {}", e))?;
    Ok(true)
}

#[command]
pub async fn restore_backup(backup_id: String) -> Result<bool, String> {
    let backup_path = get_config_dir().join("backups").join(&backup_id);
    
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
        
        let src_path = entry.path();
        let dest_path = config_dir.join(&name);
        
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
// ============================================================================

#[command]
pub async fn search_file_handle(_file_path: String) -> Vec<serde_json::Value> {
    vec![]
}

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

#[command]
pub async fn select_icon(app: tauri::AppHandle) -> Option<serde_json::Value> {
    let file = app.dialog().file()
        .add_filter("图标文件", &["png", "jpg", "jpeg", "ico", "bmp", "gif"])
        .blocking_pick_file();
    
    match file {
        Some(path) => {
            Some(serde_json::json!({
                "path": path.to_string(),
                "base64": ""
            }))
        }
        None => None,
    }
}

#[command]
pub async fn get_file_icon(_file_path: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "base64": "" }))
}

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
// ============================================================================

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

fn shortcut_str_to_tauri(accelerator: &str) -> Option<Shortcut> {
    accelerator.parse::<Shortcut>().ok()
}

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

    Ok(())
}

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

#[command]
pub async fn register_all_shortcuts(app: tauri::AppHandle) -> Result<bool, String> {
    register_all_shortcuts_internal(&app)?;
    Ok(true)
}

// ============================================================================
// 菜单事件处理
// ============================================================================

#[command]
pub async fn handle_menu_event(app: tauri::AppHandle, menu_id: String) -> Result<bool, String> {
    match menu_id.as_str() {
        "settings" => {
            let _ = app.emit("navigate-to", "settings");
            Ok(true)
        }
        "quit" => {
            app.exit(0);
            Ok(true)
        }
        _ => Ok(false),
    }
}

// ============================================================================
// 旧版 Electron 配置自动迁移
// ============================================================================

fn get_old_electron_user_data_dir() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| String::from("."));
    PathBuf::from(appdata).join("toolbox")
}

fn get_old_electron_config_dir() -> PathBuf {
    get_old_electron_user_data_dir().join("config")
}

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

#[cfg(not(windows))]
fn dpapi_decrypt(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI 仅在 Windows 上可用".to_string())
}

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

fn get_old_electron_portable_config_dir() -> PathBuf {
    let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let app_dir = exe_path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
    app_dir.join("config")
}

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