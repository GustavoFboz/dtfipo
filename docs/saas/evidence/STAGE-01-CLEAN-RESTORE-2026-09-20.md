# Evidência de restauração limpa — Etapa 01 SaaS

Status: aprovada

Execução: 2026-09-20 06:17:19 UTC  
Workflow: [DentalFlow SaaS Restore Rehearsal — execução 35493807420](https://github.com/GustavoFboz/dtfipo/actions/runs/35493807420)  
Branch: `saas/stage-01-contract-recovery`  
Commit ensaiado: `7e62fa397c87902277bbb405c04f015ba855299b`

Artefato: `saas-stage-01-clean-restore-35493807420` (ID `10599657735`,
4.479 bytes)  
SHA-256 do artefato ZIP:
`0efd2898131b18fec309b1aad6d71c46a449d037b2bd5c68b224781ed2d93df0`

## Escopo do ensaio

O workflow iniciou uma instância Supabase isolada e vazia, verificou o pacote
determinístico, aplicou `public/restore.sql`, executou as asserções da Etapa 01
e produziu a auditoria sanitizada do schema restaurado. O Lovable Cloud e os
dados vivos não foram acessados nem modificados pelo ensaio.

## Resultado

- pacote determinístico de 152 migrations verificado;
- `public/restore.sql` aplicado integralmente sem erro;
- asserções do contrato concluídas com `"result": "passed"`;
- 12/12 colunas e 6/6 índices canônicos presentes;
- ciclo de cobrança restaurado como `MONTHLY`;
- tabelas fiscais protegidas por RLS, sem leitura de `anon` ou
  `authenticated`;
- mutações financeiras e vínculo Asaas restritos a `service_role`;
- zero duplicidades de clientes, assinaturas, pagamentos ou eventos externos;
- zero tuplas inválidas de provedor e ambiente;
- auditoria e encerramento da instância concluídos com sucesso.

O banco limpo não possuía perfis fiscais nem vínculos Sandbox/Produção. Esse é
o estado esperado antes da Etapa 02 e confirma que o restore não cria clientes
ou assinaturas artificiais.

## Defeitos históricos detectados e corrigidos

O ensaio foi mantido estrito e revelou incompatibilidades que um banco vivo já
migrado não mostrava:

1. inclusão duplicada de tabelas na publicação Realtime;
2. colisão entre índice e constraint de unicidade do código de convite;
3. policy `INSERT` de Storage com cláusula `USING` inválida;
4. criação tardia de `cases.requested_by` em relação às funções de Storage;
5. reconciliação IPO incompatível com UUID, banco vazio e ordem de atribuição;
6. valor `SOLICITANTE` ausente do enum no snapshot histórico.

As correções são idempotentes, permanecem no schema canônico e na cópia de
restore e foram incorporadas novamente ao SQL consolidado.

## Privacidade e retenção

O artefato contém somente o log de aplicação, o relatório de asserções e a
auditoria de schema. Não contém CPF/CNPJ, nomes, e-mails, UUIDs de usuários ou
dados clínicos. O artefato do GitHub expira em 2026-10-20; este registro
versionado preserva o run, o commit, o digest e o veredito sanitizado.

## Veredito

A restauração limpa da Etapa 01 está aprovada. Em conjunto com a auditoria do
schema vivo e os tipos regenerados, esta evidência encerra a recuperação do
contrato canônico e libera a revisão final da PR antes da Etapa 02.
