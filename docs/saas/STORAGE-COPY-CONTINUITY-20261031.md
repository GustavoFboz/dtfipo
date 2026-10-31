# Continuidade da cópia externa — 31/10/2026

Esta melhoria NÃO encerra o critério 6.2. Contador oficial: **13/23 (56,52%)**. Nenhuma escrita no Cloud, Asaas, arquivos clínicos ou aplicativo ativo foi feita.

## Estado verificado

O índice histórico criptografado de 29/10 foi autenticado fora do Git. Foram conferidos recibos, tamanhos, versões, quantidade de partes e os três fingerprints agregados (versão, tamanho e ETag) contra SQL somente leitura do Cloud.

| Medida | Resultado |
| --- | --- |
| Inventário congelado | 708 objetos: 707 da aplicação e uma exportação histórica |
| Recebidos com recibos | 592 objetos, 6.489.242.325 bytes |
| Ausentes da cópia | 116 objetos, 1.968.840.906 bytes |
| Partes declaradas no índice | 33 ZIPs |
| Fingerprints do Cloud no escopo congelado | 3 de 3 coincidentes |
| Fora do escopo congelado | 21 exportações novas do banco |
| Prova adicional nesta retomada | ZIP da parte 03: SHA-256 e CRC corretos; 2 arquivos/137.526 bytes restaurados em cofre privado offline, com autenticação |

A existência das outras 32 partes foi observada na Biblioteca por nome e tamanho. **Seus SHA-256 não foram recalculados nesta rodada**. O teste da parte 03 não substitui a restauração integral. O banco restaurado anteriormente continha 125 tabelas, 14.024 registros e 202 chaves estrangeiras, mas aquele snapshot é de 29/10, não o estado atual.

## Ferramenta e limites

Scripts implementados nesta branch:
- scripts/recovery/audit-external-copy.mjs — lê o índice cifrado com chave externa; rejeita recibos repetidos, arquivos alterados e falso aceite; gera somente contagens e fingerprints.
- scripts/recovery/audit-external-copy.test.mjs — quatro testes fictícios.
- .github/workflows/saas-storage-copy-continuity.yml — CI somente com dados fictícios, sem segredos.

Uso com Node 22 e arquivos privados (fora do Git):

    node scripts/recovery/audit-external-copy.mjs INDICE.dfenc CHAVE.bin [DIRETORIO_DOS_ZIPS]

Quando o diretório de volumes é informado, calcula o SHA-256 de cada ZIP sequencialmente, sem repetir downloads do Cloud. Sem o diretório, reporta que a verificação física dos volumes não foi feita. O resultado contém sempre operational_acceptance=false: somente a auditoria de índice NÃO encerra o critério 6.2.

## Próxima execução

Usar o índice autenticado MAIS RECENTE (592 recibos), não o checkpoint operacional anterior (576). Obter somente os 116 objetos restantes, até quatro por lote e um download de origem por vez, preservando fragmentos criptografados antes de novas tentativas. Conciliar 21 exportações posteriores separadamente, em vez de misturá-las no snapshot histórico.

Depois conferir hashes de TODOS os volumes, restaurar TODOS os objetos em cofre offline, validar relacionamentos com o banco e obter uma exportação/validação atual dos dados conforme a política de recuperação. Somente após a prova independente e a decisão segura de retomada será possível encerrar 6.2 e registrar 14/23 (60,87%).

A ferramenta e as consultas SQL não dão acesso aos bytes restantes. Não houve coleta dos 116 nesta rodada; sem fonte autorizada de download não existe comprovação de cópia integral. Não executar restore na produção nem reativar processamento financeiro na cópia.
