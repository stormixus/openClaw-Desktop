/// SQL schema for openClaw Desktop SQLite database.

pub const CREATE_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS gateways (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    auth_method TEXT NOT NULL DEFAULT 'token',
    token TEXT,
    password TEXT,
    device_token TEXT,
    active_session_key TEXT DEFAULT 'main',
    active_npc_theme_id TEXT DEFAULT 'default',
    device_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO app_state VALUES ('active_gateway_id', '');

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    auto_update INTEGER NOT NULL DEFAULT 1,
    launch_on_startup INTEGER NOT NULL DEFAULT 0,
    minimize_to_tray INTEGER NOT NULL DEFAULT 1,
    api_keys TEXT NOT NULL DEFAULT '{}'
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS device_identity (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    device_id TEXT NOT NULL,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS device_auth (
    device_id TEXT NOT NULL,
    role TEXT NOT NULL,
    token TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (device_id, role)
);

CREATE TABLE IF NOT EXISTS npc_themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS npc_bg_paths (
    theme_id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    emoji TEXT NOT NULL DEFAULT '',
    title_key TEXT NOT NULL,
    desc_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'playable',
    source TEXT NOT NULL DEFAULT 'builtin',
    visible INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
"#;
