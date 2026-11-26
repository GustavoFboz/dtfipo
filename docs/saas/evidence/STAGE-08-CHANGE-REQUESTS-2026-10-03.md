# Etapa 08 — solicitações auditadas, 03/10/2026

O responsável pediu continuidade das etapas e manteve a homologação financeira
Asaas em standby até o restabelecimento dos créditos. DICOM permanece adiado
até a Radiologia funcionar. Este avanço prepara instruções do gestor e sua
consulta pelo Master, sem executar cancelamento/troca no provedor.

## Comportamento implementado

Solicitar cancelamento, solicitar troca e retirar uma solicitação pendente na
página `/assinatura`; fila de solicitações por empresa no `/master`. O estado
visível é **aguardando confirmação no Asaas**. Datas são vigências pretendidas.
O preço atual vem do contrato histórico; preço/limites futuros e período pago
são registrados no servidor. Regras completas em `../STAGE-08-BILLING-CENTER.md`.

Solicitações/auditoria são privadas; gestor é autorizado em cada chamada e
Master é autorizado por cadastro de operador. Uma instrução não concede
papel Master, não altera quota/entitlement/ledger, não cancela fatura e não
exclui dados. Nenhuma chamada de escrita Asaas foi adicionada.

## Verificação local

- **178 testes em 16 arquivos aprovados**, incluindo billing, entitlement
  Desktop, armazenamento, MFA, isolamento de sessão e UI de confirmação.
- Novos testes verificam identidade Cloud, JWT capturado, offline, dados
  vazios/inconsistentes, rejeição após troca de sessão, retirada sem confirmação
  ambígua, prazo máximo de transporte e indicação correta de solicitação pendente.
- TypeScript aprovado; verificações 06, 08 e 09, restauração determinística de
  **166 migrations** e contratos estáticos Desktop/Android aprovados.
- Builds Web, Windows e Android aprovados. São builds dos shells; não comprovam
  teste manual em aparelhos ou instaladores novos. O teste adicional do painel
  Master comprova a exibição das propostas sem execução e a limpeza ao sair.

## Banco e integração

Migração: `20261003233500_saas_billing_change_requests_stage08.sql`. Cópia no
manifest e bundles de restauração; self-heal reafirma fronteiras privadas.
As assertivas são somente leitura; ensaio funcional usa dados sintéticos com
rollback; ensaio de concorrência usa duas conexões em Supabase descartável.

Validação do commit `d5b26cbf457397746a29c854d5208bf813de8cab`, PR
[#118](https://github.com/GustavoFboz/dtfipo/pull/118):

- [CI 37163160917](https://github.com/GustavoFboz/dtfipo/actions/runs/37163160917): aprovado.
- [Restauração 37163164184](https://github.com/GustavoFboz/dtfipo/actions/runs/37163164184): aprovada.
- [Ensaio inicial 37163017703](https://github.com/GustavoFboz/dtfipo/actions/runs/37163017703): grants,
  regras e duas conexões concorrentes aprovados. Duplicata gerou uma solicitação
  e um evento; seleção concorrente conflitante foi recusada; assinatura intacta.
- A primeira CI identificou uma asserção antiga que regenerava o token de teste
  na comparação; a virada do segundo podia alterar a validade. As asserções
  agora comparam o token capturado, preservando a verificação de identidade.

A migração foi aplicada no **banco ativo**, em transação, depois da aprovação
das CIs. As assertivas somente leitura de RLS/grants passaram. Comparações
integrais antes/depois das **3 assinaturas, 2 pagamentos e 4 planos** confirmaram
registros idênticos. O catálogo inicial continua com **100 centavos**; o contrato
Sandbox existente continua com **24.900 centavos**. Solicitações e eventos de
solicitação estavam vazios ao concluir a implantação; nenhum pedido foi criado
para ensaiar em dados reais.

Checks de claims SQL em transação somente leitura comprovaram contexto do gestor,
fila vazia para o Master autorizado e recusa de contexto/fila a não autorizado,
inclusive `aal2`. São checks do backend, sem simular um login real de dispositivo.
O aceite manual da interface publicada e a prova financeira permanecem separados.
Não executar fixtures de ensaio no banco de usuários.

## Pendências financeiras preservadas

A etapa 08 **não está homologada financeiramente**. Falta conferência e execução
idempotente/reconciliável no Asaas, tratamento das cobranças já existentes,
preço contratual por vigência e prova de acesso no próximo período. Solicitações
pendentes não serão executadas automaticamente quando os créditos retornarem.
Produção, catálogo e a empresa interna isenta permanecem com as regras atuais.

Documentação oficial consultada em 03/10:
[atualizar assinatura](https://docs.asaas.com/reference/atualizar-assinatura-existente)
e [remover assinatura](https://docs.asaas.com/reference/remover-assinatura).
