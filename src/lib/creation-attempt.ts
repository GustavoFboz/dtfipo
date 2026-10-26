/** Persist only opaque IDs; clinical drafts remain in their existing owner-scoped stores. */
export type CreationAttempt = { key: string; patientId: string };

export function newCreationAttempt(): CreationAttempt {
  return { key: crypto.randomUUID(), patientId: crypto.randomUUID() };
}

export function loadCreationAttempt(storage: Pick<Storage, "getItem" | "setItem">, scope: string): CreationAttempt {
  const name = `dentalflow:create-attempt:${scope}`;
  try {
   const raw = storage.getItem(name);
   if (raw) {
    const parsed = JSON.parse(raw) as CreationAttempt | null;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (parsed && uuid.test(parsed.key) && uuid.test(parsed.patientId)) return parsed;
   }
  } catch { /* A corrupt draft must not block a new local attempt. */ }
  const attempt = newCreationAttempt();
  try { storage.setItem(name, JSON.stringify(attempt)); } catch { /* Retained in the form for this session. */ }
  return attempt;
}

export function clearCreationAttempt(storage: Pick<Storage, "removeItem">, scope: string) {
  try { storage.removeItem(`dentalflow:create-attempt:${scope}`); } catch { /* Storage can be disabled. */ }
}

/** A second click shares the in-flight promise, including its failure. */
export function singleFlight<T>() {
  let pending: Promise<T> | undefined;
  return (run: () => Promise<T>): Promise<T> => {
    if (pending) return pending;
    pending = Promise.resolve().then(run).finally(() => { pending = undefined; });
    return pending;
  };
}
