import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "./team.server";

export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listTeamMembersHandler } = await import("./team-management.server");
    return listTeamMembersHandler({ context });
  });

export const setTeamMemberPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    const { setTeamMemberPasswordHandler } = await import("./team-management.server");
    return setTeamMemberPasswordHandler({ data, context });
  });

export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; full_name: string; phone?: string; role: AppRole; password: string }) => d)
  .handler(async ({ data, context }) => {
    const { createTeamMemberHandler } = await import("./team-management.server");
    return createTeamMemberHandler({ data, context });
  });
