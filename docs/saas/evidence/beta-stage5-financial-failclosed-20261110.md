# DentalFlow — Beta 5/8: ensaio financeiro de risco sem acesso Lovable (10/11/2026)

**Status:** ampliação de testes em banco PostgreSQL descartável. **Não é a homologação real com o Asaas Sandbox.** Etapa 5 continua `pending`; nenhuma nova cobrança, assinatura, lançamento ou cliente foi criado no provedor.

## Evidência do que o repositório já testa

O workflow `saas-restore-rehearsal.yml` importa o schema do DentalFlow em um Supabase PostgreSQL isolado e executa `stage-05-lifecycle-rehearsal.sql` entre `BEGIN` e `ROLLBACK`. O contrato simula um ciclo mensal com valores e IDs inteiramente artificiais e cobre:

- Atraso de ciclo, início da carência, suspensão depois de vencer, regularização após pagamento e restauração de acesso.
- Pagamento `CONFIRMED`/ `RECEIVED` duplicado sem estender período ou duplicar registro contábil.
- Cancelamento do provedor mantendo o restante do período pago; estorno completo revogando o período revertido sem apagar dados clínicos.
- Replay privado de dead-letter somente no ambiente correto, com auditoria, uma única tentativa e sem acesso por credencial ou status inadequado.
- Recurso com cliente externo divergente nunca ativa nem suspende a empresa correta.

## Ampliação nova desta rodada

- Falha fechada quando a fatura do atraso tem **R$ 0,01 de divergência** com o plano: banco continua ativo e sem novo registro de cobrança.
- Falha fechada quando um pagamento supostamente confirmado traz preço divergente, mesmo com ID da empresa correto: mantém assinatura suspensa e pagamento pendente.
- Falha fechada quando um evento do ambiente **production** cita uma assinatura do **sandbox**: nenhuma modificação no ledger ou no acesso.
- O CI exige marcador `BETA_STAGE5_NEGATIVE_PRICE_ENVIRONMENT_LEDGER_PASSED` e testagem estática para evitar regressões nessas proteções. O ensaio sempre termina com `ROLLBACK`.

**Não foram utilizados arquivos, chaves, contas nem clientes reais. Nenhum segredo foi impresso nos logs.**

## Lacuna crítica da recorrência

O checkout atual cria a assinatura com `billingType: "UNDEFINED"` (o cliente escolhe a modalidade no pagamento). Segundo a documentação oficial Asaas, a assinatura gera cobranças por ciclo, mas **o débito automático depende da modalidade efetivamente escolhida**; cartão de crédito pode repetir a cobrança automaticamente quando autorizado, boleto/Pix normalmente exigem pagamento pelo cliente. A criação da assinatura não comprova pagamento nem garante cobrança automática de um cartão.

Fonte da regra comercial: [Asaas — FAQ de assinaturas](https://docs.asaas.com/docs/subscriptions-faq) e [formas de pagamento de assinatura](https://central.ajuda.asaas.com/hc/pt-br/articles/54672181332379-Quais-s%C3%A3o-as-formas-de-pagamento-dispon%C3%ADveis-para-cobran%C3%A7as-por-assinatura).

**Decisão conservadora:** não alterar `UNDEFINED` para `CREDIT_CARD`, não criar cobrança nem migrar assinaturas existentes automaticamente. Antes do beta comercial, conferir no Sandbox um ciclo posterior com a modalidade escolhida, a fatura gerada e paga, o webhook/worker, o ledger e a permissão final.

## O que ainda impede +1/8 (5/8)

1. Prova de **recorrência real Sandbox**: assinatura e segunda cobrança emitida, seu pagamento simulado pelo Asaas, confirmação via webhook e reconciliação no ledger, sem duplicação.
2. Prova de **atraso → carência → suspensão → regularização** no Sandbox, incluindo worker com token/cron habilitado e leitura do estado de acesso Web (idealmente Windows/Android).
3. Prova de cancelamento, inativação de renovação, reativação/contratação adequada e eventos de risco nos fluxos realmente publicados.
4. Confirmar plano, valor, ciclo e método de pagamento exibidos corretamente, sem usar credenciais reais em CI nem reconectar o Lovable pausado.

Os testes locais podem avançar independentemente do proprietário. **A conclusão formal da etapa 5 não deve ser declarada sem o Sandbox real e verificação de webhook/assinatura.** Nenhuma etapa anterior perde seu aceite.
