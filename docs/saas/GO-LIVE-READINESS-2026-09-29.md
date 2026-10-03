# Situação para a primeira venda real — revisão de 03/10/2026

Este registro separa implantação de código, homologação e operação financeira.
Não há cobrança de Produção concluída. O operador decidiu fazer o pagamento
real controlado somente depois de concluir os preparativos técnicos.

| Marco | Estado comprovado | Porta que ainda falta |
| --- | --- | --- |
| 00–01 Base e contrato | Restauração e auditoria documentadas | Revisar após novas migrations |
| 02–03 Checkout Asaas | Primeira contratação de R$ 249 no Sandbox, webhook, ledger e acesso ativo | Credenciais e webhook exclusivos de Produção |
| 04 Inbox e reconciliação | Cinco eventos processados e dois dead letters no audit de 03/10 | Diagnosticar os dois eventos; provar replay após verificar a cobrança no Asaas |
| 05 Ciclo de vida | Dois ciclos pagos no ledger Sandbox, até 29/11; ensaios isolados disponíveis | Atraso, suspensão, estorno e reativação vinculados à assinatura; débito automático não comprovado |
| 06 Cotas e arquivos | Reservas e recuperação manual implantadas; CI de quota e concorrência aprovado; upload/exclusão de caso publicados com devolução exata de 26.088.984 bytes | Outros uploads dos módulos disponíveis; revisão das 9 reservas antigas e dos 5 objetos sem origem; DICOM adiado até a Radiologia funcionar |
| 07 Master | Operador autorizado cadastrado; TOTP confirmado; isolamento de conta/sessão e recusas SQL comprovados | Testes com sessões reais e replay Sandbox com auditoria; revisão financeira em standby |
| 08 Centro de cobrança | Histórico, documentos e renovação recuperados no código | Confirmar na publicação; implementar troca de plano e cancelamento com efeito no Asaas |
| 09 Produção | Adapter separa Sandbox e Produção por chave, URL e flag | Credenciais reais, webhook de Produção, alertas, piloto e cobrança real controlada |

Decisão do responsável em 03/10: a Radiologia ainda não está funcional.
Homologar DICOM fica fora dos requisitos de conclusão do SaaS atual e volta
a ser necessário antes da ativação desse módulo. A pausa financeira até o
restabelecimento dos créditos Lovable e a preservação dos registros históricos
permanecem. A confirmação de exclusão está registrada em
`evidence/STAGE-06-DELETE-CONFIRMATION-2026-10-03.md`.

## Preço do catálogo e contratos existentes — revisão de 03/10/2026

A leitura do banco ativo em 03/10 confirmou `company_initial` com 100 centavos.
A assinatura Sandbox existente mantém contrato de 24.900 centavos, confirmado
pela função privada de preço e pelos dois pagamentos registrados. Os outros
planos permanecem em 44.900 e 74.900 centavos. Nenhum preço foi alterado durante
esta recuperação. A PR #89 já foi integrada no histórico do projeto.

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
