# Marco paralelo 2.3 — autorização offline e assinatura (31/10/2026)

Esta mudança prepara o item **2.3** enquanto o aceite de backup/recuperação **6.2** continua pendente. O contador permanece **13/23 = 56,52%**. A PR não altera tabelas, migrações, webhooks, preço, pagamento, backup, Storage, cron ou segredos. Não há deploy nem distribuição nativa autorizados por esta mudança.

## Falha encontrada

Existiam dois caminhos de fallback offline: a facade Desktop recusava `effective_access=full` sem fim de período, mesmo quando a empresa estava identificada como `internal_full_access=true`; a facade compartilhada fazia o contrário, conservando acesso integral sem qualquer fim de período. A facade compartilhada também podia considerar o cache pela sessão local sem comprovar novamente a autorização nativa de 72 horas.

## Mudança isolada

- `src/lib/subscription-offline-policy.ts` estabelece uma única regra para snapshots assinados anteriormente pelo servidor.
- Uma assinatura normal preserva `full` apenas enquanto o término do período pago é válido e **futuro**. Datas ausentes, inválidas ou vencidas resultam em `billing_only` sem excluir o histórico.
- Uma empresa que já possua `effective_access=full` e `internal_full_access === true` no **snapshot legítimo do servidor** não depende de uma data de pagamento; a isenção não é concedida pelo frontend.
- Um snapshot suspenso/billing_only jamais é promovido pela função; a isenção não supera o bloqueio do servidor.
- Ambos os caminhos exigem identidade nativa válida, usuário correspondente ao owner e prova de atualização do cache dentro do prazo. Abrir o app, usar JWT antigo ou ler SQLite não estende a janela de 72 horas.
- A regra comum não autoriza identidade por si só; limpeza atômica/privacidade e autenticação de sessão continuam pertencendo aos adaptadores nativos.

## Matriz executável

`src/lib/subscription-offline-policy.test.ts` cobre vigência paga, primeiro instante do vencimento, data ausente/inválida, conta isenta explicitamente confirmada, string falsa de privilégio, assinatura já bloqueada e falta de empresa. O teste compartilhado de 72 horas em `src/lib/offline-access-policy.test.ts` continua sendo uma etapa independente.

**Não concluir 2.3 com testes unitários.** Antes da distribuição é necessário provar em aparelhos Windows/Android o vencimento, a limpeza cache/outbox, revalidação online, revogação, restauração offline, conflitos e falhas de limpeza; iOS tem aceite próprio. A isenção IPO e os dados históricos devem permanecer inalterados na base. Nenhuma execução pode encurtar os períodos financeiros nem solicitar cobrança.

## Convivência com 6.2

A auditoria criptografada e os 33 ZIPs históricos de 29/10 permanecem independentes. Não executar downloads simultâneos, restore, nova exportação nem leitura de anexos durante esta revisão. Quando o Work retornar, retomar a cópia faltante de 116 objetos e a restauração integral separadamente; somente então avaliar se 6.2 chegou ao 14º aceite (60,87%).
