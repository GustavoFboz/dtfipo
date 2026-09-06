use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct DesktopWindowState {
    pub maximized: bool,
    pub fullscreen: bool,
}

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Janela principal do DentalFlow não encontrada.".to_string())
}

#[tauri::command]
pub fn desktop_window_state(app: AppHandle) -> Result<DesktopWindowState, String> {
    let window = main_window(&app)?;
    Ok(DesktopWindowState {
        maximized: window.is_maximized().map_err(|error| error.to_string())?,
        fullscreen: window.is_fullscreen().map_err(|error| error.to_string())?,
    })
}

#[tauri::command]
pub fn desktop_window_action(app: AppHandle, action: String) -> Result<DesktopWindowState, String> {
    let window = main_window(&app)?;

    match action.as_str() {
        "minimize" => window.minimize().map_err(|error| error.to_string())?,
        "toggle_maximize" => window.toggle_maximize().map_err(|error| error.to_string())?,
        "drag" => window.start_dragging().map_err(|error| error.to_string())?,
        "close" => {
            window.close().map_err(|error| error.to_string())?;
            return Ok(DesktopWindowState {
                maximized: false,
                fullscreen: false,
            });
        }
        _ => return Err(format!("Ação de janela não suportada: {action}")),
    }

    Ok(DesktopWindowState {
        maximized: window.is_maximized().map_err(|error| error.to_string())?,
        fullscreen: window.is_fullscreen().map_err(|error| error.to_string())?,
    })
}
