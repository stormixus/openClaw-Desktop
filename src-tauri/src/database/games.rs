use super::models::GameRow;
use super::DbState;
use tauri::State;

#[tauri::command]
pub fn db_get_games(db: State<'_, DbState>) -> Result<Vec<GameRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, emoji, title_key, desc_key, status, source,
                    visible, sort_order, created_at
             FROM games ORDER BY sort_order ASC, created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(GameRow {
                id: row.get(0)?,
                emoji: row.get(1)?,
                title_key: row.get(2)?,
                desc_key: row.get(3)?,
                status: row.get(4)?,
                source: row.get(5)?,
                visible: row.get::<_, i32>(6)? != 0,
                sort_order: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut games = Vec::new();
    for row in rows {
        games.push(row.map_err(|e| e.to_string())?);
    }
    Ok(games)
}

#[tauri::command]
pub fn db_upsert_game(db: State<'_, DbState>, game: GameRow) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO games (id, emoji, title_key, desc_key, status, source, visible, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
             emoji = excluded.emoji,
             title_key = excluded.title_key,
             desc_key = excluded.desc_key,
             status = excluded.status,
             source = excluded.source,
             visible = excluded.visible,
             sort_order = excluded.sort_order",
        rusqlite::params![
            game.id,
            game.emoji,
            game.title_key,
            game.desc_key,
            game.status,
            game.source,
            game.visible as i32,
            game.sort_order,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_update_game_visibility(
    db: State<'_, DbState>,
    id: String,
    visible: bool,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE games SET visible = ?1 WHERE id = ?2",
        rusqlite::params![visible as i32, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_update_game_orders(
    db: State<'_, DbState>,
    updates: Vec<(String, i32)>,
) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (id, order) in updates {
        tx.execute(
            "UPDATE games SET sort_order = ?1 WHERE id = ?2",
            rusqlite::params![order, id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_seed_games(db: State<'_, DbState>, games: Vec<GameRow>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (i, game) in games.iter().enumerate() {
        tx.execute(
            "INSERT OR IGNORE INTO games (id, emoji, title_key, desc_key, status, source, visible, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
            rusqlite::params![
                game.id,
                game.emoji,
                game.title_key,
                game.desc_key,
                game.status,
                game.source,
                i as i32,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
