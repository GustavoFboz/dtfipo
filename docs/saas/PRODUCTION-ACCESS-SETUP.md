# Cadastro único de acessos para preparar o Asaas em Produção

Frente atual: etapa 7/7, itens 7.1 e 7.2 em preparação. Este cadastro permite
continuar a implementação e os diagnósticos sem compartilhar credenciais.
Não encerra a homologação nem libera vendas. Os sete estágios e os 23 aceites
finais permanecem abertos; o denominador é o de ACCEPTANCE-PROGRESS.md.

## 1. Acessos que já funcionam

GitHub GustavoFboz/dtfipo, projeto Lovable
a8b717e3-87ad-482d-8d4a-de81679507e0 e consultas ao banco estão conectados.
Não é necessário fornecer PAT, senha Google/Asaas, código de MFA ou chave
administrativa do Supabase. As ferramentas conectadas não cadastram secrets;
o titular deve usar uma vez os formulários oficiais abaixo.

Editor: https://lovable.dev/projects/a8b717e3-87ad-482d-8d4a-de81679507e0

## 2. Chave de API da conta recebedora

Entrar na conta real que receberá os pagamentos. Em Asaas: menu do usuário →
Integrações → Chaves de API → Gerar chave. Nome sugerido: DentalFlow Produção.
Concluir no próprio Asaas eventuais confirmações por aplicativo/SMS.
A chave de Produção tem prefixo `$aact_prod_`; Sandbox usa `$aact_hmlg_`.
O Asaas mostra a chave apenas uma vez. Guardá-la em um gerenciador protegido
e cadastrá-la diretamente em ASAAS_PRODUCTION_API_KEY no passo 5.

Se o painel impedir a geração por falta de aprovação, resolver a pendência
cadastral no Asaas. Informar apenas o status ou texto do impedimento, nunca
documentos pessoais, chave, senha ou código de confirmação neste roteiro/chat.

## 3. Webhook de Produção preparado, inicialmente desativado

Em Asaas: menu do usuário → Integrações → Webhooks → Criar Webhook.

| Campo | Valor |
| --- | --- |
| Nome | DentalFlow Produção |
| URL | https://dtfipo.lovable.app/api/billing/asaas-webhook |
| E-mail de alertas | gustavovitorfa@gmail.com, conta já indicada pelo responsável |
| API Version | 3 |
| Auth Token | Gerar token no formulário; guardar em ASAAS_PRODUCTION_WEBHOOK_TOKEN |
| Enabled / Ativado | false / desativado, até a ativação coordenada |
| Interrupted / Interrompido | false |
| Send Type | SEQUENTIALLY / sequencial |

O Auth Token deve ser diferente da chave de API, ter de 32 a 255 caracteres e
não conter espaços. Não copiar o token na URL, em mensagens ou no código.

Eventos atualmente automatizados pelo worker:

- PAYMENT_CONFIRMED
- PAYMENT_RECEIVED
- PAYMENT_OVERDUE
- PAYMENT_REFUNDED
- SUBSCRIPTION_CREATED
- SUBSCRIPTION_UPDATED
- SUBSCRIPTION_INACTIVATED

Preparar também os eventos críticos para revisão:
PAYMENT_PARTIALLY_REFUNDED, PAYMENT_REFUND_IN_PROGRESS,
PAYMENT_CHARGEBACK_REQUESTED, PAYMENT_CHARGEBACK_DISPUTE,
PAYMENT_AWAITING_CHARGEBACK_REVERSAL e SUBSCRIPTION_DELETED.
O recebimento destes eventos não significa execução automática de seu ciclo:
o processador atual exige revisão. Fechar este tratamento e os aceites do ciclo
antes de ativar vendas. Não selecionar indiscriminadamente todos os eventos.

Registrar aqui/chat somente o ID ou nome do webhook e se foi salvo desativado.

## 4. Token próprio para o processador e o diagnóstico

Gerar outro valor aleatório, diferente dos dois anteriores e do token de
Sandbox, preferencialmente 64 caracteres hexadecimais (32 bytes aleatórios).
Ele será usado com o mesmo nome nos dois lugares: BILLING_PRODUCTION_WORKER_TOKEN.
Não substituir BILLING_WORKER_TOKEN, que continua sendo o token do Sandbox.

No Windows PowerShell, este comando gera o valor e o coloca na área de
transferência sem mostrá-lo na tela nem gravá-lo em um arquivo:

```powershell
$billingRandomBytes = New-Object byte[] 32
$billingRandomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $billingRandomGenerator.GetBytes($billingRandomBytes) } finally { $billingRandomGenerator.Dispose() }
Set-Clipboard -Value (($billingRandomBytes | ForEach-Object { $_.ToString('x2') }) -join '')
```

Colar o mesmo valor nos campos protegidos dos passos 5 e 6. Guardá-lo no
gerenciador protegido se precisar repô-lo; valores salvos não são recuperáveis
pelos conectores. Não executar este comando outra vez entre os dois cadastros,
pois isso geraria valores diferentes. Depois, limpar a área de transferência.

Para preparar também a recuperação administrativa, executar o gerador uma
segunda vez e salvar o novo valor como BILLING_PRODUCTION_REPLAY_TOKEN,
somente no backend. Ele é diferente do token do worker e não participa do cron.
Nenhum replay é disparado por esse cadastro ou diagnóstico; os aceites das
ações administrativas, incluindo MFA no painel Master, continuam em aberto.

## 5. Formulário protegido do backend

No projeto correto do Lovable: More / Mais → Cloud → Secrets → Add secret.
O formulário aceita mais de um par de nome e valor.
Se houver Manage secrets para Supabase externo, utilizar o painel que ele
abrir, sem criar outro backend ou substituir secrets gerenciados.

