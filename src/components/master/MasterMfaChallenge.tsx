import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Online administrative action; the server remains the authorization boundary. */
export function MasterMfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return;
      if (error) setError("Não foi possível consultar o autenticador. Verifique sua conexão e sessão.");
      else {
        const verified = data.totp.filter((factor) => factor.status === "verified");
        setFactors(verified);
        setFactorId(verified[0]?.id ?? "");
      }
      setLoaded(true);
    }).catch(() => {
      if (active) { setError("Não foi possível consultar o autenticador."); setLoaded(true); }
    });
    return () => { active = false; };
  }, []);

  async function verify() {
    if (busy || !/^\d{6}$/.test(code) || !factors.some((factor) => factor.id === factorId)) return;
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || assurance.data?.currentLevel !== "aal2") throw new Error("MFA_REQUIRED");
      setCode("");
      onVerified();
    } catch {
      setCode("");
      setError("Não foi possível confirmar. Confira o código atual do autenticador e tente novamente.");
    } finally { setBusy(false); }
  }

  return <section className="mt-3 rounded border p-3" aria-label="Confirmação de dois fatores">
    <p className="text-sm">Confirme sua identidade com o aplicativo autenticador antes de enviar o evento.</p>
    {!loaded && <p role="status">Consultando autenticadores…</p>}
    {loaded && !error && factors.length === 0 && <p role="status" className="mt-2 text-sm">
      Sua conta precisa de um autenticador previamente configurado. A confirmação não concede permissão Master.
    </p>}
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
