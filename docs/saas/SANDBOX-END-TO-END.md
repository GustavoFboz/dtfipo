# Homologação real — Asaas Sandbox

Status: **não passou**. Até agora houve testes com mocks, restauração em banco
descartável e inspeções do banco vivo, mas não há evidência de uma assinatura
e cobrança criadas pelo DentalFlow no Asaas Sandbox, entregue por webhook e
projetada como acesso pago. Não declarar o SaaS liberado por causa da CI.

## Preparar a execução

1. Preparar uma implantação controlada que inclua as PRs encadeadas 64, 65,
   68 e 69 nesta ordem, com migrations correspondentes e backend no mesmo
   commit. Usar um ambiente de teste isolado ou publicar a integração revista
   e restrita ao Sandbox. Conferir o commit após o deploy: uma migration
   instalada sozinha não disponibiliza webhook ou worker. Não liberar Produção
   por conta dessa implantação.
2. Conferir `ASAAS_ENVIRONMENT=sandbox`, chave `$aact_hmlg_`, `ASAAS_USER_AGENT`,
   `ASAAS_WEBHOOK_TOKEN` e `BILLING_WORKER_TOKEN` **somente no backend**; o token
   do worker também precisa existir no segredo do GitHub Actions. Para replay,
   usar `BILLING_REPLAY_TOKEN` independente, apenas no backend. Nunca registrar
   os valores dos segredos em relatório, PR, tela ou log.
3. Configurar no Asaas Sandbox o webhook HTTPS publicado
   `/api/billing/asaas-webhook`, com o `authToken` correspondente e eventos de
   pagamento e assinatura necessários. Verificar no painel Asaas se a entrega
   está ativa. A agenda do worker deve estar ativa na branch padrão.
4. Usar uma empresa de teste separada da IPO, com identidade fiscal fictícia
   aceita pelo Sandbox, plano e usuário financeiro autorizados. Conferir no
   banco que seu checkout inicia em `pending_checkout` e sem pagamento marcado
   como `paid`.

## Executar e comparar

| Passo | Evidência mínima sem dados pessoais ou segredos | Critério |
| --- | --- | --- |
| Criar checkout no DentalFlow | Uma intenção e os IDs `cus_*`, `sub_*` e `pay_*` do ambiente `sandbox`; preço e plano | Repetir a operação reutiliza os IDs, sem assinatura ou cobrança duplicada. |
| Antes de pagar | `pay_*` pendente no Asaas; entitlement em `pending_checkout` | URL e retorno do navegador não liberam acesso. |
| Confirmar **aquela** cobrança no Sandbox | Status consultado no Asaas e ID `evt_*` recebido no webhook | Uma linha na inbox, entrega HTTP 200 após persistência. |
| Rodar o worker autorizado | Evento `processed`, cobrança única `paid`, período mensal e empresa correta | Acesso `active` apenas depois da confirmação consultada no Asaas; IPO não é alterada. |
| Repetir entrega e testar credencial errada | Mesmo `evt_*`; 401 com token inválido | Nenhuma segunda cobrança ou extensão de período. |
| Renovação, atraso, carência, estorno e inativação | IDs e estados do Asaas, ledger e datas projetadas | Não há perda de dados; eventos de risco desconhecidos ficam para revisão. |
| Acessar Web, Windows e Android | Estado e prazo do mesmo entitlement | Acesso coerente com política offline e revalidação da sessão. |

Para um primeiro pagamento de teste, o Asaas documenta a confirmação de
cobrança somente no Sandbox e o teste com cartão fictício. Escolher um dos
cenários oficiais para a cobrança realmente criada pelo checkout, sem usar
dados de cartão reais:
<https://docs.asaas.com/reference/confirmar-pagamento> e
<https://docs.asaas.com/docs/testando-pagamento-com-cart%C3%A3o-de-cr%C3%A9dito>.

Registrar data/hora, commit publicado, ambiente, IDs externos, estado anterior
e posterior da assinatura e resultado de cada linha da tabela. Ocultar CPF,
endereço, email completo, URL privada de fatura e credenciais. Se falhar,
registrar o passo e o código de erro; não substituir uma cobrança ambígua
criando outra por tentativa. O teste só passa com recurso financeiro real do
**Sandbox do Asaas** e efeitos observados no banco e nas plataformas.

## Pendências atuais

- Inspeção em 2026-09-27 UTC: o banco publicado apresentou `0` eventos Asaas,
  `0` pagamentos Asaas e `0` assinaturas vinculadas ao Asaas. A conta de teste
  existente tem empresa `AS Lab` e assinatura `pending_checkout`, mas ainda
  não tem perfil fiscal, cliente, assinatura ou cobrança no provedor.
  Estes valores não são um teste de entrega do Sandbox.
- O projeto publicado informa o commit `6bcf7ad3afdb0116679b831f4b87d70ec7bccb0b`
  da Etapa 03 com a página de apresentação corrigida. As Etapas 04/05 estão
  preparadas em uma integração isolada; webhook, worker e agendamento ainda
  não foram publicados.
- As migrations das Etapas 04/05 estão no banco vivo. Depois da aplicação
  sequencial das três migrations da Etapa 05, a asserção SQL somente leitura
  `stage-05-restore-assertions.sql` retornou `passed`. Isso confirma apenas
  estrutura e privilégios, não uma cobrança ou entrega real.
- Tokens e configuração do webhook/agenda não foram verificados com teste de
  entrega do Asaas; não há `evt_*` real processado.
- Varredura limitada para webhooks perdidos está na branch isolada da Etapa 05,
  ainda sem implantação e sem evidência real. Ela não cobre eventos antigos,
  páginas de cobrança além de 100 registros ou eventos de risco como chargeback.
