# Privacidade de atividades publicada — 22/10/2026

PR [183](https://github.com/GustavoFboz/dtfipo/pull/183) integrada na revisão
`4afe3d9ccb088d3645541439ac0ae638c79b4bab`, árvore
`0548cd1b0bbf46b43927d481b912816d86ff130c`. Publicação nativa
`048c5a34-3ac4-4281-9c40-f326b3c9984f` em https://dtfipo.lovable.app;
o menu Cloud confirmou **Seu site está atualizado**. Desenvolvimento pelo
GitHub; nenhum pedido ao builder AI ou nova chave Asaas.

## Banco e histórico

A migração `20261022050000_saas_activity_read_privacy_stage07.sql` foi aplicada
em transação, com limites de bloqueio/execução e comparação integral por hash
das atividades e marcadores antes/depois, sob bloqueio. A transação só confirmou
após provar que os dados não mudaram. Foram preservadas **1.336 atividades e
775 marcadores**. A asserção somente leitura retornou `passed` no backend ativo.

Os marcadores herdam a visibilidade do comentário pela RLS da sessão, incluindo
empresa, acesso operacional e intervalo do cadista. A escrita pertence ao
próprio leitor. O restore reproduz o contrato canônico de atividades que já
existia no banco ativo e acrescenta as interseções restritivas. Não houve
alteração de comentário, autor, data ou registro histórico.

## Execução real publicada

O job `181a23b4-03e5-425b-aefb-2d3ff6a66dcc` retornou HTTP200 e concluiu em
**14:43:24 UTC / 10:43:24 Manaus**, com **112/112 verificações aprovadas**:

- 84 regressões reais de armazenamento, cota, concorrência, falhas e limpeza.
- 28 verificações novas de privacidade e autorização, 14 por sessão USER.

As duas sessões foram verificadas pelo Auth e eram AAL1 real, sem operador.
Cada sessão criou atividade e marcador no caso descartável do job. O upsert
preservou o ID; a outra empresa não viu a atividade nem o marcador, não pôde
inserir leitura da atividade invisível nem alterar/apagar a leitura existente.
Reatribuir o leitor foi recusado. As duas sessões receberam
`PLATFORM_MASTER_FORBIDDEN` no dashboard e no replay administrativo. O alvo
Sandbox era deliberadamente inexistente; nenhum evento real foi indicado.

O preparo clínico descartável foi administrativo. As operações de atividade,
leitura e Storage usaram somente as sessões USER. A limpeza removeu os UUIDs
exatos do job e os marcadores dependentes. Não houve comentário, e-mail, menção
ou notificação para pessoas. A capability era curta, de uso único, consumida;
nenhum token ou credencial está nestas evidências.

[Recibo completo sanitizado](activity-read-storage-20261022.json).
A consulta de **14:44:44 UTC / 10:44:44 Manaus** confirmou job `completed`,
112 checks, nenhuma atividade temporária, zero linhas Storage das fixtures,
1.336 atividades e 775 marcadores originais. Continuavam um pagamento
Production, zero eventos Production falhos/dead letter e worker `ok`, com
heartbeat às 14:41:04 UTC. Nenhuma cobrança ou contrato foi alterado.
[Snapshot agregado](activity-read-runtime-snapshot-20261022.json).

## CI e plataformas

O [CI Web](https://github.com/GustavoFboz/dtfipo/actions/runs/39796394003)
e a [restauração limpa](https://github.com/GustavoFboz/dtfipo/actions/runs/39796394023)
passaram na cabeça `e500e7420f4ff550ccf2195d18d8f8b460f6839d`. O restore usa
177 migrações e ensaia staff de outra empresa, cadista após a atribuição,
upsert, falsificação, anonimato, suspensão e preservação do histórico.
São simulações SQL descartáveis; não são prova de MFA real.

O [Windows](https://github.com/GustavoFboz/dtfipo/actions/runs/39796393862)
gerou e verificou o instalador 0.6.8; build de PR sem Authenticode, sem publicação
de nova versão permanente. No [Android](https://github.com/GustavoFboz/dtfipo/actions/runs/39796393877),
API35 concluiu os checks de início, expiração, recuperação, interface de login
e retorno da versão release, com APK de diagnóstico isolado. API37 experimental
falhou no emulador: `system_server`, GPU readback, assertion
`hasReadColorBufferDma`. Isso não comprova aprovação em Android17/aparelhos.
Não houve troca de assinatura nem atualização dos downloads permanentes.

## Limites do aceite

**8/23 (34,78%), 15 itens abertos/parciais, 0/7 etapas encerradas.** Este
incremento corrige uma falha; não encerra sozinho o item 4.2. Master/MFA e replay
positivos reais continuam pendentes, assim como a [revisão das onze tabelas](legacy-table-review-20261022.md).
O estoque legado não possui coluna de empresa nem autor: sua migração requer
propriedade definida antes de atribuir dados existentes. O Cloud ainda mostra
um problema crítico no scan; não houve correção automática nem alegação de
que todos os alertas foram encerrados.

Os [40 links históricos](private-links-audit-20261022.json) continuam válidos
até 2036 e não foram revogados nesta entrega. As nove reservas históricas, os
demais ciclos do provedor, backup operacional, aparelhos e revisão para vendas
conservam seus aceites próprios.
