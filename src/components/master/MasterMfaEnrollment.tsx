import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cancelMasterFactor, enrollMasterFactor, verifyMasterFactor, type PendingMasterFactor } from "@/lib/auth/master-mfa";

export function MasterMfaEnrollment({ onVerified }: { onVerified: () => void }) {
  const [pending, setPending] = useState<PendingMasterFactor | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // MFA verification emits MFA_CHALLENGE_VERIFIED: keep this operation alive.
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        generation.current++; setPending(null); setCode(""); setBusy(false);
      }
    });
    return () => { generation.current++; data.subscription.unsubscribe(); };
  }, []);

  async function act(action: "start" | "verify" | "cancel") {
    if (busy) return;
    const operation = generation.current;
    setBusy(true); setError("");
    try {
      if (action === "start") {
        const factor = await enrollMasterFactor(supabase.auth);
        if (operation === generation.current) setPending(factor);
      } else if (pending) {
        if (action === "cancel") await cancelMasterFactor(supabase.auth, pending);
        else await verifyMasterFactor(supabase.auth, pending, code);
        if (operation === generation.current) {
          setPending(null);
          if (action === "verify") onVerified();
        }
      }
    } catch {
      if (operation === generation.current) setError("Não foi possível concluir. Confira sua sessão, conexão e o código atual. Se já configurou o autenticador, reabra a confirmação.");
    } finally {
      if (operation === generation.current) { setCode(""); setBusy(false); }
    }
  }

  return <div className="mt-3 space-y-3 text-sm">
    <p>Configure um aplicativo autenticador para sua conta. A confirmação pode encerrar suas outras sessões. O cadastro não concede permissão Master.</p>
    {!pending ? <button disabled={busy} onClick={() => void act("start")}
      className="rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50">
      {busy ? "Preparando…" : "Configurar autenticador"}</button> : <>
      <p>Escaneie o QR no seu aplicativo ou cadastre a chave manualmente. Guarde-a em local seguro.</p>
      <img alt="QR de cadastro do autenticador da sua conta" className="h-48 w-48 bg-white p-2"
        src={pending.qrCode.startsWith("data:image/svg+xml") ? pending.qrCode : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pending.qrCode)}`} />
      <label className="block">Chave de configuração
        <input readOnly value={pending.secret} autoComplete="off" spellCheck={false}
          className="mt-1 block w-full rounded border bg-transparent p-2 font-mono" /></label>
      <form onSubmit={(event) => { event.preventDefault(); void act("verify"); }}>
        <label className="block">Código de seis dígitos
          <input value={code} disabled={busy} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className="mt-1 block rounded border bg-transparent p-2" /></label>
        <button type="submit" disabled={busy || !/^\d{6}$/.test(code)}
          className="mt-2 rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50">Confirmar cadastro</button>
        <button type="button" disabled={busy} onClick={() => void act("cancel")} className="ml-3">Cancelar cadastro</button>
      </form>
      <p>Conclua ou cancele antes de sair. Ao sair sem concluir, o cadastro pode ficar pendente; ele ainda não protege sua conta.</p>
    </>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </div>;
}
