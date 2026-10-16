#![allow(linker_messages)]

pub mod commands;
pub mod file_search;

use std::sync::Mutex;

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