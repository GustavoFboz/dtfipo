# Operação e recuperação do SaaS

Escopo: monitoramento interno e recuperação controlada. A preparação avança com o backend existente; criação de cobranças e replay exigem seu próprio fluxo autorizado. A compra real de R$1 será realizada pelo responsável após os gates aplicáveis. DICOM aguarda a Radiologia. Este roteiro não libera Produção.

## Rotina do operador

Abrir `/master` com a conta Master autorizada e usar **Atualizar indicadores** no início da operação e depois de uma intervenção. A consulta é uma fotografia, com horário do servidor; o painel não envia notificações externas nem consulta o Asaas. Ler os ambientes separadamente. Registrar ambiente, horário UTC, commit publicado, execução do GitHub Actions e contagens antes/depois de qualquer incidente, sem copiar chaves, dados fiscais ou conteúdo de pacientes.

| Indicador | Quando investigar | Primeiro passo |
| --- | --- | --- |
| Worker sem conclusão sem erros | 15 minutos, quando existem assinaturas vinculadas ou eventos pendentes | Conferir execução, credencial e ambiente do agendador; atualizar o Master |
| Execução sem término | 5 minutos desde o início | Conferir timeout/transporte e o registro do job; aguardar recuperação das leases |
| Fila atrasada | Evento elegível há 10 minutos ou lease vencida | Conferir worker e status do evento; preservar o registro original |
| Evento com falha/dead letter | Qualquer ocorrência | Separar indisponibilidade do Asaas de rejeição do contrato/vínculo/período |
| Checkout incerto/lease vencida | Qualquer ocorrência | Confirmar recurso e referência existentes no provedor antes de nova criação |
| Falhas de checkout | Falha atualizada nas últimas 24 horas | Conferir o diagnóstico fixo da operação e o job, sem repetir criação às cegas |
| Reconciliação atrasada | Assinatura elegível sem tentativa há 2 horas | Conferir agendamento e backlog; `reconciliation_checked_at` registra tentativa, não sucesso |
| Carência vencida | Qualquer ocorrência | Conferir cobrança no provedor pelo worker; nunca suspender com base apenas no relógio |
| Período sem ledger local | Período ativo futuro sem pagamento pago que alcance o fim desse período | Conferir a assinatura, ledger e inbox; não mudar acesso manualmente para esconder divergência |
| Reserva antiga | Mais de 24 horas | Revisão individual em Armazenamento; idade sozinha não comprova abandono |

O painel mostra somente agregados e os contadores da execução mais recente por ambiente. `last_healthy_at` significa execução concluída sem erros relatados; não comprova conciliação financeira completa. Uma execução vazia posterior pode substituir a última execução com erro, mas eventos falhos/dead letters continuam na inbox. Conferir também jobs anteriores. O histórico dos incidentes fica nos eventos/auditoria e nos registros do CI; guardar a evidência pertinente antes de expirar a retenção dos artefatos (30 dias).

## Diagnóstico privado de publicação

`GET /api/billing/asaas-worker` é uma inspeção de telemetria protegida pelo token
do worker. Não compartilhe o token com navegador, cliente ou repositório.
O GET não consulta o Asaas nem executa claim, suspensão, replay, reconciliação
ou alteração do ledger. Usa o mesmo ambiente validado do backend e um prazo
de leitura de 3 segundos.

O contrato `dentalflow-worker-health-v1` com `available=true` comprova que a
publicação expõe o diagnóstico e consegue ler a telemetria no banco. `worker=null`
indica que ainda não houve registro de execução; não significa falha de
publicação. O workflow `SaaS readonly publication probe` guarda apenas a
projeção sanitizada e avalia separadamente o heartbeat. Falha HTTP 401 exige
conferir a credencial do agendador; 409 indica ambiente diferente; 404/405
podem indicar revisão publicada anterior ao GET. Um 503 pode indicar
configuração, prazo ou banco indisponível. Nunca registrar o corpo arbitrário
de erro nem copiar credenciais na evidência.

Esse diagnóstico usa GET na aplicação DentalFlow. Não autoriza usar outros
endpoints GET do provedor como se fossem somente leitura, nem substitui os
aceites com pagamento/assinatura reais ou o teste de interface no dispositivo.

## Agendador e indisponibilidade

O workflow `saas-asaas-inbox-worker.yml` usa BILLING_ENVIRONMENT, cujo padrão é **Sandbox**, e envia o mesmo ambiente em X-Billing-Environment. Produção exige habilitação explícita e token separado. Backend configurado para outro ambiente recusa antes de processar. A troca de ambiente e a configuração das credenciais pertencem ao gate de Produção.

O GitHub executa schedules a partir da branch padrão, atualmente `main`; a integração Lovable usa `saas/stage-03-asaas-checkout`. Publicar nessa branch conectada não atualiza o cron em `main`. Os workflows e seu verificador são alinhados por uma integração isolada na `main`, sem mover a branch padrão ou o código do aplicativo. Conferir a presença do secret `BILLING_WORKER_TOKEN` e as execuções reais antes de considerar o agendamento aceito. Um workflow sem credencial deve falhar de forma explícita.

