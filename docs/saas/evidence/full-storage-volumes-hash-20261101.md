# DentalFlow SaaS 6.2 — auditoria real de 33/33 ZIPs históricos

**Checkpoint:** 01/11/2026 — leitura exclusivamente local de arquivos privados já existentes na Biblioteca, sem acesso de escrita ao Cloud nem ao Asaas.

## Provas executadas nesta rodada

Foi materializada uma cópia temporária dos 33 volumes históricos de 29/10. O índice `DFREC001` foi **autenticado e descriptografado localmente com AES-256-GCM e chave privada externa ao Git**. A chave e os nomes de objetos clínicos não foram transcritos para relatório, teste, mensagem ou commit. Os 33 ZIPs foram lidos em streaming, um por vez, e confrontados com tamanho e SHA-256 declarados nas 33 entradas do índice autenticado. Nenhum ZIP foi aberto para divulgação de dados de pacientes.

| Controle | Resultado |
| --- | ---: |
| Índice histórico autenticado | Sim |
| Volumes ZIP declarados | 33 |
| Volumes ZIP encontrados, sem symlink, com tamanho e SHA-256 corretos | **33/33** |
| Bytes totais de ZIP validados | **6.489.970.080** |
| Volumes com SHA divergente | **0** |
| Objetos declarados no inventário congelado | 708 |
| Objetos com recibo no índice | 592 |
| Objetos ainda ausentes | **116** |
| Bytes de objetos faltantes | **1.968.840.906** |
| Cópia histórica integral | **NÃO** |
| Restauração integral de todos os bytes e do banco, com Auth/Storage | **NÃO** |
| Conciliação de mudanças recentes do Cloud | **NÃO** |
| Aceite formal 6.2 | **PENDENTE** |

**Importante:** 6.489.970.080 é o número de bytes dos contêineres ZIP, e não o campo `index.bytes_verified`, nem a quantidade de bytes de conteúdo clínico. Não confundir metadados ZIP com tamanhos de objetos.

Esta verificação vai além da auditoria somente por nome/tamanho da Biblioteca, pois calcula os 33 SHA-256 **reais dos arquivos físicos** e os confronta com o índice autenticado. Ela **não** prova que todos os arquivos dentro dos ZIPs foram restaurados individualmente, que seus vínculos clínicos foram conferidos, ou que os 116 objetos faltantes foram baixados.

## Como reproduzir, de forma privada

Com os 33 volumes preservados, o índice criptografado e a chave privada **fora do Git**, executar:

    node scripts/recovery/audit-external-copy.mjs INDICE.dfenc CHAVE.bin DIRETORIO_PRIVADO_DOS_33_ZIPS

A ferramenta lê sequencialmente cada ZIP com SHA-256. A saída é somente um resumo de contagens/fingerprints, sem caminhos clínicos, chaves, hashes individuais ou conteúdo sensível. O script já existia; nesta rodada sua auditoria de **todos** os ZIPs privados foi executada. Os dados temporários da recuperação estão restritos a diretório local privado.

O contrato continua `operational_acceptance=false`. O avanço físico de integridade deve ser um gate técnico parcial próprio e **não autoriza marcar `storage-full-copy`, `full-isolated-recovery` ou `current-runtime-reconciliation` como concluídos**.

## Próximo bloqueio real

Retomar da cópia congelada de 29/10: os **116 objetos faltantes** e aproximadamente 1,97 GB precisam ser adquiridos da fonte com autorização, autenticados, inseridos em novos volumes criptografados e adicionados ao índice somente após conferência. Respeitar até quatro por lote e apenas uma transferência de origem de cada vez. Não alterar o Cloud nem apagar objetos originais. Depois, restaurar todo o conjunto em destino isolado, reconciliar com banco e com delta atual e comprovar rollback/recuperação sem executar cobrança real.

A conclusão de 6.2 ainda exigirá novo recibo e análise independente. **13/23 aceites formais permanecem.**
