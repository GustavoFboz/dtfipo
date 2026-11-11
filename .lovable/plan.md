# Auditoria somente leitura — casos, cobrança e telemetria (02/11/2026)

HEAD observado: `a062f6c29977281da75cfbdd97f5d1bfbe1510fd`, árvore limpa. Nada foi alterado.

## O que foi verificado nesta leitura
- Criação de caso/paciente já passa por `src/lib/creation-rpc.ts` (RPCs `create_case_idempotent_v1` / `create_patient_idempotent_v1`, presentes no banco), usados por `src/lib/api.ts` e `src/lib/patients-local-first.ts`.
- `src/components/NewCaseDialog.tsx`: a invalidação global `qc.invalidateQueries()` foi removida; restam invalidações direcionadas (`["cases"]` em 447/905, `["case", id]` em 906, `["patients"]` em 660).
- `src/hooks/use-cases-realtime.ts:220`: INSERT remoto ainda chama `fetchCaseById` (consulta completa) antes de mostrar o caso para outros usuários.
- Testes executados agora: `creation-rpc`, `creation-attempt`, `billing-cancel-request` passam; `global-search.test.ts` falha 1 de 6 (ordenação "Ana Cristina" vs "Cristina Ana") — falha preexistente.
- Telemetria beta: não há módulo dedicado; só `src/lib/lovable-error-reporting.ts` e o painel `MasterSaasProtocolProgress.tsx`. Não verificado se há eventos de uso reais coletados.
- Ciclo recorrente/cancelamento: não reexaminado em profundidade nesta rodada; testes de `billing-cancel-request`, `billing-plan-change`, `billing-change-requests` existem.

## Correções propostas (menor risco)
1. **Ordenação da busca de pacientes** — `src/lib/global-search.ts` (`rankPatientsForSearch`): nome exato na ordem digitada deve vir antes da forma invertida. Causa demonstrada pelo teste que falha hoje. Teste: `src/lib/global-search.test.ts`.
2. **Caso novo aparece mais rápido para colegas** — `src/hooks/use-cases-realtime.ts:216-227`: inserir na lista com os campos do próprio evento Realtime (já filtrado por RLS) e completar com `fetchCaseById` em segundo plano, sem esperar. Sem mudança de banco. Teste novo ao lado do hook; regressão `scripts/check-desktop-case-dialog-offline.mjs`.
3. **Evitar recarga dupla ao criar** — `NewCaseDialog.tsx:905-906`: o caso já é posto no cache pelo retorno do RPC; trocar a invalidação imediata de `["cases"]` por uma invalidação adiada/não bloqueante (ou remover, confiando no Realtime). Teste: `creation-rpc.test.ts` + regressão offline.

## Bloqueadores de venda (confirmados ou não verificados)
- Mínimo de senha do Auth ainda não comprovado como 8 (titular deve ajustar em Cloud → Users → Auth Settings).
- Asaas segue em Sandbox; eventos `dead_letter` de 30/09 sem resolução; nenhum teste em Produção.
- Instabilidade do backend (instância Tiny, alertas de disco, créditos esgotados) registrada em 08/10; estado atual não reverificado.
- Recuperação de senha e uploads ponta a ponta com fixtures não comprovados.
- Backup de arquivos fb301026a incompleto (315/707), sem readback.

## Limites desta auditoria
Não foram lidos logs de runtime publicados nem rotas de cobrança linha a linha; nada aqui prova que o sistema está pronto.
