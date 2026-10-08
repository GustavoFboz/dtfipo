# Etapa técnica 10 — conexão Asaas Produção e liberação

Ordem apresentada ao responsável: **7/7**, conforme RELEASE-PLAN.md.
Status: preparação em andamento. Em 04/10/2026, 22h44 de Manaus, o responsável
solicitou finalizar os aceites e informou que fará o teste da primeira conta
de R$1. A compra será feita por ele após a conferência de Produção; esta decisão
não encerra os demais aceites nem autoriza execução de solicitações antigas.

## Preparação e aceite obrigatório

1. Conferir a identidade da conta recebedora e sua habilitação para os meios
   de pagamento oferecidos. Registrar apenas a confirmação e o responsável,
   sem copiar documentos financeiros para o repositório.
2. Criar/conferir a chave de API do Asaas de Produção e um token exclusivo
   para autenticar seu webhook. Cadastrar somente nos secrets do backend;
   nunca em VITE_*, APK/EXE, logs, SQL de evidência, chat ou GitHub.
3. Conferir a configuração exigida por loadAsaasConfig e seus gates de
   Produção. Sandbox e Produção precisam de IDs, filas e tokens segregados.
   Não basta trocar o hostname ou a flag isoladamente.
4. Configurar o webhook de Produção com o endpoint publicado, autenticação
   e eventos efetivamente suportados pelo protocolo. Comprovar persistência
   antes do 200, duplicatas e recuperação após indisponibilidade.
5. Alinhar agendador e diagnóstico ao ambiente do backend no mesmo rollout.
   A preparação usa `BILLING_ENVIRONMENT` (padrão `sandbox`); `production` exige
   `BILLING_PRODUCTION_ENABLED=true` e o secret `BILLING_PRODUCTION_WORKER_TOKEN`
   separado de `BILLING_WORKER_TOKEN` do Sandbox. O backend continua exigindo
   suas próprias flags e secrets; a configuração do GitHub não os substitui.
6. Conferir preço, titularidade, vencimento, cancelamento e acesso de uma conta
   isolada. O catálogo Inicial permanece em R$1 para o teste controlado;
   contratos anteriores conservam seus snapshots.
7. Após autorização específica do responsável, realizar a compra real
   controlada. Guardar evidências sanitizadas de cobrança recebida, evento,
   ledger e acesso nas plataformas. Retorno do navegador não é prova de pagamento.
8. Aprovar o lote beta apenas após as etapas 1/7–6/7, este teste, os riscos
   conhecidos, alertas e o plano de suporte. Registrar a decisão de liberação.

## Recuperação

Uma falha interrompe novas vendas pelo gate de rollout, preserva filas e
registros já recebidos e aciona o runbook. Não restaurar banco antigo sobre
pagamentos novos, apagar IDs externos, reenviar cobranças ou estornar clientes
automaticamente. Reconciliar cada ocorrência com o Asaas e manter auditoria.

## Referências

- ADR-001-ASAAS-RECURRING-BILLING.md
- STAGE-09-INCIDENT-RUNBOOK.md
- https://docs.asaas.com/reference/comece-por-aqui
- https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook

## Conferência de 04/10, 22h45 em Manaus

Consulta somente de leitura confirmou `company_initial` ativo, BRL, 100
centavos. Eventos: cinco processados e dois dead letters, todos Sandbox.
Nenhuma solicitação de mudança/cancelamento está registrada. Última execução
saudável do worker: 22h20m13s, Sandbox, aproximadamente 25 minutos antes da
consulta. Não comprova regularidade aceitável nem habilitação de Produção.

Próximos requisitos de configuração, ainda sem evidência:

| Local | Conferência |
| --- | --- |
| Asaas Produção | Conta recebedora correta e aprovada; modalidade aceita para R$1; chave própria; webhook cadastrado com URL e eventos corretos. |
| Secrets do backend | `ASAAS_ENVIRONMENT=production`, chave e token do webhook de Produção, `ASAAS_PRODUCTION_ENABLED=true`, `BILLING_WORKER_TOKEN` próprio de Produção e demais requisitos de `loadAsaasConfig`. |
| GitHub | `BILLING_ENVIRONMENT=production`, `BILLING_PRODUCTION_ENABLED=true`, secret `BILLING_PRODUCTION_WORKER_TOKEN` idêntico ao worker do backend de Produção e diferente do Sandbox. |
| Publicação | Confirmar a revisão servida, GET privado com ambiente correto e execução saudável recente. |
| Teste do responsável | Uma compra de R$1, identificar cobrança/empresa e verificar recebimento no provedor, webhook, ledger e acesso; não inferir pagamento do redirecionamento. |

Não colar secrets no chat, GitHub ou evidências. As ferramentas conectadas nesta
rodada não oferecem leitura/configuração de secrets; SQL não comprova seu valor
nem substitui a verificação no backend. Não configurar apenas a flag e iniciar
checkout antes de conferir os outros itens.
