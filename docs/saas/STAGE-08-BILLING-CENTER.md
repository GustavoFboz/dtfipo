# Etapa 08 — centro de cobrança da empresa

Status: histórico, limite de acesso financeiro e links de cobrança preparados.
Troca de plano e cancelamento iniciado pelo cliente continuam pendentes de uma
política de vigência que preserve os períodos pagos e sincronize o Asaas.

## Implementado

- O gestor vê plano, preço contratado, próximo vencimento, forma atual de
  cobrança e até 50 pagamentos locais. Uma assinatura `UNDEFINED` é descrita
  como cobrança mensal que precisa ser paga, sem prometer débito automático.
- Para cada lançamento com recurso Asaas, o backend autentica o gestor,
  confere IDs de cobrança, cliente, assinatura, valor e ambiente no provedor,
  valida o endereço hospedado e só então abre a cobrança. Isso não confirma
  pagamento. Recibo ou nota fiscal dependem da disponibilidade do Asaas; o
  DentalFlow não fabrica comprovante.
- A política de leitura direta de `billing_payments` foi reduzida de qualquer
  membro da empresa a owner/CEO/ADMIN autorizado para cobrança. RPCs privadas
  não revelam token nem perfil fiscal bruto.
- Web, Windows e Android usam o mesmo componente, com transporte hospedado na
  Web e API autorizada para os aplicativos instalados. O histórico requer rede;
  o snapshot de direito de uso continua com a política offline existente.

## Prova e limites

`npm run check:saas:stage-06`, build, TypeScript, teste da conferência do
documento e restauração limpa com `stage-08-billing-history-rehearsal.sql`.
Depois de aplicar a migração no banco ativo, conferir gestor e usuário sem
permissão, um pagamento Sandbox e a abertura da página Asaas. A cobrança
recorrente por cartão ainda precisa de um fluxo próprio no Asaas; o checkout
atual usa `UNDEFINED`.

Cancelamento direto ainda não é oferecido porque o Asaas pode manter cobranças
pendentes mesmo quando uma assinatura fica `INACTIVE`. Troca de plano direta
também exige novo contrato de preço por vigência; alterar o catálogo apenas
afetaria novos clientes. Reversão: retirar a interface nova, manter ledger e
auditar a política de leitura antes de qualquer ampliação de acesso.
