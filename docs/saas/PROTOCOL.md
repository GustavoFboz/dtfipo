# Protocolo SaaS DentalFlow

Status: iniciado em 2026-09-19

Continuidade em 03/10/2026: recuperação do código das etapas 06–09 removido
na edição Lovable de 29/09, antes de continuar a homologação da etapa 05.
Histórico e renovação estão preparados; cancelamento e troca de plano ainda
precisam ser implementados. O operador Master foi atribuído no banco ativo por
autorização explícita, e seu autenticador TOTP foi confirmado em 03/10.
Consulte `evidence/CONTINUITY-2026-10-03.md` para separar código e provas financeiras.

Retomada de 03/10: etapa financeira **05/09 em espera** por solicitação do
responsável, até o restabelecimento dos créditos Lovable. Etapa atual de avanço
independente: **06/09**, com upload de caso comprovado, correção da confirmação
de exclusão e recuperação manual de envios pendentes. O Master **07/09** aguarda os testes com sessões reais e o replay
auditado. Restam pendências nas seis etapas 04–09: recuperação de
eventos, ciclo financeiro, uploads publicados, prova do replay auditado Master,
cancelamento/troca de plano e liberação controlada de produção.
O tratamento de eventos financeiros fora de ordem e de falhas isoladas do
worker está registrado em `evidence/STAGE-05-RESUME-2026-10-03.md`.
A auditoria de armazenamento e o roteiro de homologação estão em
`evidence/STAGE-06-LIVE-AUDIT-2026-10-03.md`.
O contrato de recuperação está em `evidence/STAGE-06-RESERVATION-RECOVERY-2026-10-03.md`.

Escopo confirmado pelo responsável em 03/10: a Radiologia ainda não está
funcionando. A homologação DICOM fica adiada para a ativação desse módulo e
não bloqueia a conclusão do SaaS dos módulos atualmente disponíveis. As
proteções de armazenamento já implementadas para DICOM permanecem vigentes.

Provedor financeiro obrigatório para lançamento: Asaas

Homologação: Asaas Sandbox; operação: Asaas Produção

Decisão vinculante: `ADR-001-ASAAS-RECURRING-BILLING.md`

## Objetivo

Levar a fundação de assinaturas já existente até uma operação SaaS auditável,
recuperável e segura, sem colocar chave financeira no navegador e sem tornar o
Windows ou o Android dependentes de uma resposta Cloud a cada abertura.

As tabelas atuais são uma fundação interna, não uma integração de cobrança. O
protocolo somente termina quando o fluxo real de cliente, assinatura mensal,
cobrança, webhook e entitlement estiver comprovado no Asaas. Um intent interno,
um token de QA ou uma ativação manual não contam como assinatura recebida.

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
| Cliente, assinatura e ocorrência financeira externa | Asaas |
| Estado de acesso projetado | `public.account_subscriptions` |
| Tentativa de compra | `public.checkout_intents` |
| Ledger local de pagamento confirmado | `public.billing_payments` |
| Evento externo/idempotência | `public.billing_events` |
| Direito de uso | RPC `my_subscription_context()` + RLS |
| Chave do provedor | secret do backend Lovable; nunca `VITE_*` |
| Interface | consumidor do contrato; nunca autoridade financeira |

O Asaas será encapsulado atrás de um adapter para proteger o domínio interno.
Isso não o torna opcional: trocar o provedor exige decisão explícita de produto
e um novo ADR. A UI nunca poderá chamar diretamente a API financeira.

## Fluxo canônico

1. O administrador escolhe um plano mensal e informa o perfil fiscal.
2. O backend cria um `checkout_intent` interno e cria ou reutiliza, de forma
   idempotente, o cliente no Asaas.
3. O backend cria a assinatura Asaas com ciclo `MONTHLY`, valor do plano e
   referência externa rastreável.
4. O navegador recebe apenas a URL pública da cobrança Asaas e identificadores
   não secretos; redirect nunca confirma pagamento.
5. O Asaas envia um webhook autenticado ao backend.
6. O backend persiste o evento antes de responder `HTTP 200`.
7. Um processador idempotente reconcilia o evento com o Asaas e chama apenas
   RPCs restritas a `service_role`.
8. O novo snapshot de assinatura invalida os caches; Windows e Android guardam
   somente um snapshot verificado e com validade limitada.

## Definição de pronto do SaaS

Uma etapa documental, uma migration ou uma tela isolada nunca é suficiente. O
SaaS só estará pronto quando o roteiro do ADR-001 passar no Sandbox e depois em
uma cobrança real controlada de Produção, incluindo evento duplicado, atraso,
estorno, cancelamento, reativação e paridade Web/Windows/Android.

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

Status: concluída em 2026-09-19.

- inventariar schema, RLS, autenticação, planos, entitlements e adapters;
- executar `npm run check:saas:stage-00` (ou o comando Node equivalente);
- executar o SQL somente leitura de auditoria no Lovable Cloud;
- registrar lacunas, severidade, critério de aceite e rollback.

Saída: `STAGE-00-BASELINE-AUDIT.md` e `sql/stage-00-live-audit.sql`.

### 01 — Contrato canônico e recuperação

Status: concluída em 2026-09-20.

- sincronizar migrations e pacote de restauração; regenerar os tipos Supabase
  a partir do schema vivo (o espelho Drizzle permanece não autoritativo);
