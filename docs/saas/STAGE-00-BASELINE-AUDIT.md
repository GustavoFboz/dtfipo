# Etapa 00 — Auditoria de baseline SaaS

Data: 2026-09-19  
Commit auditado: `e95b98e9fd398755955cf9910e0d354302db1278`  
Escopo: repositório, migrations, contratos de UI, segurança estática e adapters

## Resultado executivo

O DentalFlow já possui uma fundação SaaS relevante, mas ainda não possui uma
integração de cobrança de produção. O banco modela planos, intents, pagamentos,
eventos, estados e limites; o frontend possui onboarding e bloqueio por
assinatura; o Windows preserva um snapshot verificado para uso offline.

O produto ainda não consegue cobrar um cliente real: não há adapter de
provedor, endpoint de webhook, URL de checkout, processador/retry,
reconciliação, painel Master ou centro de cobrança para uma empresa ativa.

Após a revisão do proprietário do produto, ficou formalizado que a meta é
receber assinaturas mensais reais pelo Asaas. A estrutura existente não será
aceita como solução final nem como sandbox substituto do provedor. A decisão e
o teste ponta a ponta obrigatório estão em
`ADR-001-ASAAS-RECURRING-BILLING.md`.

O bloqueio mais urgente é de recuperabilidade. A documentação operacional diz
que `public/restore/migrations.json` reconstrói o backend, mas esse manifesto
termina em 202607 e não inclui a fundação SaaS criada nas migrations de 202609.
Uma restauração seguindo o runbook atual não recria a camada de cobrança.

## Baseline encontrado

| Área | Estado | Evidência |
| --- | --- | --- |
| Modelo empresa-only | Implementado | profissional foi desativado como plano faturável |
| Planos | Implementado | Inicial R$ 249; Crescimento R$ 449; Avançado R$ 749 |
| Limites | Implementado | 1 sessão/8 membros/25 GB; 2/20/100 GB; 3/50/500 GB |
| Ciclo de assinatura | Implementado | pending, trial, active, atraso, carência, suspensão e cancelamento |
| Checkout interno | Parcial | cria intent, mas não cria checkout externo nem URL |
| Cliente/assinatura Asaas | Ausente | não cria `/v3/customers` nem `/v3/subscriptions` |
| Ledger | Implementado | `billing_payments` com unicidade por pagamento do provedor |
| Inbox de webhook | Fundação | `billing_events` existe, sem endpoint/processador |
| Mutação financeira | Protegida | RPCs de aplicação de estado são `service_role` only |
| Entitlement/RLS | Implementado | gate de UI e helpers do banco dependem de acesso pago |
| IPO interna | Implementado | isenção, plano avançado, três sessões e proteção por trigger |
| Windows offline | Implementado | snapshot SQLite verificado e limitado pelo período pago |
| Android offline | Ausente | não existe adapter móvel de entitlement equivalente |
| Administração Master | Ausente | `admin` atual é papel operacional, não papel de plataforma |
| Área de cobrança ativa | Ausente | histórico de `billing_payments` não é consumido pela UI |

## Inventário técnico

### Banco e contratos existentes

- `billing_plans`
- `account_subscriptions`
- `checkout_intents`
- `billing_payments`
- `billing_events`
- `billing_test_tokens` e `billing_test_access`
- `company_sessions`
- `clinic_storage_entitlements`
- `my_subscription_context()`
- `billing_apply_checkout_paid()` restrita a `service_role`
- `billing_apply_subscription_state()` restrita a `service_role`

### Aplicação existente

- onboarding de empresa escolhe plano e ambientes;
- onboarding profissional exige código válido de empresa;
- `SubscriptionGate` só libera operação com `effective_access=full`;
- sandbox interno exige token de QA de uso limitado;
- Hub mostra apenas sessões pagas;
- build Desktop troca `subscriptions.ts` por facade local-first.

### Infraestrutura ausente

- nenhuma rota `/api` de cobrança ou webhook;
- nenhuma referência a Asaas no código de execução;
- nenhum secret de provedor definido no contrato do backend;
- nenhuma fila/processador ou tarefa de reconciliação;
- nenhum campo fiscal de empresa (`CPF/CNPJ`, razão social, e-mail de cobrança,
  endereço fiscal) na tabela `clinics`;
- nenhum índice/constraint canônico para IDs externos de cliente/assinatura;
- nenhuma UI Master para operação financeira e replay de eventos.

## Achados priorizados

### P0 — Pacote de restauração não contém o SaaS

`public/restore/migrations.json`, `public/restore.sql` e
`public/restore/backend-restore.sql` não contêm as tabelas de cobrança. O
espelho Drizzle contém apenas a primeira migration 0.3.2 e também não contém os
hardening posteriores.

