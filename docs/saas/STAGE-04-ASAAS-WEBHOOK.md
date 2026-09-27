# Etapa 04 — webhook Asaas e confirmação inicial

Status: migration aplicada ao banco vivo em 2026-09-26 e verificada; backend
publicado para teste na branch Lovable `saas/stage-03-asaas-checkout` pelo
[PR 72](https://github.com/GustavoFboz/dtfipo/pull/72). O agendador foi
integrado à `main` pelo [PR 74](https://github.com/GustavoFboz/dtfipo/pull/74),
mas faltam a validação dos segredos, a configuração do webhook no Asaas e a
homologação real de compra. Consulte evidence/STAGE-04-LIVE-AUDIT-2026-09-26.md
para a inspeção anterior à publicação.

## O que foi implementado

- `POST /api/billing/asaas-webhook` verifica `asaas-access-token` em tempo
  constante, limita o corpo a 32 KiB, descarta dados pessoais do payload e
  persiste `event.id`, tipo e ID da cobrança antes de responder `200`.
- `billing_events` deduplica por provedor, ambiente e ID de evento. A
  duplicata recebe `200` sem reiniciar uma tentativa concluída.
- `POST /api/billing/asaas-worker` exige um segredo próprio. Uma RPC seleciona
  eventos pendentes com `FOR UPDATE SKIP LOCKED`, lease de 90 segundos,
  seis tentativas e `dead_letter` após falhas consecutivas.
- Somente `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` podem confirmar a primeira
  cobrança. O worker consulta `GET /v3/payments/{id}` no ambiente configurado;
  uma RPC única compara ambiente, ID da cobrança, assinatura, cliente, empresa,
  plano e valor com o checkout registrado antes de ativar o período mensal.
- Eventos de estorno, atraso, cancelamento, renovação e tipos desconhecidos são
  retidos para revisão. Esta etapa ainda não executa a política completa da
  Etapa 05. Evento meramente informativo pode ser marcado como ignorado.

## Segredos e operação no Sandbox

1. Mantenha os quatro segredos da Etapa 02 exclusivamente no backend. O
   `ASAAS_WEBHOOK_TOKEN` é o `authToken` configurado no webhook do Asaas
   Sandbox. Não use a API key como token de webhook.
2. Crie outro segredo aleatório, `BILLING_WORKER_TOKEN` (32 caracteres ou mais),
   no backend **e** como segredo do GitHub Actions. O endpoint do worker não
   aceita o token do webhook.
3. Com o backend de teste publicado e a migration aplicada, configure no Asaas
   Sandbox o endpoint público
   `https://dtfipo.lovable.app/api/billing/asaas-webhook` com os eventos de
   pagamento e assinatura necessários. Use entrega sequencial. O agendador do
   GitHub está na branch padrão e chama o worker a cada cinco minutos quando
   o segredo de Actions está configurado.
4. Compare no Sandbox, sem dados fiscais no relatório, o `pay_*`, `sub_*`,
   `cus_*`, valor, período, um evento repetido, um evento falso e a transição
   `pending_checkout` → `active`. Depois verifique RLS e acesso Web/Windows/
   Android. O arquivo `sql/stage-04-restore-assertions.sql` confere o contrato
   privado no banco restaurado ou no banco vivo, somente leitura.

## Limites antes do Beta

- O primeiro pagamento não será aplicado até um worker autorizado rodar;
  atualmente o agendador previsto tem intervalo de cinco minutos. A latência
  real ainda precisa ser medida no Sandbox.
- A Etapa 05 já implementa projeção de parte das renovações, estornos,
  inadimplência e reativação no backend de teste. Ainda há eventos de risco e
  casos parciais que exigem revisão. Eventos não resolvidos ficam na inbox
  para investigação; não declarar o SaaS pronto antes da homologação real.
- Não ligue o webhook em Produção nem libere `ASAAS_PRODUCTION_ENABLED` nesta
  etapa. Falta testar cobrança real controlada e o ciclo completo.
- Nenhum secret, documento fiscal ou URL de fatura deve entrar em logs/PR.

## Verificação e rollback

```sh
npm run check:saas:stage-04
npx vitest run src/lib/billing/asaas-webhook.server.test.ts
npm run build
```

Para interromper, desative o webhook na conta Asaas e remova o segredo do
agendador. Preserve inbox, IDs e pagamentos para reconciliação. Não exclua
eventos e não crie cobranças substitutas automaticamente.
