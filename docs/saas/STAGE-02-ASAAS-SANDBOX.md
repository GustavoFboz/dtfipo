# Etapa 02 — Adapter Asaas Sandbox

Status: implementação local concluída; homologação real no Asaas Sandbox pendente

Data: 2026-09-20

## Resultado desta etapa

O DentalFlow passa a possuir um adapter financeiro exclusivamente de backend
para criar ou reutilizar um cliente e uma assinatura mensal no Asaas. Esta
etapa **não ativa acesso** e não substitui o webhook da Etapa 04: criar uma
assinatura apenas prepara a recorrência; pagamento continua não confirmado.

O fluxo implementado é:

1. o backend valida ambiente, prefixo da chave, `User-Agent` e token do webhook;
2. o banco autoriza o administrador da empresa e entrega o perfil fiscal apenas
   ao `service_role`;
3. uma lease durável serializa cada criação por empresa/assinatura;
4. o adapter consulta `externalReference` antes de qualquer `POST`;
5. cliente e assinatura existentes são reutilizados;
6. `POST` inconclusivo nunca é repetido às cegas: o adapter consulta novamente;
7. IDs Asaas são vinculados por RPCs privadas, sem alterar o status para pago;
8. duplicidade ou divergência de cliente falha fechado para revisão manual.
9. resultado ainda incerto após reconciliação permanece bloqueado até revisão
   manual; uma nova execução nunca recria o recurso automaticamente.

## Configuração obrigatória no backend Lovable

Cadastre em **Lovable Cloud → Secrets**. Não use prefixo `VITE_`, não coloque
os valores no GitHub e não envie os segredos por chat.

| Secret                | Valor no Sandbox                               | Regra                                    |
| --------------------- | ---------------------------------------------- | ---------------------------------------- |
| `ASAAS_ENVIRONMENT`   | `sandbox`                                      | obrigatório e sem fallback para Produção |
| `ASAAS_API_KEY`       | chave iniciada por `$aact_hmlg_`               | criada dentro da conta Asaas Sandbox     |
| `ASAAS_WEBHOOK_TOKEN` | segredo aleatório com pelo menos 32 caracteres | será validado pelo endpoint da Etapa 04  |
| `ASAAS_USER_AGENT`    | `DentalFlow/0.3.0 (billing)`                   | identifica a aplicação no Asaas          |

Opcionais:

| Variável                        |  Padrão |             Limite |
| ------------------------------- | ------: | -----------------: |
| `ASAAS_TIMEOUT_MS`              | `10000` |    1.000–30.000 ms |
| `ASAAS_MAX_GET_RETRIES`         |     `2` | 0–4; somente `GET` |
| `ASAAS_MIN_REQUEST_INTERVAL_MS` |   `125` |         0–5.000 ms |

`ASAAS_PRODUCTION_ENABLED` deve permanecer ausente no Sandbox. Mesmo com uma
chave de Produção, o adapter bloqueia o ambiente até a homologação e a liberação
explícita da Etapa 09.

Para gerar `ASAAS_WEBHOOK_TOKEN` localmente sem reutilizar senha:

```bash
openssl rand -hex 32
```

Guarde o valor no gerenciador de secrets; ele não deve ser versionado.

## Arquivos

- `src/lib/billing/asaas.server.ts`: autenticação, allowlist de URLs, timeout,
  rate gate, retry seguro de leitura e cliente HTTP;
- `src/lib/billing/asaas-provisioning.server.ts`: idempotência, reconciliação e
  criação/reutilização dos recursos;
- `supabase/migrations/20260920203000_saas_asaas_adapter_stage02.sql`: leases,
  autorização e vínculos privados;
- `src/lib/billing/asaas.server.test.ts` e
  `asaas-provisioning.server.test.ts`: contrato unitário sem rede real;
- `docs/saas/sql/stage-02-restore-assertions.sql`: auditoria da restauração.

## Segurança e comportamento de falha

- chamadas financeiras aceitam apenas os dois hosts oficiais, derivados do
  ambiente; nenhuma URL livre é lida de variável;
- a chave vai somente no header `access_token` do backend;
- Produção exige chave `$aact_prod_` **e** `ASAAS_PRODUCTION_ENABLED=true`;
- `GET` usa backoff com jitter e respeita `RateLimit-Reset`;
- `POST` nunca recebe retry automático;
- timeout/erro 5xx durante criação é marcado como resultado incerto e exige
  reconciliação por referência antes de nova tentativa;
- IDs de cliente e assinatura já vinculados não podem ser sobrescritos por
  outro ID ou por outro ambiente;
- a tabela de operações não armazena CPF/CNPJ, endereço, chave ou payload;
- tabelas/RPCs de provedor são inacessíveis a `anon` e `authenticated`;
- logs e mensagens normalizadas não carregam chave nem números fiscais longos.

As decisões seguem a documentação oficial do Asaas sobre
[autenticação](https://docs.asaas.com/docs/autenticação-1),
[limites](https://docs.asaas.com/reference/rate-e-quota-limit),
[clientes](https://docs.asaas.com/reference/criar-novo-cliente) e
[assinaturas](https://docs.asaas.com/reference/criar-nova-assinatura).

## Validação reproduzível

Sem credenciais:

```bash
npm run check:saas:stage-02
npx vitest run src/lib/billing/asaas.server.test.ts \
  src/lib/billing/asaas-provisioning.server.test.ts
npm run build
```

Com banco limpo, execute também o ensaio de restauração da CI e
`docs/saas/sql/stage-02-restore-assertions.sql`.

## Critério para concluir a etapa

A PR permanece em validação até existir evidência sanitizada do Sandbox com:

- secrets presentes somente no backend;
- um cliente criado e uma segunda execução reutilizando o mesmo `cus_*`;
- uma assinatura `MONTHLY` criada e uma segunda execução reutilizando o mesmo
  `sub_*`;
- apenas uma referência de cliente e uma de assinatura no Asaas;
- IDs vinculados no ambiente `sandbox`;
- assinatura interna ainda em `pending_checkout` e
  `paymentConfirmed: false`;
- nenhum segredo, CPF/CNPJ completo ou endereço na evidência.

## Rollback

1. desative o chamador da Etapa 03 ou remova os secrets do backend;
2. preserve os IDs já criados para conciliação — nunca tente recriá-los;
3. a migration pode permanecer instalada sem tráfego externo;
4. não apague clientes, assinaturas ou operações automaticamente;
5. se uma criação estiver `uncertain`, consulte o Asaas pela referência antes
   de qualquer ação manual.
