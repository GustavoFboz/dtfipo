# Etapa 09 — segurança, Beta e Produção

Status: preparação técnica iniciada. Produção permanece bloqueada e nenhuma cobrança real é autorizada por esta etapa.

## Gates obrigatórios

1. CI de restauração limpa e ensaios das etapas 01–08 devem passar no commit candidato.
2. As provas reais restantes do Sandbox (duplicata/perda/replay, ciclo de vida e uploads dos módulos disponíveis) devem ser registradas sem mocks como evidência principal. Upload e exclusão de anexo de caso já foram comprovados em 03/10.
3. O operador Master deve ser explicitamente autorizado e usar MFA AAL2 antes de replay administrativo.
4. Sandbox e Produção devem usar chaves, webhook e dados separados. Segredos nunca entram no repositório.
5. `ASAAS_PRODUCTION_ENABLED` permanece falso até a compra controlada ser autorizada pelo operador.
6. A primeira cobrança de Produção será uma única compra controlada de R$ 1. Ela deve comprovar pagamento, webhook, ledger, entitlement, idempotência e cancelamento sem apagar dados.
7. Só depois desse aceite o catálogo volta ao preço comercial e o beta é liberado em lote piloto.

Escopo de 03/10/2026: o responsável adiou a homologação DICOM porque a
Radiologia ainda não funciona. Esse ensaio não bloqueia o SaaS dos módulos
disponíveis; deve ser realizado antes de disponibilizar a Radiologia. As
proteções de armazenamento existentes continuam vigentes. Os requisitos
financeiros, de identidade, de segurança e a flag de Produção não mudam.

## Rollback

Desabilitar imediatamente a flag de Produção, manter ledger/eventos para auditoria e preservar dados/entitlements já pagos conforme o período contratado. Nunca apagar histórico financeiro como mecanismo de rollback.

## Observabilidade mínima

Antes do piloto: fila/dead-letter, falhas do worker, divergência Asaas↔ledger, falhas de checkout e uso/cota de armazenamento precisam de rotina operacional documentada. Alertas externos e credenciais de Produção dependem da configuração das contas e não são simulados no repositório.

Preparação de 04/10: painel privado Master com fila/checkout por ambiente,
telemetria da última execução, atraso de reconciliação, carência, inconsistência
local de período/ledger e reservas antigas. O worker registra início/conclusão
sem dados do provedor e o agendador exige resumo válido/telemetria confirmada.
Consulte `STAGE-09-INCIDENT-RUNBOOK.md`. O painel não comprova conciliação com
o Asaas, cron efetivo ou entrega de alerta externo. A branch padrão do
agendamento e a revisão publicada precisam ser conferidas antes do aceite.

Continuidade de 03/10, 21h em Manaus (04/10 UTC): diagnóstico privado GET
preparado para distinguir publicação/configuração de execução ausente. O GET
lê somente telemetria e não chama o Asaas. Workflows serão alinhados na branch
padrão por alteração isolada; o aceite exige observar execuções reais depois
da publicação. Frequência de cron não equivale a prazo garantido de execução.