- congelar mapeamento de estados externos para estados DentalFlow;
- adicionar perfil fiscal mínimo da empresa e índices únicos dos IDs Asaas;
- validar restauração do zero antes de tocar no provedor.

### 02 — Adapter Asaas Sandbox

Status: criação real do cliente e assinatura no Asaas Sandbox comprovada em
28/09/2026. Consulte `evidence/SANDBOX-FIRST-PAID-CYCLE-2026-09-28.md`.

- configurar `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, ambiente e `User-Agent`
  somente no backend;
- implementar cliente com timeout, backoff, limite de taxa e idempotência;
- criar/reutilizar cliente em `/v3/customers` e assinatura mensal em
  `/v3/subscriptions` sem duplicar cobranças.

As URLs e chaves de Sandbox e Produção são independentes. A documentação
oficial atual define `https://api-sandbox.asaas.com/v3` para Sandbox e
`https://api.asaas.com/v3` para Produção:
<https://docs.asaas.com/reference/comece-por-aqui>.

### 03 — Checkout real

Status: primeiro checkout e pagamento real no Asaas Sandbox comprovados em
28/09/2026. Consulte `STAGE-03-REAL-CHECKOUT.md` e a evidência do primeiro ciclo.

- transformar intent interno em assinatura e cobrança reais do Asaas;
- devolver URL de pagamento do Asaas de forma segura;
- expirar intents abandonados e reconciliar retorno do navegador;
- nunca ativar assinatura pelo redirect síncrono.

### 04 — Webhook, inbox e reconciliação

Status: receptor, inbox e worker publicados; primeiro `PAYMENT_CONFIRMED`
processado no Sandbox em 28/09/2026. Repetição, perda de webhook e erros do
provedor ainda exigem homologação específica.
Consulte STAGE-04-ASAAS-WEBHOOK.md.

- endpoint público com validação de `asaas-access-token`;
- persistência única por `(provider, provider_event_id)` antes do `200`;
- processador assíncrono, tentativas, dead-letter e replay administrativo;
- reconciliação periódica para eventos perdidos ou fora de ordem.

O Asaas documenta entrega *at least once*, recomenda usar o `id` do evento como
chave única e responder somente após persistir:
<https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook>.

### 05 — Ciclo de vida e reativação

Status: ciclo inicial pago comprovado no Sandbox; renovação, atraso, carência,
estorno, inativação e replay ainda aguardam provas reais individuais. Os eventos
de risco restantes continuam em revisão. Consulte STAGE-05-ASAAS-LIFECYCLE.md.

- mapear aprovação, vencimento, atraso, estorno, chargeback e cancelamento;
- testar carência, suspensão, renovação e reativação sem exclusão de dados;
- impedir downgrade que exceda sessões, membros ou armazenamento sem uma
  política explícita.

### 06 — Cotas e armazenamento

Status: cota e reservas obrigatórias implantadas em 29/09/2026; ensaios em
base descartável passaram. Um novo anexo de caso foi confirmado na conta
publicada em 03/10. O responsável confirmou a exclusão funcionando, e a
consulta somente leitura comprovou ausência do objeto/anexo/catálogo e retorno
exato da cota ao valor anterior. Restam os demais uploads dos módulos
disponíveis e a reconciliação dos resíduos históricos. DICOM será homologado
quando a Radiologia estiver funcional, fora do escopo atual de conclusão.
O administrador pode revisar reservas antigas por uma ação que não remove
objetos; a limpeza dos nove registros reais depende de revisão individual.
Consulte `STAGE-06-STORAGE-QUOTAS.md`.

- aplicar limites do plano e adicionais por entitlement;
- bloquear novos uploads antes de exceder a cota;
- preservar download/eliminação controlada durante restrição;
- manter a cortesia e as invariantes internas da IPO.

### 07 — Administração Master

Status: papel separado e painel publicados, operador autorizado habilitado no
banco ativo e um fator TOTP verificado em 03/10/2026. O responsável confirmou o
autenticador no painel publicado. Testes SQL em transação somente leitura
confirmaram recusa de acesso/replay a não operador e recusa de replay em `aal1`.
A prova de replay real com auditoria permanece pendente e depende da revisão
financeira Sandbox. O painel também passou a isolar cache e confirmações por
conta/sessão, com testes locais de troca, logout e respostas tardias. Consulte
`STAGE-07-MASTER-ADMIN.md`, `evidence/STAGE-07-ENROLLMENT-2026-10-03.md` e
`evidence/STAGE-07-SESSION-ISOLATION-2026-10-03.md`.

- criar papel de plataforma separado de `admin`/`CEO` da empresa;
- permitir busca de empresas, assinatura, pagamentos, eventos e saúde da fila;
- ações sensíveis exigem justificativa, auditoria e reautenticação;
- nenhum painel Master é disponibilizado por confiança apenas na UI.

### 08 — Centro de cobrança do cliente

Status: histórico e consulta segura de cobrança preparados; falta completar
cancelamento e troca de plano com efeito comprovado no Asaas. Consulte
`STAGE-08-BILLING-CENTER.md`.

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

Uma PR não pode marcar uma etapa financeira como concluída sem evidência Asaas
compatível com seu critério de aceite. Mocks e tokens de QA são testes
auxiliares, não evidência de recebimento de assinatura.