Critério para resolver: restaurar um banco vazio e obter o mesmo schema,
funções, GRANTs, policies e invariantes da sequência atual de migrations.

### P0 resolvido — Estado vivo provado

O backend oficial é Lovable Cloud e não há deploy de migrations via GitHub. A
existência dos arquivos no repositório não prova que todos foram aplicados no
ambiente vivo.

O SQL somente leitura foi executado no Lovable Cloud em 2026-09-19 20:45:50
UTC. Todos os nove objetos esperados estavam presentes, as RLS estavam
habilitadas e as RPCs financeiras estavam restritas a `service_role`. A
evidência sanitizada e o checksum do CSV estão em
`evidence/STAGE-00-LIVE-AUDIT-2026-09-19.md`.

### P1 — Intents de checkout expirados

O banco vivo contém dois intents `pending`, ambos vencidos, sem pagamentos ou
eventos de provedor associados. Eles não são órfãos e não foram apagados pela
auditoria.

Critério para resolver: rotina idempotente deve marcar intents expirados sem
ativar assinatura, e a reconciliação deve impedir duplicidade ao reiniciar um
checkout. Implementação prevista nas Etapas 03 e 04.

### P1 — Não existe caminho de pagamento real

O checkout atual encerra em `checkout_intent_id`. Falta criar/reutilizar o
cliente no provedor, criar checkout/assinatura, guardar IDs externos e devolver
uma URL pagável.

O caminho aceito é específico: cliente e assinatura mensal no Asaas, cobrança
pagável do Asaas e ativação somente após evento financeiro autenticado. Intent,
redirect, token de QA e mutação manual não substituem esse fluxo.

### P1 — Webhook e reconciliação ausentes

`billing_events` fornece uma boa chave idempotente, porém não há receptor,
autenticação, persistência antes do `200`, processador, retry, dead-letter ou
reconciliação. O redirect do checkout não pode preencher essa lacuna.

### P1 — Perfil fiscal insuficiente

`clinics` possui nome, tipo e proprietário, mas não os dados mínimos para criar
um cliente de cobrança de forma consistente. A Etapa 01 deve definir dados,
validação, criptografia/visibilidade e política de alteração.

### P1 — Falta papel de plataforma

Os papéis atuais representam usuários da operação. Um Master SaaS precisa ser
separado de `CEO`, `admin` e `is_default_admin`, aplicado no backend, auditado e
inacessível a administradores de clientes.

### P1 — Android não preserva entitlement verificado

O Windows possui cache com validade; o adapter genérico usado pelo Android faz
consulta Cloud direta. Isso viola a paridade local-first para aplicativos
instalados e precisa ser resolvido antes do Beta pago.

### P2 — Visibilidade do ledger é ampla

A policy atual de `billing_payments` permite leitura por qualquer membro ativo
da empresa. O centro de cobrança deverá restringir dados financeiros ao
administrador financeiro/CEO conforme regra explícita.

### P2 — Cliente ativo não possui centro de cobrança

O gate de pagamento aparece quando o acesso já está bloqueado. Uma empresa
ativa não possui tela para ver vencimento, recibos, histórico, troca de plano
ou cancelamento.

### P2 — Operação e privacidade de eventos não estão definidas

Faltam retenção do payload, redaction de dados sensíveis, métricas, alertas,
tentativas e política de replay para `billing_events`.

## Verificações executadas

```text
node scripts/check-enterprise-hub-032.mjs
DentalFlow 0.6.6 company billing, professional membership and IPO invariants passed.

node scripts/check-desktop-entitlement-bootstrap-032.mjs
DentalFlow Desktop 0.6.6 entitlement/bootstrap regressions: OK

node scripts/check-clinic-route-outlets.mjs
OK: Clinic e Patients preservam rotas filhas

Lovable Cloud SQL editor
Relatório consolidado gerado sem nomes, UUIDs, e-mails ou dados clínicos.
Todos os 9 objetos esperados presentes; 0 órfãos; 0 duplicidades externas.
```

O build completo não foi repetido localmente porque este ambiente não possui
`bun`; o CI geral do mesmo commit-base passou antes do início desta etapa.

## Critério de saída da Etapa 00

- [x] inventário estático versionado;
- [x] lacunas priorizadas;
- [x] protocolo e sequência definidos;
- [x] Asaas formalizado como provedor financeiro obrigatório para lançamento;
- [x] aceite ponta a ponta formalizado no ADR-001;
- [x] check automatizado do baseline;
- [x] SQL vivo somente leitura preparado;
- [x] SQL executado no Lovable Cloud e evidência sanitizada anexada;
- [x] decisão formal de entrada na Etapa 01.

Etapa 00 concluída em 2026-09-19. Próxima branch:
`saas/stage-01-contract-recovery`.
