use super::models::SettingsRow;
use super::DbState;
use tauri::State;

#[tauri::command]
pub fn db_get_settings(db: State<'_, DbState>) -> Result<SettingsRow, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT auto_update, launch_on_startup, minimize_to_tray, api_keys FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(SettingsRow {
                auto_update: row.get::<_, i32>(0)? != 0,
                launch_on_startup: row.get::<_, i32>(1)? != 0,
                minimize_to_tray: row.get::<_, i32>(2)? != 0,
                api_keys: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_save_settings(db: State<'_, DbState>, settings: SettingsRow) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (id, auto_update, launch_on_startup, minimize_to_tray, api_keys)
         VALUES (1, ?1, ?2, ?3, ?4)",
        rusqlite::params![
            settings.auto_update as i32,
            settings.launch_on_startup as i32,
            settings.minimize_to_tray as i32,
            settings.api_keys,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
