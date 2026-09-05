// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OWNER_EMAIL = "gustavovitorfa@gmail.com";
const ARCHIVE_URL = "https://codeload.github.com/GustavoFboz/dtfipo/zip/refs/heads/main";

export const downloadVersionedSystemArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const claimEmail = String(claims?.email || "").trim().toLowerCase();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email,is_default_admin")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error("Não foi possível validar a autorização da exportação.");

    const profileEmail = String(profile?.email || "").trim().toLowerCase();
    const authorizedEmail = claimEmail === OWNER_EMAIL || profileEmail === OWNER_EMAIL;
    if (!authorizedEmail || profile?.is_default_admin !== true) {
      throw new Error("Acesso negado: exportação completa restrita ao proprietário do sistema.");
    }

    const response = await fetch(ARCHIVE_URL, {
      method: "GET",
      headers: { "User-Agent": "DentalFlow-System-Backup" },
    });
    if (!response.ok) throw new Error(`Falha ao gerar ZIP do repositório (${response.status}).`);

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.byteLength) throw new Error("O arquivo retornado pelo GitHub está vazio.");

    try {
      await supabase.from("admin_logs").insert({
        actor_id: userId,
        action: "system.versioned_archive_download",
        entity: "repository",
        metadata: { repository: "GustavoFboz/dtfipo", branch: "main", size_bytes: bytes.byteLength },
      });
    } catch {
      // Auditoria não deve impedir o backup do proprietário.
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return {
      fileName: `dentalflow-codigo-completo-${stamp}.zip`,
      contentType: "application/zip",
      size: bytes.byteLength,
      base64: bytes.toString("base64"),
    };
  });
