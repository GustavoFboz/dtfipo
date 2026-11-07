import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MasterMfaChallenge } from "./MasterMfaChallenge";
import { closeExternalSandboxTest, type MasterReviewEvent } from "@/lib/master-admin";
import type { MasterSessionCheck, MasterSessionScope } from "@/lib/auth/master-session";
import { supabase } from "@/integrations/supabase/client";

export function MasterExternalTestReview({ event, scope, isCurrent, onClose, onCompleted }: {
  event: MasterReviewEvent; scope: MasterSessionScope; isCurrent: MasterSessionCheck;
  onClose: () => void; onCompleted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [mfaConfirmed, setMfaConfirmed] = useState(false);
  const review = useMutation({
    mutationFn: async () => {
      if (!mfaConfirmed) throw new Error("Confirme sua identidade com o autenticador.");
      await closeExternalSandboxTest(supabase, scope, isCurrent, event, reason, confirmed);
    },
    onSuccess: () => { if (isCurrent(scope)) onCompleted(); },
  });
  return <section className="rounded-xl border border-amber-400 bg-white p-5 dark:bg-slate-900">
    <h2 className="font-semibold">Encerrar teste externo: {event.provider_event_id}</h2>
    <p className="mt-2 text-sm">Use somente para uma cobrança manual de teste no Sandbox, conferida no Asaas e sem vínculo com contrato do DentalFlow. O evento e a justificativa ficam no histórico. Esta ação encerra a revisão sem reprocessar o pagamento ou alterar acesso.</p>
    {!mfaConfirmed && <MasterMfaChallenge scope={scope} isCurrent={isCurrent}
      onVerified={() => { if (isCurrent(scope)) setMfaConfirmed(true); }} />}
    {mfaConfirmed && <p role="status" className="mt-2 text-sm">Identidade confirmada. O servidor verificará sua permissão ao concluir.</p>}
    <label className="mt-3 flex gap-2 text-sm">
      <input type="checkbox" checked={confirmed} disabled={review.isPending}
        onChange={(e) => setConfirmed(e.target.checked)} />
      Confirmei no Asaas: cobrança manual externa, sem contrato SaaS.
    </label>
    <label className="mt-3 block text-sm">Justificativa da revisão
      <input className="mt-1 block w-full rounded border bg-transparent p-2" value={reason}
        maxLength={300} disabled={review.isPending} onChange={(e) => setReason(e.target.value)} />
    </label>
    <button disabled={!mfaConfirmed || !confirmed || reason.trim().length < 16 || review.isPending}
      className="mt-3 rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50"
      onClick={() => review.mutate()}>Concluir revisão do teste</button>
    <button className="ml-3 text-sm" disabled={review.isPending} onClick={onClose}>Voltar</button>
    {review.isError && <p role="alert" className="mt-2 text-sm text-red-600">{review.error.message}</p>}
  </section>;
}
