# Etapa 06 — confirmação de exclusão e exibição da cota

Status: upload e exclusão de anexo de caso pela conta publicada comprovados
em 03/10/2026. O responsável confirmou a exclusão funcionando corretamente e
a consulta somente leitura confirmou a remoção e o retorno da cota.
O Asaas permanece em standby.

## Problema e reprodução

O responsável enviou telas do armazenamento antes/depois de um novo anexo e da
tentativa de remover esse arquivo pelo detalhe do caso. O fundo escurecia, mas
a caixa com **Excluir** e **Cancelar** não aparecia.

`CaseAttachments` chama a confirmação global antes de executar a remoção. O
`AlertDialog` compartilhado tinha fundo e conteúdo na camada `z-50`; o diálogo
do caso está na camada `1200`. A confirmação montava e assumia o foco modal,
mas ficava escondida sob o caso. O fluxo aguardava a resposta do responsável.

O ensaio React/Radix reproduziu a camada da confirmação abaixo do caso,
compilando com Tailwind as classes reais renderizadas. Ele também aplica os
arquivos reais de CSS nativo, na ordem do aplicativo. Os testes de cancelar,
Escape e confirmar usam um anexo fictício, sem chamadas de remoção ao banco.

Foi reproduzida uma segunda falha na mesma fila: o clique no botão resolve a
solicitação, e depois o Radix dispara `onOpenChange(false)`. A rotina antiga
resolvia também a próxima solicitação, caso já estivesse na fila.

A tela também mostrou **72 GB usados** após o envio. O formatador antigo
removia a sequência `.0` de `7.02`, produzindo `72`. O backend não registrou um
salto para 72 GiB; a falha era de apresentação.

## Correções

- Fundo de confirmação na camada `1300`, conteúdo na `1310`: acima do caso,
  compatível com os overrides nativos já existentes.
- Cada callback resolve somente a solicitação com o identificador esperado;
  o fechamento tardio da solicitação anterior preserva a próxima na fila.
- O formatador elimina somente zeros decimais finais, preservando os algarismos
  significativos de `7.02`, `7.05`, os inteiros e as cotas de 25/100/500 GB.

As rotinas de autorização, remoção pelo Storage, finalização no catálogo e
adapters de plataforma foram preservadas. Nenhuma migration foi necessária.

## Prova do novo upload no banco ativo

Consulta agregada `READ ONLY` com `ROLLBACK`, sem retornar nomes de pacientes,
nomes de arquivos, caminhos ou conteúdo clínico:

| Medida da IPO | Resultado |
| --- | ---: |
| Arquivos no catálogo `ready` | 500 |
| Reservas existentes | 9 |
| Bytes contabilizados | 7.534.408.222 |
| Uso em GiB, arredondado a três casas | 7,017 |
| Novo arquivo `ready` após 20:20 UTC de 03/10 | 1 |
| Tamanho do novo arquivo | 26.088.984 bytes |
| Novo arquivo com objeto correspondente | 1 |
| Novo arquivo com registro de anexo ativo | 1 |

O uso anterior era de 7.508.319.238 bytes; a diferença corresponde exatamente
ao novo arquivo. O envio não deixou uma nova reserva pendente. As nove reservas
antigas permanecem como pendência distinta, conforme a auditoria anterior.

## Validação e limite

O teste da confirmação verifica a ordem de camadas Web/nativa, foco no modal,
cancelamento sem remover, repetição da ação após cancelar, Escape sem fechar o
caso, confirmação única, liberação do bloqueio ao fechar os modais e preservação
de solicitações em fila. O teste de tamanho cobre as casas decimais e as cotas.
Passaram 128 testes (13 arquivos), TypeScript, checks das etapas 06/09,
regressão de bootstrap/entitlement Desktop, pacote de restauração com 164
migrations e os builds de produção Web, Desktop e Android. A confirmação entra
no CI para conservar essa cobertura. Nenhum instalador nativo foi gerado aqui.
São testes React/Radix em `happy-dom`, não uma homologação num Windows ou
Android instalado. A confirmação abaixo cobre o fluxo real utilizado pelo
responsável; não representa homologação de todos os clientes instalados.

## Confirmação da exclusão publicada

Em 03/10/2026, às 18:55 em Manaus (22:55 UTC), o responsável informou:
**“Exclusão funcionando corretamente”**. A verificação posterior executou
somente uma consulta agregada em `READ ONLY` com `ROLLBACK`, sem remover dados.

| Medida | Antes da exclusão | Depois da exclusão |
| --- | ---: | ---: |
| Arquivos da IPO no catálogo `ready` | 500 | 499 |
| Bytes contabilizados | 7.534.408.222 | 7.508.319.238 |
| Entradas do anexo de homologação no catálogo | 1 | 0 |
| Objetos correspondentes ao tamanho/horário do envio | 1 | 0 |
| Anexos correspondentes ao tamanho/horário do envio | 1 | 0 |
| Reservas antigas | 9 | 9 |
| Bytes das reservas antigas | 1.112.944.862 | 1.112.944.862 |

Os filtros do anexo usam os 26.088.984 bytes comprovados no envio e horário
a partir de 20:20 UTC de 03/10. Os resultados não retornam nomes, caminhos ou
dados clínicos. O uso caiu exatamente 26.088.984 bytes (cerca de 24,9 MiB) e
voltou ao valor anterior ao upload. Não ficou objeto órfão correspondente ao
envio. As nove reservas históricas continuam como pendência separada.

Upload e exclusão do anexo de caso estão validados para esse ensaio publicado.
A revisão dos resíduos históricos e os demais uploads dos módulos disponíveis
continuam pendentes na etapa 06. O responsável adiou DICOM em 03/10 porque a
Radiologia ainda não funciona; esse ensaio será necessário para ativar o módulo,
sem bloquear a conclusão atual do SaaS.
