// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

mod database;
mod document;

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

/// List all installed system font family names, sorted and deduplicated.
#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    use font_kit::source::SystemSource;
    use std::collections::BTreeSet;

    let source = SystemSource::new();
    let mut families = BTreeSet::new();

    if let Ok(all) = source.all_families() {
        for name in all {
            // Skip hidden/internal fonts starting with '.' or '#'
            if !name.starts_with('.') && !name.starts_with('#') {
                families.insert(name);
            }
        }
    }

    families.into_iter().collect()
}

#[tauri::command]
fn create_temp_document(ext: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("openclaw-forge");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let filename = format!("새 문서-{}.{}", timestamp, ext);
    let path = temp_dir.join(&filename);

    let content: &[u8] = match ext.as_str() {
        "xlsx" => {
            // Minimal valid xlsx: create via rust_xlsxwriter or just empty file
            // doc_open handles empty xlsx gracefully
            b""
        }
        "docx" => b"",
        _ => b"",
    };

    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid path encoding".to_string())
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AssistantMeta {
    pub name: Option<String>,
    pub avatar: Option<String>,
}

/// Fetch assistant metadata from the gateway's web UI HTML.
/// Parses window.__OPENCLAW_ASSISTANT_NAME__ and __OPENCLAW_ASSISTANT_AVATAR__.
/// This runs on the Rust side to bypass browser CORS restrictions.
#[tauri::command]
async fn fetch_assistant_meta(url: String) -> Result<AssistantMeta, String> {
    // Convert ws:// to http://, wss:// to https://
    let http_url = url
        .replace("ws://", "http://")
        .replace("wss://", "https://");

    // Ensure path ends with /chat
    let fetch_url = if http_url.ends_with('/') {
        format!("{}chat", http_url)
    } else if http_url.ends_with("/chat") {
        http_url.clone()
    } else {
        format!("{}/chat", http_url.trim_end_matches('/'))
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client.get(&fetch_url)
        .send()
        .await
        .map_err(|e| format!("HTTP fetch failed: {}", e))?;

    let html = response.text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Parse window.__OPENCLAW_ASSISTANT_NAME__="value"
    let name = extract_window_var(&html, "__OPENCLAW_ASSISTANT_NAME__");
    let avatar = extract_window_var(&html, "__OPENCLAW_ASSISTANT_AVATAR__");

    Ok(AssistantMeta { name, avatar })
}

fn extract_window_var(html: &str, var_name: &str) -> Option<String> {
    let pattern = format!("{}=\"", var_name);
    if let Some(start) = html.find(&pattern) {
        let value_start = start + pattern.len();
        if let Some(end) = html[value_start..].find('"') {
            return Some(html[value_start..value_start + end].to_string());
        }
    }
    None
}

/// Get the backgrounds directory path (app_data_dir/backgrounds)
fn get_bg_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let bg_dir = data_dir.join("backgrounds");
    if !bg_dir.exists() {
        fs::create_dir_all(&bg_dir)
            .map_err(|e| format!("Failed to create backgrounds dir: {}", e))?;
    }
    Ok(bg_dir)
}

fn validate_theme_id(theme_id: &str) -> Result<(), String> {
    if theme_id.is_empty() || !theme_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("Invalid theme_id: {}", theme_id));
    }
    Ok(())
}

/// Save a base64-encoded PNG image as a file. Returns the absolute file path.
#[tauri::command]
fn save_npc_background(app: tauri::AppHandle, theme_id: String, base64_data: String) -> Result<String, String> {
    validate_theme_id(&theme_id)?;
    let bg_dir = get_bg_dir(&app)?;
    let file_path = bg_dir.join(format!("{}.png", theme_id));

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    fs::write(&file_path, &bytes)
        .map_err(|e| format!("File write error: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Check if a background file exists for a theme. Returns the path if it exists.
#[tauri::command]
fn get_npc_bg_path(app: tauri::AppHandle, theme_id: String) -> Result<Option<String>, String> {
    validate_theme_id(&theme_id)?;
    let bg_dir = get_bg_dir(&app)?;
    let file_path = bg_dir.join(format!("{}.png", theme_id));
    if file_path.exists() {
        Ok(Some(file_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Delete a background file for a theme.
#[tauri::command]
fn delete_npc_background(app: tauri::AppHandle, theme_id: String) -> Result<(), String> {
    validate_theme_id(&theme_id)?;
    let bg_dir = get_bg_dir(&app)?;
    let file_path = bg_dir.join(format!("{}.png", theme_id));
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("File delete error: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            fs::create_dir_all(&data_dir)
                .map_err(|e| format!("Failed to create data dir: {}", e))?;
            let conn = database::init_db(&data_dir)
                .map_err(|e| format!("Failed to init database: {}", e))?;
            app.manage(database::DbState(std::sync::Mutex::new(conn)));
            app.manage(document::manager::SessionManager::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            detect_local_openclaw,
            fetch_assistant_meta,
            list_system_fonts,
            create_temp_document,
            save_npc_background,
            get_npc_bg_path,
            delete_npc_background,
            // Document commands
            document::commands::doc_open,
            document::commands::doc_read_view,
            document::commands::doc_set_text_content,
            document::commands::doc_get_pdf_bytes,
            document::commands::doc_pdf_ocr_extract,
            document::commands::doc_pdf_ocr_layout,
            document::commands::doc_ocr_list_langs,
            document::commands::doc_ocr_ensure_langs,
            document::commands::doc_pdf_export_overlay,
            document::commands::doc_save_text_as_docx,
            document::commands::doc_stage_patch,
            document::commands::doc_commit,
            document::commands::doc_save,
            document::commands::doc_discard,
            document::commands::doc_close,
            document::commands::doc_undo,
            document::commands::doc_redo,
            document::commands::doc_list_sessions,
            // Database commands
            database::gateways::db_get_gateways,
            database::gateways::db_save_gateway,
            database::gateways::db_delete_gateway,
            database::gateways::db_get_active_gateway_id,
            database::gateways::db_set_active_gateway_id,
            database::gateways::db_update_gateway_state,
            database::gateways::db_update_gateway_orders,
            database::settings::db_get_settings,
            database::settings::db_save_settings,
            database::identity::db_get_device_identity,
            database::identity::db_save_device_identity,
            database::auth::db_get_device_auth,
            database::auth::db_save_device_auth,
            database::auth::db_clear_device_auth,
            database::themes::db_get_custom_themes,
            database::themes::db_save_custom_theme,
            database::themes::db_delete_custom_theme,
            database::themes::db_get_bg_path,
            database::themes::db_set_bg_path,
            database::games::db_get_games,
            database::games::db_upsert_game,
            database::games::db_update_game_visibility,
            database::games::db_update_game_orders,
            database::games::db_seed_games,
            database::migration::db_migrate_from_json,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
