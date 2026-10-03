# Continuidade do Protocolo SaaS — 03/10/2026

## Ponto retomado

Os CSVs de 01/10 às 23:04 e 02/10 às 09:59 registram a conta Sandbox
ativa até 29/11 e dois eventos da mesma cobrança de teste em `dead_letter`.
São `PAYMENT_OVERDUE` e `PAYMENT_RECEIVED`, ambos com seis tentativas e
`PROVIDER_RECONCILIATION_FAILED`. A leitura do banco ativo confirmou esse estado.
Nenhum evento foi apagado, reclassificado ou reprocessado nesta recuperação.

## Regressão identificada

O commit Lovable `d7a311e` de 29/09, intitulado “Corrigiu erro de tipo na
cobrança”, removeu arquivos e restaurou trechos anteriores das etapas 06–09.
Isso aconteceu depois das PRs #89, #91, #92 e #93. O banco ativo manteve as
estruturas, causando divergência entre banco, código e pacote de recuperação.

A recuperação usa a versão revisada `eac0eb4`, imediatamente anterior à
regressão, para os módulos SaaS afetados. Preserva o ajuste de tipos do worker
(`p_error_code` opcional) e todas as alterações posteriores do Desktop, equipe,
arcada, fotos autorizadas, notificações e imagens dos estados vazios.

Foram recuperados:

- renovação na assinatura existente, histórico e documentos hospedados;
- página de assinatura e painel Master com autorização no servidor;
- proteção de upload por reserva, incluindo DICOM e fotos;
- exclusão do objeto antes de liberar sua contabilização na cota;
- migrations já existentes, grants privados e ensaios isolados;
- manifesto e bundles de restauração com 164 migrations, incluindo a correção
  RLS posterior da PR #95;
- correção anterior do receiver de `fetch` na API Asaas.

O worker agora separa falhas de consulta Asaas de rejeições no ledger. Guarda
somente códigos fixos e permitidos, sem mensagens arbitrárias, dados pessoais
ou segredos. Uma cobrança sem assinatura permanece em revisão e nunca libera
acesso por aproximação de cliente, preço ou descrição.

## Estado confirmado por leitura do banco

| Item | Evidência de 03/10 |
| --- | --- |
| Empresa Inicial | Catálogo de 100 centavos para novas contratações |
| Contrato Sandbox existente | 24.900 centavos; não alterado pelo catálogo |
| Ledger | Dois pagamentos `paid`, dois períodos mensais, até 29/11 |
| Idempotência | Cinco eventos processados, inclusive reconciliações; duas linhas no ledger |
| Eventos em revisão | Dois dead letters; ainda sem diagnóstico autoritativo da cobrança |
| IPO | Isenta, ativa, `internal_override`, período vitalício, sem assinatura Asaas |
| Master | Estruturas presentes; nenhum operador cadastrado |
| Histórico e documentos | RPCs presentes; contexto do documento exclusivo do backend |
| Arquivos | 493 entradas `ready` e nove `reserved`; não alteradas |

Não foram modificados preços, acessos, pagamentos, RLS ou dados clínicos no
banco ativo. A restauração dos arquivos de migration no Git não representa
execução de migration no ambiente ativo.

## Verificação

- 83 testes direcionados passaram em Vitest, incluindo cobrança, renovação,
  documentos, armazenamento, Desktop e seleção dentária.
- 63 testes de cobrança e entitlement passaram também no runner Bun usado
  pelo CI; os cinco testes com mocks de armazenamento usam Vitest no CI.
- A verificação TypeScript e as compilações Web e Desktop passaram.
- Checks das etapas 02, 03, 04, 05, 06 e 09 passaram.
- Regressões de Clinic, Desktop, Android, notificações, atualização nativa,
  isolamento por usuário e proteção IPO passaram.
- A restauração em banco descartável será conferida no workflow restaurado.
  Estes resultados locais não substituem a homologação financeira no Asaas.

## Próxima sequência

1. Conferir esta recuperação no CI e na branch conectada ao Lovable.
2. Consultar a cobrança dos dois dead letters no Asaas Sandbox pelo backend,
   verificando `subscription`, cliente, valor, referência e estado atual. Essa
   consulta adicional permaneceu bloqueada pela revisão automática por exigir
   autorização explícita para enviar os identificadores ao serviço Lovable.
3. Corrigir ou repetir o cenário com uma cobrança efetivamente vinculada à
   assinatura e ao preço contratado. Uma cobrança avulsa de R$5 não comprova
   atraso e reativação de um contrato de R$249.
4. Homologar atraso, carência, suspensão, estorno, cancelamento, reativação e
   replay, preservando a IPO e os dados clínicos.
5. Concluir cancelamento/troca de plano e o cadastro Master com MFA; validar
   uploads/DICOM e paridade com os aplicativos instalados.
6. Somente após estes preparativos, realizar o teste real controlado de R$1
   solicitado pelo operador e decidir a liberação do beta.

O Protocolo SaaS permanece em andamento. Não foi marcado como concluído e
nenhuma cobrança real de Produção foi realizada nesta continuidade.

## Recuperação em caso de falha

Reverter somente a PR desta recuperação, preservando os ajustes posteriores
fora do SaaS. Não apagar dados financeiros ou clínicos e não desfazer no banco
as estruturas já existentes. Revalidar os contratos antes de publicar qualquer
nova versão. Não reescrever histórico Git publicado.
