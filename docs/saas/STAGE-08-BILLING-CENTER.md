# Etapa 08 — centro de cobrança da empresa

Status: histórico, limite de acesso financeiro e links de cobrança preparados.
Solicitações auditadas de cancelamento e troca de plano implementadas em 03/10.
O executor de cancelamento foi implementado em 06/10; sua publicação e prova
real ficam registradas separadamente. Troca de plano e seu preço por vigência
continuam pendentes. Registrar uma solicitação não encerra a renovação nem
altera o contrato vigente.

## Implementado

- O gestor vê plano, preço contratado, próximo vencimento, forma atual de
  cobrança e até 50 pagamentos locais. Uma assinatura `UNDEFINED` é descrita
  como cobrança mensal que precisa ser paga, sem prometer débito automático.
- Para cada lançamento com recurso Asaas, o backend autentica o gestor,
  confere IDs de cobrança, cliente, assinatura, valor e ambiente no provedor,
  valida o endereço hospedado e só então abre a cobrança. Isso não confirma
  pagamento. Recibo ou nota fiscal dependem da disponibilidade do Asaas; o
  DentalFlow não fabrica comprovante.
- A política de leitura direta de `billing_payments` foi reduzida de qualquer
  membro da empresa a owner/CEO/ADMIN autorizado para cobrança. RPCs privadas
  não revelam token nem perfil fiscal bruto.
- Web, Windows e Android usam o mesmo componente, com transporte hospedado na
  Web e API autorizada para os aplicativos instalados. O histórico requer rede;
  o snapshot de direito de uso continua com a política offline existente.

## Prova e limites

`npm run check:saas:stage-06`, build, TypeScript, teste da conferência do
documento e restauração limpa com `stage-08-billing-history-rehearsal.sql`.
Depois de aplicar a migração no banco ativo, conferir gestor e usuário sem
permissão, um pagamento Sandbox e a abertura da página Asaas. A cobrança
recorrente por cartão ainda precisa de um fluxo próprio no Asaas; o checkout
atual usa `UNDEFINED`.

## Solicitações do gestor e acompanhamento Master

Migração: `20261003233500_saas_billing_change_requests_stage08.sql`.
Na página `/assinatura`, o gestor pode registrar uma solicitação, acompanhar
o estado `awaiting_provider` e retirá-la enquanto aguarda confirmação. O Master
consulta uma fila privada por empresa. Cancelamento agora possui revisão com
autenticador e inativação; troca de plano ainda aguarda execução.

- O servidor autoriza owner/CEO/ADMIN ativo da empresa em cada RPC. Tabelas e
  auxiliares não possuem acesso direto dos clientes; Master exige operador
  habilitado e não é concedido por um papel de empresa.
- A solicitação guarda ator, plano e preço contratado atuais, ambiente, plano
  e preço futuro, período pago e vigência pretendida. Cancelamento propõe
  encerrar a renovação; troca propõe entrar no próximo período, sem pró-rata
  ou alteração do acesso atual. A data registrada é o limite mínimo de vigência,
  não uma promessa de execução automática.
- Assinatura isenta, não vinculada ou checkout inicial não oferecem alterações.
  Troca exige assinatura ativa com período pago vigente no ledger. Cancelamento
  de uma assinatura estabelecida em atraso/suspensa pode ser solicitado.
- O preço do catálogo nunca substitui o preço histórico contratado. O token de
  seleção detecta alteração de contrato, período, plano, preço e limites antes
  do envio; ele não substitui autenticação. A proposta congela um preço para
  revisão, sem criar um novo contrato financeiro.
- Downgrade compara equipe aprovada, ambientes ativos e arquivos prontos **mais
  reservas**. A capacidade respeita base/cortesia e adicionais ativos, como na
  etapa 06. Limites e adicionais terão de ser conferidos novamente na execução;
  uma solicitação não bloqueia a operação clínica nem garante capacidade futura.
- Uma empresa tem no máximo uma solicitação aberta. Lock de assinatura e índice
  único tornam repetição da mesma seleção idempotente enquanto está pendente.
  Outra seleção exige retirada prévia; retirada registra seu próprio evento de
  auditoria e é idempotente. Nenhuma dessas ações apaga histórico ou arquivos.

Exceção online ao contrato cross-platform: instruções financeiras usam o mesmo
adapter na Web, Windows e Android, validam a identidade no servidor, fixam o JWT
da sessão e têm prazo de 12 segundos. Não entram na outbox clínica. Cache de UI
e confirmações são isolados por conta/sessão/empresa; respostas tardias não são
aceitas em uma nova sessão. Falha ou timeout exige atualizar a lista antes de
reenviar, pois o servidor pode ter registrado a instrução. O snapshot offline de
direito de uso permanece com o contrato existente.

