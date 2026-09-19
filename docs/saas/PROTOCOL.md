# Protocolo SaaS DentalFlow

Status: iniciado em 2026-09-19  
Provedor de referência para homologação: Asaas Sandbox  
Contrato interno: independente de provedor

## Objetivo

Levar a fundação de assinaturas já existente até uma operação SaaS auditável,
recuperável e segura, sem colocar chave financeira no navegador e sem tornar o
Windows ou o Android dependentes de uma resposta Cloud a cada abertura.

O protocolo preserva as decisões de produto já codificadas:

- somente empresas pagam; profissionais ocupam vagas da empresa;
- planos `company_initial`, `company_growth` e `company_advanced` continuam
  sendo a fonte de limites e preços;
- a IPO é uma conta interna, isenta e permanentemente protegida do ciclo de
  cobrança comercial;
- atraso ou cancelamento restringe a operação, mas nunca exclui dados;
- somente o backend confirmado por webhook altera um pagamento para pago;
- Web, Windows e Android usam o mesmo contrato de assinatura, com adapters
  locais para continuidade dos aplicativos instalados.

## Autoridades e fronteiras

| Assunto | Autoridade |
| --- | --- |
| Plano, preço e limite | `public.billing_plans` |
| Estado da assinatura | `public.account_subscriptions` |
| Tentativa de compra | `public.checkout_intents` |
| Pagamento confirmado | `public.billing_payments` |
| Evento externo/idempotência | `public.billing_events` |
| Direito de uso | RPC `my_subscription_context()` + RLS |
| Chave do provedor | secret do backend Lovable; nunca `VITE_*` |
| Interface | consumidor do contrato; nunca autoridade financeira |

O Asaas será encapsulado atrás de um adapter. Trocar o provedor não poderá
alterar os componentes de assinatura nem os estados internos do DentalFlow.

## Fluxo canônico

1. O administrador escolhe plano e ambientes.
2. O backend cria um `checkout_intent` interno e, de forma idempotente, cria ou
   reutiliza cliente/checkout/assinatura no provedor.
3. O navegador recebe apenas URL pública de checkout e identificadores não
   secretos.
4. O provedor envia um webhook autenticado ao backend.
5. O backend persiste o evento antes de responder `HTTP 200`.
6. Um processador idempotente reconcilia o evento com o provedor e chama apenas
   RPCs restritas a `service_role`.
7. O novo snapshot de assinatura invalida os caches; Windows e Android guardam
   somente um snapshot verificado e com validade limitada.

## Estados internos

| Estado | Acesso operacional | Observação |
| --- | --- | --- |
| `pending_checkout` | bloqueado | checkout ainda não confirmado |
| `trialing` | completo até o fim do período | somente se houver período válido |
| `active` | completo até o fim do período | pagamento confirmado pelo backend |
| `past_due` | completo apenas durante carência | nunca apaga dados |
| `grace` | completo apenas durante carência | prazo explícito no servidor |
| `suspended` | bloqueado | área de cobrança permanece acessível |
| `canceled` | completo até o fim já pago; depois bloqueado | reativação cria novo ciclo |

## Etapas executáveis

### 00 — Baseline e auditoria

- inventariar schema, RLS, autenticação, planos, entitlements e adapters;
- executar `npm run check:saas:stage-00` (ou o comando Node equivalente);
- executar o SQL somente leitura de auditoria no Lovable Cloud;
- registrar lacunas, severidade, critério de aceite e rollback.

Saída: `STAGE-00-BASELINE-AUDIT.md` e `sql/stage-00-live-audit.sql`.

### 01 — Contrato canônico e recuperação

- tornar migrations, tipos gerados, Drizzle e pacote de restauração coerentes;
- congelar mapeamento de estados externos para estados DentalFlow;
- adicionar perfil fiscal mínimo da empresa e índices de IDs externos;
- validar restauração do zero antes de tocar no provedor.

### 02 — Adapter Asaas Sandbox

- configurar `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, ambiente e `User-Agent`
  somente no backend;
- implementar cliente com timeout, backoff, limite de taxa e idempotência;
- criar/reutilizar cliente e assinatura sem duplicar cobranças.

As URLs e chaves de Sandbox e Produção são independentes. A documentação
oficial atual define `https://api-sandbox.asaas.com/v3` para Sandbox e
`https://api.asaas.com/v3` para Produção:
<https://docs.asaas.com/reference/comece-por-aqui>.

### 03 — Checkout real

- transformar intent interno em checkout do provedor;
- devolver URL de pagamento segura;
- expirar intents abandonados e reconciliar retorno do navegador;
- nunca ativar assinatura pelo redirect síncrono.

### 04 — Webhook, inbox e reconciliação

- endpoint público com validação de `asaas-access-token`;
- persistência única por `(provider, provider_event_id)` antes do `200`;
- processador assíncrono, tentativas, dead-letter e replay administrativo;
- reconciliação periódica para eventos perdidos ou fora de ordem.

O Asaas documenta entrega *at least once*, recomenda usar o `id` do evento como
chave única e responder somente após persistir:
<https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook>.

### 05 — Ciclo de vida e reativação

- mapear aprovação, vencimento, atraso, estorno, chargeback e cancelamento;
- testar carência, suspensão, renovação e reativação sem exclusão de dados;
- impedir downgrade que exceda sessões, membros ou armazenamento sem uma
  política explícita.

### 06 — Cotas e armazenamento

- aplicar limites do plano e adicionais por entitlement;
- bloquear novos uploads antes de exceder a cota;
- preservar download/eliminação controlada durante restrição;
- manter a cortesia e as invariantes internas da IPO.

### 07 — Administração Master

- criar papel de plataforma separado de `admin`/`CEO` da empresa;
- permitir busca de empresas, assinatura, pagamentos, eventos e saúde da fila;
- ações sensíveis exigem justificativa, auditoria e reautenticação;
- nenhum painel Master é disponibilizado por confiança apenas na UI.

### 08 — Centro de cobrança do cliente

- plano atual, vencimento, forma de pagamento, faturas e recibos;
- troca/cancelamento com impacto e data efetiva claros;
- acesso somente ao administrador financeiro autorizado da empresa;
- comportamento equivalente na Web, Windows e Android.

### 09 — Segurança, Beta e produção

- testes de contrato, RLS, idempotência, concorrência e replay;
- homologação completa no Sandbox, inclusive falhas e reprocessamentos;
- rollout por feature flag e lote piloto;
- runbook de incidentes, métricas, alertas e rollback;
- somente depois, credenciais e webhook separados de Produção.

## Regra de entrega por etapa

Cada etapa deve sair em branch e PR próprias, com:

1. arquivos e migrations exatos;
2. comandos reproduzíveis;
3. evidências de teste;
4. critérios de aceite;
5. riscos e observabilidade;
6. rollback sem apagar dados;
7. atualização do pacote de restauração quando houver schema.

