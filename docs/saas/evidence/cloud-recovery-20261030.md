# Recuperação do Cloud — checkpoint de 30/10/2026 UTC

**Aceite 6.2 parcial. Contador mantido em 13/23 (56,52%).** Esta prova distingue
a recuperação real já executada, os arquivos guardados fora da origem e a
transferência administrativa ainda em andamento. Não declara o aplicativo
restaurado para servir tráfego.

## Banco real recuperado

A exportação nativa de 29/10/2026, às 09h45 de Manaus, foi efetivamente obtida,
verificada e guardada com criptografia autenticada e chave separada. O arquivo
nativo tem 2.360.153 bytes; SHA-256:

`46013bd7f8ea0b29ddf07758a10636d3cc72b4df5babb7bce6c4492627c57b98`

O arquivo nativo do PostgreSQL 17.6 foi decodificado com pg_restore e os dados
dos schemas public, auth, storage e supabase_migrations foram recuperados em
PGlite/PostgreSQL 18.6 local isolado:

| Verificação executada | Resultado |
| --- | ---: |
| Conjuntos de dados de tabelas recuperados | 125 |
| Registros recuperados | 14.024 |
| Chaves estrangeiras verificadas | 202 |
| Restrições conferidas | 1.296 |
| Restrições sem validação ao final | 0 |

As contagens e os dados COPY recuperados foram comparados com a exportação.
Tabelas de serviços e runtimes como cron/net/Vault não foram ativadas no
destino. O arquivo nativo completo foi preservado; esse ensaio não cria uma
instância ativa de Auth/Storage, nem autoriza processamento financeiro na cópia.
Os testes descartáveis anteriores e seus limites continuam registrados em
[operational-recovery-20261028.md](operational-recovery-20261028.md).

## Arquivos reais: coberturas distintas

O inventário de retomada de 30/10/2026, 00h43m31s UTC, tinha 708 objetos na
lista de trabalho: 707 arquivos da aplicação e um export histórico. O ledger
registrava 702 arquivos ready, 8.421.253.330 bytes, nenhuma reserva e nenhuma
referência ready quebrada. Os objetos sem registro no ledger também fazem
parte da cópia; não foram apagados.

Um novo arquivo de 47.135.884 bytes surgiu depois da exportação nativa.
Os 707 objetos da lista anterior conservavam ID, versão, tamanho, ETag e MIME
na conferência de retomada. Isso não transforma o export antigo em snapshot
atual; a associação entre o banco escolhido e os arquivos ainda exige prova
explícita.

| Cobertura comprovada | Arquivos | Bytes de origem |
| --- | ---: | ---: |
| Verificados localmente antes de o executor ficar indisponível | 136 | 854.866.000 |
| Guardados em cópia privada fora do Cloud de origem | 91 | 505.418.505 |

Todos os 136 arquivos passaram por criptografia/descriptografia autenticada,
tamanho e SHA-256; 122 também tiveram comparação integral com MD5 de origem
quando o ETag era comparável. Os 91 arquivos persistidos são um subconjunto,
em dois volumes. Não somar as duas linhas nem chamar os 136 de cópia externa
completa. O backup criptografado do banco também foi persistido separadamente.

## Execução administrativa no Cloud

O executor e o navegador locais ficaram indisponíveis. Foi comprovado acesso
legítimo de servidor ao projeto esperado e ao bucket privado case-files:
correspondência do projeto e presença da chave verdadeiras, metadados HTTP200,
bucket privado.

Foi iniciada uma única operação pelo Lovable, usando o terminal privado
existente, para copiar os objetos sequencialmente, preservar metadados em
manifesto criptografado, gravar partes retomáveis num bucket administrativo
privado já existente e conferir readback/descriptografia em um cofre novo.

<!-- SERVER-CHECKPOINT-BEGIN -->
A auditoria somente leitura de 30/10/2026, **08h54 Manaus**, encontrou 20
partes privadas, totalizando 3.844.347.416 bytes, mas o diretório temporário,
a chave, o inventário e o checkpoint anteriores já não existiam no terminal.
Não há readback/autenticação comprovados dessa tentativa. Esses volumes
**não contam como arquivos recuperáveis**; a contagem anterior de 315
processados não representa recuperação aceita. A chave dessa série era
diferente da chave da cópia externa e não deve ser substituída por ela.

A revisão do código registrado também encontrou checkpoint de parte ainda
não persistida e nomes em texto claro no cabeçalho externo. A instrução para
corrigir e continuar essa gravação foi recusada pela revisão automática por
falta de autorização específica para dados, destino e guarda da chave. A ação
recusada não foi executada; a auditoria posterior foi estritamente de leitura.

Foi adotado um caminho com outra distribuição dos dados: leitura pelo controle
nativo de download do painel, criptografia local imediata com a chave já
guardada separadamente e salvamento dos volumes conferidos no mesmo destino
externo privado usado anteriormente. Nenhuma chave foi enviada ao Cloud e
nenhum novo backup foi gravado no bucket de origem por esse caminho.

Na conferência independente de **09h00m18s Manaus**, os dois volumes externos
originais recuperaram 91 arquivos / 505.418.505 bytes num cofre novo, com
autenticação, SHA-256 e tamanho conferidos; duração medida de 10,681 segundos.
As novas cópias também são recuperadas com o programa entregue antes de salvar.

O quarto volume salvo elevou a cobertura externa a **108 arquivos /
585.518.164 bytes**, com índice e instruções atualizados para a versão 3.
Há 116 arquivos / 637.684.868 bytes conferidos localmente nesse checkpoint.
Não somar essas coberturas nem considerar a cópia integral concluída.

O inventário lido às **09h19m03s Manaus** conservou os 708 objetos da lista
anterior, com mesmos IDs, caminhos, versões, tamanhos, ETags e MIME; zero novos
objetos ou objetos anteriores alterados/ausentes. Isso permite continuar a
conferência dos arquivos contra o inventário escolhido, sem reescrever a data
do banco.
<!-- SERVER-CHECKPOINT-END -->

A operação não autoriza mudar rotas, RLS, credenciais de acesso, usuários,
cobrança, vigências, jobs financeiros, dados clínicos ou objetos originais.
A chave de criptografia dessa nova série deve permanecer separada dos volumes;
não misturar séries ou chaves com a cópia externa já existente. Nenhum conteúdo
clínico, segredo ou chave de backup pertence a Git, logs ou artefatos de CI.

## Condições restantes para encerrar 6.2

1. Concluir a cobertura dos arquivos e comprovar tamanho, hash, autenticação,
   readback e recuperação em destino novo, com volume e duração medidos.
2. Conferir os vínculos com o snapshot de banco escolhido e registrar o ponto de
   recuperação e qualquer arquivo posterior; inventário atual não redata o banco.
3. Concluir a guarda independente da origem, com chave separada, e registrar o
   procedimento de recuperação, conferência e rollback dentro do escopo offline.
4. Registrar o aceite integral apenas depois dessas provas. Configurar um
   aplicativo ativo, Auth/Storage ou retomar tráfego conserva decisão própria.

O cancelamento A, o plano/preço futuro B e os períodos pagos não precisam ser
antecipados para realizar esta recuperação.
