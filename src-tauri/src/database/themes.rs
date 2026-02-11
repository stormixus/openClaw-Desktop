use super::models::NpcThemeRow;
use super::DbState;
use tauri::State;

#[tauri::command]
pub fn db_get_custom_themes(db: State<'_, DbState>) -> Result<Vec<NpcThemeRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, data, created_at FROM npc_themes ORDER BY created_at")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(NpcThemeRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                data: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut themes = Vec::new();
    for row in rows {
        themes.push(row.map_err(|e| e.to_string())?);
    }
    Ok(themes)
}

#[tauri::command]
pub fn db_save_custom_theme(db: State<'_, DbState>, theme: NpcThemeRow) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO npc_themes (id, name, description, data)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             data = excluded.data",
        rusqlite::params![theme.id, theme.name, theme.description, theme.data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_delete_custom_theme(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM npc_themes WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_get_bg_path(db: State<'_, DbState>, theme_id: String) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT file_path FROM npc_bg_paths WHERE theme_id = ?1",
        [&theme_id],
        |row| row.get(0),
    );

    match result {
        Ok(path) => Ok(Some(path)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn db_set_bg_path(
    db: State<'_, DbState>,
    theme_id: String,
    path: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO npc_bg_paths (theme_id, file_path) VALUES (?1, ?2)",
        rusqlite::params![theme_id, path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
