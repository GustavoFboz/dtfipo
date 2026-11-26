# Publicação do executor de cancelamento — 06/10/2026

PR [147](https://github.com/GustavoFboz/dtfipo/pull/147), fonte publicada `a11f8dfc90da472a9f28bead1e2cc994d5b21b75`.
Inspeção real em 2026-10-06 04:13:24.675722+00. Etapa **5/7**, itens **5.2/5.3 parciais**.

## Entrega comprovada

- Migração instalada no banco em 2026-10-06 04:09:50.111906+00; novas permissões privadas conferidas. Worker/service_role não pode autorizar o cancelamento; cliente autenticado não pode gravar a prova final nem ler auditoria bruta.
- Código novo no Master: `/assets/master-Dnjx8i__.js`, HTTP 200, com revisão de cancelamento, adapter e instrução de conferência. Uma requisição sem login à API foi recusada com HTTP 403 e BILLING_CANCEL_FORBIDDEN.
- 259 testes em 20 arquivos, TypeScript, Web e builds estáticos Desktop/Mobile passaram. CI e restauração limpa com 173 migrações passaram na candidata e no merge. O ensaio de cancelamento/MFA/lease/preservação foi executado e aprovado na restauração descartável.
- Comparação de 2026-10-06 04:08:44.811869+00 a 2026-10-06 04:13:16.02393+00: ledger `d55c78a72d5186254aff4e0323637628` e contrato de negócio `f2ab61f2b02c4091d86668d4ad5492d8` iguais; solicitações, execuções e pagamentos de Produção continuam em zero.

## Limites do aceite

A publicação e a recusa sem login não substituem execução autenticada no Sandbox.
As provas de SQL usam fixtures e claims apenas no banco descartável, com rollback;
não foram fabricadas sessões no ambiente ativo. Nenhuma cobrança, inativação,
estorno, replay financeiro, remoção de arquivo ou e-mail foi executado para validar
esta entrega. Não foram gerados novos instaladores nem realizadas provas físicas/iOS.

Cancelamento interrompe somente a recorrência após confirmação do recurso; os
débitos já emitidos seguem preservados. Troca de plano continua sem executor, pois
exige preço por vigência, limites e tratamento das cobranças existentes. As falhas
inconclusivas permitem conferência por GET, sem outra tentativa de PUT. As duas
revisões manuais externas continuam pendentes: dois dead letters e zero conclusões.

**Contador: 2/23 (8,70%); faltam oito aceites para chegar a 10/23.** Nenhum item foi
convertido de parcial para integral com base apenas nesta implementação.

Os timestamps response_record_created_at são horários dos registros do pg_net,
não horários de conclusão HTTP comprovados separadamente. O hash de negócio
exclui reconciliation_checked_at, metadata e updated_at para não interpretar a
cadência do worker como alteração financeira; preço, plano, estado e vigência
continuam incluídos. A definição e os recibos completos estão no JSON sanitizado.
