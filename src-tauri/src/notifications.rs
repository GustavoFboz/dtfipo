use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
pub fn desktop_native_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    let title = title.trim();
    let body = body.trim();

    if title.is_empty() && body.is_empty() {
        return Ok(());
    }

    let safe_title = if title.is_empty() { "DentalFlow" } else { title };
    let safe_body = if body.len() > 420 { &body[..420] } else { body };

    app.notification()
        .builder()
        .title(safe_title)
        .body(safe_body)
        .show()
        .map_err(|error| format!("Falha ao exibir notificação nativa: {error}"))?;

    Ok(())
}
