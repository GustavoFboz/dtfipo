import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { RenewalPaymentPanel } from "@/components/SubscriptionGate";
import { fetchMySubscriptionContext } from "@/lib/subscriptions";

export const Route = createFileRoute("/_authenticated/assinatura")({ component: SubscriptionBillingPage });

function SubscriptionBillingPage() {
  const context = useQuery({
    queryKey: ["subscription_context"],
    queryFn: fetchMySubscriptionContext,
    staleTime: 20_000,
  });
  if (context.isLoading) return <p className="p-8">Conferindo assinatura…</p>;
  if (!context.data || context.data.account_type !== "company_admin" || !context.data.company) {
    return <p className="p-8">Somente o responsável pela empresa pode consultar a cobrança.</p>;
  }
  if (context.data.company.internal_full_access) {
    return <>
      <Link to="/hub" className="fixed left-5 top-4 z-10 text-sm text-[#15988f]">Voltar aos ambientes</Link>
      <div className="grid min-h-[100dvh] place-items-center bg-[#f4f8f7] px-5 text-slate-950 dark:bg-[#080b10] dark:text-white">
        <section className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 dark:border-white/[0.07] dark:bg-[#0d1218]">
          <h1 className="text-[30px] font-light tracking-[-0.04em]">Conta interna</h1>
          <p className="mt-4 text-[13px] leading-6 text-slate-500 dark:text-white/45">
            Esta empresa tem acesso livre ao DentalFlow e é isenta de mensalidade. Não há cobrança no Asaas.
          </p>
        </section>
      </div>
    </>;
  }
  return <>
    <Link to="/hub" className="fixed left-5 top-4 z-10 text-sm text-[#15988f]">Voltar aos ambientes</Link>
    <RenewalPaymentPanel context={context.data} />
  </>;
}
