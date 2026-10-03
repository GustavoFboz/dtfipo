# Etapa 07 — isolamento Master por conta e sessão, 03/10/2026

A configuração TOTP do operador real já foi confirmada no painel publicado e no
banco ativo. Esta entrega avança a verificação independente de segurança da
etapa 07. A homologação financeira da etapa 05 permanece em espera até o retorno
dos créditos Lovable, conforme solicitação do responsável.

## Problema e correção

A raiz da aplicação já removia consultas na troca de usuário, mas `/master`
usava uma chave de cache global e mantinha as confirmações MFA, evento escolhido
e justificativa em estado local sem ligação explícita à sessão. Uma leitura
inicial atrasada ou uma confirmação que terminasse após logout/troca de sessão
precisava ser recusada pela própria tela.

O painel agora aguarda uma sessão Cloud, separa consultas por usuário, sessão e
geração em memória, e desmonta o conteúdo administrativo quando esse escopo
muda. Isso limpa busca, evento, justificativa, códigos, cadastro pendente e as
duas confirmações MFA. O cache Master é descartado ao sair e uma falha posterior
do servidor também esconde os dados anteriores. O carregamento aceita o sinal
de cancelamento e confere o escopo antes e depois da resposta.

Cada RPC usa o JWT conferido para aquela requisição; o token não entra na chave
de cache, snapshot, estado da interface ou armazenamento da aplicação. A leitura
local dos identificadores do JWT serve somente para separar a interface. A
assinatura do token, permissão Master, segundo fator, justificativa e auditoria
continuam sob responsabilidade do backend existente.

Refresh de token, repetição de `SIGNED_IN` na mesma sessão e upgrade MFA válido
preservam o escopo. Novo login, outra conta ou perda de AAL2 exigem nova
confirmação. Resultados MFA tardios de uma sessão abandonada são recusados no
painel. Sessões sintéticas do dispositivo não abrem esta área administrativa.
Os adapters nativos e o acesso clínico offline permanecem no contrato existente.

Uma ação financeira já enviada continua sujeita à transação do servidor. A
verificação posterior da interface não desfaz uma ação concluída; apenas impede
que sua resposta confirme uma sessão diferente. Nenhum replay foi enviado
nesta entrega.

## Validação

- 115 testes passaram: 78 de billing/storage/entitlement Desktop, 10 de cadastro
  MFA, 12 de ciclo da sessão, oito de RPC/cache e sete da interface React.
- A interface foi exercitada em DOM simulado com auth/RPC fictícios: confirmação
  da conta separada do replay; limpeza em novo login do mesmo usuário; recusa de
  outra conta; resposta de consulta antiga; MFA terminado após logout; segredo
  de cadastro retornado depois da troca; evento `SIGNED_IN` repetido.
- Os testes de RPC usam o cliente Supabase/PostgREST real com transporte
  simulado, incluindo header de autenticação, negativa do servidor e
  cancelamento. Eles não representam chamadas ao banco ativo ou ao Asaas.
- Checks SaaS 06 e 09, pacote de restauração, regressão Desktop de entitlement/
  bootstrap, TypeScript e builds Web/Desktop/Android passaram.
- O lockfile adiciona apenas o ambiente DOM de testes e suas dependências, sem
  alterar as versões existentes; a verificação de lockfile congelado passou.
- Os cenários Master foram incluídos no CI. `happy-dom` é dependência somente
  de desenvolvimento e não é importado pelo aplicativo.

Comandos reproduzíveis:

```sh
bun install --frozen-lockfile
bun run check:saas:stage-06
bun run check:saas:stage-09
bun scripts/check-desktop-entitlement-bootstrap-032.mjs
bunx tsc --noEmit
bunx vitest run --configLoader runner src/lib/billing/*.test.ts src/lib/storage.test.ts src/lib/subscriptions.desktop.test.ts src/lib/auth/master-mfa.test.ts src/lib/auth/master-session.test.ts src/lib/master-admin.test.ts src/components/master/MasterPage.test.tsx
bunx vite build --configLoader runner
bun run sound:prepare
bunx vite build --config vite.desktop.config.ts --configLoader runner
bunx vite build --config vite.mobile.config.ts --configLoader runner
```

## Pendências e reversão

A etapa 07 segue parcial: falta repetir os cenários de outra conta/sessão no
aplicativo publicado com logins reais e comprovar um replay Sandbox devidamente
revisado com os dois registros de auditoria. Os testes locais não substituem
essas provas operacionais. O replay dos eventos avulsos diagnosticados na etapa
05 continua sem autorização técnica de vínculo com uma assinatura SaaS.

Não há migration, chamada Asaas, alteração de pagamento, preço, assinatura,
entitlement ou concessão de operador nesta entrega. A reversão é por novo commit
revertendo esta alteração, sem reescrever histórico publicado ou remover os
guardas SQL e registros de auditoria existentes.

Referências de contrato:
https://supabase.com/docs/reference/javascript/auth-onauthstatechange
https://supabase.com/docs/guides/auth/sessions
