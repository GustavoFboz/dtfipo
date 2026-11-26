# Recuperação cifrada dos 116 objetos ausentes — execução privada

Escopo: somente a diferença autenticada do inventário do Storage de 29/10/2026. O programa `scripts/recovery/download-missing-objects.mjs` consome a lista criptografada criada por `scripts/recovery/prepare-storage-resume.mjs` e uma credencial **servidor** do Supabase, em um host privado. Não acessa o banco, não publica nada, não modifica os objetos originais nem muda assinaturas.

## Antes de executar
1. Manter a chave AES fora do Git, em arquivo `0600`; diretório privado `0700`.
2. Obter acesso autenticado ao Storage original com permissão de leitura autorizada; fornecer `DENTALFLOW_RECOVERY_STORAGE_URL` (HTTPS exato da instância) e `DENTALFLOW_RECOVERY_STORAGE_KEY` somente via ambiente privado. Nunca expor a chave em browser, chat, logs ou workflow CI.
3. Garantir pelo menos 2,5 GB de espaço disponível, além dos 33 volumes históricos separados e de uma cópia consistente atual do banco.
4. Confirmar que o índice privado de 29/10 tem **708** objetos, **592** recibos íntegros e **116** pendentes, **1.968.840.906 bytes**. A lista deve ter 29 lotes, até quatro objetos por lote.

```bash
node scripts/recovery/prepare-storage-resume.mjs INDICE.dfenc CHAVE.bin RETOMADA.dfenc
node scripts/recovery/download-missing-objects.mjs RETOMADA.dfenc CHAVE.bin /cofre/privado/116
```

Os downloads são sequenciais; um GET por arquivo, intervalo mínimo de 200 ms e timeout de 120 segundos. O conteúdo é cifrado diretamente em disco com AES-256-GCM por objeto (SHA-256 e tamanho no recibo criptografado). Se existir ETag na forma MD5, é validado. Nenhuma linha contém nome/path do objeto em texto claro. Uma execução interrompida pode ser retomada com a mesma lista e pasta, mas pares incompletos falham fechados para revisão manual — nunca sobrescreve objetos protegidos.

**Atenção: obter os 116 arquivos não basta para encerrar 6.2.** Após o download, conferir as versões/ETags atuais em SQL de leitura, validar todos os 708 bytes, reconstituir objeto e metadado na cópia isolada, conciliar o banco atual/exports posteriores, restaurar os anexos e testar o retorno. A ferramenta retorna sempre `source_catalog_reconciled=false`, `integrated_database_storage_restore_verified=false` e `operational_acceptance=false` mesmo após completar os arquivos; os recibos só podem ser elevados após comprovação externa. Testes CI usam exclusivamente conteúdo fictício, não dados clínicos.

**Estado 02/11:** índice/manifesto privados foram autenticados e derivados, mas **nenhum dos 116 bytes foi baixado nesta rodada** por falta de conexão de leitura de objetos no ambiente do executor ChatGPT. O conector SQL não é substituto da credencial autorizada do Storage. Nenhum arquivo, chave ou índice privado é incluído nesta PR.
