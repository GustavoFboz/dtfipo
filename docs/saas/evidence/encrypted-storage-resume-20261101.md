# DentalFlow SaaS 6.2 — plano criptografado de retomada dos 116 objetos

**Data:** 01/11/2026. **Resultado:** lista privada de retomada gerada e autenticada, sem baixar objetos e sem alterar Produção.

Após validação física de 33/33 ZIPs de 29/10 (SHA-256 válido em todos), o índice AES-256-GCM privado foi reaberto localmente, com chave mantida fora do Git. Foi extraída **somente em memória** a diferença entre o inventário congelado e os recibos de preservação, para preparar um arquivo de trabalho **criptografado e autenticado**. Seu conteúdo não está neste repositório.

| Controle | Resultado |
| --- | ---: |
| Índice autenticado | Sim |
| Objetos inventariados | 708 |
| Recibos de arquivos preservados | 592 |
| Pendentes com versão e tamanho no índice | **116** |
| Bytes pendentes | **1.968.840.906** |
| Lotes privados preparados | **29** |
| Objetos por lote | Máximo de 4 |
| Download da origem nesta rodada | **0** |
| Conteúdo clínico, nomes de objetos e chave no Git | **Nenhum** |
| Aceite 6.2 | **Não concluído** |

O arquivo privado de retomada `DentalFlow_Retomada_116_2026-11-01.dfenc` foi escrito no espaço de recuperação temporário, com permissões restritas (0600) e criptografia AES-256-GCM autenticada. Não apresenta nomes ou dados clínicos em texto claro no disco. Não será publicado em Git, incluído em logs de CI ou entregue como arquivo público.

### Código reproduzível

O novo `scripts/recovery/prepare-storage-resume.mjs` valida a autenticidade do índice, checa duplicidade, contagens/versões e deriva até quatro objetos por lote. Rejeita sobrescrita do arquivo de saída e não faz rede. O relatório de execução expõe **apenas contagens** e sempre define `downloaded_objects=0` e `operational_acceptance=false`. Testes sintéticos garantem que o arquivo de retomada realmente está criptografado e que adulterações de índice/recibo ou lotes acima do limite não são aceitos.

Uso seguro, somente onde os arquivos privados estiverem disponíveis:

    node scripts/recovery/prepare-storage-resume.mjs INDICE.dfenc CHAVE.bin SAIDA_PRIVADA.dfenc

### Próxima dependência externa

Para converter os lotes em um backup realmente completo, cada objeto deve ser recuperado por **acesso autorizado de leitura ao Storage original** (e não pela consulta SQL de metadados), preservando versão/ETag/tamanho e SHA-256. Transferências devem ser sequenciais na origem, até quatro objetos organizados por lote, com verificação criptográfica, retomada por recibo e sem substituir objetos existentes. A origem não pôde ser acessada para downloads nesta rodada: as integrações atuais expõem SQL e metadados, não os bytes do Storage.

Depois disso, validar TODOS os bytes e relações em ambiente isolado; reconciliar o estado atual do Cloud e confirmar o plano de incidente/rollback. O recibo de preparação não deve ser contado como cópia, e o marco `storage-full-copy` permanece **incompleto**. O índice técnico e os 13/23 aceites formais não mudam por gerar esta lista.
