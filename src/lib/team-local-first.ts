import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop, localCacheGet, localCachePut } from "@/lib/desktop-local";
import { resolveDesktopOwnerId } from "@/lib/desktop-identity";

const TEAM_NS = "team-members:v1";
const TEAM_KEY = "all";

export type TeamMemberReadModel = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  account_subtype: string | null;
  is_default_admin: boolean | null;
  user_code: string | null;
  clinic_id: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function transient(error: unknown) {
  if (!online()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return [
    "failed to fetch",
    "networkerror",
    "network error",
    "load failed",
    "fetch failed",
    "connection",
    "offline",
    "timeout",
    "cloud login",
    "revalidation",
    "revalidação",
  ].some((part) => message.includes(part));
}

async function readCached(ownerId: string) {
  const entry = await localCacheGet<TeamMemberReadModel[]>(ownerId, TEAM_NS, TEAM_KEY).catch(() => null);
  return Array.isArray(entry?.payload) ? entry.payload : null;
}

async function writeCached(ownerId: string, rows: TeamMemberReadModel[]) {
  const previous = await readCached(ownerId);
  // Never let a transient/ambiguous zero-row response erase a verified team.
  if (rows.length === 0 && previous && previous.length > 0) return previous;
  await localCachePut(ownerId, TEAM_NS, TEAM_KEY, rows);
  return rows;
}

async function fetchRemoteTeam(): Promise<TeamMemberReadModel[]> {
  const { data: auth } = await supabase.auth.getSession();
  const user = auth.session?.user;
  if (!user || user.user_metadata?.dentalflow_offline_device) {
    throw new Error("Cloud Login requires revalidation (team)");
  }

  const { data: me, error: meError } = await supabase
    .from("profiles")
    .select("id,clinic_id")
    .eq("id", user.id)
    .maybeSingle();
  if (meError) throw meError;

  let query = supabase
    .from("profiles")
    .select("id,full_name,email,phone,role,account_subtype,is_default_admin,user_code,clinic_id,avatar_url,created_at,updated_at")
    .order("created_at", { ascending: true });

  // The database RLS remains authoritative. This client-side filter prevents an
  // enterprise account from asking for profiles outside its own organization.
  if ((me as any)?.clinic_id) query = query.eq("clinic_id", (me as any).clinic_id);
  else query = query.eq("id", user.id);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as TeamMemberReadModel[];
}

/**
 * Desktop-safe team list. The web admin path still uses its server function,
 * while Tauri reads the same authorized profiles directly and mirrors them to
 * SQLite. This avoids React Start server functions against the static asset://
 * origin, which was the cause of the empty Team screen in the installed app.
 */
export async function fetchTeamMembersLocalFirst(): Promise<TeamMemberReadModel[]> {
  if (!isDentalFlowDesktop()) return fetchRemoteTeam();
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return [];
  const cached = await readCached(ownerId);

  if (online()) {
    try {
      const remote = await fetchRemoteTeam();
      return await writeCached(ownerId, remote);
    } catch (error) {
      if (!transient(error) && !cached) throw error;
      console.warn("[DentalFlow Desktop] Equipe remota indisponível; usando espelho local", error);
    }
  }

  return cached ?? [];
}

export async function warmTeamMembersLocalCache() {
  if (!isDentalFlowDesktop() || !online()) return 0;
  const rows = await fetchTeamMembersLocalFirst();
  return rows.length;
}
