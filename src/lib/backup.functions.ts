// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBackupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: hashRow } = await (supabase.rpc as any)("backend_schema_hash");
    const currentHash = (hashRow as unknown as string) ?? "";
    const { data: last } = await supabase
      .from("backend_backups")
      .select("id, created_at, schema_hash, size_bytes")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { currentHash, last };
  });

export const generateBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: sql, error } = await (supabase.rpc as any)("export_backup");
    if (error) throw new Error(error.message);
    const text = (sql as unknown as string) ?? "";
    const { data: hashRow } = await (supabase.rpc as any)("backend_schema_hash");
    const hash = (hashRow as unknown as string) ?? "";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const bytes = new TextEncoder().encode(text);
    const blob = new Blob([bytes], { type: "application/sql" });
    let storagePath: string | null = null;
    try {
      const up1 = await supabase.storage.from("backend-backups").upload("latest.sql", blob, {
        upsert: true,
        contentType: "application/sql",
      });
      const up2 = await supabase.storage.from("backend-backups").upload(`history/backup-${ts}.sql`, blob, {
        upsert: false,
        contentType: "application/sql",
      });
      if (!up1.error) storagePath = up1.data?.path ?? "latest.sql";
      if (up2.error) console.warn("history upload:", up2.error.message);
    } catch (e) {
      console.warn("storage upload failed:", (e as Error).message);
    }
    await supabase.from("backend_backups").insert({
      created_by: userId,
      schema_hash: hash,
      size_bytes: bytes.byteLength,
      storage_path: storagePath,
    });
    return { sql: text, hash, storagePath };
  });