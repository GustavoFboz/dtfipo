use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct DesktopPrinter {
    pub name: String,
    pub is_default: bool,
}

fn run_powershell(script: &str, envs: &[(&str, String)]) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("powershell.exe");
        cmd.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
        for (key, value) in envs {
            cmd.env(key, value);
        }
        let output = cmd.output().map_err(|e| format!("Não foi possível acessar o serviço de impressão: {e}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if err.is_empty() { "O Windows recusou a operação de impressão.".into() } else { err });
        }
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (script, envs);
        Err("A impressão nativa direta está disponível no DentalFlow Desktop para Windows.".into())
    }
}

fn validate_printer_name(value: &str) -> Result<&str, String> {
    let name = value.trim();
    if name.is_empty() || name.len() > 255 || name.chars().any(|c| c.is_control()) {
        return Err("Nome de impressora inválido.".into());
    }
    Ok(name)
}

#[tauri::command]
pub fn desktop_list_printers() -> Result<Vec<DesktopPrinter>, String> {
    let script = r#"
$ErrorActionPreference='Stop'
Get-CimInstance Win32_Printer | Sort-Object Default -Descending, Name | ForEach-Object {
  $flag = if ($_.Default) { '1' } else { '0' }
  Write-Output ($flag + "`t" + $_.Name)
}
"#;
    let output = run_powershell(script, &[])?;
    let printers = output
        .lines()
        .filter_map(|line| {
            let (flag, name) = line.split_once('\t')?;
            let name = name.trim();
            if name.is_empty() { return None; }
            Some(DesktopPrinter { name: name.to_string(), is_default: flag.trim() == "1" })
        })
        .collect();
    Ok(printers)
}

#[tauri::command]
pub fn desktop_open_printer_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg("ms-settings:printers")
            .spawn()
            .map_err(|e| format!("Não foi possível abrir as configurações de impressoras: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("As configurações nativas de impressora estão disponíveis no Windows.".into())
}

#[tauri::command]
pub fn desktop_print_text(printer_name: Option<String>, content: String) -> Result<(), String> {
    if content.trim().is_empty() {
        return Err("A nota está vazia.".into());
    }
    if content.len() > 512 * 1024 {
        return Err("A nota excedeu o limite seguro para impressão direta.".into());
    }

    let printer = match printer_name {
        Some(value) if !value.trim().is_empty() => Some(validate_printer_name(&value)?.to_string()),
        _ => None,
    };

    let mut path = std::env::temp_dir();
    path.push(format!("dentalflow-print-{}-{}.txt", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
    std::fs::write(&path, content.as_bytes()).map_err(|e| format!("Não foi possível preparar a nota: {e}"))?;

    let script = if printer.is_some() {
        r#"$ErrorActionPreference='Stop'; $text=Get-Content -Raw -LiteralPath $env:DF_PRINT_PATH -Encoding UTF8; $text | Out-Printer -Name $env:DF_PRINTER"#
    } else {
        r#"$ErrorActionPreference='Stop'; $text=Get-Content -Raw -LiteralPath $env:DF_PRINT_PATH -Encoding UTF8; $text | Out-Printer"#
    };

    let mut envs = vec![("DF_PRINT_PATH", path.to_string_lossy().to_string())];
    if let Some(name) = printer { envs.push(("DF_PRINTER", name)); }
    let result = run_powershell(script, &envs).map(|_| ());
    let _ = std::fs::remove_file(path);
    result
}
