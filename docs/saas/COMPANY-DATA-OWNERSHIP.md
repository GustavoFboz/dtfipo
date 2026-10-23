# Vínculo de dados por empresa

Atualização de 23/10/2026: publicação confirmada e **186/186 verificações reais**
aprovadas: 58 de propriedade, 16 de identidade e 112 de arquivos/privacidade.
A leitura independente confirmou os totais IPO, ausência de resíduos das
fixtures e zero divergência entre diretórios e perfis. O bloqueio de ambiente
do checkpoint abaixo foi resolvido. [Prova e limites](evidence/company-ownership-publication-20261023.md).
O contador continua 8/23; o item 4.2 permanece parcial pelos demais aceites.

Em 22/10/2026, o titular confirmou que o estoque existente pertence
integralmente à IPO; as demais contas são de teste. A conferência encontrou
107 itens, 47 movimentações, 45 campos personalizados, duas regras, dois
consumos e 29 componentes por dente. Todos os consumos com caso associado
apontam para a IPO, sem vínculo conflitante com outra empresa. Os diretórios
têm quatro cadistas, sete dentistas e três protéticos, todos com perfil IPO.

## Implementação

A migração `20261022160000_saas_company_stock_ownership_stage07.sql` adiciona
`clinic_id` em 22 tabelas de estoque, catálogos relacionados e diretórios.
Os dados operacionais existentes recebem a empresa IPO confirmada, com os
mesmos IDs, quantidades, nomes, autores e datas. Os diretórios seguem o vínculo
real do perfil, que também se mantém atualizado após aprovação de associação.
O backfill suspende e restaura exatamente o estado dos gatilhos de cada tabela
para não disparar recálculo, alteração de datas ou notificações históricas.

Novos registros recebem a empresa atual validada ou a empresa do pai
autorizado. O vínculo de estoque é imutável e referências entre empresas são
recusadas antes de alterar saldos. As políticas restritivas intersectam as
regras antigas, incluindo papéis globais legados. Gatilhos também conferem
escritas executadas por RPCs privilegiadas: SQL como owner não autoriza misturar
caso, item, categoria, regra, componente, pote, broca ou responsável estrangeiro.
As rotinas de equipe conferem empresa do alvo e das categorias antes de editar.
Leitura de perfil/diretório respeita a própria pessoa, empresa e participação
autorizada no caso; a colaboração explícita existente é preservada.

O restore inclui as tabelas canônicas de resina que faltavam, campos usados
pelas rotinas atuais e as funções vigentes do banco ativo. O self-heal final
reaplica as duas rotinas de implante e as revogações para não desfazer a guarda.
Um restore de schema sem a IPO mantém sementes antigas sem proprietário e
invisíveis, sem transferi-las automaticamente ao primeiro cliente que se cadastra.

## Clientes instalados

Os adapters de estoque usam cache por usuário **e empresa**, validando a mesma
identidade antes e depois de leituras assíncronas. Não reutilizam o namespace
antigo que podia conter dados lidos antes do isolamento. Alterações offline
novas carregam sua empresa; pendências antigas sem essa origem ficam em
conflito para revisão, preservadas. A regra existente de até 72 horas permanece.
A publicação do backend protege também clientes anteriores online; a nova
guarda de cache exige o frontend atualizado nos aplicativos instalados.

## Validação e limites

O CI descartável testa duas empresas, gestores, papel global legado, usuário
comum, novos registros, nomes iguais em empresas diferentes, tentativa de
troca de empresa, referência estrangeira, consumo por RPC, reversão idempotente,
edição de equipe estrangeira e suspensão. Essas identidades SQL são simulações.
O novo job privado `ownership` mantém as duas fixtures fixas e sessões USER
reais, sem promoção. O preparo administrativo usa UUIDs exclusivos do job;
as leituras, recusas e consumo/reversão usam os clientes reais. A migração foi
aplicada à base ativa em 22/10/2026, após CI e restore aprovados. A transação
comparou hashes de todas as linhas antes/depois, excluindo somente o novo
`clinic_id` nas tabelas migradas: saldos, autores, datas e demais campos
históricos foram preservados. A asserção de schema ativo também passou.

A leitura independente das 17:12 UTC confirmou as 22 tabelas sem registros
operacionais fora da IPO ou sem empresa, e os 14 profissionais com diretório
e perfil concordantes. O snapshot agregado está em
`docs/saas/evidence/company-ownership-live-20261022.json`; não contém fichas,
nomes de pacientes, credenciais ou links de acesso.

Validação: 218 testes locais e TypeScript; gates 06/09, cobrança, quatro
regressões de entitlement Desktop e restore determinístico de 178 migrações.
No GitHub, Web, restore completo/backfill e build Windows passaram. Android
API 35 compilou e iniciou no emulador; o ensaio experimental API 37 falhou
com queda do sistema do emulador. Esses resultados não substituem aparelhos
reais nem representam novos instaladores permanentes publicados.

A publicação de aplicação foi solicitada sob o deployment
`53112bd2-363b-4ecb-b791-401aa7d7f969`, para o merge
`c5ed0a22026614573b6132ce040edc4d554db640`. O conector confirma o SHA
sincronizado e o projeto ready/is_published, mas isso não prova a conclusão
desse deployment. O ambiente de terminal/navegador perdeu a conexão durante
a conferência. A sonda HTTP alternativa recebeu 403, sem comprovar a versão.
Aquele checkpoint deixou a confirmação visual da publicação, o job real `ownership` e as regressões
reais de Auth/Storage após esta migração **pendentes em 22/10, resolvidas em 23/10**. Nenhum job
novo nem token de execução foi criado enquanto a versão publicada não pôde
ser confirmada. O painel privado também não foi republicado nessa interrupção.

A revisão mais ampla também encontrou 12 pacientes sem empresa nem casos
associados. Sua origem não pode ser determinada pelos vínculos existentes;
permanecem reservados para revisão, sem exclusão nem atribuição por suposição.
Novos pacientes exigem empresa. Tipos de caso, cores e configuração de workflow
conservam revisão própria de catálogo/configuração compartilhada. Esta entrega
não afirma isolamento integral de todos os módulos nem encerra MFA/Master,
links assinados históricos, testes em aparelhos ou o item 4.2. Contador: 8/23.