O apoio no GitHub mantém a frequência nominal de 5 minutos, nos minutos
2, 7, 12…; só dispensa o POST após o GET privado comprovar job ativo, HTTP 200
do despacho e heartbeat saudável recentes no mesmo ambiente. Contrato ausente,
falha ou estado antigo preservam o processamento anterior. A credencial dos
probes/worker é passada por headers via stdin, sem corpos de erro no log.

A migração do agendador privado foi instalada em 05/10/2026, 15h46 de Manaus,
sem criar jobs ou segredos. O bootstrap Sandbox 37365444013, tentativa 2,
concluiu às 16h20 e comprovou o isolamento da Data API antes do registro.
O pg_cron chama o processador nos minutos 1, 6, 11… e guarda o token no Vault.
Foram comprovados 24 disparos de 16h21 a 18h16 e 24 respostas HTTP 200,
com telemetria saudável. Produção não tem job registrado. Configuração
repetida preserva o job; uma troca de ambiente remove o job anterior. Ver
[DATABASE-SCHEDULER.md](DATABASE-SCHEDULER.md) e sua
[evidência](evidence/database-scheduler-20261005.md).

O diagnóstico somente de leitura roda a cada 15 minutos, nos
minutos 7, 22, 37 e 52, e depois de mudanças de backend na branch conectada.
Essas frequências são agendamentos solicitados, não garantias de prazo do
GitHub. Não executar POST manualmente como teste durante a pausa financeira.

Referência: [GitHub — eventos de agendamento](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Falha de telemetria não interrompe a aplicação de um evento verificado. O endpoint retorna `monitoringRecorded=false`, e o agendador acusa falha. O transporte do monitor tem prazo de 3 segundos e limite de espera de 3,5 segundos; os RPCs financeiros e suas leases seguem seu fluxo existente. Se o backend não carregar a configuração, nenhuma execução é registrada: detectar pelo job e pelo horário antigo/ausente no Master.

Para indisponibilidade do provedor ou banco: preservar inbox, ledger e acesso já pago; conferir o erro fixo e a disponibilidade; aguardar a próxima tentativa após o backoff. Só acionar manualmente o worker quando a operação financeira estiver autorizada. Nunca repetir uma criação incerta sem confirmar se o recurso já existe.

## Replay e inconsistências financeiras

Durante o standby, registrar o diagnóstico e preparar a evidência. Quando a homologação for retomada, confirmar que a cobrança pertence à assinatura, empresa, ambiente, valor contratado e período corretos. Cobrança avulsa sem assinatura continua em revisão, mesmo paga. Um replay exige conta Master habilitada, MFA AAL2, justificativa de 16–300 caracteres e auditoria. Reprocessar o evento original pela fila normal; o worker consulta o provedor e reaplica as guardas idempotentes. Não inserir pagamentos pagos, apagar eventos ou alterar períodos para fazer o painel parecer correto.

A conciliação Asaas↔ledger continua exigindo evidência real por recurso e período. O indicador local de período sem ledger só identifica uma inconsistência interna; não identifica todas as divergências do provedor, cobranças ausentes, estornos ou valores externos divergentes.

## Armazenamento

Reservas antigas devem ser verificadas com o gestor da empresa. Usar a recuperação individual existente somente quando não houver objeto nem referência e o servidor confirmar os requisitos. A recuperação remove apenas a reserva do catálogo. Não excluir objetos órfãos em lote nem atribuir origem presumida. Os nove registros antigos já identificados continuam uma pendência separada; o painel não libera quota automaticamente.

## Rollback e aceite

Interromper o rollout e desabilitar a flag `ASAAS_PRODUCTION_ENABLED` caso um incidente ocorra após a liberação controlada; não trocar o ambiente para Sandbox mantendo um webhook de Produção ativo. Manter ledger, eventos, auditoria, arquivos e períodos já pagos. Repor uma revisão de código previamente validada, verificar compatibilidade do schema e conferir indicadores e entitlement antes de retomar. Este incremento não oferece botão financeiro, replay automático ou exclusão de histórico.

O item 6.1 foi aceito em Sandbox em 05/10, 18h17 de Manaus. O alerta real do diagnóstico 37365443348 por heartbeat antigo foi entregue à caixa do operador às 16h19; o diagnóstico agendado 37372084469 passou após a recuperação. A entrega observada não garante prazo futuro: a detecção e o e-mail dependem dos canais do GitHub.

Antes do piloto ainda faltam: testes reais de identidade/replay, provas financeiras Sandbox, backup/restauração operacional de dados, ativação/autenticação do webhook e agendamento/alertas separados de Produção, além da compra real controlada de R$ 1 feita pelo responsável. As solicitações da etapa 08 não serão executadas automaticamente com o retorno dos créditos.
