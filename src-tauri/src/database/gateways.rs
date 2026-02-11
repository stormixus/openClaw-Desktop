use super::models::GatewayRow;
use super::DbState;
use tauri::State;

#[tauri::command]
pub fn db_get_gateways(db: State<'_, DbState>) -> Result<Vec<GatewayRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, url, auth_method, token, password, device_token,
                    active_session_key, active_npc_theme_id, device_id,
                    sort_order, created_at, updated_at
             FROM gateways ORDER BY sort_order ASC, created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(GatewayRow {
                id: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                auth_method: row.get(3)?,
                token: row.get(4)?,
                password: row.get(5)?,
                device_token: row.get(6)?,
                active_session_key: row.get::<_, Option<String>>(7)?.unwrap_or_else(|| "main".to_string()),
                active_npc_theme_id: row.get::<_, Option<String>>(8)?.unwrap_or_else(|| "default".to_string()),
                device_id: row.get(9)?,
                sort_order: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut gateways = Vec::new();
    for row in rows {
        gateways.push(row.map_err(|e| e.to_string())?);
    }
    Ok(gateways)
}

#[tauri::command]
pub fn db_save_gateway(db: State<'_, DbState>, gateway: GatewayRow) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO gateways (id, name, url, auth_method, token, password, device_token,
                               active_session_key, active_npc_theme_id, device_id, sort_order, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, unixepoch())
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             url = excluded.url,
             auth_method = excluded.auth_method,
             token = excluded.token,
             password = excluded.password,
             device_token = excluded.device_token,
             active_session_key = excluded.active_session_key,
             active_npc_theme_id = excluded.active_npc_theme_id,
             device_id = excluded.device_id,
             sort_order = excluded.sort_order,
             updated_at = unixepoch()",
        rusqlite::params![
            gateway.id,
            gateway.name,
            gateway.url,
            gateway.auth_method,
            gateway.token,
            gateway.password,
            gateway.device_token,
            gateway.active_session_key,
            gateway.active_npc_theme_id,
            gateway.device_id,
            gateway.sort_order,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_update_gateway_orders(db: State<'_, DbState>, updates: Vec<(String, i32)>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (id, order) in updates {
        tx.execute(
            "UPDATE gateways SET sort_order = ?1 WHERE id = ?2",
            rusqlite::params![order, id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_delete_gateway(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM gateways WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_get_active_gateway_id(db: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let value: String = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'active_gateway_id'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

#[tauri::command]
pub fn db_set_active_gateway_id(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_gateway_id', ?1)",
        [&id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_update_gateway_state(
    db: State<'_, DbState>,
    id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let column = match key.as_str() {
        "active_session_key" => "active_session_key",
        "active_npc_theme_id" => "active_npc_theme_id",
        "device_id" => "device_id",
        "token" => "token",
        "device_token" => "device_token",
        _ => return Err(format!("Unknown gateway state key: {}", key)),
    };
    let sql = format!(
        "UPDATE gateways SET {} = ?1, updated_at = unixepoch() WHERE id = ?2",
        column
    );
    conn.execute(&sql, rusqlite::params![value, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
