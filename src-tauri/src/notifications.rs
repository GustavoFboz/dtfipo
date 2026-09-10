use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn MessageBeep(u_type: u32) -> i32;
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn play_native_notification_sound() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        // MB_ICONASTERISK / system notification sound. It respects the user's
        // Windows sound scheme and volume instead of relying on WebView autoplay.
        return MessageBeep(0x0000_0040) != 0;
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
pub fn desktop_notification_sound() -> bool {
    play_native_notification_sound()
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

    let _ = play_native_notification_sound();

    app.notification()
        .builder()
        .title(safe_title)
        .body(safe_body)
        .show()
        .map_err(|error| format!("Falha ao exibir notificação nativa: {error}"))?;

    Ok(())
}
