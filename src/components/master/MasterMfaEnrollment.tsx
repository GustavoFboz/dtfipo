import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cancelMasterFactor, enrollMasterFactor, verifyMasterFactor, type PendingMasterFactor } from "@/lib/auth/master-mfa";
import { requireMasterSession, type MasterSessionCheck, type MasterSessionScope } from "@/lib/auth/master-session";

export function MasterMfaEnrollment({ scope, isCurrent, onVerified }: {
  scope: MasterSessionScope; isCurrent: MasterSessionCheck; onVerified: () => void;
}) {
  const [pending, setPending] = useState<PendingMasterFactor | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const running = useRef(false);
  useEffect(() => {
    // The parent remounts on a different account/session, not on an MFA upgrade.
    return () => { generation.current++; };
  }, [scope]);

  async function act(action: "start" | "verify" | "cancel") {
    if (running.current || !isCurrent(scope)) return;
    const operation = generation.current;
    running.current = true;
    setBusy(true); setError("");
    try {
      await requireMasterSession(supabase.auth, scope, isCurrent);
      if (action === "start") {
        const factor = await enrollMasterFactor(supabase.auth);
        await requireMasterSession(supabase.auth, scope, isCurrent);
        if (operation === generation.current && isCurrent(scope)) setPending(factor);
      } else if (pending) {
        if (action === "cancel") await cancelMasterFactor(supabase.auth, pending);
        else await verifyMasterFactor(supabase.auth, pending, code);
        await requireMasterSession(supabase.auth, scope, isCurrent, undefined, action === "verify");
        if (operation === generation.current && isCurrent(scope)) {
          setPending(null);
          if (action === "verify") onVerified();
        }
      }
    } catch {
      if (operation === generation.current && isCurrent(scope)) setError("Não foi possível concluir. Confira sua sessão, conexão e o código atual. Se já configurou o autenticador, reabra a confirmação.");
    } finally {
      running.current = false;
      if (operation === generation.current && isCurrent(scope)) { setCode(""); setBusy(false); }
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
