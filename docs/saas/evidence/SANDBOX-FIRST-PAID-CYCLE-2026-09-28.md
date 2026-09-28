# Primeiro ciclo pago no Asaas Sandbox — 28/09/2026

Ambiente: `sandbox`; projeto publicado em `dtfipo.lovable.app`, commit
`34fb36f79eb38e2bea014b0c3959b001e4f8e68a`. Cliente de teste: AS Lab,
plano `company_initial`, R$ 249,00 mensais. O comprovante do Asaas foi enviado
pelo operador, sem registrar dados de cartão ou identidade no repositório.

| Evidência observada | Resultado |
| --- | --- |
| Antes do pagamento | Intent `provider_created`, assinatura `pending_checkout`, nenhum pagamento no ledger; a interface mostrava pagamento pendente. |
| Criação no provedor | Operações `customer_ensure` e `subscription_create` bem-sucedidas; intent com IDs de assinatura, cobrança e URL do Asaas Sandbox. |
| Confirmação | Comprovante do Asaas em 28/09/2026; `PAYMENT_CONFIRMED` recebido na inbox às 15:54:41 UTC. |
| Processamento | Worker autorizado executado; evento `processed` às 15:57:04 UTC sem erro. |
| Projeção financeira | Exatamente uma linha `paid` de R$ 249,00, checkout `paid`, assinatura `active`, período até 29/10/2026 00:00 UTC. |
| Direito de uso | `subscription_access_mode = full`; empresa pagante sem `billing_exempt`. Usuário confirmou que conseguiu abrir o sistema e vê a conta CEO. |
| Conta interna | IPO continua `billing_exempt`, `company_advanced`, `active`, acesso `full` e pelo menos 500 GiB. |

**Conclusão:** o primeiro pagamento real do ambiente de testes passou de
checkout → Asaas → webhook → worker → ledger → direito de acesso. O retorno
visual de cada módulo, renovação, inadimplência, estorno, cancelamento,
reativação, cota, concorrência e paridade Windows/Android ainda precisam dos
testes correspondentes. Não houve cobrança de Produção nem autorização para
ativar produção comercial.
