# DentalFlow — verificação privada dos 116 anexos no pacote externo cifrado

**Escopo:** etapa 3/8 do beta, após a restauração REAL do banco atual de 04/11 em Docker isolado (93 pacientes, 86 casos, 8 agendamentos e 702 linhas de metadados Storage). **A restauração do banco não inclui bytes dos anexos.**

## Entrada e comportamento da ferramenta Windows

O workflow [DentalFlow Recovered 116 Encrypted ZIP Readback](../../../.github/workflows/saas-encrypted-116-readback.yml) compila `DentalFlow-Conferencia-116-Offline.exe`. O usuário seleciona no Windows, localmente, **quatro elementos**:

1. `DentalFlow_Anexos_2026-10-29_Indice.dfenc` — índice histórico AES-256-GCM de 29/10;
2. `DentalFlow_Chave_2026-10-29.bin` — chave ORIGINAL para esse índice e para os 33 volumes históricos;
3. pasta `DentalFlow-Cifrado-...` contendo os **14** arquivos `part-001.dfenc` até `part-014.dfenc` e o `catalog.dfenc` autenticados após retorno do Drive;
4. chave **NOVA** `DentalFlow-Chave-Externa-...` usada para criptografar esses 14 downloads. **Não** usar a chave nova do backup de banco, que é outra chave independente.

**Não selecionar** a pasta de 14 partes do banco (que tem apenas `part-001.dfenc` e catálogo), nem enviar arquivos secretos ao GitHub ou ChatGPT. A GUI mostra somente `Selecionado ✓`, sem revelar nomes de arquivos ou caminhos.

O algoritmo primeiro autentica GCM, SHA-256 e tamanho de cada um dos 14 arquivos cifrados do pacote e, após isso, abre um leitor de ZIP de acesso aleatório usando o modo CTR da mesma chave AES (nonce GCM de 96 bits, primeiro bloco contador 2). Lê entradas ZIP em blocos limitados a 1 MiB, sem extrair arquivos, sem criar ZIPs temporários em texto claro, sem conexões de rede e sem alterar o computador além do próprio processo. Entradas com nomes inesperados são ignoradas; tamanhos incorretos, SHA, CRC, GCM, ETag MD5 comparável, partes ausentes e arquivos inválidos provocam falha de verificação.

A saída mostra **apenas**: `116/116` esperados, `14/14` partes cifradas autenticadas, correspondências com ETag MD5, objetos sem digest histórico comparável e quantidade de itens inválidos. Os SHA-256 calculados para cada objeto permanecem somente na memória e não entram em logs/CI.

## O que o teste NÃO prova

- **Não** revalida automaticamente os 592 objetos nos **33 volumes históricos**: essa cópia teve verificação anterior independente; requer nova conferência e presença das cópias para um teste de restauração integrada.
- **Não** comprova que os 24 arquivos sem digest comparável no índice têm os mesmos bytes da origem de 29/10. Eles podem ser lidos e verificados contra o download autenticado, mas ainda precisam de confronto com origem ou evidência temporal confiável.
- **Não** recupera nem monta o serviço Supabase Storage, não abre documentos clínicos em interface DentalFlow, não executa SQL em produção, não testa integração Asaas, autenticação, Vault ou outros objetos criados após 29/10.
- **Não** valida os quatro registros de anexos com vínculo ao caso histórico ausente nem simula rollback da publicação.
- **Não** autoriza publicação, cobrança ou aceite formal. O checkpoint permanece **2/8 concluídas e etapa 3 pendente** até o ensaio real e conjunto de banco + arquivos e reversão.

## Segurança operacional

- Conservar os ZIPs baixados e ambas as cópias cifradas intactas; as chaves original, do pacote de 14 downloads e do banco são **três chaves distintas**.
- Nenhuma chave, backup, nome clínico ou pasta privada deve entrar no repositório público, no ChatGPT ou em artefatos GitHub Actions.
- A compilação Windows é unsigned; conferir o workflow do próprio repositório e não desativar antivírus para instalá-la.
- O Docker não é necessário para esse verificador; ele só entra no próximo ensaio de reconstituição em ambiente descartável.

Rastreamento: [issue #241](https://github.com/GustavoFboz/dtfipo/issues/241) e `docs/saas/BETA-RELEASE-8-EXECUTIONS.json`.
