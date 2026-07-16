// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

// 应用状态，存储快捷键管理器和当前配置
pub struct AppState {
    pub shortcuts: Mutex<std::collections::HashMap<String, String>>,
    pub window_shortcut: Mutex<String>,
    pub close_to_minimize: Mutex<bool>,
    pub is_quitting: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            shortcuts: Mutex::new(std::collections::HashMap::new()),
            window_shortcut: Mutex::new("Ctrl+Shift+H".to_string()),
            close_to_minimize: Mutex::new(false),
            is_quitting: Mutex::new(false),
        }
    }
}

fn get_initial_log_level() -> log::LevelFilter {
    match app_lib::commands::get_app_config_blocking_for_log() {
        Ok(config) => parse_log_level(&config.log_level),
        Err(_) => log::LevelFilter::Info,
    }
}

fn parse_log_level(level: &str) -> log::LevelFilter {
    match level.to_uppercase().as_str() {
        "DEBUG" => log::LevelFilter::Debug,
        "INFO" => log::LevelFilter::Info,
        "WARN" => log::LevelFilter::Warn,
        "ERROR" => log::LevelFilter::Error,
        _ => log::LevelFilter::Info,
    }
}

fn main() {
    // 计算日志目录：与旧版一致，放在可执行文件同级目录的 logs/ 下
    let log_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("logs")))
        .unwrap_or_else(|| std::path::PathBuf::from("logs"));

    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(get_initial_log_level())
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                        path: log_dir,
                        file_name: Some("app.log".into()),
                    }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_lib::commands::select_directory,
            app_lib::commands::select_file,
            app_lib::commands::select_backup_directory,
            app_lib::commands::load_config,
            app_lib::commands::save_config,
            app_lib::commands::search_files,
            app_lib::commands::open_file,
            app_lib::commands::open_url,
            app_lib::commands::get_processes,
            app_lib::commands::get_system_info,
            app_lib::commands::get_local_network_info,
            app_lib::commands::kill_process,
            app_lib::commands::kill_processes,
            app_lib::commands::search_file_handle,
            app_lib::commands::generate_password,
            app_lib::commands::get_passwords,
            app_lib::commands::save_password,
            app_lib::commands::delete_password,
            app_lib::commands::get_app_config,
            app_lib::commands::save_app_config,
            app_lib::commands::reset_app_config,
            app_lib::commands::http_request,
            app_lib::commands::get_backup_dir,
            app_lib::commands::create_full_backup,
            app_lib::commands::get_backup_list,
            app_lib::commands::delete_backup,
            app_lib::commands::restore_backup,
            app_lib::commands::import_backup,
            app_lib::commands::migrate_config_dir,
            app_lib::commands::select_icon,
            app_lib::commands::get_file_icon,
            app_lib::commands::resolve_shortcut,
            app_lib::commands::register_global_shortcut,
            app_lib::commands::unregister_global_shortcut,
            app_lib::commands::register_all_shortcuts,
            app_lib::commands::show_window,
            app_lib::commands::hide_window,
            app_lib::commands::toggle_window,
        ])
        .setup(|app| {
            // 启动时自动检测并迁移旧版 Electron 配置
            let _ = app_lib::commands::migrate_old_config();
            // 创建顶部菜单栏
            create_app_menu(app)?;
            // 加载配置并注册快捷键
            let _ = register_shortcuts_from_config(app);
            // 监听菜单事件
            app.on_menu_event(|app, event| {
                match event.id().0.as_str() {
                    "settings" => {
                        let _ = app.emit("navigate-to", "settings");
                    }
                    "quit" => {
                        *app.state::<AppState>().is_quitting.lock().unwrap() = true;
                        app.exit(0);
                    }
                    "front" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_focus();
                        }
                    }
                    "about" => {
                        let _ = app.emit("show-about", "");
                    }
                    _ => {}
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let close_to_minimize = *state.close_to_minimize.lock().unwrap();
                let is_quitting = *state.is_quitting.lock().unwrap();

                if is_quitting {
                    return;
                }

                if close_to_minimize {
                    api.prevent_close();
                    
                    let app_clone = app.clone();
                    app.dialog()
                        .message("确定要关闭窗口吗？")
                        .buttons(tauri_plugin_dialog::MessageDialogButtons::YesNoCancelCustom(
                            "最小化到托盘".to_string(),
                            "退出程序".to_string(),
                            "取消".to_string(),
                        ))
                        .show_with_result(move |result| {
                            match result {
                                tauri_plugin_dialog::MessageDialogResult::Custom(s) => {
                                    if s == "最小化到托盘" {
                                        if let Some(window) = app_clone.get_webview_window("main") {
                                            let _ = window.hide();
                                        }
                                    } else if s == "退出程序" {
                                        *app_clone.state::<AppState>().is_quitting.lock().unwrap() = true;
                                        app_clone.exit(0);
                                    }
                                }
                                _ => {}
                            }
                        });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn create_app_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();

    let settings_i = MenuItem::with_id(handle, "settings", "设置", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(handle, "quit", "退出", true, Some("Ctrl+Q"))?;
    let undo_i = MenuItem::with_id(handle, "undo", "撤销", true, Some("Ctrl+Z"))?;
    let redo_i = MenuItem::with_id(handle, "redo", "恢复", true, Some("Ctrl+Y"))?;
    let cut_i = MenuItem::with_id(handle, "cut", "剪切", true, Some("Ctrl+X"))?;
    let copy_i = MenuItem::with_id(handle, "copy", "复制", true, Some("Ctrl+C"))?;
    let paste_i = MenuItem::with_id(handle, "paste", "粘贴", true, Some("Ctrl+V"))?;
    let minimize_i = MenuItem::with_id(handle, "minimize", "最小化", true, None::<&str>)?;
    let fullscreen_i = MenuItem::with_id(handle, "fullscreen", "全屏", true, None::<&str>)?;
    let front_i = MenuItem::with_id(handle, "front", "前置", true, None::<&str>)?;
    let about_i = MenuItem::with_id(handle, "about", "关于", true, None::<&str>)?;

    let file_m = Submenu::with_items(handle, "文件", true, &[
        &settings_i,
        &PredefinedMenuItem::separator(handle)?,
        &quit_i,
    ])?;

    let edit_m = Submenu::with_items(handle, "编辑", true, &[
        &undo_i,
        &redo_i,
        &PredefinedMenuItem::separator(handle)?,
        &cut_i,
        &copy_i,
        &paste_i,
    ])?;

    let view_m = Submenu::with_items(handle, "视图", true, &[
        &fullscreen_i,
    ])?;

    let window_m = Submenu::with_items(handle, "窗口", true, &[
        &minimize_i,
        &PredefinedMenuItem::separator(handle)?,
        &front_i,
    ])?;

    let help_m = Submenu::with_items(handle, "帮助", true, &[
        &about_i,
    ])?;

    let menu = Menu::with_items(handle, &[
        &file_m,
        &edit_m,
        &view_m,
        &window_m,
        &help_m,
    ])?;

    app.set_menu(menu)?;

    // 监听菜单事件
    app.on_menu_event(move |app, event| {
        match event.id().0.as_str() {
            "settings" => {
                let _ = app.emit("navigate-to", "settings");
            }
            "quit" => {
                app.exit(0);
            }
            "front" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
            }
            "about" => {
                let _ = app.emit("show-about", "");
            }
            _ => {}
        }
    });

    Ok(())
}

fn register_shortcuts_from_config(app: &mut tauri::App) -> Result<(), String> {
    let app_handle = app.handle().clone();
    match app_lib::commands::get_app_config_blocking(&app_handle) {
        Ok(config) => {
            let state = app.state::<AppState>();
            *state.window_shortcut.lock().unwrap() = config.window_shortcut.clone();
            *state.close_to_minimize.lock().unwrap() = config.close_to_minimize;
            if let Some(shortcuts) = config.shortcuts.as_object() {
                let mut map = std::collections::HashMap::new();
                for (k, v) in shortcuts {
                    if let Some(s) = v.as_str() {
                        map.insert(k.clone(), s.to_string());
                    }
                }
                *state.shortcuts.lock().unwrap() = map;
            }
            app_lib::commands::register_all_shortcuts_internal(&app_handle)?;
            Ok(())
        }
        Err(e) => Err(e),
    }
}
