# Cancelamento Sandbox preparado — 28/10/2026

Checkpoint de **28/10/2026, 15h57 Manaus** (19h57 UTC). A publicação da PR204
preparou uma única solicitação autenticada da fixture Sandbox A. O job passou
**17/17 verificações reais**, mas terminou em `AWAITING_MASTER`: o cancelamento
financeiro ainda não foi executado. **12/23 (52,17%), 11 critérios restantes,
1/7 etapas encerradas; nenhum aceite parcial foi arredondado.**

## Revisão, publicação e testes

- PR204: https://github.com/GustavoFboz/dtfipo/pull/204.
- Head `82e11a9bd64489445c6067f3238447b18e48c0f1`; merge
  `4216eb33d3e93a9de6db2e22eaab9e4f500b38dd`.
- 261 testes locais em 14 arquivos, TypeScript, build, etapas 06/08/09,
  bundle de 184 migrações e conferência do diff aprovados.
- CI Web `40573445506`, Windows `40573445408` e restauração limpa
  `40573445631` concluídos com sucesso. A restauração é de schema descartável,
  sem comprovar backup/restauração operacional de dados e arquivos.
- Workflow Android `40573445424` aparece como sucesso geral, mas a matriz
  API37 falhou no smoke de inicialização (`122433449821`). API35 passou
  (`122433450274`); publicação permanente de instalador foi ignorada. Não há
  novo aceite Android17 nem de aparelhos físicos.
- Publicação solicitada `de4dd0e2-affd-4a6d-b7a2-7defa38279da`, inicialmente
  `pending`. A confirmação veio do manifesto público com 184 migrações e da
  execução real do novo código publicado em https://dtfipo.lovable.app.

## Preparo autenticado e autorização preservada

O job `f159e50a-3576-46a3-9550-423cf262cb0e` foi executado uma vez,
19h56m47–19h56m53 UTC. A capacidade de uso único foi consumida e sua cópia
local removida. O HTTP aceitou somente o ID do job; não recebeu ator, empresa,
ambiente financeiro, credenciais de usuário ou parâmetros de cancelamento.

O backend conferiu a assinatura, o cliente Sandbox com notificações desativadas
e três cobranças existentes. As duas identidades de teste continuaram USER;
o Auth verificou sessões reais, sem promover operador ou simular claims MFA.
A sessão gestora da fixture A pediu a cotação atual e registrou a solicitação
pelas RPCs normais do produto. Outra empresa não pôde consultar o histórico;
o gestor comum recebeu HTTP403 ao chamar a ação Master somente para conferência.

Solicitação `5cd49826-9cec-421d-b511-98519ecdd80e`, criada em
19h56m52.124431 UTC: `cancel / sandbox / awaiting_provider`, contrato Growth
de R$449 e período pago até **18/12/2026, 00h00 UTC**. Nenhuma tentativa de
escrita no provedor foi registrada; `billing_cancel_executions` continua zero.
O job não possui método para executar alterações financeiras no Asaas.

O acesso pago e o histórico com dois pagamentos foram conferidos na sessão
real. Os hashes do ledger e das três cobranças foram salvos para comparação
depois da futura ação Master. A fixture B e sua assinatura permanecem ativas,
disponíveis para as próximas homologações independentes.

## Preservação e carga observada

Snapshots de 19h53m50 e 19h57m27 UTC coincidem nos campos conferidos:

| Dado | Antes e depois |
| --- | --- |
| Arquivos prontos | 700 |
| Bytes prontos | 8.357.682.562 |
| Reservas de armazenamento | 0 |
| Hash de Storage | `e6d2b3b7155123e1c0b6f184f9f50fa1` |
| Hash de casos | `419b08f5b8905de5caa4fa9616ed4db6` |
| Hash de pacientes | `d1573a1878b4cc6ab9f2d2b3143b3f2d` |
| Hash de pagamentos | `b2c430d6aaed7c02409aca88b4b649ea` |
| Hash de contratos fora das fixtures | `5f93ae8a05622562813e88f6797b522d` |
| Execuções financeiras de cancelamento | 0 |
| Esperas por lock | 0 |

As duas assinaturas, valores e períodos permaneceram idênticos. A comparação
de contratos exclui apenas campos de atualização/reconciliação; os hashes das
fixtures preservam plano, vínculo e vigência. Foram observadas 26 conexões
antes e 24 depois, sem jobs QA em execução no fim. As chamadas ao provedor
foram leituras sequenciais, sem retries automáticos. Os 685 arquivos do
checkpoint de 27/10 são uma contagem histórica: a rodada atual iniciou e
terminou com 700, sem tentar desfazer a evolução legítima do sistema.

## Próximas ações e limites

1. Na sessão Master real, revisar esse pedido, confirmar o autenticador,
   a preservação das cobranças emitidas e a justificativa; executar uma vez.
2. Se o resultado for inconclusivo, usar a conferência somente por GET.
   Não recriar o pedido, repetir PUT ou usar SQL para fabricar autorização.
3. Executar novo job de observação e comparar os hashes: `INACTIVE` no Asaas,
   uma escrita auditada, mesmo período pago, histórico e dados preservados.
4. Continuar troca de plano/preço por vigência, downgrade e demais ciclos;
   5.2/5.3 e 2.1/2.2 continuam parciais até suas provas completas.

Nesta rodada não foi reaberto login nem executada ação Master. Desenvolvimento
independente pode continuar; a validação protegida mantém sua exigência real.
Os [recibos e snapshots](cancellation-preparation-20261028.json) não incluem
tokens, URLs de cobrança, dados fiscais, imagens ou caminhos privados.
