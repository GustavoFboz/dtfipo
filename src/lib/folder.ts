/**
 * Abre o link de uma pasta. Suporta http(s)://, file:// e UNC (\\servidor\...).
 *
 * Como navegadores bloqueiam abrir caminhos locais/UNC por segurança, o
 * caminho é SEMPRE copiado para a área de transferência, e a tentativa de
 * abertura é feita em paralelo. O usuário pode então colar o caminho no
 * Explorador (Win+R no Windows, Cmd+Shift+G no Finder do Mac).
 */
export type OpenFolderResult = {
  ok: boolean;
  copied: boolean;
  rawPath: string;
  /** mensagem para a UI; pode ser exibida via toast */
  message?: string;
};

export async function openFolderLink(raw: string | null | undefined): Promise<OpenFolderResult> {
  if (!raw || !raw.trim()) {
    return { ok: false, copied: false, rawPath: "", message: "Link da pasta não configurado." };
  }
  const rawPath = raw.trim();

  // http(s) abre direto sem mistério
  if (/^https?:\/\//i.test(rawPath)) {
    const win = window.open(rawPath, "_blank", "noopener,noreferrer");
    if (!win) return { ok: false, copied: false, rawPath, message: "Pop-up bloqueado pelo navegador." };
    return { ok: true, copied: false, rawPath };
  }

  // Sempre copia o caminho original para a área de transferência
  const copied = await copyToClipboard(rawPath);

  // Constrói URL file:// para tentar abrir (vai falhar na maioria dos navegadores)
  let openUrl = rawPath;
  if (rawPath.startsWith("\\\\")) {
    openUrl = `file://${rawPath.slice(2).replace(/\\/g, "/")}`;
  } else if (/^[a-zA-Z]:\\/.test(rawPath)) {
    openUrl = `file:///${rawPath.replace(/\\/g, "/")}`;
  } else if (rawPath.startsWith("file:")) {
    openUrl = rawPath;
  }

  try {
    window.open(openUrl, "_blank", "noopener,noreferrer");
  } catch {
    /* ignored — esperado */
  }

  return {
    ok: false,
    copied,
    rawPath,
    message: copied
      ? "Caminho copiado. No Windows, pressione Win+R e cole; no Finder do Mac, Cmd+Shift+G."
      : "Não consegui copiar o caminho automaticamente.",
  };
}

/** Copia o link para a área de transferência (fallback útil para pastas de rede). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
