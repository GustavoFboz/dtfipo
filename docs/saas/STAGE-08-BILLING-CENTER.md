# Etapa 08 — centro de cobrança da empresa

Status: histórico, limite de acesso financeiro e links de cobrança preparados.
Solicitações auditadas de cancelamento e troca de plano implementadas em 03/10.
A execução no provedor e a prova financeira permanecem em standby. Registrar
uma solicitação não encerra a renovação nem altera o contrato vigente.

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
consulta uma fila privada por empresa; nesta fase a fila não tem botão de execução.

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
