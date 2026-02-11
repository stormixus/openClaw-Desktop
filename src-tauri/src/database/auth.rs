use super::models::DeviceAuthRow;
use super::DbState;
use tauri::State;

#[tauri::command]
pub fn db_get_device_auth(
    db: State<'_, DbState>,
    device_id: String,
    role: String,
) -> Result<Option<DeviceAuthRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT device_id, role, token, scopes, updated_at
         FROM device_auth WHERE device_id = ?1 AND role = ?2",
        rusqlite::params![device_id, role],
        |row| {
            Ok(DeviceAuthRow {
                device_id: row.get(0)?,
                role: row.get(1)?,
                token: row.get(2)?,
                scopes: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    );

    match result {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn db_save_device_auth(db: State<'_, DbState>, entry: DeviceAuthRow) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO device_auth (device_id, role, token, scopes, updated_at)
         VALUES (?1, ?2, ?3, ?4, unixepoch())",
        rusqlite::params![entry.device_id, entry.role, entry.token, entry.scopes],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_clear_device_auth(
    db: State<'_, DbState>,
    device_id: String,
    role: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM device_auth WHERE device_id = ?1 AND role = ?2",
        rusqlite::params![device_id, role],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
