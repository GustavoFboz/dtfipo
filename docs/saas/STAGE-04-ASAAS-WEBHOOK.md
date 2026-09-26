# Etapa 04 — webhook Asaas e confirmação inicial

Status: código em homologação; sem webhook, scheduler ou pagamento vivo comprovado.

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
3. Depois que as PRs 64 e 65 e esta etapa forem integradas e a migration tiver
   sido aplicada ao banco correto, configure no Asaas o endpoint público
   `https://dtfipo.lovable.app/api/billing/asaas-webhook` com os eventos de
   pagamento necessários. Use entrega sequencial. O agendador do GitHub só
   executa na branch padrão após o merge e chama o worker a cada cinco minutos.
4. Compare no Sandbox, sem dados fiscais no relatório, o `pay_*`, `sub_*`,
   `cus_*`, valor, período, um evento repetido, um evento falso e a transição
   `pending_checkout` → `active`. Depois verifique RLS e acesso Web/Windows/
   Android. O arquivo `sql/stage-04-restore-assertions.sql` confere o contrato
   privado no banco restaurado ou no banco vivo, somente leitura.

## Limites antes do Beta

- O primeiro pagamento não será aplicado até um worker autorizado rodar;
  atualmente o agendador previsto tem intervalo de cinco minutos. A latência
  real ainda precisa ser medida no Sandbox.
- Renovações, estornos, inadimplência e reativação ainda exigem a Etapa 05.
  Os eventos ficam em `dead_letter` para revisão e não podem ser ignorados em
  produção. Desenvolver projeção desses eventos e rotina de replay autenticada
  antes de declarar o SaaS pronto.
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
