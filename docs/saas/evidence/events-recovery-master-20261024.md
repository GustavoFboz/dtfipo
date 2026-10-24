# Eventos recuperados e revisão Master real — 24/10/2026

Checkpoint de 24/10, 16h38 Manaus (20h38 UTC): **10/23 aceites integrais
(43,48%; interface 43,5%), 13 restantes, primeira etapa encerrada (1/7)**.
Os itens 1.1 e 1.3 passam a concluídos. Revisão manual e recuperação automática
têm provas distintas; nenhuma revisão criou crédito.

## Revisão e publicação

Desenvolvimento pelo GitHub, sem builder AI. PR190 integrou a execução
Sandbox isolada (`27af966aa2802c7b4cab026b56f96a9fe93a865c`); PR191 integrou
a retomada sem reconfirmar a fixture renovada
(`6732bb96a6860599490b19712a2577c19261fbe6`); PR192 integrou a seleção do
vencimento real do provedor dentro de 31 dias
(`494054072ffdcd0d78a1655575b1776c274aee37`, head
`f7ef3f2549ca3b82e7d091341b5fcf95982494f1`). As três publicações nativas
foram confirmadas pelo editor como “Seu site foi atualizado”. A publicação
final foi `ffe3f215-ae8f-4151-8dd2-567280d287fa` em
https://dtfipo.lovable.app.

A migração `20261024193000_saas_isolated_sandbox_reconciliation.sql` foi
aplicada e sua cópia de restauração confere. Restore limpo de **181 migrações**,
CI Web, testes de cobrança, entitlement Desktop, tipos e verificações 06/09
passaram. O build Windows passou sem publicar novo instalador permanente;
Authenticode não foi verificado. Android API35 passou inclusive no smoke de
inicialização. API37 experimental falhou nesse smoke; o workflow permite essa
falha, portanto seu resultado geral verde não é homologação API37. Aparelhos
físicos, distribuição e iOS seguem com aceites próprios.
[Resultados por job](events-recovery-platform-builds-20261024.json).

## Item 1.3 — ausência real de webhook e recuperação

Somente duas identidades USER fixas e seus contratos Growth de R$449 no
**Sandbox** foram usados. A chave Sandbox existente foi projetada em memória;
runtime, cron e conta paga de Produção não foram trocados. Lease e seleção
da inbox foram limitados aos recursos registrados para cada job. O simulador
oficial confirmou cada pagamento uma vez, sem dinheiro real ou notificações.

1. A tentativa `6737d532-9f3a-46c9-8da7-ffc8a747ff07` recuperou a renovação
   B (`pay_851esw7e19ls4j4r`, vencimento 18/11), com uma linha paga e vigência
   18/11–18/12. O provedor estava pago sem webhook nem ledger local. A mesma
   reconciliação normal descobriu e processou o pagamento; a repetição não
   alterou o resultado. A tentativa global falhou no preparo da fixture A.
2. A retomada `f4c672d9-4cf7-430b-a9c9-05e58022188c` apenas conferiu B,
   sem novo pagamento. A geração da próxima fatura A teve retorno inconclusivo;
   o readback não encontrou o dia exato então exigido. Nenhuma segunda geração
   foi disparada na mesma tentativa. Essa execução também permaneceu falha.
3. Após corrigir a seleção para respeitar o calendário real do Asaas, o job
   `5fc75962-4add-41ba-88ea-258160b466d5` terminou em 24/10, 16h10 Manaus,
   com **27/27 verificações aprovadas**. B foi conferida sem escrita adicional.
   A cobrança A `pay_j2bfaoll3mye63hn`, vencimento 18/11, estava recebida no
   provedor sem evento de pagamento nem ledger local. A reconciliação normal
   descobriu uma cobrança e processou uma vez: uma linha paga, vigência
   18/11–18/12, histórico anterior e acesso da sessão real preservados.
   Leitura pela outra empresa foi recusada; a terceira execução não repetiu
   o efeito financeiro.

O recurso de carnê pode gerar faturas futuras no Sandbox: esse efeito é
documentado. O `nextDueDate` de A chegou a 18/01/2027 após geração; somente
a fatura elegível de 18/11 foi confirmada. A data local anterior de 16/11
não foi imposta à recorrência do provedor. Não se apagou nem ocultou webhook
para produzir a ausência observada. As duas assinaturas terminam com dois
pagamentos cada, ativas, período 18/11–18/12 UTC. Recursos e registros
financeiros permanecem auditáveis.

