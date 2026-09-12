mod device_identity;
mod local_db;
mod notifications;
mod printing;
mod window_controls;

use device_identity::{device_identity_clear, device_identity_get, device_identity_set};
use local_db::{
    desktop_runtime_info, local_cache_clear_owner, local_cache_delete, local_cache_get,
    local_cache_list, local_cache_put, outbox_clear_done, outbox_enqueue, outbox_mark,
    outbox_pending,
};
use notifications::{desktop_native_notification, desktop_notification_sound};
use printing::{desktop_list_printers, desktop_open_printer_settings, desktop_print_text};
use tauri::{AppHandle, Manager};
use window_controls::{desktop_window_action, desktop_window_state};

#[cfg(desktop)]
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Must be registered before the other plugins. If DentalFlow is already
    // running silently in the tray and the user launches it again, the second
    // process exits and the existing main window is simply restored.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                show_main_window(app);
            }))
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--background"]),
            ));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let local_db = local_db::initialize(app.handle())?;
            app.manage(local_db);

            #[cfg(mobile)]
            {
                use tauri::plugin::PermissionState;
                use tauri_plugin_notification::NotificationExt;

                // Android 13+ requires runtime permission for native notifications.
                // Ask once during the first mobile bootstrap; later launches simply
                // reuse the persisted system decision.
                if matches!(
                    app.notification().permission_state(),
                    Ok(PermissionState::Unknown)
                ) {
                    let _ = app.notification().request_permission();
                }
            }

            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                use tauri_plugin_autostart::ManagerExt;

                // DentalFlow starts with Windows using --background. The WebView
                // remains alive so the authenticated notification bridge can keep
                // receiving events without opening the interface.
                let autostart = app.autolaunch();
                if !autostart.is_enabled().unwrap_or(false) {
                    let _ = autostart.enable();
                }

                let open_item = MenuItem::with_id(app, "open", "Abrir DentalFlow", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Encerrar DentalFlow", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                let mut tray = TrayIconBuilder::new()
                    .tooltip("DentalFlow — notificações em segundo plano")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open" => show_main_window(app),
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_main_window(tray.app_handle());
                        }
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
                tray.build(app)?;

                let background_start = std::env::args().any(|arg| arg == "--background");
                if !background_start {
                    show_main_window(app.handle());
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Covers Alt+F4/taskbar close in addition to the custom X button.
                // Explicit `Encerrar DentalFlow` in the tray uses app.exit(0) and
                // remains the intentional way to terminate background alerts.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_info,
            desktop_window_state,
            desktop_window_action,
            desktop_native_notification,
            desktop_notification_sound,
            desktop_list_printers,
            desktop_open_printer_settings,
            desktop_print_text,
            device_identity_get,
            device_identity_set,
            device_identity_clear,
            local_cache_put,
            local_cache_get,
            local_cache_list,
            local_cache_delete,
            local_cache_clear_owner,
            outbox_enqueue,
            outbox_pending,
            outbox_mark,
            outbox_clear_done,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DentalFlow");
}
