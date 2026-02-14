pub mod schema;
pub mod models;
pub mod gateways;
pub mod settings;
pub mod identity;
pub mod auth;
pub mod themes;
pub mod games;
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
    let has_sort_order: bool = conn
        .prepare("PRAGMA table_info(gateways)")
        .and_then(|mut stmt| {
            let columns: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
                .unwrap_or_default();
            Ok(columns.iter().any(|c| c == "sort_order"))
        })
        .unwrap_or(false);

    if !has_sort_order {
        conn.execute("ALTER TABLE gateways ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0", [])
            .map_err(|e| format!("Failed to add sort_order column: {}", e))?;
    }

    Ok(conn)
}
