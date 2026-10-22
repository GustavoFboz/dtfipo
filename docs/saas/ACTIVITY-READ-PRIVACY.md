# Privacidade dos marcadores de leitura de atividades

Incremento de 22/10/2026 na frente 4/7, item 4.2. Contador preservado em
**8/23 (34,78%)**; não encerra MFA, Master/AAL2, replay ou arquivos históricos.

## Falha observada

A política `case_activity_reads_select` do backend ativo permitia SELECT com
`USING (true)` para authenticated. A tabela expõe IDs da atividade e do leitor
e a data da leitura, mesmo quando o comentário correspondente está oculto.
O INSERT conferia somente `user_id = auth.uid()`, permitindo criar um marcador
para uma atividade cujo ID fosse conhecido, sem exigir sua visibilidade.

## Correção

A migração `20261022050000_saas_activity_read_privacy_stage07.sql` substitui a
leitura ampla por um EXISTS sobre a atividade visto pela sessão do chamador.
Uma política restritiva para todas as operações intersecta as permissões
legadas e também exige dono próprio na escrita. O marcador consulta o pai pela
RLS do chamador, sem helper privilegiado próprio. Não apaga nem reescreve
comentários ou marcadores.

O pacote de recuperação ainda tinha as políticas antigas de atividade baseadas
em staff e não continha a tabela de marcadores nem as funções canônicas da
0.6.4 vistas no banco ativo. O primeiro CI isolado detectou a tabela ausente.
A migração reproduz a estrutura canônica, essas duas funções e as permissões vigentes de atividade,
acrescenta interseções restritivas e retira EXECUTE anônimo dos helpers. Isso
conserva o limite por empresa e por atribuição também após restauração limpa,
sem importar migrações históricas que reescrevem dados de pessoas.

O subselect aplica as regras existentes de `case_activity`, incluindo empresa,
caso autorizado, período operacional e intervalo atual do cadista. Leitores
de uma atividade autorizada continuam visíveis para quem pode ver a atividade;
cadistas não ganham acesso a marcadores do histórico anterior à atribuição.
Upsert da própria leitura continua compatível com o contrato da interface Web,
Windows e Android. Não foi introduzida uma dependência de UI somente Web.

## Validação

O restore inclui a mesma migração antes do self-heal. A asserção somente leitura
confere RLS, política restritiva e ausência de SELECT irrestrito. O ensaio
transacional roda **somente no banco descartável de CI** e verifica duas
empresas, usuário comum, staff legado de outra empresa, cadista, intervalo,
leitores autorizados, upsert, falsificação/movimentação de marcador, anonimato,
revogação de acesso e preservação do histórico.

O job privado existente de Storage executa o novo conjunto com as mesmas duas
sessões USER reais, no caso descartável do próprio job. Usa um tipo de atividade
que não gera notificações e UUIDs conhecidos antes da requisição. Testa a
invisibilidade entre empresas, INSERT para atividade invisível, UPDATE/DELETE
estrangeiros, reatribuição do usuário, upsert e limpeza, além da recusa de
dashboard e replay Master para USER/AAL1 real. O alvo do replay é um ID Sandbox
deliberadamente inexistente; nenhum evento financeiro real é indicado.
Não cria operador, não inventa AAL2 nem envia e-mail/menções.

Os testes locais passaram: 211 em 11 arquivos, TypeScript, gates 05/06/09,
restore determinístico de 177 migrações, bootstrap e quatro testes Desktop.
CI Web e restauração limpa passaram. A PR183 foi integrada e publicada; a
migração confirmou preservação integral de 1.336 atividades e 775 marcadores.
O job publicado passou 112/112 checks reais (84 de Storage e 28 de privacidade
e autorização), com limpeza total das fixtures. [Prova e limites](evidence/activity-read-publication-20261022.md).
As outras onze tabelas conservam sua [revisão individual](evidence/legacy-table-review-20261022.md).
