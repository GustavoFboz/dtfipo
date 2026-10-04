# Etapa técnica 10 — conexão Asaas Produção e liberação

Ordem apresentada ao responsável: **7/7**, conforme RELEASE-PLAN.md.
Status: pendente; pagamentos reais continuam adiados.

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
5. Ajustar o agendador e o diagnóstico para o ambiente de Produção no mesmo
   rollout autorizado. O agendador atual fixa Sandbox: mantê-lo dessa forma
   enquanto o servidor muda para Produção produziria recusa de ambiente.
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
