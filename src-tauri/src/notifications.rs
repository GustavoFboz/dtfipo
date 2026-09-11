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
        // Windows' documented sound-scheme event for notifications is
        // "SystemNotification". The previous 0.6.3 implementation only tried
        // "Notification.Default", which is not a dependable WinMM alias and can
        // succeed silently depending on the machine's sound scheme. Keep two
        // aliases plus the standard system asterisk/beep as fallbacks so a
        // received DentalFlow notification never depends on WebView audio.
        const SND_ASYNC: u32 = 0x0001;
        const SND_NODEFAULT: u32 = 0x0002;
        const SND_ALIAS: u32 = 0x0001_0000;
        let flags = SND_ALIAS | SND_ASYNC | SND_NODEFAULT;

        for alias in ["SystemNotification", "Notification.Default", "SystemAsterisk"] {
            let wide: Vec<u16> = format!("{alias}\0").encode_utf16().collect();
            if PlaySoundW(wide.as_ptr(), 0, flags) != 0 {
                return true;
            }
        }

        // MB_ICONASTERISK follows the user's Windows sound scheme and master
        // volume. It is intentionally the last fallback so we still prefer the
        // dedicated system notification event whenever it exists.
        MessageBeep(0x0000_0040) != 0
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

    // Sound is dispatched once by DesktopNotificationSoundBridge for every new
    // canonical notification, regardless of whether the window is focused.
    // Keeping the toast command silent prevents a double sound in background.
    app.notification()
        .builder()
        .title(safe_title)
        .body(safe_body)
        .show()
        .map_err(|error| format!("Falha ao exibir notificação nativa: {error}"))?;

    Ok(())
}
