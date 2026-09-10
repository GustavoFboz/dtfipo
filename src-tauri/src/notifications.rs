use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBeep, MB_ICONASTERISK};

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn play_native_notification_sound() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        return MessageBeep(MB_ICONASTERISK) != 0;
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

    // Tauri's Windows toast backend can display correctly while remaining silent
    // depending on the user's notification sound policy. Trigger the Windows
    // notification sound explicitly so the installed app behaves consistently
    // with the in-app notification experience.
    let _ = play_native_notification_sound();

    app.notification()
        .builder()
        .title(safe_title)
        .body(safe_body)
        .show()
        .map_err(|error| format!("Falha ao exibir notificação nativa: {error}"))?;

    Ok(())
}
