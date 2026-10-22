# Validações publicadas — 22/10/2026

A autorização explícita do titular para administrar Cloud e publicar o SaaS
permitiu concluir a publicação da PR181, revisão
`0bdc69d5ad666e4014053a9d88eb076dfc192dd2`, deployment nativo
`bf58a179-0a5f-4788-b4e8-3afdafc21c30`. O painel confirmou “Seu site foi
atualizado”. CI/build e restauração das 176 migrações passaram, junto dos
202 testes locais de cobrança/fixtures, TypeScript e regressões desktop.

## Storage — prova parcial do item 3.2

Job `1644cba9-4fba-4cf0-83f1-cb97c513e548`, concluído em
**22/10/2026 04:05:25 UTC / 00:05:25 Manaus**: **84/84 verificações reais**.
[Recibo persistido](storage-resilience-20261022.json).

Duas sessões USER das fixtures autorizadas executaram os quatro tipos de
upload e exclusão. Reservas concorrentes que juntas excediam a cota tiveram
exatamente um vencedor. Envios interrompidos não foram concluídos sem objeto;
o cancelamento posterior foi idempotente. Um PNG de 68 bytes com reserva de
67 bytes teve a conclusão recusada com `STORAGE_OBJECT_SIZE_MISMATCH`, conforme
o contrato de validação do tamanho persistido. Seus bytes foram conferidos;
cancelar antes da remoção foi recusado. As cotas voltaram exatamente ao início.
O cenário de liberação prematura também preservou os bytes do objeto válido.

O preparo clínico descartável foi administrativo e limitado ao marcador do
job. Bytes, reservas, downloads, isolamento e limpeza usaram as sessões USER,
sem promoção, sessão Master inventada ou recuperação histórica por SQL.
Às 04:08:12 UTC, a consulta final encontrou **zero linhas Storage das fixtures**.
As nove reservas históricas não foram alteradas; ainda exigem revisão individual
por gestor real. Por isso, **3.2 permanece parcial**. Aparelhos mantêm o item 3.3.

## Alerta “Teste Webhook Unika POS”

O workflow manual [#18](https://github.com/GustavoFboz/dtfipo/actions/runs/39720405987)
passou na revisão `0bdc69d`. O GET privado, em **04:05:37 UTC / 00:05:37 Manaus**,
retornou listagem completa de duas filas e correlação `different_queue`:

| Fila | Endpoint do DentalFlow | Ativa | Interrompida | Envio | Eventos |
| --- | --- | --- | --- | --- | --- |
| DentalFlow | Sim | Sim | Não | Sequencial | 13 |
| Teste Webhook Unika POS | Não | Sim | Sim | Não sequencial | 5 |

Ambas usam API v3. [Recibo sanitizado](production-queue-correlation-20261022.json).
Não foram lidos os Logs de Webhooks; a causa HTTP da outra fila não foi
determinada. Nenhuma fila foi editada, retomada ou desativada, e o diagnóstico
não processou finanças. O nome “Teste” não autoriza interromper outro sistema.

A execução #16 havia falhado porque o workflow não fazia checkout do script.
A PR181 resolveu a execução. No #18, o checkout posterior aos GETs limpou os
JSONs de conta/webhook já escritos; a correlação foi preservada no artefato e
nos logs. O checkout passa ao início, antes da coleta, para preservar os três
recibos nas próximas execuções manuais. Os pushes continuam sem esse GET extra.

## Segurança — revisão aberta, sem aceite novo

O Quick security scan exibiu leitura ampla autenticada em 12 tabelas legadas.
A consulta somente de metadados confirmou políticas SELECT com `USING (true)`
em cadistas, case_activity_reads, case_types, component_categories, components,
doctors, implant_systems, proteticos, scan_jigs, stock_items, tooth_colors e
workflow_templates. O alcance e a finalidade de cada tabela precisam de revisão;
catálogos compartilhados e registros operacionais exigem decisões diferentes.
Não foi feita leitura do conteúdo pessoal nem correção automática pelo builder.

O scanner também aponta uma regra antiga de avatars e INSERT em clinics. A
revisão deve considerar o conjunto de políticas restritivas e os gatilhos de
onboarding, sem inferir segurança só pela permissão isolada nem descartar o
alerta sem prova. MFA, sessão Master/AAL2, replay e arquivos históricos continuam
em aberto nos itens 4.2/4.3. [Metadados resumidos](security-scan-review-20261022.json).

## Continuidade financeira

A leitura das 04:08:12 UTC manteve um pagamento Production e zero eventos
Production falhos/dead letter. Cron segue habilitado e o worker `ok`, com último
heartbeat às 04:06:02 UTC. Não houve cobrança nova, mudança de contrato, alteração
de ambiente nem novo ensaio de alerta. [Snapshot](authorized-validation-snapshot-20261022.json).

**Total preservado após o novo aceite de identidade: 8/23 (34,78%); 15 itens
abertos/parciais; 0/7 etapas inteiramente encerradas.** Publicação e testes
parciais não concedem novos aceites financeiros nem aprovação para vendas.
