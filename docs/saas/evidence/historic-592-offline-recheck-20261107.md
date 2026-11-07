# DentalFlow — Windows: revisão privada dos 592 anexos históricos

**Estado da etapa 3/8:** 2/8 etapas completas. O backup real de banco de 04/11 foi restaurado em PostgreSQL Supabase isolado (93 pacientes, 86 casos, 8 agendamentos, 702 metadados). O proprietário também executou a leitura privada do pacote cifrado de anexos recuperados e confirmou **116/116 objetos, 14/14 partes AES-GCM, 92 ETag MD5 equivalentes, 24 sem hash histórico comparável, 0 ZIPs/arquivos inválidos**. Essa conferência não prova restauração conjunta.

## Próxima parte: 33 ZIPs antigos, 592 objetos

Foi preparado `DentalFlow-Conferencia-592-Offline.exe`, via GitHub Actions `DentalFlow Historical 592 ZIP Volumes Offline Verification`.

O usuário deve selecionar no próprio Windows:

1. Índice original `DentalFlow_Anexos_2026-10-29_Indice.dfenc`.
2. Chave original `DentalFlow_Chave_2026-10-29.bin`, sem enviar ao GitHub/ChatGPT.
3. **Pasta local com os 33 volumes ZIP originais** nomeados `DentalFlow_Anexos_2026-10-29_Parte_01.zip` ... `Parte_33.zip`. Esses volumes são **diferentes** das 14 partes `part-###.dfenc` que já foram verificadas.

A ferramenta exige 33 ZIPs no diretório selecionado e, por leitura em fluxo, valida SHA-256 dos volumes ZIP, índice e manifestos criptografados, tags AES-GCM de cada objeto, tamanho e SHA-256 do plaintext em memória. Não extrai dados clínicos e não imprime nomes privados. Mostra somente progresso por ZIP e totais. Arquivos ZIP ou objetos com falha não são aceitos, e nenhum arquivo é apagado. Não é necessário Docker.

**Não exigir redownload dos 116 objetos nem nova exportação do banco.** Se os 33 ZIPs não estiverem no Windows, estão também no histórico da Biblioteca do ChatGPT; o proprietário deve identificar um destino privado e suficiente para eventual cópia, sem sobrescrever backups existentes. Não compartilhar chaves, manifesto ou nomes clínicos.

Mesmo com 592/592, a contagem agregada **708/708** indica a cobertura de dois conjuntos historicamente autenticados, e NÃO comprova reconstituição operacional no serviço Storage nem integridade contra origem dos 24 objetos sem digest. **Não declarar etapa 3 aprovada antes do ensaio integrado de banco+Storage e rollback em ambiente isolado.** Nenhuma modificação em produção, Asaas, usuários ou Lovable.

**Nota:** a verificação de permissões POSIX do arquivo de chave não é aplicável no Windows; o programa valida que o arquivo não é symlink e tem exatamente 32 bytes. O usuário deve manter a chave em pasta com permissões NTFS restritas e fora de diretórios sincronizados.

Rastreamento: [issue #241](https://github.com/GustavoFboz/dtfipo/issues/241) e `docs/saas/BETA-RELEASE-8-EXECUTIONS.json`.
