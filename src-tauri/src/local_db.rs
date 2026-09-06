use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const SCHEMA_VERSION: i64 = 1;
const MAX_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;
const MAX_LIST_LIMIT: i64 = 500;

pub struct LocalDb {
    connection: Mutex<Connection>,
    path: PathBuf,
}

#[derive(Serialize)]
pub struct DesktopRuntimeInfo {
    platform: &'static str,
    database_path: String,
    schema_version: i64,
}

#[derive(Serialize)]
pub struct LocalCacheEntry {
    owner_id: String,
    namespace: String,
    key: String,
    payload: Value,
    updated_at: i64,
}

#[derive(Deserialize)]
pub struct OutboxInput {
    id: String,
    owner_id: String,
    entity_type: String,
    entity_id: Option<String>,
    operation: String,
    payload: Value,
    base_version: Option<String>,
}

#[derive(Serialize)]
pub struct OutboxEntry {
    id: String,
    owner_id: String,
    entity_type: String,
    entity_id: Option<String>,
    operation: String,
    payload: Value,
    base_version: Option<String>,
    status: String,
    attempts: i64,
    last_error: Option<String>,
    created_at: i64,
    updated_at: i64,
}

pub fn initialize(app: &AppHandle) -> Result<LocalDb, Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;

    let path = app_data_dir.join("dentalflow.sqlite3");
    let connection = Connection::open(&path)?;

    connection.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS local_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS local_cache (
            owner_id TEXT NOT NULL,
            namespace TEXT NOT NULL,
            cache_key TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (owner_id, namespace, cache_key)
        );

        CREATE INDEX IF NOT EXISTS idx_local_cache_owner_namespace_updated
            ON local_cache (owner_id, namespace, updated_at DESC);

        CREATE TABLE IF NOT EXISTS outbox (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            operation TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            base_version TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_outbox_owner_status_created
            ON outbox (owner_id, status, created_at ASC);
        "#,
    )?;

    connection.execute(
        r#"
        INSERT INTO local_meta (key, value, updated_at)
        VALUES ('schema_version', ?1, ?2)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        "#,
        params![SCHEMA_VERSION.to_string(), now_ms()],
    )?;

    Ok(LocalDb {
        connection: Mutex::new(connection),
        path,
    })
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn lock_connection<'a>(
    state: &'a State<'_, LocalDb>,
) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state
        .connection
        .lock()
        .map_err(|_| "Não foi possível acessar o banco local do DentalFlow.".to_string())
}

fn validate_text(value: &str, field: &str, max_len: usize) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{field} é obrigatório."));
    }
    if trimmed.len() > max_len {
        return Err(format!("{field} excede o tamanho permitido."));
    }
    Ok(())
}

fn encode_payload(payload: &Value) -> Result<String, String> {
    let encoded = serde_json::to_string(payload).map_err(|error| error.to_string())?;
    if encoded.len() > MAX_PAYLOAD_BYTES {
        return Err("O payload local excede o limite de 8 MB.".to_string());
    }
    Ok(encoded)
}

