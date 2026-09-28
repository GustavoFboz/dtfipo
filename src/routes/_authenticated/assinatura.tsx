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
  return <>
    <Link to="/hub" className="fixed left-5 top-4 z-10 text-sm text-[#15988f]">Voltar aos ambientes</Link>
    <RenewalPaymentPanel context={context.data} />
  </>;
}
