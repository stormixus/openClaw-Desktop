use super::models::MigrationPayload;
use super::DbState;
use tauri::State;

#[tauri::command]
pub fn db_migrate_from_json(db: State<'_, DbState>, data: MigrationPayload) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Run everything in a transaction for atomicity
    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Migrate gateways
        if let Some(gateways) = &data.gateways {
            for gw in gateways {
                conn.execute(
                    "INSERT OR IGNORE INTO gateways (id, name, url, auth_method, token, password, device_token)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    rusqlite::params![
                        gw.id, gw.name, gw.url, gw.auth_method,
                        gw.token, gw.password, gw.device_token,
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Migrate active gateway ID
        if let Some(active_id) = &data.active_gateway_id {
            conn.execute(
                "INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_gateway_id', ?1)",
                [active_id],
            )
            .map_err(|e| e.to_string())?;
        }

        // Migrate per-gateway session keys
        if let Some(sessions) = &data.gateway_sessions {
            for entry in sessions {
                conn.execute(
                    "UPDATE gateways SET active_session_key = ?1 WHERE id = ?2",
                    rusqlite::params![entry.session_key, entry.gateway_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Migrate per-gateway active NPC theme IDs
        if let Some(theme_ids) = &data.gateway_theme_ids {
            for entry in theme_ids {
                conn.execute(
                    "UPDATE gateways SET active_npc_theme_id = ?1 WHERE id = ?2",
                    rusqlite::params![entry.theme_id, entry.gateway_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Migrate per-gateway device IDs
        if let Some(device_ids) = &data.gateway_device_ids {
            for entry in device_ids {
                conn.execute(
                    "UPDATE gateways SET device_id = ?1 WHERE id = ?2",
                    rusqlite::params![entry.device_id, entry.gateway_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Migrate settings
        if let Some(s) = &data.settings {
            conn.execute(
                "INSERT OR REPLACE INTO settings (id, auto_update, launch_on_startup, minimize_to_tray, api_keys)
                 VALUES (1, ?1, ?2, ?3, ?4)",
                rusqlite::params![
                    s.auto_update as i32,
                    s.launch_on_startup as i32,
                    s.minimize_to_tray as i32,
                    s.api_keys,
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        // Migrate device identity
        if let Some(identity) = &data.device_identity {
            conn.execute(
                "INSERT OR REPLACE INTO device_identity (id, device_id, public_key, private_key)
                 VALUES (1, ?1, ?2, ?3)",
                rusqlite::params![identity.device_id, identity.public_key, identity.private_key],
            )
            .map_err(|e| e.to_string())?;
        }

        // Migrate device auth entries
        if let Some(entries) = &data.device_auth_entries {
            for entry in entries {
                conn.execute(
                    "INSERT OR REPLACE INTO device_auth (device_id, role, token, scopes)
                     VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![entry.device_id, entry.role, entry.token, entry.scopes],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Migrate custom NPC themes
        if let Some(themes) = &data.custom_themes {
            for theme in themes {
                conn.execute(
                    "INSERT OR IGNORE INTO npc_themes (id, name, description, data)
                     VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![theme.id, theme.name, theme.description, theme.data],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Migrate background paths
        if let Some(paths) = &data.bg_paths {
            for entry in paths {
                conn.execute(
                    "INSERT OR IGNORE INTO npc_bg_paths (theme_id, file_path)
                     VALUES (?1, ?2)",
                    rusqlite::params![entry.theme_id, entry.file_path],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}
