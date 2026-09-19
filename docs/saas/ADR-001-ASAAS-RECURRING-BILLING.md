# ADR-001 — Asaas é o provedor financeiro do SaaS

Status: aceito e vinculante para o lançamento SaaS

Data: 2026-09-19

Decisor de produto: proprietário do DentalFlow

## Contexto

O repositório já contém tabelas de planos, intents, pagamentos, eventos e
entitlements. Essa estrutura é uma fundação interna: ela ainda não cria um
cliente pagador, uma assinatura ou uma cobrança real e não recebe webhooks de
um provedor financeiro.

O objetivo do produto não é manter um sandbox próprio de pagamentos. É receber
mensalidades reais das empresas assinantes por meio do Asaas, refletir o estado
financeiro no DentalFlow e liberar ou restringir o uso sem excluir os dados do
cliente.

## Decisão

O provedor financeiro obrigatório para o lançamento é **Asaas**, primeiro em
Sandbox e depois em Produção. O desacoplamento por adapter é uma proteção
técnica e não torna o Asaas opcional neste protocolo. Qualquer troca de
provedor exige nova decisão explícita de produto e outro ADR.

O fluxo comercial canônico será:

1. somente uma empresa é pagadora; profissionais usam as vagas dela;
2. cada empresa pagadora possui um cliente canônico no Asaas, criado ou
   reutilizado por `POST /v3/customers` e relacionado pelo identificador interno;
3. cada contratação ativa possui uma assinatura Asaas com ciclo `MONTHLY`,
   criada por `POST /v3/subscriptions`, valor correspondente ao plano escolhido
   e `externalReference` rastreável;
4. a URL e os dados de cobrança exibidos ao cliente vêm do Asaas;
5. criar a assinatura ou retornar do checkout **não confirma pagamento**;
6. eventos de cobrança e assinatura chegam por webhook autenticado pelo header
   `asaas-access-token`, são persistidos antes da resposta e deduplicados pelo
   `id` do evento;
7. `PAYMENT_RECEIVED`/eventos financeiros equivalentes são reconciliados com a
   API antes de alterar o acesso quando houver ambiguidade;
8. o DentalFlow projeta esses eventos em `billing_payments` e
   `account_subscriptions`; essa projeção controla os entitlements da Web, do
   Windows e do Android;
9. atraso, estorno, chargeback, cancelamento, renovação e reativação seguem uma
   máquina de estados testada e nunca excluem dados do cliente;
10. chaves, tokens e chamadas privilegiadas existem somente no backend.

## Autoridade dos dados

| Dado | Autoridade |
| --- | --- |
| Catálogo, preço contratado e limites do plano | DentalFlow |
| Cliente, assinatura, cobrança e ocorrência financeira | Asaas |
| Evento externo recebido e idempotência | Inbox do DentalFlow |
| Acesso efetivo aos módulos | Projeção validada do DentalFlow |

As tabelas `billing_*` não substituem o Asaas e não podem fabricar um pagamento
em produção. Tokens de QA e RPCs manuais permanecem restritos a testes e
recuperação auditada.

## Critério de aceite obrigatório

Nenhuma versão será declarada “SaaS pronto” antes de uma evidência reproduzível
no Asaas Sandbox comprovar, ponta a ponta:

- criação de empresa e coleta do perfil fiscal;
- criação ou reutilização de um único cliente Asaas;
- criação de uma assinatura mensal sem duplicidade;
- geração de uma cobrança e abertura de URL pagável do Asaas;
- confirmação do pagamento por webhook, não por redirect do navegador;
- persistência do evento antes de `HTTP 200` e reenvio idempotente;
- atualização do ledger, da assinatura e do entitlement;
- acesso coerente na Web, no Windows e no Android;
- tratamento de vencimento, atraso/carência, pagamento após atraso, estorno,
  chargeback, cancelamento e reativação;
- histórico e recibo visíveis somente para responsável financeiro autorizado;
- reconciliação capaz de recuperar webhook perdido ou fora de ordem;
- credenciais e webhooks independentes entre Sandbox e Produção.

O mesmo roteiro será repetido com uma cobrança real controlada antes do rollout
de Produção.

## Consequências

- o checkout interno atual é somente um intent e não satisfaz o objetivo;
- a Etapa 01 deve preparar schema e restauração para IDs e perfil fiscal Asaas;
- as Etapas 02 a 05 devem entregar a integração financeira real antes de
  expandir administração e interfaces;
- a CI deve falhar se este ADR ou suas invariantes obrigatórias forem removidos;
- não será usada ativação manual como substituto de webhook em Produção.

## Referências oficiais

- cliente Asaas: <https://docs.asaas.com/reference/criar-novo-cliente>;
- assinatura recorrente: <https://docs.asaas.com/reference/criar-nova-assinatura>;
- recebimento seguro e assíncrono de webhooks:
  <https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook>;
- idempotência de eventos:
  <https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks>.
