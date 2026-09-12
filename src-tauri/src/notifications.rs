use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "windows")]
use std::{path::PathBuf, sync::OnceLock};

#[cfg(target_os = "windows")]
#[link(name = "winmm")]
extern "system" {
    fn PlaySoundW(psz_sound: *const u16, hmod: isize, fdw_sound: u32) -> i32;
    fn mciSendStringW(
        command: *const u16,
        return_string: *mut u16,
        return_length: u32,
        callback: isize,
    ) -> u32;
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn MessageBeep(u_type: u32) -> i32;
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(target_os = "windows")]
fn wide(value: &str) -> Vec<u16> {
    format!("{value}\0").encode_utf16().collect()
}

#[cfg(target_os = "windows")]
fn custom_sound_path() -> Option<&'static PathBuf> {
    static PATH: OnceLock<Option<PathBuf>> = OnceLock::new();
    PATH.get_or_init(|| {
        let bytes = include_bytes!("../resources/dentalflow_notification.mp3");
        let path = std::env::temp_dir().join("dentalflow_notification_065.mp3");

        let should_write = std::fs::metadata(&path)
            .map(|metadata| metadata.len() != bytes.len() as u64)
            .unwrap_or(true);

        if should_write && std::fs::write(&path, bytes).is_err() {
            return None;
        }
        Some(path)
    })
    .as_ref()
}

#[cfg(target_os = "windows")]
unsafe fn mci(command: &str) -> bool {
    mciSendStringW(wide(command).as_ptr(), std::ptr::null_mut(), 0, 0) == 0
}

#[cfg(target_os = "windows")]
unsafe fn play_embedded_dentalflow_sound() -> bool {
    let Some(path) = custom_sound_path() else {
        return false;
    };
    let path = path.to_string_lossy().replace('"', "");

    // MCI gives us dependable native MP3 playback without routing through the
    // WebView. The audio bytes are embedded in the executable through
    // include_bytes!, while the tiny temp copy is only a WinMM playback target.
    let _ = mci("close dentalflow_notification");
    if !mci(&format!(
        "open \"{path}\" type mpegvideo alias dentalflow_notification"
    )) {
        return false;
    }
    if mci("play dentalflow_notification from 0") {
        return true;
    }
    let _ = mci("close dentalflow_notification");
    false
}

fn play_native_notification_sound() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        if play_embedded_dentalflow_sound() {
            return true;
        }

        // If a Windows media component is unavailable, retain the system sound
        // chain rather than silently dropping a notification.
        const SND_ASYNC: u32 = 0x0001;
        const SND_NODEFAULT: u32 = 0x0002;
        const SND_ALIAS: u32 = 0x0001_0000;
        let flags = SND_ALIAS | SND_ASYNC | SND_NODEFAULT;

        for alias in ["SystemNotification", "Notification.Default", "SystemAsterisk"] {
            let alias_wide = wide(alias);
            if PlaySoundW(alias_wide.as_ptr(), 0, flags) != 0 {
                return true;
            }
        }

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

    // Sound is dispatched exactly once by DesktopNotificationSoundBridge. The
    // Windows toast itself stays silent so background delivery cannot double-play.
    app.notification()
        .builder()
        .title(safe_title)
        .body(safe_body)
        .show()
        .map_err(|error| format!("Falha ao exibir notificação nativa: {error}"))?;

    Ok(())
}
