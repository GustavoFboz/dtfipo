# Evidência viva — Etapa 00 SaaS

Status: aprovada com pendência rastreada

Execução no Lovable Cloud: 2026-09-19 20:45:50 UTC

Arquivo de origem recebido: `query-results-export-2026-09-19_16-46-01.csv`

SHA-256 do arquivo de origem:
`48189eaabdbbfb90aecdfd89406f63a0ef0c2ee956cc2265cf752c8916d09a6c`

O CSV original não foi versionado. Esta evidência preserva somente contagens,
configurações e invariantes sem nomes, UUIDs, e-mails ou dados clínicos.

## Resultado

### Schema

Todos os nove objetos esperados estavam presentes:

- `public.account_subscriptions`
- `public.billing_events`
- `public.billing_payments`
- `public.billing_plans`
- `public.billing_test_access`
- `public.billing_test_tokens`
- `public.checkout_intents`
- `public.clinic_storage_entitlements`
- `public.company_sessions`

### Planos

| Código | Ativo | Mensalidade | Sessões | Membros | Armazenamento |
| --- | --- | ---: | ---: | ---: | ---: |
| `professional` | não | R$ 89,00 | 0 | 0 | 0 |
| `company_initial` | sim | R$ 249,00 | 1 | 8 | 25 GB |
| `company_growth` | sim | R$ 449,00 | 2 | 20 | 100 GB |
| `company_advanced` | sim | R$ 749,00 | 3 | 50 | 500 GB |

O plano profissional legado permanece inativo e não é faturável.

### Estado operacional

| Métrica | Resultado |
| --- | ---: |
| Assinaturas `active` | 1 |
| Assinaturas `pending_checkout` | 1 |
| Intents `pending` | 2 |
| Intents pendentes expirados | 2 |
| Pagamentos | 0 |
| Eventos de provedor | 0 |
| Intents órfãos | 0 |
| Pagamentos órfãos | 0 |
| Grupos de assinaturas externas duplicadas | 0 |
| Grupos de pagamentos externos duplicados | 0 |
| Acessos integrais com período expirado | 0 |

Os dois intents pendentes expirados não foram alterados nem excluídos durante a
auditoria. A política idempotente de expiração e reconciliação será implementada
antes do checkout real, nas Etapas 03 e 04.

### Segurança

- RLS estava habilitada nas oito tabelas financeiras/operacionais auditadas;
- `FORCE ROW LEVEL SECURITY` estava desabilitado, comportamento compatível com
  operações privilegiadas do proprietário/service role e sujeito à revisão da
  Etapa 01;
- `billing_apply_checkout_paid()` existia, negava execução para `anon` e
  `authenticated` e permitia somente `service_role`;
- `billing_apply_subscription_state()` apresentava as mesmas proteções.

### Conta interna IPO

Havia um registro interno isento. Todas as invariantes retornaram verdadeiras:

- isenção de cobrança;
- cota de armazenamento;
- assinatura interna protegida;
- três sessões internas;
- módulos legados preservados.

As contagens de perfis e membros coincidiram em 14. Nenhum identificador ou nome
foi preservado nesta evidência.

## Veredito

A Etapa 00 está concluída. O schema SaaS está presente no backend vivo, as
fronteiras financeiras atuais estão protegidas e a ausência de pagamentos e
eventos confirma que a integração Asaas real ainda não foi implementada.

A entrada na Etapa 01 está autorizada com duas obrigações:

1. corrigir a paridade do pacote de restauração antes de integrar o provedor;
2. manter os dois intents expirados como pendência rastreada até existir uma
   rotina idempotente de expiração/reconciliação.

