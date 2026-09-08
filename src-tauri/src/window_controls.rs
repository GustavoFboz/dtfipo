use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct DesktopWindowState {
    pub maximized: bool,
    pub fullscreen: bool,
    pub focused: bool,
}

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Janela principal do DentalFlow não encontrada.".to_string())
}

fn read_window_state(window: &tauri::WebviewWindow) -> Result<DesktopWindowState, String> {
    Ok(DesktopWindowState {
        maximized: window.is_maximized().map_err(|error| error.to_string())?,
        fullscreen: window.is_fullscreen().map_err(|error| error.to_string())?,
        focused: window.is_focused().map_err(|error| error.to_string())?,
    })
}

#[tauri::command]
pub fn desktop_window_state(app: AppHandle) -> Result<DesktopWindowState, String> {
    let window = main_window(&app)?;
    read_window_state(&window)
}

#[tauri::command]
pub fn desktop_window_action(app: AppHandle, action: String) -> Result<DesktopWindowState, String> {
    let window = main_window(&app)?;

    match action.as_str() {
        "minimize" => window.minimize().map_err(|error| error.to_string())?,
        "toggle_maximize" => {
            if window.is_maximized().map_err(|error| error.to_string())? {
                window.unmaximize().map_err(|error| error.to_string())?;
            } else {
                window.maximize().map_err(|error| error.to_string())?;
            }
        }
        "drag" => window.start_dragging().map_err(|error| error.to_string())?,
        "close" => {
            window.close().map_err(|error| error.to_string())?;
            return Ok(DesktopWindowState {
                maximized: false,
                fullscreen: false,
                focused: false,
            });
        }
        _ => return Err(format!("Ação de janela não suportada: {action}")),
    }

    read_window_state(&window)
}
