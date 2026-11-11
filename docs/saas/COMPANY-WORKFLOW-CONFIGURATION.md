# Configurações de fluxo por empresa

Implementação de 23/10/2026. A auditoria ativa encontrou cinco tipos de caso e
vinte cores exatamente iguais às sementes originais, quatro templates na v1,
46 etapas, dez fases, quatro justificativas e três atribuições de etapa. Os 86
casos e todos os responsáveis desses registros pertencem à IPO. As consultas
guardam somente metadados e contagens, sem fichas de pacientes.

## Fronteira e preservação

Sete tabelas recebem propriedade: fases, etapas, atribuições de fase e etapa,
justificativas, templates e configurações. Os IDs e campos existentes da IPO
permanecem iguais. O preenchimento suspende e restaura o estado original dos
gatilhos. A aplicação ativa deve comparar os campos históricos em uma única
transação e abortar se casos, pacientes, estoque ou contratos forem alterados.

Templates deixam de ter uma chave global por fluxo. Configurações conservam
o `id=true` por empresa: a chave composta e o default de empresa também
mantêm o upsert dos clientes instalados anteriores dentro da própria empresa.
Em um restore apenas de schema, a configuração sem dono fica arquivada em
tabela privada; não é entregue ao primeiro cliente. Demais sementes sem empresa
ficam invisíveis. Não há transferência de dados dos 12 pacientes sem origem.

Cada empresa nova recebe fases, quatro fluxos e justificativas criados somente
com padrões do repositório, sem copiar as personalizações ou responsáveis IPO.
As empresas de teste existentes recebem esses mesmos padrões independentes.
Os dois catálogos originais continuam compartilhados para leitura; escritas
de clientes são recusadas por RLS e gatilho, inclusive em funções privilegiadas.
A coluna de ordenação esperada pela interface é acrescentada aos tipos de caso,
sem alterar IDs ou rótulos. O restore também passa a incluir a migração canônica
dos quatro fluxos versionados, ausente do pacote anterior.

RLS e gatilhos conferem empresa, pai, responsável e referências entre etapas.
O gerenciamento exige o papel administrativo da própria empresa com acesso
operacional; papel global antigo não concede administração em outra empresa.
Colaboração explícita conserva a leitura das definições necessárias ao caso,
sem permitir editar a configuração da empresa colaboradora.
A autoridade do caso acompanha o resolvedor existente de cobrança/armazenamento
(solicitante primeiro, paciente como fallback); a empresa do paciente continua
separada. Um cliente não pode anexar paciente estrangeiro sem acesso prévio.

## Versões e clientes

Salvar um fluxo cria versão da própria empresa. Aplicar a casos abertos usa
somente seus casos e preserva os finalizados. Avançar um caso antigo não o
migra automaticamente para a versão ativa mais recente. As RPCs conferem
autorização no caso, empresa da etapa e justificativa antes de qualquer efeito.
Fases/etapas em uso não podem ser apagadas por um cliente.

A seleção visual usa a empresa da etapa atual e a versão do caso, evitando
misturar sequências quando há colaboração. Sem empresa inequívoca, oculta a
sequência. O cache instalado fica separado por usuário e empresa. Pendências
antigas sem origem ou de outra empresa ficam em conflito e são preservadas.
Alterações de configuração pendentes também enviam uma asserção de empresa
para a RPC. A regra de 72 horas não muda. O frontend instalado precisa estar
atualizado para receber as novas guardas de cache/seleção.

## Verificação preparada

O ensaio SQL descartável cobre duas empresas, gestor, papel global legado,
usuário comum, configuração padrão, falsificação de empresa, referências e
responsáveis estrangeiros, edição de versão com/sem aplicação, caso finalizado,
preservação de outra empresa, dicionários protegidos e suspensão. Não executar
esse ensaio no banco ativo. A asserção de schema é somente leitura.

O job privado `configuration` usa as duas fixtures USER reais, sem promoção.
Cria somente IDs descartáveis próprios; verifica leituras, recusas e avanço/
retorno autorizado, limpando tudo ao final. Os fluxos positivos de edição por
gestor continuam identificados como ensaios SQL, até terem prova real própria.
Não há operação financeira nem alteração de ambiente Asaas.

CI/restore de 180 migrações, aplicação ativa com hashes históricos em 20 tabelas
e publicação foram comprovados em 23/10. O novo job passou 41/41 verificações
reais; as regressões elevaram a rodada a 227/227, com limpeza confirmada.
[Publicação, recibos e limites](evidence/company-workflow-publication-20261023.md).
O item 4.2 continua parcial e o total 8/23.
