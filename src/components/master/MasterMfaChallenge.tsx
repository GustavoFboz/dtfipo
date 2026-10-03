import { useEffect, useRef, useState } from "react";
import { MasterMfaEnrollment } from "./MasterMfaEnrollment";
import { verifyMasterFactor } from "@/lib/auth/master-mfa";
import { requireMasterSession, type MasterSessionCheck, type MasterSessionScope } from "@/lib/auth/master-session";
import { supabase } from "@/integrations/supabase/client";

/** Online administrative action; the server remains the authorization boundary. */
export function MasterMfaChallenge({ scope, isCurrent, onVerified }: {
  scope: MasterSessionScope; isCurrent: MasterSessionCheck; onVerified: () => void;
}) {
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const running = useRef(false);
  useEffect(() => {
    const operation = generation.current;
    void (async () => {
      await requireMasterSession(supabase.auth, scope, isCurrent);
      const { data, error } = await supabase.auth.mfa.listFactors();
      await requireMasterSession(supabase.auth, scope, isCurrent);
      if (operation !== generation.current) return;
      if (error) throw error;
      const verified = data.totp.filter((factor) => factor.status === "verified");
      setFactors(verified);
      setFactorId(verified[0]?.id ?? "");
      setLoaded(true);
    })().catch(() => {
      if (operation === generation.current && isCurrent(scope)) {
        setError("Não foi possível consultar o autenticador. Verifique sua conexão e sessão."); setLoaded(true);
      }
    });
    return () => { generation.current++; };
  }, [scope, isCurrent]);

  async function verify() {
    if (running.current || !isCurrent(scope) || !/^\d{6}$/.test(code) || !factors.some((factor) => factor.id === factorId)) return;
    const operation = generation.current;
    running.current = true;
    setBusy(true); setError("");
    try {
      await requireMasterSession(supabase.auth, scope, isCurrent);
      await verifyMasterFactor(supabase.auth, { ownerId: scope.ownerId, id: factorId }, code);
      await requireMasterSession(supabase.auth, scope, isCurrent, undefined, true);
      if (operation !== generation.current) return;
      setCode("");
      onVerified();
    } catch {
      if (operation === generation.current && isCurrent(scope)) {
        setCode("");
        setError("Não foi possível confirmar. Confira o código atual do autenticador e tente novamente.");
      }
    } finally {
      running.current = false;
      if (operation === generation.current && isCurrent(scope)) setBusy(false);
    }
  }

  return <section className="mt-3 rounded border p-3" aria-label="Confirmação de dois fatores">
    <p className="text-sm">Confirme sua identidade com o aplicativo autenticador.</p>
    {!loaded && <p role="status">Consultando autenticadores…</p>}
    {loaded && !error && factors.length === 0 && <MasterMfaEnrollment scope={scope} isCurrent={isCurrent} onVerified={onVerified} />}
    {factors.length > 0 && <form onSubmit={(event) => { event.preventDefault(); void verify(); }}>
      {factors.length > 1 && <label className="mt-2 block text-sm">Autenticador
        <select value={factorId} disabled={busy} onChange={(event) => setFactorId(event.target.value)}
          className="block rounded border bg-transparent p-2">
          {factors.map((factor, index) => <option key={factor.id} value={factor.id}>
            {factor.friendly_name || `Autenticador ${index + 1}`}</option>)}
        </select></label>}
      <label className="mt-2 block text-sm">Código de seis dígitos
        <input value={code} disabled={busy} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          className="mt-1 block rounded border bg-transparent p-2" /></label>
      <button type="submit" disabled={busy || !/^\d{6}$/.test(code)}
        className="mt-2 rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50">
        {busy ? "Confirmando…" : "Confirmar identidade"}</button>
    </form>}
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  </section>;
}
