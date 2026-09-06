use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Manager};

const IDENTITY_FILE: &str = "dentalflow.identity.json";
// This is deliberately finite. A device must periodically reconnect so the
// server can revalidate membership/permissions instead of granting indefinite
// offline access from a stale cloud session.
const MAX_OFFLINE_WINDOW_MS: i64 = 14 * 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceIdentity {
    pub user_id: String,
    pub email: Option<String>,
    pub full_name: Option<String>,
    pub clinic_id: Option<String>,
    pub validated_at: i64,
    pub valid_until: i64,
}

#[derive(Debug, Deserialize)]
pub struct DeviceIdentityInput {
    pub user_id: String,
    pub email: Option<String>,
    pub full_name: Option<String>,
    pub clinic_id: Option<String>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn identity_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(IDENTITY_FILE))
}

fn validate_user_id(user_id: &str) -> Result<(), String> {
    let trimmed = user_id.trim();
    if trimmed.is_empty() || trimmed.len() > 160 {
        return Err("Identidade local inválida.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn device_identity_get(app: AppHandle) -> Result<Option<DeviceIdentity>, String> {
    let path = identity_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let identity = serde_json::from_str::<DeviceIdentity>(&raw).map_err(|error| error.to_string())?;
    validate_user_id(&identity.user_id)?;
    if identity.valid_until <= now_ms() {
        return Ok(None);
    }
    Ok(Some(identity))
}

#[tauri::command]
pub fn device_identity_set(app: AppHandle, input: DeviceIdentityInput) -> Result<DeviceIdentity, String> {
    validate_user_id(&input.user_id)?;
    let validated_at = now_ms();
    let identity = DeviceIdentity {
        user_id: input.user_id.trim().to_string(),
        email: input.email.map(|value| value.trim().chars().take(320).collect()),
        full_name: input.full_name.map(|value| value.trim().chars().take(240).collect()),
        clinic_id: input.clinic_id.map(|value| value.trim().chars().take(160).collect()),
        validated_at,
        valid_until: validated_at + MAX_OFFLINE_WINDOW_MS,
    };
    let path = identity_path(&app)?;
    let temp = path.with_extension("json.tmp");
    let encoded = serde_json::to_vec(&identity).map_err(|error| error.to_string())?;
    fs::write(&temp, encoded).map_err(|error| error.to_string())?;
    // Windows does not reliably replace an existing destination with rename().
    // Remove the previous provision only after the new temp file is durable.
    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    fs::rename(&temp, &path).map_err(|error| error.to_string())?;
    Ok(identity)
}

#[tauri::command]
pub fn device_identity_clear(app: AppHandle) -> Result<(), String> {
    let path = identity_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}
