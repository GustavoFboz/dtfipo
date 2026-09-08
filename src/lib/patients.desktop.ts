export * from "./patients-local-first";

import type { Patient } from "./types";
import { fetchPatientsLocalFirst as fetchPatientsBase } from "./patients-local-first";
import { localCacheGet, localCachePut } from "./desktop-local";
import { resolveDesktopOwnerId } from "./desktop-identity";

const NS = "patients:v1";
const ALL_KEY = "all";

/**
 * Routes that import @/lib/patients-local-first directly used to bypass the
 * Desktop API facade's cache-first behavior. During a transient auth/reconnect
 * window that made the Patients screen look empty even though a verified SQLite
 * mirror existed. The native Vite build aliases that import to this facade.
 */
export async function fetchPatientsLocalFirst(): Promise<Patient[]> {
  const ownerId = await resolveDesktopOwnerId();
  const cachedEntry = ownerId
    ? await localCacheGet<Patient[]>(ownerId, NS, ALL_KEY).catch(() => null)
    : null;
  const cached = Array.isArray(cachedEntry?.payload) ? cachedEntry.payload : null;

  if (cached && cached.length > 0) {
    // Return immediately for native UI responsiveness, then reconcile in the
    // background. An empty/transient remote result never blanks the current UI.
    void fetchPatientsBase()
      .then(async (remote) => {
        if (!ownerId || !Array.isArray(remote)) return;
        if (remote.length === 0 && cached.length > 0) return;
        await localCachePut(ownerId, NS, ALL_KEY, remote).catch(() => undefined);
      })
      .catch((error) => console.warn("[DentalFlow Desktop] Atualização de pacientes adiada", error));
    return cached;
  }

  try {
    return await fetchPatientsBase();
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}
