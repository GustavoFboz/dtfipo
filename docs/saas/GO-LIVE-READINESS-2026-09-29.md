# Situação para a primeira venda real — 29/09/2026

Este registro separa implantação de código, homologação e operação financeira.
Não há cobrança de Produção concluída. O operador decidiu fazer o pagamento
real controlado somente depois de concluir os preparativos técnicos.

| Marco | Estado comprovado | Porta que ainda falta |
| --- | --- | --- |
| 00–01 Base e contrato | Restauração e auditoria documentadas | Revisar após novas migrations |
| 02–03 Checkout Asaas | Primeira contratação de R$ 249 no Sandbox, webhook, ledger e acesso ativo | Credenciais e webhook exclusivos de Produção |
| 04 Inbox e reconciliação | Primeiro evento processado; fila sem evento pendente no audit de 29/09 | Provar duplicata, perda e replay com recursos reais do provedor |
| 05 Ciclo de vida | Rotinas e ensaios isolados de renovação, atraso, estorno e cancelamento | Provas no Asaas; o checkout atual usa `UNDEFINED` e não comprova cobrança automática do cartão |
| 06 Cotas e arquivos | Migração aplicada; asserções live passaram; CI de reservas, quota e concorrência passou; PR #88 integrada e sincronizada no Lovable | Upload e DICOM pela conta publicada; 3 casos e 2 fotos antigos sem empresa identificável permanecem preservados |
| 07 Master | Papel de plataforma e painel ainda não entregues | Autorização forte, auditoria e ações de suporte seguras |
| 08 Centro de cobrança | Plano, preço, próximo vencimento e link de renovação já aparecem ao gestor | Histórico/recibos, troca de plano e cancelamento com efeito no Asaas |
| 09 Produção | Adapter separa Sandbox e Produção por chave, URL e flag | Credenciais reais, webhook de Produção, alertas, piloto e cobrança real controlada |

## Divergência de preço e PR #89

Em 29/09, `company_initial` ainda tinha 24.900 centavos no catálogo ativo;
assinatura e pagamentos existentes do Sandbox também eram de R$ 249. A PR #89
prepara novos checkouts a R$ 1, preservando o valor de contratos anteriores.
Sua restauração limpa e ensaio de preço passaram, mas a revisão automática
rejeitou aplicar a migration financeira no banco ativo sem autorização
específica. A PR continua rascunho e o preço ativo continua R$ 249. Não
contornar o bloqueio por merge, agente ou outro caminho indireto.

R$ 1 será **mensal e recorrente** se o teste resultar em assinatura. Antes de
abrir vendas, recolocar o preço comercial no catálogo e decidir se a
assinatura promocional será cancelada ou terá seu preço futuro alterado no
Asaas. Alterar o catálogo sozinho não altera cobranças já geradas nem o valor
da assinatura existente.

## Preparativos que dependem das contas externas

1. Na **conta Asaas de Produção**, obter uma chave de API exclusiva iniciada
   por `$aact_prod_`. Sandbox e Produção não compartilham chaves, clientes,
   assinaturas, webhooks ou dados. Usar `https://api.asaas.com/v3` somente
   depois de habilitar o ambiente no backend.
2. Em **Lovable Cloud → Secrets** do projeto DentalFlow, registrar no backend
   `ASAAS_ENVIRONMENT=production`, `ASAAS_API_KEY` de Produção,
   `ASAAS_WEBHOOK_TOKEN` de Produção (aleatório, 32+ caracteres),
   `ASAAS_USER_AGENT`, `BILLING_WORKER_TOKEN` e, somente na liberação final,
   `ASAAS_PRODUCTION_ENABLED=true`. O token do worker precisa coincidir com
   o secret do GitHub Actions no agendador da branch padrão. Não enviar esses
   valores por chat, imagem ou repositório.
3. Na **conta Asaas de Produção**, cadastrar
   `https://dtfipo.lovable.app/api/billing/asaas-webhook`, entrega sequencial,
   eventos de pagamento e assinatura usados pelo backend, e o mesmo token
   `ASAAS_WEBHOOK_TOKEN`. Desativar o webhook de Sandbox quando mudar o
   backend compartilhado para Produção, para não misturar ambientes.
4. Conferir que o site publicado e o worker estão no commit validado, que
   a inbox é persistida antes do `200`, que o worker roda periodicamente e
   que o preço exibido corresponde ao preço criado no Asaas.

Esses preparativos **não autorizam** por si só venda geral. Primeiro é preciso
completar 07–09, fechar as provas restantes no Sandbox e executar uma compra
real controlada de R$ 1 pelo operador, conferindo pagamento, evento, ledger,
acesso, duplicata e cancelamento sem apagar dados. Só depois restaurar o
preço comercial e liberar o beta para clientes.

Referências oficiais: [preparação para Produção](https://docs.asaas.com/docs/prepara%C3%A7%C3%A3o-para-produ%C3%A7%C3%A3o),
[ambientes separados](https://docs.asaas.com/docs/sandbox),
[webhook](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook),
[alteração de assinatura](https://docs.asaas.com/reference/atualizar-assinatura-existente).
