# Troca de plano e preço por vigência

Implementação de 28/10/2026 integrada pela PR206 e publicada. A execução
Sandbox foi comprovada com Master/MFA reais: cancelamento A, troca de preço B,
uma escrita por pedido e 54/54 checks em três jobs. **5.2 concluído, 13/23**.
O plano atual continua Growth/R$449; termo futuro Inicial/R$5 para 18/12 UTC,
com pagamento/aplicação e falhas reais ainda pendentes em 5.3. Passaram 495
testes locais e restore limpo de 186 migrações.
[Execuções, integridade e limites](evidence/master-plan-change-20261028.md).
O [checkpoint anterior à execução](evidence/plan-price-periods-20261028.md)
conserva as provas de implementação e publicação iniciais.
Produção exige o rollout explícito `ASAAS_PLAN_CHANGES_PRODUCTION_ENABLED=true`
após a homologação; esse sinalizador não substitui Master, AAL2 ou sessão Auth.
Publicar o código não executa solicitações existentes. O total de aceites não
muda somente por esta implementação.

## Comportamento

O gestor registra a mesma solicitação auditada já existente. O Master revisa
o plano, valor, início, preservação das cobranças e justificativa, confirma seu
autenticador e autoriza a operação. JWT verificado, operador habilitado e sessão
Auth vigente são conferidos novamente antes da única escrita no Asaas. O worker
e a service role não recebem autorização para iniciar alterações financeiras.

`POST /api/billing/asaas-plan-change` recebe somente ID da solicitação,
ambiente, justificativa e instrução de conferência. Empresa, usuário, plano,
valor, vigência e IDs do provedor vêm do contrato congelado. O backend escolhe
as credenciais do ambiente correspondente, sem trocar runtime ou cron.

A vigência é o fim do período pago, em uma data UTC inteira. O calendário
`nextDueDate` do Asaas precisa concordar com ela. Uma lista limitada e completa
confere as cobranças do período atual em diante. Se houver uma cobrança futura
já emitida ou calendário divergente, a operação para para revisão: não reemite,
altera, exclui nem cria uma cobrança para acomodar a troca. Esse caso requer
acerto explícito da vigência/cobrança antes de uma nova solicitação. Cartão de
crédito tem exigência própria de tokenização no Asaas e não é aceito por este
executor; o checkout atual usa `UNDEFINED`.

Quando elegível, envia apenas o novo `value`, mantendo
`updatePendingPayments:false`. Não envia um novo vencimento. Uma consulta GET
confirma preço, assinatura, cliente, referência, ciclo, estado e calendário;
outra lista confere que as cobranças existentes não foram modificadas.
Auditoria privada registra ator/sessão, justificativa, lease, tentativa única,
resultado, hash do provedor e hash/contagem da lista conferida. Tokens, links de
cobrança e dados fiscais não são enviados ao cliente ou ao registro público.

## Três preços com finalidades distintas

- O preço atual corresponde ao período pago aplicável ao momento presente.
- O preço de cada cobrança é selecionado pela data do período: uma renovação
  antiga continua com o valor histórico, inclusive em duplicatas e estornos.
- O preço da recorrência no Asaas pode já ser o de uma troca futura confirmada.
  Sua confirmação não altera plano, cota nem acesso do período atual.

`billing_plan_periods` registra o contrato anterior, novo plano/valor, início e
cotação congelada. Não há migração de valores históricos nem atualização do
catálogo. Histórico/documentos continuam com os valores do ledger. A abertura
de renovação compara o preço da data da fatura e confere separadamente o preço
atual da recorrência. Cancelar após programar uma troca confere esse preço do
provedor, preservando o período pago e seu valor.

## Aplicação do novo plano

Pagamento verificado antecipado é registrado uma vez, mas não libera o novo
plano antes do início contratado. A aplicação local exige uma linha paga que
cubra a data atual, contrato confirmado e limites válidos. Usa o processador
existente: uma consulta adicional por execução e lote máximo de dez contratos,
com seleção sem bloqueio e rodízio por última conferência. Não faz chamadas ao
Asaas para ativar permissões locais, nem renova a janela offline de 72 horas.

Na aprovação e na aplicação, equipe, ambientes e armazenamento **pronto mais
reservado** são conferidos; base/cortesia e adicionais ativos são preservados.
Se o uso passar a exceder o plano ou as capacidades contratadas mudarem, o
contrato fica suspenso para revisão, sem excluir dados ou reduzir o período
pago. A telemetria do worker registra revisão. Após resolver o excesso e
conferir novamente, a aplicação local pode concluir sem nova cobrança.

Estorno do período novo não transforma o valor histórico. A projeção local
volta ao plano do período pago válido, quando houver. Cancelamento continua
encerrando renovação; a aplicação local não cria outra assinatura nem autoriza
pagamento novo de contrato cancelado.

## Falhas e continuação

Lease de até 120 segundos, trava na assinatura e cerca antes do PUT evitam
cliques concorrentes. Rede interrompida, resultado duvidoso ou lease vencido
exigem conferência somente por GET; nenhuma retomada repete PUT. O gestor pode
retirar uma troca em revisão apenas quando o backend comprova que nenhuma
escrita foi iniciada. Depois de qualquer possível escrita, a retirada continua
bloqueada até a conciliação. Pedidos antigos não são executados automaticamente.

Web, Windows e Android compartilham componente e adapter de sessão online.
O JWT fica vinculado à conta/sessão, o prazo do cliente permanece 12 segundos,
respostas tardias são descartadas e instruções financeiras não entram na outbox.
Instaladores e aparelhos conservam seus aceites próprios; não são comprovados
por testes de UI ou build.

## Verificação e limites

Executar as regressões de cobrança, entitlement Desktop, sessão/UI, etapas
06/08/09, `scripts/check-saas-plan-periods.mjs`, tipos, build e restauração limpa
de 185 migrações. No banco descartável, o ensaio
`sql/plan-price-periods-rehearsal.sql` usa fixtures e provas artificiais com
rollback; não conta como autenticação, MFA, pagamento ou aceite real Asaas.
As assertivas em `sql/plan-price-periods-assertions.sql` são somente leitura.

A validação real exige solicitação Sandbox, login Master/autenticador,
recibo de escrita única e readback; depois pagamento e aplicação no início
correto. Produção, downgrade real, falhas reais, aparelhos e critérios 5.2/5.3
continuam com aceites próprios. Manter o rollout financeiro de Produção fechado
até cumprir esses requisitos. Na reversão, desabilitar novas execuções e
preservar termos/auditoria, processador de preços por período e ledger; remover
esses dados faria cobranças válidas perderem sua conferência de preço.

Referências oficiais verificadas em 28/10/2026:
[atualização de assinatura](https://docs.asaas.com/reference/atualizar-assinatura-existente)
[atualização de cobrança](https://docs.asaas.com/reference/atualizar-cobranca-existente)
e [FAQ de assinaturas](https://docs.asaas.com/docs/faq-assinaturas).
