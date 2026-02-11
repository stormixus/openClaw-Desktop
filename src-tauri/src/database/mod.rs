pub mod schema;
pub mod models;
pub mod gateways;
pub mod settings;
pub mod identity;
pub mod auth;
pub mod themes;
pub mod migration;

use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

/// Shared database state managed by Tauri
pub struct DbState(pub Mutex<Connection>);

/// Initialize the database: open (or create) the file and apply schema.
pub fn init_db(app_data_dir: &Path) -> Result<Connection, String> {
    let db_path = app_data_dir.join("openclaw.db");
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("Failed to set PRAGMA: {}", e))?;

    conn.execute_batch(schema::CREATE_SCHEMA)
        .map_err(|e| format!("Failed to apply schema: {}", e))?;

    // Migration: Add sort_order column if it doesn't exist
    // This is a naive migration but safe for adding columns with default values
    let _ = conn.execute("ALTER TABLE gateways ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0", []);

    Ok(conn)
}
