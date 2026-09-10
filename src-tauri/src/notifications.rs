use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "windows")]
#[link(name = "winmm")]
extern "system" {
    fn PlaySoundW(psz_sound: *const u16, hmod: isize, fdw_sound: u32) -> i32;
}

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
        // Use the same Windows notification sound class used by regular native
        // applications. This avoids WebView autoplay latency and follows the
        // user's Windows sound scheme/volume. MessageBeep remains a fallback for
        // systems where the Notification.Default alias is unavailable.
        const SND_ASYNC: u32 = 0x0001;
        const SND_NODEFAULT: u32 = 0x0002;
        const SND_ALIAS: u32 = 0x0001_0000;
        let alias: Vec<u16> = "Notification.Default\0".encode_utf16().collect();
        if PlaySoundW(alias.as_ptr(), 0, SND_ALIAS | SND_ASYNC | SND_NODEFAULT) != 0 {
            return true;
        }
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

    // Play immediately before registering the toast. It is asynchronous, so it
    // does not add perceptible delay to notification delivery.
    let _ = play_native_notification_sound();

    app.notification()
        .builder()
        .title(safe_title)
        .body(safe_body)
        .show()
        .map_err(|error| format!("Falha ao exibir notificação nativa: {error}"))?;

    Ok(())
}
