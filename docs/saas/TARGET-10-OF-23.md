# Meta de dez aceites integrais, sem alterar os 23 critérios

Solicitação de 05/10/2026, 20h35 Manaus. Baseline verificado: **2/23**, meta
**10/23** (43,48%). Precisamos fechar **oito aceites adicionais** com prova real.
Este arquivo organiza a execução; não atribui aceite a implementação parcial.

| Ordem | Critério | Prova que ainda falta para contar |
| --- | --- | --- |
| 1 | 1.1 — dois eventos manuais externos | Duas conclusões individuais no Master, com MFA real, auditoria e confirmação de preservação do ledger/períodos. Em 00h35 UTC de 06/10 ainda havia dois dead letters e zero revisões. |
| 2 | 1.2 — duplicatas e ordem | Redelivery idêntico e aviso antigo no Sandbox, com consulta atual do provedor e uma única aplicação financeira. Webhook mais reconciliação histórica já foi observado, mas não encerra esses dois casos. |
| 3 | 1.3 — webhook perdido | Cobrança de fixture Sandbox cujo evento não chegou, recuperada pela reconciliação, com ID e período verificados; nenhum pagamento de Produção. |
| 4 | 2.1 — ciclo financeiro | Evidência no provedor para os estados previstos; estorno parcial, chargeback e exclusão desconhecida permanecem em revisão, sem liberar acesso. |
| 5 | 2.2 — dados e período pago | Comparar ledger, vigência e dados remotos antes/depois dos fluxos financeiros reais das fixtures. Regressões locais e hashes de uma mudança de código são provas parciais. |
| 6 | 3.1 — uploads e exclusões | Exercitar caso, paciente, foto e avatar pelas APIs autenticadas do ambiente, conservando reserva/tamanho e recusando operações de outra empresa. Exclusão de caso Web foi confirmada pelo titular. |
| 7 | 4.1 — identidade e recuperação | Método administrativo autorizado para uma recuperação de fixture sem envio de e-mail, depois confirmação, troca de senha e login. Não editar auth.users nem produzir claims falsos como substituto do fluxo. |
| 8 | 5.1 — histórico e cobrança | Gestor autenticado visualiza histórico e abre a cobrança conferida no Asaas; um usuário sem permissão é recusado. Não fabricar recibo nem apresentar cobrança manual externa como contrato SaaS. |

Trabalho independente adicional: a correção de referências e renovação de
arquivos do item 4.3 está em [PRIVATE-FILE-ACCESS.md](PRIVATE-FILE-ACCESS.md).
O item pode substituir uma prioridade somente quando seu aceite integral
for comprovado; isso não altera o denominador nem apaga a pendência anterior.

## Limites atuais de execução

O SQL técnico do backend não é uma sessão Master/AAL2. A RPC de encerramento
externo não está concedida a service_role; o titular precisa concluir o fluxo
publicado na sua sessão. Não substituir por UPDATE, claims forjados ou um
operador fictício criado para revisar os eventos dele.

Há acesso a código, publicações, SELECT/DDL e operação privada do worker.
Não há credencial de fixture Auth nem método já autorizado/exposto pelo
conector para obter uma sessão ou consumir o link de recuperação sem e-mail.
Não criar uma rota administrativa pública usando o segredo financeiro para
transformá-lo em uma credencial de gerenciamento de identidades.

Testes com dinheiro real continuam pertencendo ao gate 7.3 e ao responsável.
Não habilitar Produção para alcançar a meta numérica. Aparelhos, distribuição,
onboarding/capacidade e documentos comerciais mantêm seus aceites próprios.
