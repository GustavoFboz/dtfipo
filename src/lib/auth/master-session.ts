import type { Session, SupabaseClient } from "@supabase/supabase-js";

type Auth = Pick<SupabaseClient["auth"], "getSession" | "onAuthStateChange">;
export type MasterSessionScope = { ownerId: string; sessionId: string; generation: number };
export type MasterSessionCheck = (scope: MasterSessionScope) => boolean;
export type MasterSessionState = { ready: boolean; scope: MasterSessionScope | null };
let nextGeneration = 0;

/** Untrusted labels for UI isolation only. RPCs still authenticate/authorize the JWT. */
function sessionLabels(session: Session | null) {
  if (!session) return null;
  try {
    const encoded = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(encoded));
    const expiresAt = Math.min(claims.exp * 1000, (session.expires_at ?? Infinity) * 1000);
    if (claims.sub !== session.user.id || typeof claims.session_id !== "string" || !claims.session_id
      || !["aal1", "aal2"].includes(claims.aal) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return { ownerId: session.user.id, sessionId: claims.session_id, aal: claims.aal as string, expiresAt };
  } catch { return null; }
}

/** Subscribe before reading storage so an old getSession result cannot undo logout. */
export function observeMasterSession(auth: Auth, onChange: (state: MasterSessionState) => void) {
  let active = true;
  let revision = 0;
  let current: ReturnType<typeof sessionLabels> = null;
  const retiredSessions = new Set<string>();
  let state: MasterSessionState = { ready: false, scope: null };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const labelKey = (labels: NonNullable<ReturnType<typeof sessionLabels>>) => JSON.stringify([labels.ownerId, labels.sessionId]);
  function apply(session: Session | null, retirePrevious = true) {
    if (!active) return;
    let next = sessionLabels(session);
    if (retirePrevious && current && (!next || labelKey(current) !== labelKey(next))) retiredSessions.add(labelKey(current));
    if (next && retiredSessions.has(labelKey(next))) next = null;
    const sameSession = next && current && next.ownerId === current.ownerId
      && next.sessionId === current.sessionId && !(current.aal === "aal2" && next.aal !== "aal2");
    const scope = next ? (sameSession ? state.scope : {
      ownerId: next.ownerId, sessionId: next.sessionId, generation: ++nextGeneration,
    }) : null;
    current = next;
    state = { ready: true, scope };
    clearTimeout(timer);
    if (next) timer = setTimeout(() => { revision++; apply(null, false); }, Math.min(next.expiresAt - Date.now(), 2_147_483_647));
    onChange(state);
  }

  const initialRevision = revision;
  const { data } = auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") {
      if (revision === initialRevision) apply(session);
      return;
    }
    revision++;
    if (event === "MFA_CHALLENGE_VERIFIED") {
      const labels = sessionLabels(session);
      if (!current || !labels || labelKey(current) !== labelKey(labels)) {
        if (labels) retiredSessions.add(labelKey(labels));
        apply(null);
        return;
      }
    }
    apply(event === "SIGNED_OUT" ? null : session);
  });
  void auth.getSession().then(({ data, error }) => {
    if (active && revision === initialRevision) apply(error ? null : data.session);
  }).catch(() => { if (active && revision === initialRevision) apply(null); });

  return {
    isCurrent: (scope: MasterSessionScope) => active && state.scope === scope
      && !!current && current.expiresAt > Date.now(),
    dispose: () => { active = false; clearTimeout(timer); data.subscription.unsubscribe(); },
  };
}

/** Keep tokens inside the request flow; never use them as query keys or UI state. */
export async function requireMasterSession(
  auth: Pick<Auth, "getSession">, scope: MasterSessionScope, isCurrent: MasterSessionCheck,
  signal?: AbortSignal, requireMfa = false,
) {
  signal?.throwIfAborted();
  if (!isCurrent(scope)) throw new Error("MASTER_SESSION_CHANGED");
  const { data, error } = await auth.getSession();
  const labels = sessionLabels(data.session);
  signal?.throwIfAborted();
  if (error || !data.session || !labels || !isCurrent(scope)
    || labels.ownerId !== scope.ownerId || labels.sessionId !== scope.sessionId) throw new Error("MASTER_SESSION_CHANGED");
  if (requireMfa && labels.aal !== "aal2") throw new Error("MASTER_MFA_REQUIRED");
  return data.session;
}
