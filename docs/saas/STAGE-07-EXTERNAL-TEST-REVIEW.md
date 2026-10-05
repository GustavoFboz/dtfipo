# Revisão auditada de testes manuais externos no Sandbox

Esta ação encerra a revisão de um evento de teste externo; não reconcilia um
pagamento SaaS nem substitui os ensaios de replay, duplicata ou eventos fora de ordem.
O responsável confirmou em 05/10/2026 que a cobrança Sandbox de R$5 com
vencimento em 29/09 foi criada manualmente no Asaas. A consulta real mostrou
RECEIVED nos dois eventos, sem ledger ou checkout local associado.

## Fluxo do operador

No Master, escolher **Revisar teste externo** no evento Sandbox. Conferir a
cobrança no Asaas e o contexto original, confirmar que é teste manual externo
sem contrato SaaS, confirmar o autenticador e registrar justificativa de
16–300 caracteres. **Concluir revisão do teste** registra a decisão. Repetir
a conferência individual no outro evento da mesma cobrança.

O servidor exige operador habilitado, JWT autenticado e AAL2. Aceita somente
PAYMENT_CONFIRMED/RECEIVED/OVERDUE em dead letter, no Sandbox, com snapshot
legado contendo somente paymentId, sem lease e sem vínculo no ledger ou em
checkout_intents. Eventos com referência, assinatura ou origem de reconciliação
continuam em revisão. Produção não admite esta ação.

O registro original conserva payload, ID, recebimento e número de tentativas;
o estado passa a ignored, com código EXTERNAL_MANUAL_SANDBOX_TEST. A decisão
e o ator são persistidos atomicamente em platform_operator_audit. Uma resposta
ambígua pode ser repetida com a mesma decisão sem duplicar a auditoria.
Não há chamada ao Asaas, replay, crédito de acesso ou alteração de cobrança,
contrato, período pago ou dados clínicos. A instrução não entra na outbox offline.

## Aceite e limites

O ensaio em banco isolado verifica operador não habilitado, AAL1, Produção,
ausência de confirmação, vínculo com checkout/ledger, referência no snapshot,
evento em processamento, repetição e preservação integral das tabelas financeiras.
Os testes de sessão/interface verificam pinagem do JWT, recusa do backend,
confirmação individual e descarte após troca de conta/login.

A implantação não executa a revisão dos dois eventos existentes. Eles permanecem
preservados até uma decisão na sessão real Master/AAL2. O item 1.1 continua
parcial; o replay financeiro real permanece um aceite separado de 4.2.
