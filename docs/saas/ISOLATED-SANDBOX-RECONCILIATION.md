# Recuperação financeira isolada no Sandbox

Implementação de 24/10/2026. A aplicação principal continua em Produção;
o teste privado usa exclusivamente a chave Sandbox já configurada, as duas
fixtures autorizadas e recursos cadastrados para o seu job. Não há parâmetro
HTTP para escolher ambiente, empresa, assinatura ou cobrança.

## Execução

O job `reconciliation` usa a capacidade privada de uso único existente. Confere
Auth real, empresa, assinatura Growth, preço contratado de R$449 no Sandbox,
cliente sem notificações e referência do provedor. Seleciona somente a fatura
com o primeiro vencimento igual ou posterior ao fim do período pago, limitada
aos próximos 31 dias. A data real do Asaas é preservada: o dia da recorrência
pode diferir do fim local após um vencimento alterado ou um mês curto. Caso ainda não exista, o
recurso oficial de carnê pode antecipar sua geração até aquele mês. Esse GET
tem efeito no Sandbox e é chamado uma única vez, sem repetição automática.
O PDF não é baixado e redirecionamentos não são seguidos. Depois de uma resposta
inconclusiva, somente a consulta das faturas decide se a geração foi concluída.
Uma fixture já renovada além dos próximos 31 dias é apenas conferida, sem nova
confirmação. A rodada exige pelo menos uma recuperação efetivamente concluída.

A confirmação usa somente o simulador oficial Sandbox, uma vez. Uma retomada
encontra um pagamento já confirmado por GET; não repete a confirmação. O teste
exige observar o pagamento no provedor sem lançamento nem evento de pagamento
na inbox local, antes da recuperação. Não apaga webhook nem esconde evento para
fabricar essa condição. Se o webhook chegar, a ausência não fica comprovada.

O mesmo `processAsaasInbox` da aplicação executa a descoberta, seguida do
processamento normal com GET do Asaas e `billing_apply_asaas_payment_lifecycle`.
A seleção e o lease são restritos à assinatura/cobrança registrada para o job.
Uma terceira execução confere idempotência. Datas, preço, histórico anterior,
acesso da sessão e recusa de leitura estrangeira precisam concordar.

## Fronteiras

As tabelas e funções de preparo são privadas; clientes comuns e operadores não
ganham acesso direto. Os auxiliares exigem `service_role`, job em execução,
capacidade já consumida e prazo válido. O registro confere as duas identidades
fixas, ausência de operador/isenção/contrato Production e vínculo Sandbox.
Eventos de outras empresas, Produção e dead letters manuais ficam fora do lease.
Não há alteração de MFA, promoção de usuário, chamada ao worker global, escrita
de telemetria/cadência nem mudança de configuração Asaas/cron.

Um fingerprint de 33 tabelas, excluindo somente as duas empresas de teste,
compara contas, ledger, pacientes, casos, estoque, profissionais e configuração
antes/depois. Dados clínicos não saem no recibo: somente contagens de checks,
hashes, IDs de teste, valores Sandbox, estados e datas. As novas renovações e
recursos do job ficam como auditoria; registros financeiros não são apagados.

## Verificação e aceite

Testes unitários conferem a projeção de configuração sem chave Production,
escopo de recursos, data mensal, fatura ambígua, ausência de repetição e o
mesmo algoritmo de recuperação. O ensaio SQL descartável verifica grants,
registro imutável, expiração, lease exclusivo, inbox idempotente e preservação
de eventos fora do escopo. Não executar o ensaio na base ativa.

CI/restore (181 migrações), publicação e execução real foram concluídos em
24/10. O job final passou 27/27 verificações; as duas tentativas falhas e a
recuperação parcial anterior permanecem no histórico. Pagamento recebido sem
webhook/ledger foi observado, descoberto pela reconciliação normal e aplicado
uma vez, preservando vigência/histórico e hash de 33 tabelas fora das fixtures.
Item 1.3 concluído. Renovação não encerra atraso, suspensão, estorno,
cancelamento e reativação. Master/AAL2 real também foi comprovado nessa rodada;
replay financeiro positivo, preço por vigência e aparelhos continuam próprios.
[Publicação, recibos e limites](evidence/events-recovery-master-20261024.md).

Referências oficiais consultadas em 24/10/2026:

- [Confirmar pagamento no Sandbox](https://docs.asaas.com/reference/confirmar-pagamento).
- [Gerar carnê e cobranças futuras no Sandbox](https://docs.asaas.com/reference/gerar-carne-de-assinatura).
- [Listar cobranças da assinatura](https://docs.asaas.com/reference/listar-cobrancas-de-uma-assinatura).
