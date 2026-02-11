use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GatewayRow {
    pub id: String,
    pub name: String,
    pub url: String,
    pub auth_method: String,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub device_token: Option<String>,
    #[serde(default = "default_session_key")]
    pub active_session_key: String,
    #[serde(default = "default_theme_id")]
    pub active_npc_theme_id: String,
    #[serde(default)]
    pub device_id: Option<String>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(default)]
    pub updated_at: Option<i64>,
}

fn default_session_key() -> String {
    "main".to_string()
}

fn default_theme_id() -> String {
    "default".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsRow {
    pub auto_update: bool,
    pub launch_on_startup: bool,
    pub minimize_to_tray: bool,
    pub api_keys: String, // JSON string
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentityRow {
    pub device_id: String,
    pub public_key: String,
    pub private_key: String,
    #[serde(default)]
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthRow {
    pub device_id: String,
    pub role: String,
    pub token: String,
    #[serde(default = "default_scopes")]
    pub scopes: String, // JSON array string
    #[serde(default)]
    pub updated_at: Option<i64>,
}

fn default_scopes() -> String {
    "[]".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NpcThemeRow {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub data: String, // JSON string of theme data
    #[serde(default)]
    pub created_at: Option<i64>,
}

/// Payload sent from the frontend for one-time migration
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationPayload {
    #[serde(default)]
    pub gateways: Option<Vec<GatewayRow>>,
    #[serde(default)]
    pub active_gateway_id: Option<String>,
    #[serde(default)]
    pub settings: Option<SettingsRow>,
    #[serde(default)]
    pub device_identity: Option<DeviceIdentityRow>,
    #[serde(default)]
    pub device_auth_entries: Option<Vec<DeviceAuthRow>>,
    #[serde(default)]
    pub custom_themes: Option<Vec<NpcThemeRow>>,
    #[serde(default)]
    pub bg_paths: Option<Vec<BgPathEntry>>,
    #[serde(default)]
    pub gateway_sessions: Option<Vec<GatewaySessionEntry>>,
    #[serde(default)]
    pub gateway_theme_ids: Option<Vec<GatewayThemeEntry>>,
    #[serde(default)]
    pub gateway_device_ids: Option<Vec<GatewayDeviceIdEntry>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BgPathEntry {
    pub theme_id: String,
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewaySessionEntry {
    pub gateway_id: String,
    pub session_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayThemeEntry {
    pub gateway_id: String,
    pub theme_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayDeviceIdEntry {
    pub gateway_id: String,
    pub device_id: String,
}
