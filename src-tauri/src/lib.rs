// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug)]
pub struct LocalOpenClawConfig {
    pub found: bool,
    pub port: Option<u16>,
    pub token: Option<String>,
    pub config_path: Option<String>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Detect local openClaw installation by scanning common config locations
#[tauri::command]
fn detect_local_openclaw() -> LocalOpenClawConfig {
    let home = dirs::home_dir().unwrap_or_default();
    
    // Common config locations to check
    let config_paths = vec![
        home.join(".config/openclaw/config.toml"),
        home.join(".config/openclaw/config.yaml"),
        home.join(".config/openclaw/config.json"),
        home.join(".openclaw/config.toml"),
        home.join(".openclaw/config.yaml"),
        home.join(".openclaw/config.json"),
        home.join(".config/openclaw-gateway/config.toml"),
        home.join(".config/openclaw-gateway/config.yaml"),
        home.join(".local/share/openclaw/config.toml"),
    ];
    
    for path in config_paths {
        if path.exists() {
            if let Some(config) = try_parse_config(&path) {
                return config;
            }
        }
    }
    
    // Also check for running process and default port
    if check_port_available(18789) == false {
        // Port is in use, likely openClaw is running
        return LocalOpenClawConfig {
            found: true,
            port: Some(18789),
            token: None,
            config_path: None,
        };
    }
    
    LocalOpenClawConfig {
        found: false,
        port: None,
        token: None,
        config_path: None,
    }
}

fn try_parse_config(path: &PathBuf) -> Option<LocalOpenClawConfig> {
    let content = fs::read_to_string(path).ok()?;
    let path_str = path.to_string_lossy().to_string();
    
    // Try to extract port and token from various formats
    let mut port: Option<u16> = None;
    let mut token: Option<String> = None;
    
    // Simple regex-like parsing for common patterns
    for line in content.lines() {
        let line = line.trim();
        
        // Port detection
        if line.contains("port") {
            if let Some(num) = extract_number(line) {
                port = Some(num);
            }
        }
        
        // Token detection
        if line.contains("token") || line.contains("secret") || line.contains("api_key") {
            if let Some(t) = extract_quoted_string(line) {
                token = Some(t);
            }
        }
        
        // Device token detection  
        if line.contains("device_token") {
            if let Some(t) = extract_quoted_string(line) {
                token = Some(t);
            }
        }
    }
    
    if port.is_some() || token.is_some() {
        Some(LocalOpenClawConfig {
            found: true,
            port,
            token,
            config_path: Some(path_str),
        })
    } else {
        None
    }
}

fn extract_number(line: &str) -> Option<u16> {
    // Find digits in line
    let digits: String = line.chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

fn extract_quoted_string(line: &str) -> Option<String> {
    // Try double quotes
    if let Some(start) = line.find('"') {
        if let Some(end) = line[start+1..].find('"') {
            return Some(line[start+1..start+1+end].to_string());
        }
    }
    // Try single quotes
    if let Some(start) = line.find('\'') {
        if let Some(end) = line[start+1..].find('\'') {
            return Some(line[start+1..start+1+end].to_string());
        }
    }
    // Try after = or :
    if let Some(pos) = line.find('=').or_else(|| line.find(':')) {
        let value = line[pos+1..].trim();
        if !value.is_empty() && !value.starts_with('{') && !value.starts_with('[') {
            return Some(value.trim_matches(|c| c == '"' || c == '\'').to_string());
        }
    }
    None
}

fn check_port_available(port: u16) -> bool {
    use std::net::TcpListener;
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, detect_local_openclaw])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
