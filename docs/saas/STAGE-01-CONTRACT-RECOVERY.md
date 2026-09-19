# Etapa 01 — Contrato canônico e recuperação

Status: implementação preparada; aplicação e auditoria no Lovable Cloud pendentes  
Branch: `saas/stage-01-contract-recovery`  
Migration: `20260919213000_saas_contract_recovery_stage01.sql`

## Resultado esperado

Esta etapa prepara o banco para a integração real do Asaas sem chamar a API e
sem ativar nenhuma assinatura. O adapter e os secrets entram somente na Etapa
02.

## Contrato implementado

- ciclo comercial fixado em `MONTHLY`;
- IDs de evento, pagamento, checkout e assinatura separados por
  `sandbox`, `production` ou `internal`;
- unicidade dos IDs externos por provedor e ambiente;
- perfil fiscal da empresa em `company_billing_profiles`;
- cliente Asaas canônico em `billing_provider_customers`, com vínculos
  simultâneos e independentes para Sandbox e Produção;
- leitura direta da tabela fiscal negada a `anon` e `authenticated`;
- edição fiscal apenas por proprietário, `CEO` ou `ADMIN`, via RPC validada;
- CPF/CNPJ normalizado e validado pelos dígitos verificadores brasileiros;
- CPF/CNPJ retornado ao cliente somente mascarado;
- vínculo do `provider_customer_id` restrito a `service_role`;
- mapeamento versionado dos eventos Asaas, inclusive pagamento confirmado,
  atraso, estorno, chargeback e cancelamento.

## Fronteira de privacidade

O CPF/CNPJ integral é necessário para criar o cliente pagador no Asaas, mas não
é devolvido pela RPC de leitura. A aplicação cliente recebe somente o final
mascarado. Nenhuma chave Asaas, token de webhook ou segredo é armazenado nessa
tabela ou enviado ao navegador.

O backend da Etapa 02 usará `service_role` para ler o perfil, criar/reutilizar o
cliente no ambiente correto do Asaas e chamar `billing_bind_asaas_customer`.
A UI não pode informar ou substituir `provider_customer_id`.

## Recuperação

O pacote público de restauração anterior ficou congelado antes da fundação
SaaS e o SQL consolidado divergiu do próprio manifesto. Esta etapa trata isso
como falha de recuperação, não como simples ausência de documentação.

Critérios antes de concluir a etapa:

- todas as migrations SaaS necessárias constam no manifesto público;
- o SQL consolidado é gerado deterministicamente a partir do manifesto;
- arquivos individuais e consolidado possuem a mesma ordem e conteúdo;
- uma restauração limpa cria os objetos, índices, RPCs, RLS e grants esperados;
- a auditoria pós-aplicação não retorna IDs, CPF/CNPJ, e-mails ou nomes.

O arquivo `drizzle/schema.ts` permanece intencionalmente vazio e não é fonte de
schema. Os tipos Supabase continuam sendo gerados pelo Lovable Cloud; não são
editados manualmente. Eles deverão ser regenerados após a aplicação viva desta
migration.

## Aplicação segura

1. Fazer backup do Lovable Cloud.
2. Aplicar a migration da etapa no ambiente oficial.
3. Executar `docs/saas/sql/stage-01-live-audit.sql` em modo somente leitura.
4. Exportar apenas o relatório JSON sanitizado.
5. Regenerar os tipos Supabase a partir do schema vivo.
6. Executar `npm run check:saas:stage-01` e as pipelines Web/Windows/Android.

## Rollback

A migration é aditiva. Em incidente, o adapter da Etapa 02 permanece desligado
e as novas RPCs podem ter `EXECUTE` revogado sem apagar dados. Colunas, índices
e o perfil fiscal não devem ser removidos automaticamente após uso; qualquer
remoção exige exportação, validação de retenção e migration específica.

## Critério de saída

- [x] contrato de ambiente e identidade externa definido;
- [x] perfil fiscal protegido e RPCs separadas por autoridade;
- [x] mapeamento de eventos congelado;
- [ ] pacote de restauração sincronizado;
- [ ] migration aplicada no Lovable Cloud;
- [ ] auditoria viva aprovada;
- [ ] tipos Supabase regenerados;
- [ ] restauração limpa ensaiada.