[Tentativas falhas preservadas](events-recovery-failed-attempts-20261024.json)
e [recibos concluídos](events-recovery-completed-jobs-20261024.json).
Uma tentativa falha não é contabilizada como sucesso integral.

## Item 1.1 — dois eventos externos encerrados individualmente

O diagnóstico Asaas real de **05/10/2026**, e a confirmação do titular naquela
data, identificaram a cobrança manual Sandbox de R$5, vencimento 29/09,
`pay_w9733yh2mprx2169`, como teste externo. A consulta histórica retornou
RECEIVED; a assinatura não foi informada pelo provedor. Não se inferiu uma
assinatura avulsa somente dessa ausência nem se alegou nova consulta Asaas
em 24/10. [Diagnóstico original](inbox-review-20261005.md).

Em 24/10 o titular realizou login Master e confirmação real do autenticador no
aplicativo. A base confirmou uma sessão AAL2 real; nenhum papel foi promovido
e nenhuma claim MFA foi fabricada. O fluxo de revisão exigiu nova confirmação
do autenticador e justificativa para **cada evento**:

| Evento local | Tipo | Decisão em UTC | Auditoria |
| --- | --- | --- | --- |
| `ea41bc68-e051-4e52-b547-af2ac70e50a4` | PAYMENT_RECEIVED | 20:31:47.651541 | `3638b8c3-a5dc-4999-9413-9db45cf71b1f` |
| `9ad8482e-eb0f-48fd-9ea5-aee5c4b776c2` | PAYMENT_OVERDUE | 20:35:06.662017 | `790334c9-6f4a-4f23-bd27-fc67bef48a2e` |

Os dois passaram a `ignored / EXTERNAL_MANUAL_SANDBOX_TEST`, conservando
payload, IDs, seis tentativas e uma auditoria individual. Vínculos no ledger
continuam zero. O Master publicado mostrou fila sem revisões manuais pendentes
e autenticador confirmado. **Nenhum replay financeiro foi executado**;
`billing_event_replays` permanece zero. Essa prova fecha 1.1, mas não o replay
positivo de 4.2.
[Decisões e prova agregada de sessão](external-reviews-master-20261024.json).

## Regressões, preservação e limites

Identidade passou **16/16** no job `69fb7881-8f50-4d39-8fe3-004243be126a`;
arquivos/privacidade passaram **112/112** no job
`755c475c-a4c7-4c7a-b13a-983d557d8334`. Somadas às 27 de recuperação,
são **155/155 verificações nas três execuções concluídas**, com capacidades
consumidas. Fixtures de arquivos ficaram sem objetos ou reservas ativas e
nenhum job permaneceu em execução.

O fingerprint de 33 tabelas fora das fixtures na execução bem-sucedida foi
`b51871071b9d369033d480c06cfd9f58`, idêntico antes/depois e à conferência
independente das 20h38 UTC. A IPO possui agora **86 casos, 122 itens,
48 movimentações e 58 campos de estoque**. Os totais antigos 107/47/45 são
checkpoints históricos: a consulta de datas confirma que os itens adicionais
precedem a rodada financeira e a última movimentação ocorreu às 15h49 UTC,
antes do job concluído. A causa dessas alterações anteriores não foi atribuída
por suposição; nenhum dado foi revertido para reproduzir contagens antigas.
O fingerprint das tentativas iniciais é preservado separadamente, sem usá-lo
como baseline do job final.
[Snapshot e limites observados](events-recovery-final-snapshot-20261024.json).

Produção conserva um pagamento real, nenhum evento falho e worker saudável.
O preço Inicial de teste continua R$5, com contratos históricos de R$1 e isenção
IPO preservados. A janela offline permanece 72 horas. A rodada não fez nova
cobrança real, reembolso ou alteração financeira em Produção.

Restam 13 aceites: demais estados financeiros e preservação em todos os ciclos;
aparelhos/offline; nove reservas históricas; replay positivo e origem de 12
pacientes; 40 links antigos; cancelamento/troca/preço por vigência; backup real,
capacidade, documentos comerciais e aprovação final de vendas. Master/MFA
positivos agora têm prova real, mas o item 4.2 continua parcial. Não equivale
a 100% nem à liberação comercial integral.
