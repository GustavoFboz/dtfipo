# Etapa 03 — Checkout real do Asaas

Status: implementação concluída; homologação real no Asaas Sandbox pendente

Data: 2026-09-21

## Resultado desta etapa

O DentalFlow deixa de apresentar a ativação financeira simulada na interface de
assinatura. O administrador de uma empresa pendente agora:

1. informa o perfil fiscal mínimo por uma RPC autenticada;
2. escolhe o plano e as sessões da empresa;
3. cria ou reutiliza um intent interno;
4. solicita ao backend a criação idempotente do cliente e da assinatura mensal
   no Asaas;
5. recebe somente a URL pública validada da primeira cobrança;
6. abre o pagamento no navegador, no Android ou no Windows;
7. permanece sem acesso operacional até um webhook financeiro válido.

O redirect do navegador e a resposta de criação do Asaas nunca marcam o
pagamento como aprovado. A confirmação financeira pertence à Etapa 04.

## Fronteiras de segurança

- `ASAAS_API_KEY` e os demais secrets são lidos somente pelo backend;
- o navegador envia o access token Supabase do usuário ao endpoint, que o
  valida novamente antes de usar `service_role`;
- o backend limita origem, método, conteúdo e tamanho da requisição;
- CPF/CNPJ completo é recebido pela RPC protegida e nunca é devolvido ao
  cliente; a tela recebe somente o documento mascarado;
- a URL de pagamento precisa usar HTTPS e o host exato do ambiente:
  `sandbox.asaas.com` no Sandbox ou `www.asaas.com` em Produção;
- o frontend repete essa validação antes de abrir a URL;
- um refresh ou segundo clique reutiliza o mesmo intent, cliente, assinatura e
  cobrança;
- plano e sessões ficam bloqueados depois que uma cobrança externa é criada;
- IDs divergentes, respostas ambíguas e duplicidades falham fechados;
- a migration não concede as RPCs privadas a `anon` ou `authenticated`.

## Arquivos principais

- `src/routes/api/billing/asaas-checkout.ts`: endpoint autenticado;
- `src/lib/billing/asaas-checkout.server.ts`: orquestração e handoff seguro;
- `src/lib/billing/asaas.server.ts`: leitura das cobranças da assinatura e
  allowlist da URL pública;
- `src/components/billing/BillingCheckoutPanel.tsx`: perfil fiscal, resumo e
  botão multiplataforma;
- `src/lib/subscriptions.ts`: RPCs do perfil, cliente do endpoint e abertura no
  navegador externo;
- `supabase/migrations/20260921210000_saas_asaas_checkout_stage03.sql`: contrato
  privado, persistência da cobrança e idempotência do intent;
- `docs/saas/sql/stage-03-live-verification.sql`: verificação somente leitura do
  banco vivo;
- `docs/saas/sql/stage-03-restore-assertions.sql`: verificação do restore.

## Comportamento multiplataforma

| Plataforma | Abertura do pagamento                          |
| ---------- | ---------------------------------------------- |
| Web        | nova aba segura; usa a origem atual do backend |
| Android    | navegador externo pelo plugin Capacitor        |
| Windows    | navegador externo pelo opener seguro do Tauri  |

Os aplicativos instalados usam o backend canônico
`https://dtfipo.lovable.app`; nenhum secret financeiro é empacotado no APK ou
no EXE.

## Validação reproduzível

```bash
bun run check:saas:stage-03
bun test src/lib/billing/asaas.server.test.ts \
  src/lib/billing/asaas-provisioning.server.test.ts \
  src/lib/billing/asaas-checkout.server.test.ts
bun run build
```

Depois de aplicar a migration no banco vivo, execute
`docs/saas/sql/stage-03-live-verification.sql`. O resultado esperado é um JSON
com `result: "passed"` e todos os checks iguais a `true`.

## Homologação real pendente

A etapa só pode ser marcada concluída depois de um teste controlado no Asaas
Sandbox comprovar, sem expor dados fiscais:

- perfil fiscal configurado para uma empresa de teste não isenta;
- um único `cus_*` para a referência da empresa;
- um único `sub_*` mensal para a referência da assinatura;
- uma primeira cobrança `pay_*` com valor igual ao plano;
- URL de pagamento no host `sandbox.asaas.com`;
- refresh e segunda tentativa reutilizando os mesmos IDs;
- checkout interno em `provider_created`;
- assinatura interna ainda em `pending_checkout`;
- `paymentConfirmed: false` e nenhum acesso liberado.

Não registre em evidência chave, CPF/CNPJ, telefone, endereço ou URL completa da
cobrança. IDs podem ser reduzidos aos últimos quatro caracteres.

## Rollback

1. retire o chamador da interface ou remova temporariamente os secrets Asaas;
2. preserve todos os IDs e leases já criados para reconciliação;
3. não apague nem recrie automaticamente cliente, assinatura ou cobrança;
4. a migration pode permanecer instalada sem tráfego externo;
5. mantenha Produção bloqueada e não adicione `ASAAS_PRODUCTION_ENABLED`;
6. uma operação `uncertain` exige conferência no painel Asaas antes de qualquer
   nova tentativa.
