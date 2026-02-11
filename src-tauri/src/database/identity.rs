use super::models::DeviceIdentityRow;
use super::DbState;
use tauri::State;

#[tauri::command]
pub fn db_get_device_identity(db: State<'_, DbState>) -> Result<Option<DeviceIdentityRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT device_id, public_key, private_key, created_at FROM device_identity WHERE id = 1",
        [],
        |row| {
            Ok(DeviceIdentityRow {
                device_id: row.get(0)?,
                public_key: row.get(1)?,
                private_key: row.get(2)?,
                created_at: row.get(3)?,
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
pub fn db_save_device_identity(
    db: State<'_, DbState>,
    identity: DeviceIdentityRow,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO device_identity (id, device_id, public_key, private_key)
         VALUES (1, ?1, ?2, ?3)",
        rusqlite::params![identity.device_id, identity.public_key, identity.private_key],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
