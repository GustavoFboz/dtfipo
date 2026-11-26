# DentalFlow — evidência da primeira restauração real e isolada do banco

**Data da evidência:** 06/11/2026 (horário local do proprietário). **Estado:** banco recuperado em contêiner descartável; anexos ainda não recuperados nele.

## Resultado observado pelo proprietário

A interface Windows `DentalFlow — Restauração Isolada Supabase` autenticou o pacote cifrado AES-256-GCM do banco exportado em **04/11/2026** (`pg_custom`, **2.439.186 bytes**) e informou:

| Medida | Resultado reportado | Comparação com baseline vivo de 04/11 |
|---|---:|---|
| Pacientes | 93 | Coincide |
| Casos | 86 | Coincide |
| Agendamentos | 8 | Coincide |
| Linhas de metadados em `storage_files` | 702 | Coincide |

A interface informou expressamente **'Banco restaurado e conferido localmente em ambiente DESCARTÁVEL'** e **'O contêiner foi removido ao final. ANEXOS AINDA NÃO RESTAURADOS'**. O código do ensaio usa imagem `supabase/postgres:17.11.0.018`, sem rede e sem portas publicadas, valida os limites do contêiner antes de transmitir o dump, desabilita a execução de trabalhos `pg_cron`, e destrói o contêiner após o teste.

A cópia criptografada externa do banco já havia sido autenticada após download de retorno do Drive (uma parte). O dump jamais foi colocado no GitHub, nem as chaves. **A imagem original do proprietário não é anexada a este documento**, para evitar exposição acidental de dados locais.

## Interpretação e limites

**Este é o primeiro ensaio comprovado de importação do backup real do banco, não apenas de fixtures SQL.** A evidência confirma o processamento do dump e as quatro contagens principais, com isolamento local informado pela ferramenta. Não é prova de recuperação ponta a ponta de todos os usuários, hashes de Auth, Vault original, Edge Functions, anexos de Storage ou do ciclo Asaas. O banco temporário foi descartado e não permanece como ambiente acessível.

**O contador de execução do beta continua em 2/8; etapa 3 permanece pendente.** O aceite requer recuperação conjunta de bytes de arquivos e relações no ambiente isolado, incluindo leitura efetiva dos itens, e reversão.

## Próximo ensaio necessário

1. Preservar sem modificações os backups privados: 33 volumes históricos do índice de 29/10 (592 objetos), cópia cifrada recuperada dos 116 arquivos (14 partes / 2.712.484.560 bytes de origem local) e dump atual cifrado (1 parte / 2.439.186 bytes), mantendo **cada chave fora do Drive e do repositório**.
2. Preparar um verificador/ambiente local capaz de reconstituir os **708 arquivos históricos** de forma privada, sem rede, validando contagens, tamanhos e hashes disponíveis. Distinguir os **24 arquivos sem digest histórico comparável**, que exigem verificação suplementar; não concluir integridade histórica apenas pelo ETag.
3. Restaurar conjuntamente o **dump do banco atual** e as cópias de bytes de Storage no ambiente descartável, reproduzindo os caminhos e buckets originais e verificando a leitura dos anexos para casos reais com autorização apropriada. O SQL de baseline está em `docs/saas/sql/clinical-storage-restore-aggregate-preflight.sql`.
4. Preservar os **quatro registros históricos de anexos cujo case_id aponta a um caso ausente** e o paciente sem clínica associado a agendamento; não corrigir/reassociar por presunção.
5. Ensaiar rollback de dados e publicação em ambiente seguro, revisar isolamento entre empresas e funcionamento crítico de assinatura. **Não executar cobranças de teste reais nem publicar beta sem autorização/evidências P0.**

**Rastreabilidade:** [Issue #241](https://github.com/GustavoFboz/dtfipo/issues/241), [PR #265](https://github.com/GustavoFboz/dtfipo/pull/265), `docs/saas/BETA-RELEASE-8-EXECUTIONS.json`.
