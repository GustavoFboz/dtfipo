//! Native Windows printing bridge for the DentalFlow case note (0.3.5).
//!
//! The frontend never provides a command line. It may only:
//!   * list the printers installed on the machine;
//!   * open the operating system printer settings panel;
//!   * send plain text to a printer name that is validated against the
//!     installed printer list before anything is executed.
//!
//! This keeps arbitrary shell/command injection impossible from the WebView.

use serde::Serialize;
use base64::{engine::general_purpose, Engine as _};

#[derive(Serialize, Clone)]
pub struct DesktopPrinter {
    pub name: String,
    pub is_default: bool,
}

#[cfg(target_os = "windows")]
mod platform {
    use super::DesktopPrinter;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    fn powershell(script: &str, envs: &[(&str, &str)]) -> Result<String, String> {
        let mut command = Command::new("powershell.exe");
        command.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ]);
        for (key, value) in envs {
            command.env(key, value);
        }
        command.creation_flags(CREATE_NO_WINDOW);

        let output = command
            .output()
            .map_err(|error| format!("Falha ao acessar o serviço de impressão do Windows: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "O serviço de impressão do Windows recusou a operação.".to_string()
            } else {
                stderr
            });
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    pub fn list_printers() -> Result<Vec<DesktopPrinter>, String> {
        let raw = powershell(
            "Get-CimInstance -ClassName Win32_Printer | ForEach-Object { $_.Name + [char]9 + $_.Default }",
            &[],
        )?;

        let mut printers: Vec<DesktopPrinter> = Vec::new();
        for line in raw.lines() {
            let line = line.trim_end_matches('\r');
            if line.trim().is_empty() {
                continue;
            }
            let mut parts = line.splitn(2, '\t');
            let name = parts.next().unwrap_or("").trim().to_string();
            if name.is_empty() {
                continue;
            }
            let is_default = parts
                .next()
                .map(|value| value.trim().eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            printers.push(DesktopPrinter { name, is_default });
        }

        Ok(printers)
    }

    pub fn open_printer_settings() -> Result<(), String> {
        powershell("Start-Process 'ms-settings:printers'", &[]).map(|_| ())
    }

    pub fn print_text(printer: &str, text: &str) -> Result<(), String> {
        let installed = list_printers()?;
        let matched = installed
            .iter()
            .find(|candidate| candidate.name.eq_ignore_ascii_case(printer))
            .ok_or_else(|| {
                format!("A impressora \"{printer}\" não está mais instalada neste computador.")
            })?;

        let file = std::env::temp_dir().join(format!(
            "dentalflow-note-{}.txt",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|value| value.as_millis())
                .unwrap_or(0)
        ));

        std::fs::write(&file, text.as_bytes())
            .map_err(|error| format!("Não foi possível preparar a nota para impressão: {error}"))?;

        let path = file.to_string_lossy().to_string();
        let result = powershell(
            "Get-Content -LiteralPath $env:DENTALFLOW_NOTE_FILE -Encoding UTF8 | Out-Printer -Name $env:DENTALFLOW_NOTE_PRINTER",
            &[
                ("DENTALFLOW_NOTE_FILE", path.as_str()),
                ("DENTALFLOW_NOTE_PRINTER", matched.name.as_str()),
            ],
        );

        let _ = std::fs::remove_file(&file);
        result.map(|_| ())
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::DesktopPrinter;

    const UNSUPPORTED: &str =
        "A impressão nativa direta está disponível apenas no DentalFlow Desktop para Windows.";

    pub fn list_printers() -> Result<Vec<DesktopPrinter>, String> {
        Ok(Vec::new())
    }

    pub fn open_printer_settings() -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn print_text(_printer: &str, _text: &str) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
}

#[tauri::command]
pub fn desktop_list_printers() -> Result<Vec<DesktopPrinter>, String> {
    platform::list_printers()
}

#[tauri::command]
pub fn desktop_open_printer_settings() -> Result<(), String> {
    platform::open_printer_settings()
}

#[tauri::command]
pub fn desktop_save_pdf(file_name: String, base64_data: String) -> Result<String, String> {
    let mut safe: String = file_name
        .chars()
        .map(|ch| if ch.is_alphanumeric() || matches!(ch, ' ' | '-' | '_' | '.') { ch } else { '_' })
        .collect();
    safe = safe.trim().trim_matches('.').to_string();
    if safe.is_empty() { safe = "Relatorio-DentalFlow.pdf".to_string(); }
    if !safe.to_ascii_lowercase().ends_with(".pdf") { safe.push_str(".pdf"); }

    let bytes = general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|_| "O PDF recebido é inválido.".to_string())?;
    if bytes.is_empty() { return Err("O PDF está vazio.".to_string()); }
    if bytes.len() > 32 * 1024 * 1024 { return Err("O PDF excede o limite permitido.".to_string()); }

    let dir = dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Downloads")))
        .ok_or_else(|| "A pasta Downloads do Windows não foi localizada.".to_string())?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Não foi possível preparar a pasta Downloads: {error}"))?;

    let mut target = dir.join(&safe);
    if target.exists() {
        let stem = safe.trim_end_matches(".pdf");
        for index in 1..10_000 {
            let candidate = dir.join(format!("{stem} ({index}).pdf"));
            if !candidate.exists() {
                target = candidate;
                break;
            }
        }
    }

    std::fs::write(&target, bytes)
        .map_err(|error| format!("Não foi possível salvar o PDF: {error}"))?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn desktop_print_text(printer: String, text: String) -> Result<(), String> {
    let printer = printer.trim();
    if printer.is_empty() {
        return Err("Selecione a impressora antes de imprimir.".to_string());
    }
    if text.trim().is_empty() {
        return Err("A nota do caso está vazia.".to_string());
    }
    if text.len() > 512_000 {
        return Err("A nota do caso excede o tamanho permitido para impressão.".to_string());
    }

    platform::print_text(printer, &text)
}

// Validation branch: exercise the Windows A4/PDF packaging workflow.
