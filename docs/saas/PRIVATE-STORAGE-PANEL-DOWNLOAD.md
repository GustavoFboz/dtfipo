# DentalFlow — verificar downloads de ZIP do painel Lovable, em privado

**Estado:** método preparado, nenhum dos 116 objetos de 29/10 foi declarado recuperado por este documento. Etapa **2/8 em execução**, sem alterar o gate comercial, 13/23 aceites formais ou a produção.

## O que a auditoria do inventário autenticado encontrou

| Origem | Subconjunto histórico que ainda falta | Download sugerido |
|---|---:|---|
| case-files | **115 arquivos** | **13 pastas distintas** entre as 76 históricas; ao selecionar todos os arquivos dessas 13 pastas, baixar aproximadamente **120 objetos / 2.711.695.823 bytes históricos** (alguns já copiados; o total atual pode ter mudado) |
| database_export_05_09_26 | **1 arquivo** | Baixar esse único arquivo (773.383 bytes segundo o inventário de 29/10) |
| Total | **116 objetos / 1.968.840.906 bytes ausentes** | Aproximadamente **2,71 GB + 0,77 MB** por UI ao baixar todos os arquivos das 13 pastas e o export separado |

A lista das 13 pastas **não deve entrar neste repositório público**: seu proprietário recebe um roteiro privado com os oito primeiros caracteres de cada pasta, suficientes para distinguir todas as 76 pastas do inventário. Esses identificadores continuam pseudônimos clínicos e não devem ser compartilhados em chats, screenshots públicos ou Issues.

## Fluxo sem créditos da IA do Lovable

1. Entre **pelo painel nativo** do projeto DentalFlow: **Mais → Storage → case-files**. O nome do projeto no editor pode aparecer como “Hello World Starter”, mas confira o projeto e o bucket antes de executar downloads.
2. **Não use o menu das pastas que só oferece Delete.** Abra a pasta especificada no roteiro privado e marque **todos os arquivos daquela pasta**, depois **Download**. A interface confirma seleção múltipla e download ZIP. Faça isso para as **13** pastas, em ordem de tamanho crescente, começando por um lote pequeno.
3. Acesse o bucket database_export_05_09_26, baixe o único arquivo indicado e armazene junto aos ZIPs dos 13 lotes.
4. Guarde os downloads em uma pasta local privada com disco criptografado no Windows — **não** enviar ZIPs clínicos em texto claro ao Google Drive, GitHub, chat, Issues ou artifacts de CI. Não excluir nem renomear objetos do Storage.
5. No GitHub Actions da execução **DentalFlow Private Storage Panel ZIP Verifier**, baixe o artefato **DentalFlow-Verificador-Windows-unsigned** (EXE sem assinatura; conferir a origem GitHub). É um executável **local**, não um serviço web, não acessa internet e não tem dados/credenciais incorporados.
6. Abra o verificador e selecione: (a) o índice criptografado original DentalFlow_Anexos_2026-10-29_Indice.dfenc do cofre privado do usuário, (b) a chave original DentalFlow_Chave_2026-10-29.bin, (c) a pasta com os downloads. Ele só lê e calcula: **116 esperados, quantidade encontrada, MD5 de origem verificado, casos com tamanho+CRC sem MD5, ZIPs inválidos e quantidade ainda ausente**. Não imprime nenhum caminho ou nome de documento e não extrai arquivos.
7. **Só depois da conferência**, cifrar as novas cópias e enviar ao Drive privado, preservando a chave AES fora do Drive. Verificar readback (hash) dos arquivos cifrados. Esse procedimento de ingestão e reconciliação completa será realizado na execução 3/8, não é feito pelo verificador.

### Limitações e segurança

- A verificação apenas por tamanho/nome/CRC para objetos históricos sem ETag MD5 **não demonstra identidade criptográfica com a origem**. A ferramenta separa esses casos; são necessários verificação de versão, reconciliação com Cloud e restauração isolada.
- Um ZIP de seleção múltipla pode ser diferente do ZIP original dos 33 volumes históricos. O programa **não confunde** download de seleção com a cópia já autenticada dos 592 objetos.
- A ferramenta usa somente dados sintéticos na CI; não abre conexões de rede, não altera banco, não acessa Asaas e não publica.
- Como o repositório é público, o workflow **não usa secrets, uploads clínicos, chave AES nem objetos reais**. O EXE é unsigned: um alerta do Windows SmartScreen pode surgir; não desative sua proteção de forma permanente.
- Manter os ZIPs no computador do proprietário com armazenamento criptografado e acesso restrito; não apagar downloads até haver ao menos uma cópia externa íntegra.
- **Gate:** mesmo 116/116 conferidos localmente não encerram 6.2: ainda será preciso juntar banco atualizado + todos os arquivos, restaurar em staging isolado e conferir reversão da versão publicada.

### Alternativa sem EXE

Se Python 3.12 estiver instalado no Windows: instalar o pacote cryptography (versão 42 a 49), depois executar scripts/recovery/verify_panel_downloads.py com três argumentos locais: caminho do índice criptografado, caminho da chave e pasta privada contendo os ZIPs. O relatório contém só contagens. **Nunca compartilhar os três arquivos de entrada com CI pública.**

Relacionado à issue #241 e ao roteiro beta 8 etapas.
