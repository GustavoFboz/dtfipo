use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[tauri::command]
pub fn desktop_notification_sound() -> bool {
    // The actual notification sound is attached to the Windows toast itself in
    // `desktop_native_notification`. Keeping this command available avoids
    // breaking older frontend calls, but it no longer tries to emulate WinRT
    // sound URIs through the legacy winmm PlaySound alias API.
    true
}

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

    let safe_title = if title.is_empty() {
        "DentalFlow".to_string()
    } else {
        truncate_chars(title, 120)
    };
    let safe_body = truncate_chars(body, 420);

    // IMPORTANT: on Windows this goes through notify-rust ->
    // tauri-winrt-notification. `Default` is parsed as WinRT's
    // ms-winsoundevent:Notification.Default, so the audio is part of the same
    // native toast instead of being fired separately through legacy winmm.
    // This preserves the low-latency realtime path and avoids double sounds.
    app.notification()
        .builder()
        .title(safe_title)
        .body(safe_body)
        .sound("Default")
        .show()
        .map_err(|error| format!("Falha ao exibir notificação nativa: {error}"))?;

    Ok(())
}
