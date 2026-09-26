# Etapa 04 — verificação do banco vivo

Data: 2026-09-26 (UTC). Evidência sanitizada; sem dados fiscais ou segredos.

## Aplicação

- Projeto: DentalFlow, Lovable Cloud, ambiente atualmente publicado.
- Migration aplicada em transação:
  `supabase/migrations/20260926190000_saas_asaas_webhook_stage04.sql`.
- SHA-256 da migration canônica e da cópia do restore:
  `72ccbf4d912ec4ae47a5bc8160aed5b144828327252cd73389eef8ef60536fc2`.
- A branch `saas/stage-04-webhook-inbox` permanece isolada. A publicação Lovable
  ainda aponta para a Etapa 03; instalar a migration não publica o endpoint.

## Verificação somente leitura após a aplicação

- `docs/saas/sql/stage-04-restore-assertions.sql`: `passed`.
- As quatro RPCs privadas (`receive`, `claim`, `finish` e `apply`) existem.
- RLS de `billing_events` ativa; `anon` e `authenticated` sem execução das
  novas RPCs; `service_role` autorizado.
- Índice único por provedor, ambiente e evento e coluna de lease presentes.
- No instante da verificação: 0 eventos na inbox, 0 pagamentos Asaas pagos e
  0 assinaturas Asaas ativas. Nenhuma ativação financeira foi observada.

## Restauração e CI

- [Restauração limpa da branch](https://github.com/GustavoFboz/dtfipo/actions/runs/36263792732):
  passou com 155 migrations e asserções da Etapa 04.
- [CI da branch](https://github.com/GustavoFboz/dtfipo/actions/runs/36263792739):
  contrato, testes financeiros e build passaram.

## Pendente

Publicar e homologar os endpoints somente após as dependências das PRs 64 e 65;
configurar separadamente o token do webhook Asaas Sandbox e o token do worker;
testar pagamento Sandbox real, duplicatas, atraso, renovação e estorno. A
migration isolada não configura webhook, não agenda processamento e não libera
Produção.