| Nome exato | Valor a cadastrar |
| --- | --- |
| ASAAS_PRODUCTION_API_KEY | Chave de API real do passo 2 |
| ASAAS_PRODUCTION_WEBHOOK_TOKEN | Auth Token do webhook do passo 3 |
| BILLING_PRODUCTION_WORKER_TOKEN | Valor aleatório do passo 4 |
| BILLING_PRODUCTION_REPLAY_TOKEN | Segundo valor aleatório do passo 4, diferente do worker |
| ASAAS_USER_AGENT | Manter o valor válido já existente; se ausente, DentalFlow/1.0 |
| ASAAS_ENVIRONMENT | Manter sandbox durante a preparação |
| ASAAS_PRODUCTION_ENABLED | false durante a preparação |

Preservar ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, BILLING_WORKER_TOKEN e BILLING_REPLAY_TOKEN atuais.
Os nomes novos são lidos somente pelo backend. A chave nunca deve ter prefixo
VITE_, ser colocada no .env público, SQL, GitHub ou conversa.
O grupo novo de Produção precisa estar completo; o backend não o completa
silenciosamente com segredos do Sandbox.

## 6. Formulário protegido do GitHub

https://github.com/GustavoFboz/dtfipo/settings/secrets/actions

Settings → Secrets and variables → Actions → Secrets → New repository secret.
Nome: BILLING_PRODUCTION_WORKER_TOKEN. Valor: exatamente o mesmo do passo 4
que foi cadastrado no backend. Preservar BILLING_WORKER_TOKEN do Sandbox.
Não cadastrar a chave de API Asaas no GitHub: ela fica apenas no backend.

Em https://github.com/GustavoFboz/dtfipo/settings/variables/actions, preservar
BILLING_ENVIRONMENT=sandbox (o padrão quando ausente) e não habilitar
BILLING_PRODUCTION_ENABLED durante a preparação. O cron ativo permanece em
Sandbox; o diagnóstico pontual é independente destas variáveis.

Após publicação do código, executar Actions → SaaS Production credentials
readonly check → Run workflow → branch saas/stage-03-asaas-checkout.
O workflow também executa nos pushes relevantes dessa branch; não há schedule
para consultar repetidamente o status cadastral do Asaas.

Ele autentica o GET privado
/api/billing/asaas-worker?check=production-setup com o token de Produção;
o backend faz exclusivamente GET https://api.asaas.com/v3/myAccount/status/.
A resposta registra apenas os quatro status cadastrais e indicadores seguros.
Não altera banco, conta Asaas, webhook, assinatura, cobrança ou autorização.
Credencial válida, conta aprovada, webhook entregue e pagamento liquidado são
provas diferentes. Ausência de secret deixa o diagnóstico sem execução e não
constitui aceite, mesmo que a execução agregada do workflow apareça verde.

## 7. Resposta única do responsável, sem segredos

Informar de uma vez:

1. Conta Asaas real aprovada, pendente ou impedimento exibido no painel.
2. Quatro novos secrets do backend cadastrados; Sandbox preservado.
3. Secret BILLING_PRODUCTION_WORKER_TOKEN cadastrado no GitHub com o mesmo valor.
4. Webhook de Produção salvo desativado; ID/nome e e-mail de alertas.
5. Diagnóstico readonly executado (link da execução, se disponível).
6. Para preparar os documentos comerciais posteriormente: nome/razão social do
   operador, CPF/CNPJ que constará no contrato, endereço comercial, e-mails de
   suporte/privacidade e preços/limites dos planos destinados à venda. Dados
   pessoais podem ser preenchidos no documento final em canal apropriado;
   não compartilhar documentos de identidade, dados bancários ou credenciais.

O valor de R$1 é para a homologação controlada solicitada, não substitui a
definição dos preços comerciais. A compra real será realizada pelo próprio
responsável após os gates técnicos aplicáveis.

## 8. Ativação final após homologação, documentada antecipadamente

Esta etapa é separada do cadastro inicial. As ferramentas atuais não editam
Secrets/Variables, portanto não é possível prometer ativação integral sem
qualquer ação posterior do titular. Não manter credenciais de login compartilhadas
ou retirar MFA para evitar essa dependência.

Somente após os aceites aplicáveis e a decisão de liberação:

- Backend: ASAAS_ENVIRONMENT=production e ASAAS_PRODUCTION_ENABLED=true.
  O código passa a ler os quatro secrets exclusivos de Produção já cadastrados.
- GitHub Variables: BILLING_ENVIRONMENT=production e
  BILLING_PRODUCTION_ENABLED=true. O scheduler usa seu secret de Produção.
- Asaas: ativar o webhook preparado para o mesmo ambiente e validar entrega.
- Confirmar execução privada do worker, regularidade/alertas e ausência de
  revisão pendente; não disparar replay ou cobrança como um diagnóstico.
- Responsável realiza o pagamento controlado de R$1, se autorizado, e conferir
  recebimento, ledger, liberação de acesso e preservação dos dados.
- Resolver os demais aceites e registrar a decisão para vendas.

Se precisar interromper o rollout, desabilitar a flag de Produção e o webhook
do mesmo ambiente; preservar ledger, eventos, período pago e dados remotos.
Não deixar webhook de Produção ativo enquanto o endpoint estiver no Sandbox.

## Fontes oficiais

- https://docs.asaas.com/docs/chaves-de-api
- https://docs.asaas.com/docs/criar-novo-webhook-pela-aplicacao-web
- https://docs.asaas.com/reference/criar-novo-webhook
- https://docs.asaas.com/reference/consultar-situacao-cadastral-da-conta
- https://docs.lovable.dev/features/secrets
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
