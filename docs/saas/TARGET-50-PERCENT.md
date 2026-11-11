# Meta de pelo menos 50% dos aceites finais

Solicitação de 19/10/2026, 02h39 Manaus. Baseline confirmado: **7/23 (30,43%)**.
O denominador permanece em 23. São necessários **cinco aceites adicionais**:
12/23 corresponde a **52,17%**, o primeiro total inteiro acima de 50%.

## Frente preparada e provas restantes

| Critério candidato | Trabalho e condição para aceitar |
| --- | --- |
| 1.3 — webhook perdido | Preparar execução restrita às fixtures Sandbox, observar ausência do evento e recuperação pelo estado real do Asaas, com uma única linha e período correto. O job financeiro atual recusa runtime de Produção; não trocar globalmente o sistema pago para Sandbox para executar esse teste. |
| 2.1 — ciclo financeiro | Completar o ensaio com estados reais do provedor para renovação, atraso/carência, suspensão, estorno e reativação; transições ambíguas permanecem em revisão. Não atribuir aceite pelos testes SQL isolados. |
| 2.2 — dados e período pago | Comparar dados clínicos, contratos, ledger e limites antes/depois dos cenários reais das fixtures. Os hashes preservados durante uma alteração de código são prova parcial. |
| 3.2 — concorrência, falhas e histórico | O job de Storage passa a exercitar reservas concorrentes, envio interrompido, tamanho incorreto e recusa de liberar cota enquanto os bytes existem. Executar na publicação e revisar reservas históricas; testes locais não encerram o item. |
| 4.1 — identidade | As 15 verificações anteriores passaram, mas o Auth aceitou sete caracteres. Ajustar o mínimo global para oito no Auth e repetir o job real, sem mudar senhas das fixtures mantidas nem enviar e-mails de teste. |

Esses são candidatos de trabalho, não aceites antecipados. Um bloqueio em um
deles pode exigir outra frente com prova integral; não reduzir requisitos nem
arredondar um teste parcial para cumprir a meta.

## Alerta enviado pelo titular

O print identifica **“Teste Webhook Unika POS”**. O nome sozinho não prova que
seja o receptor DentalFlow. O diagnóstico privado `production-queue-alert`
correlaciona esse nome com o endereço DentalFlow já esperado, distingue fila
igual/diferente, recusa concluir uma listagem incompleta e não altera filas.
Não devolve URLs, contatos, tokens ou payloads financeiros.

Conferir também os Logs de Webhooks do Asaas, que são disponibilizados pela
interface web: tentativa, endpoint, código HTTP e horário. Corrigir a causa
antes de reativar uma fila interrompida. Não desabilitar uma integração de
outro sistema somente por seu nome conter “Teste”.

Referências oficiais: [Logs de Webhooks](https://docs.asaas.com/docs/logs-de-webhooks)
e [listar configurações](https://docs.asaas.com/reference/listar-webhooks).

## Estado de execução e acesso

Na conferência de 19/10 às 16h33 UTC, Produção tinha cron ativo, HTTP 200 sem
timeout, worker saudável, um pagamento e nenhum evento falho/dead letter.
O inventário também tinha nove reservas com mais de um dia, que continuam
pendentes de revisão; não foram removidas. Isso não identifica a fila do print
nem comprova os cinco aceites novos.

O acesso seguro ao Asaas não retornou confirmação e uma verificação posterior
ainda apresentou login; os logs dessa fila não foram consultados. A revisão
automática recusou abrir o painel Lovable porque o titular instruiu não usá-lo.
Não foram tentadas rotas alternativas para contornar essa recusa. A mudança
global do Auth continua pendente. Credenciais de API Asaas e administração
Supabase não estão configuradas no GitHub; apenas os nomes dos secrets foram
conferidos, sem ler seus valores.

Código e testes são preparados pelo GitHub. A publicação do servidor e a
execução autenticada continuam sendo requisitos para aceitar os resultados;
esta preparação mantém **7/23** até existir prova nova. Preservar Produção,
IPO, contratos históricos, integrações de outros sistemas e a janela offline
de 72 horas.

## Validação da preparação

Passaram 244 testes em 12 arquivos, checagem TypeScript, verificações das etapas
06 e 09, regressões de entitlement/bootstrap do Desktop 0.6.8, integridade do
pacote de restauração com 176 migrações e `git diff --check`. O registro
[preparação de 19/10](evidence/target50-preparation-20261019.json) distingue
esses testes locais das observações reais do banco. Não houve publicação do
servidor, execução do novo diagnóstico nem execução do job ampliado.