## Próxima fase, após retomar a homologação Asaas

Conferir assinatura/cliente/ambiente, valor e cobranças pendentes no Asaas;
registrar operação idempotente e resultado reconciliável; executar a ação com
autorização e auditar; só depois projetar o novo contrato/acesso. Para troca,
implantar preço por vigência e reconciliar cobranças já criadas sem cobrar duas
vezes. Revalidar uso e vigência antes de efetivar. Não executar solicitação antiga
automaticamente quando os créditos retornarem.

O Asaas distingue [inativar](https://docs.asaas.com/reference/atualizar-assinatura-existente)
(para novas cobranças, preserva as existentes) e
[remover](https://docs.asaas.com/reference/remover-assinatura)
(encerra a recorrência e exclui pendentes/vencidas, preservando pagas).
A política de débitos existentes deve ser explicitamente conferida antes da
execução. Estas operações não são chamadas pelo pacote de solicitações.

Verificação: `check:saas:stage-08`, testes de adapter e UI, assertivas somente
leitura, ensaio SQL descartável com rollback e concorrência em duas conexões.
O registro de CI, implantação e limites está em
`evidence/STAGE-08-CHANGE-REQUESTS-2026-10-03.md`.
Reversão: retirar a interface e preservar solicitações/auditoria, ledger e
períodos pagos. Reabrir permissões diretas de tabela não é uma reversão válida.


## Transporte de alteração preparado em 04/10

O cliente servidor agora oferece PUT de assinatura, sem repetição automática.
Aceita apenas preço com centavos inteiros, data válida e inativação; sempre envia
`updatePendingPayments: false`. Não altera cobranças já emitidas, não remove
assinatura nem reativa automaticamente. Rede interrompida, HTTP 5xx, corpo não
lido, sucesso vazio ou resposta divergente são resultados inconclusivos para
conciliação por GET. A camada de transporte não concede autorização financeira.

O cancelamento agora chama esse método pelo executor descrito abaixo. A troca
continua exigindo revalidação dos limites e projeção por vigência. A implementação
não comprova uma mudança real no Sandbox e não encerra 5/7.

## Executor de cancelamento, 06/10

Migração `20261006040000_saas_cancel_executor_stage08.sql` e API
`POST /api/billing/asaas-cancel`. Web e aplicativos instalados usam o mesmo
contrato online, JWT fixado na sessão atual, timeout e nenhum envio na outbox.

1. O operador seleciona um pedido de cancelamento existente, confirma o seu
   autenticador, revisa a preservação das cobranças e informa justificativa.
   Não há cancelamento automático de pedidos antigos.
2. PostgREST verifica o JWT; as RPCs conferem operador habilitado, AAL2 e sessão
   Auth vigente. Lease de até 120 segundos, com locks na mesma ordem das RPCs
   de envio/retirada, bloqueia concorrência. A conta do solicitante precisa
   continuar autorizada para gerir a empresa. Worker/service_role não recebe
   permissão de autorizar a ação.
3. O servidor consulta assinatura, cliente, referência, ciclo, valor, ambiente
   e ausência de exclusão. O contrato congelado e o período pago são conferidos
   novamente antes de autorizar uma única escrita. Envia somente `INACTIVE`,
   preservando as cobranças existentes com `updatePendingPayments: false`.
4. Uma consulta GET confirma o estado atual; somente `INACTIVE` com vínculo e
   valor corretos conclui o pedido. O período pago, plano, ledger, arquivos e
   empresa ficam preservados. O acesso do período cancelado segue a regra
   existente até a sua data final; não há prorrogação nem estorno.
5. Falha, resposta perdida ou confirmação divergente deixam o pedido em revisão.
   Retomadas de leases vencidos e revisões só consultam; nunca repetem PUT.
   Mesmo uma interrupção antes da escrita exige revisão, preservando o registro
   e evitando uma repetição financeira cega. A revisão não permite retirar um
   pedido cuja execução já pode ter alcançado o provedor.
6. `billing_cancel_executions` registra ator, sessão, justificativa, lease,
   tentativa de escrita, resultado e hash de prova. Clientes não leem a tabela
   nem recebem tokens, IDs privados ou payload do provedor. A conclusão é
   idempotente e aparece no histórico do gestor; o Master vê estados abertos.

Testes de transporte, sessão/UI e ensaio descartável de SQL são regressões.
O ensaio não chama Asaas e não conta como aceite de 5.2 ou 5.3. Permanecem
pendentes a prova autenticada Sandbox, mudança de plano por vigência,
downgrade e falhas reais do provedor. Nenhum contrato existente é cancelado
para provar a implementação.

Referência do comportamento do provedor consultada em 06/10:
[Atualizar assinatura existente](https://docs.asaas.com/reference/atualizar-assinatura-existente).
