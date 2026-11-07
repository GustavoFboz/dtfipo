# Meta de dez aceites integrais, sem alterar os 23 critérios

Solicitação de 05/10/2026, 20h35 Manaus. Baseline verificado: **2/23**, meta
**10/23** (43,48%). Precisamos fechar **oito aceites adicionais** com prova real.
Este arquivo organiza a execução; não atribui aceite a implementação parcial.

| Ordem | Critério | Prova que ainda falta para contar |
| --- | --- | --- |
| 1 | 1.1 — dois eventos manuais externos | Duas conclusões individuais no Master, com MFA real, auditoria e confirmação de preservação do ledger/períodos. A leitura de 08/10, 19h55 UTC, ainda registrou dois dead letters e zero revisões. |
| 2 | 1.2 — duplicatas e ordem | Redelivery idêntico e aviso antigo no Sandbox, com consulta atual do provedor e uma única aplicação financeira. Webhook mais reconciliação histórica já foi observado, mas não encerra esses dois casos. |
| 3 | 1.3 — webhook perdido | Cobrança de fixture Sandbox cujo evento não chegou, recuperada pela reconciliação, com ID e período verificados; nenhum pagamento de Produção. |
| 4 | 2.1 — ciclo financeiro | Evidência no provedor para os estados previstos; estorno parcial, chargeback e exclusão desconhecida permanecem em revisão, sem liberar acesso. |
| 5 | 2.2 — dados e período pago | Comparar ledger, vigência e dados remotos antes/depois dos fluxos financeiros reais das fixtures. Regressões locais e hashes de uma mudança de código são provas parciais. |
| 6 | 3.1 — uploads e exclusões | Exercitar caso, paciente, foto e avatar pelas APIs autenticadas do ambiente, conservando reserva/tamanho e recusando operações de outra empresa. Exclusão de caso Web foi confirmada pelo titular. |
| 7 | 4.1 — identidade e recuperação | Job privado autorizado já implementado: comprovar cadastro, confirmação, recuperação e login no Auth real, além de recusa de senha inferior a oito caracteres. Em 08/10, o novo job recebeu HTTP403 antes da claim; motivo não comprovado. Ajuste global mínimo de senha e nova execução continuam pendentes. |
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

Há acesso a código, publicações e operação privada do worker. O PR154 integrou
jobs de Auth, cobrança e armazenamento com capacidade dedicada, prazo curto,
consumo único e duas identidades exatas. Eles obtêm sessões reais apenas na
memória do servidor e não enviam e-mail; não usam o segredo financeiro como
credencial de gerenciamento de identidades.

Em 08/10, o Lovable Cloud apresentou backend_unreachable_db e HTTP503 na
conexão Auth→banco. SELECTs também retornaram 504/UNAVAILABLE. O job de
identidade enviado retornou HTTP403 sem consumir a claim; a causa desse 403
não foi identificada. Jobs de cobrança e armazenamento não foram enviados.
A evidência de código/CI não substitui essa execução. Ver
[checkpoint e sequência de retomada](evidence/fixture-cloud-checkpoint-20261008.md).

Após recuperar o Cloud, conferir a publicação servida, ajustar no painel Auth
o mínimo global de senha para oito caracteres e preparar um novo job de
identidade. Uma credencial expirada ou job consumido não pode ser reutilizado.
Depois executar cobrança Sandbox, verificar papéis/acesso legítimos das duas
fixtures e executar armazenamento. Aceitar somente checks comprovados;
os cenários de webhook perdido, ciclo financeiro completo e preservação de
dados exigem suas provas próprias além dos jobs atuais.

Testes com dinheiro real continuam pertencendo ao gate 7.3 e ao responsável.
Não habilitar Produção para alcançar a meta numérica. Aparelhos, distribuição,
onboarding/capacidade e documentos comerciais mantêm seus aceites próprios.
