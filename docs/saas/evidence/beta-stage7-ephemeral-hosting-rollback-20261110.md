# DentalFlow — Etapa 7/8: reversão real de hospedagem HTTP local, não produção

**Data:** 10/11/2026. **Escopo:** CI do GitHub Actions em máquina temporária. Não usa o Lovable pausado, não publica endereço externo, não conecta banco clínico e não ativa Asaas.

## Avanços independentes

A workflow `saas-beta7-ephemeral-hosted-rollback.yml` foi criada para fechar uma lacuna do ensaio antigo: a workflow anterior executava **git revert + build**, mas não realizava troca nem reversão do conteúdo servido por uma hospedagem.

A nova workflow:

1. Obtém duas **revisões Git reais e diferentes** do DentalFlow (uma versão anterior comprovadamente diferente do arquivo `NewCaseDialog.tsx` e o commit candidato), em worktrees isolados sob `RUNNER_TEMP`.
2. Faz dois builds Web efetivos com Bun/Vite/TanStack Start em diretórios diferentes. O Supabase usado no build aponta somente para `http://127.0.0.1:54321`; os flags de Produção Asaas permanecem desligados.
3. Calcula o SHA do commit de origem via `git rev-parse HEAD` de cada worktree. Gera também um manifesto SHA-256 de **todos os arquivos públicos** do build (`.output/public`) e elege um arquivo JS real para verificar seu conteúdo via HTTP.
4. Sobe uma hospedagem HTTP **somente em 127.0.0.1**, com link simbólico de release substituído atomicamente:
   - **A:** servir revisão anterior e conferir SHA/hash/asset;
   - **B:** trocar para revisão candidata e conferir SHA/hash/asset, que precisam ser diferentes dos de A;
   - **A novamente:** restaurar o mesmo conteúdo anterior, validando os três hashes e as mesmas bytes.
5. Mantém rotas `/api/billing/` inacessíveis, permite GET/HEAD somente para arquivos estáticos presentes no manifesto e rejeita alteração de bytes depois do build. O relatório resultante contém **apenas os commits e hashes de artefatos**, nenhuma identidade de paciente, segredo, HTML ou URL privada.
6. Destrói worktrees, builds, symlink e servidor ao fim, sem tocar em Production/Lovable/Supabase Cloud ou contas do Asaas.

### O que o novo ensaio prova

Reversão efetiva de artefatos Web públicos atendidos por HTTP em uma **hospedagem local descartável**, com identificador da versão, hash do conteúdo, prova de integridade após a restauração e sem um único disparo financeiro. É uma melhoria objetiva sobre `git revert` em árvore de código sem servidor.

### O que continua faltando para marcar a etapa 7 como concluída

Este servidor local oferece somente os **arquivos estáticos do build**. Ele **não** reproduz o Nitro/Cloudflare do backend, não faz login, não serve API clínica e **não** ensaia uma reversão do Lovable, de Cloudflare, de outro host real nem um banco real em staging hospedado. Portanto:

- Ambiente staging real totalmente separado, com autenticação, backend e database próprios, sem secrets, cron ou webhook copiados de Produção.
- Comparação **de fato** do SHA do frontend e do backend **servidos na hospedagem escolhida**, não apenas do commit da branch.
- Prova de login/casos/anexos no navegador após deploy e após rollback do **mesmo host**, com tempo de recuperação e comportamento entre versões.
- Plano de recuperação da base/arquivos do staging, integridade e políticas de não exclusão durante reversão.
- Homologação e liberação manual sem liberar Asaas Produção ou pagamentos reais por meio de um ensaio técnico.

**Conclusão conservadora:** usar o novo teste como evidência *parcial* da etapa 7 e do gate P0 `deployment-source-and-environment-parity`, mantendo status `pending`. Nenhum +1/8 deve ser contabilizado antes de comprovar rollback da hospedagem integrada.

## Evidências de execução

Após CI aprovada: GitHub Actions → **DentalFlow Beta 7 Ephemeral Web Hosting Rollback A-B-A (no production)**. Artefato agregado `dentalflow-beta7-ephemeral-host-rollback-aggregate` (prazo 30 dias), contendo somente hashes de A/B/A e sinalizadores de escopo.

Relatório do protocolo de oito etapas: `docs/saas/BETA-RELEASE-8-EXECUTIONS.json`. O contador inicial desta rodada é 4/8 (50%).
