mod device_identity;
mod local_db;
mod window_controls;

use device_identity::{device_identity_clear, device_identity_get, device_identity_set};
use local_db::{
    desktop_runtime_info, local_cache_clear_owner, local_cache_delete, local_cache_get,
    local_cache_list, local_cache_put, outbox_clear_done, outbox_enqueue, outbox_mark,
    outbox_pending,
};
use tauri::Manager;
use window_controls::{desktop_window_action, desktop_window_state};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let local_db = local_db::initialize(app.handle())?;
            app.manage(local_db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_info,
            desktop_window_state,
            desktop_window_action,
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
        .expect("error while running DentalFlow Desktop");
}