fn decode_payload(encoded: &str) -> Result<Value, String> {
    serde_json::from_str(encoded).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn desktop_runtime_info(state: State<'_, LocalDb>) -> Result<DesktopRuntimeInfo, String> {
    let connection = lock_connection(&state)?;
    let schema_version = connection
        .query_row(
            "SELECT value FROM local_meta WHERE key = 'schema_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(SCHEMA_VERSION);

    Ok(DesktopRuntimeInfo {
        platform: "tauri",
        database_path: state.path.to_string_lossy().into_owned(),
        schema_version,
    })
}

#[tauri::command]
pub fn local_cache_put(
    state: State<'_, LocalDb>,
    owner_id: String,
    namespace: String,
    key: String,
    payload: Value,
) -> Result<(), String> {
    validate_text(&owner_id, "owner_id", 160)?;
    validate_text(&namespace, "namespace", 120)?;
    validate_text(&key, "key", 320)?;
    let payload_json = encode_payload(&payload)?;
    let timestamp = now_ms();

    let connection = lock_connection(&state)?;
    connection
        .execute(
            r#"
            INSERT INTO local_cache (owner_id, namespace, cache_key, payload_json, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(owner_id, namespace, cache_key) DO UPDATE SET
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at
            "#,
            params![owner_id, namespace, key, payload_json, timestamp],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn local_cache_get(
    state: State<'_, LocalDb>,
    owner_id: String,
    namespace: String,
    key: String,
) -> Result<Option<LocalCacheEntry>, String> {
    validate_text(&owner_id, "owner_id", 160)?;
    validate_text(&namespace, "namespace", 120)?;
    validate_text(&key, "key", 320)?;

    let connection = lock_connection(&state)?;
    let row: Option<(String, i64)> = connection
        .query_row(
            r#"
            SELECT payload_json, updated_at
            FROM local_cache
            WHERE owner_id = ?1 AND namespace = ?2 AND cache_key = ?3
            "#,
            params![&owner_id, &namespace, &key],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    match row {
        Some((payload_json, updated_at)) => Ok(Some(LocalCacheEntry {
            owner_id,
            namespace,
            key,
            payload: decode_payload(&payload_json)?,
            updated_at,
        })),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn local_cache_list(
    state: State<'_, LocalDb>,
    owner_id: String,
    namespace: String,
    limit: Option<i64>,
) -> Result<Vec<LocalCacheEntry>, String> {
    validate_text(&owner_id, "owner_id", 160)?;
    validate_text(&namespace, "namespace", 120)?;
    let limit = limit.unwrap_or(100).clamp(1, MAX_LIST_LIMIT);

    let connection = lock_connection(&state)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT cache_key, payload_json, updated_at
            FROM local_cache
            WHERE owner_id = ?1 AND namespace = ?2
            ORDER BY updated_at DESC
            LIMIT ?3
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![&owner_id, &namespace, limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        let (key, payload_json, updated_at) = row.map_err(|error| error.to_string())?;
        entries.push(LocalCacheEntry {
            owner_id: owner_id.clone(),
            namespace: namespace.clone(),
            key,
            payload: decode_payload(&payload_json)?,
            updated_at,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn local_cache_delete(
    state: State<'_, LocalDb>,
    owner_id: String,
    namespace: String,
    key: String,
) -> Result<(), String> {
    validate_text(&owner_id, "owner_id", 160)?;
    validate_text(&namespace, "namespace", 120)?;
    validate_text(&key, "key", 320)?;

    let connection = lock_connection(&state)?;
    connection
        .execute(
            "DELETE FROM local_cache WHERE owner_id = ?1 AND namespace = ?2 AND cache_key = ?3",
            params![owner_id, namespace, key],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn local_cache_clear_owner(state: State<'_, LocalDb>, owner_id: String) -> Result<(), String> {
    validate_text(&owner_id, "owner_id", 160)?;
    let connection = lock_connection(&state)?;
    connection
        .execute(
            "DELETE FROM local_cache WHERE owner_id = ?1",
            params![owner_id],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn outbox_enqueue(state: State<'_, LocalDb>, input: OutboxInput) -> Result<String, String> {
    validate_text(&input.id, "id", 160)?;
    validate_text(&input.owner_id, "owner_id", 160)?;
    validate_text(&input.entity_type, "entity_type", 120)?;
    validate_text(&input.operation, "operation", 80)?;
    if let Some(entity_id) = input.entity_id.as_deref() {
        validate_text(entity_id, "entity_id", 320)?;
    }

    let payload_json = encode_payload(&input.payload)?;
    let timestamp = now_ms();
    let id = input.id.clone();
    let connection = lock_connection(&state)?;
    connection
        .execute(
            r#"
            INSERT INTO outbox (
                id, owner_id, entity_type, entity_id, operation, payload_json,
                base_version, status, attempts, last_error, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', 0, NULL, ?8, ?8)
            ON CONFLICT(id) DO UPDATE SET
                payload_json = excluded.payload_json,
                base_version = excluded.base_version,
                status = 'pending',
                last_error = NULL,
                updated_at = excluded.updated_at
            "#,
            params![
                input.id,
                input.owner_id,
                input.entity_type,
                input.entity_id,
                input.operation,
                payload_json,
                input.base_version,
                timestamp,
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn outbox_pending(
    state: State<'_, LocalDb>,
    owner_id: String,
    limit: Option<i64>,
) -> Result<Vec<OutboxEntry>, String> {
    validate_text(&owner_id, "owner_id", 160)?;
    let limit = limit.unwrap_or(100).clamp(1, MAX_LIST_LIMIT);
    let connection = lock_connection(&state)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, entity_type, entity_id, operation, payload_json, base_version,
                   status, attempts, last_error, created_at, updated_at
            FROM outbox
            WHERE owner_id = ?1 AND status IN ('pending', 'error')
            ORDER BY created_at ASC
            LIMIT ?2
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![&owner_id, limit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, i64>(9)?,
                row.get::<_, i64>(10)?,
            ))
        })
        .map_err(|error| error.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        let (
            id,
            entity_type,
            entity_id,
            operation,
            payload_json,
            base_version,
            status,
            attempts,
            last_error,
            created_at,
            updated_at,
        ) = row.map_err(|error| error.to_string())?;

        entries.push(OutboxEntry {
            id,
            owner_id: owner_id.clone(),
            entity_type,
            entity_id,
            operation,
            payload: decode_payload(&payload_json)?,
            base_version,
            status,
            attempts,
            last_error,
            created_at,
            updated_at,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn outbox_mark(
    state: State<'_, LocalDb>,
    owner_id: String,
    id: String,
    status: String,
    last_error: Option<String>,
) -> Result<(), String> {
    validate_text(&owner_id, "owner_id", 160)?;
    validate_text(&id, "id", 160)?;
    let allowed_status = ["pending", "syncing", "done", "error", "conflict"];
    if !allowed_status.contains(&status.as_str()) {
        return Err("Status inválido para a outbox local.".to_string());
    }

    let connection = lock_connection(&state)?;
    connection
        .execute(
            r#"
            UPDATE outbox
            SET status = ?3,
                last_error = ?4,
                attempts = CASE WHEN ?3 = 'error' THEN attempts + 1 ELSE attempts END,
                updated_at = ?5
            WHERE owner_id = ?1 AND id = ?2
            "#,
            params![owner_id, id, status, last_error, now_ms()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn outbox_clear_done(state: State<'_, LocalDb>, owner_id: String) -> Result<usize, String> {
    validate_text(&owner_id, "owner_id", 160)?;
    let connection = lock_connection(&state)?;
    connection
        .execute(
            "DELETE FROM outbox WHERE owner_id = ?1 AND status = 'done'",
            params![owner_id],
        )
        .map_err(|error| error.to_string())
}
