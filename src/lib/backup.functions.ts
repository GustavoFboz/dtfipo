// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DISABLED_MESSAGE = "O backup backend legado foi desativado. Use a exportação protegida do código nas Configurações e os backups do Lovable Cloud para dados vivos.";

export const getBackupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error(DISABLED_MESSAGE);
  });

export const generateBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error(DISABLED_MESSAGE);
  });
