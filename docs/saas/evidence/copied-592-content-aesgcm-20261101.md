# DentalFlow SaaS 6.2 — autenticação do conteúdo dos 592 objetos preservados

**Checkpoint 01/11/2026.** Validação real de recuperação de conteúdo *sem gravação de arquivo clínico em texto claro*, sem modificar Cloud, Asaas, chaves, contratos ou banco. Os ZIPs e a chave são mantidos privados fora do Git.

## Resultado executado

Após autenticar o índice AES-256-GCM e os 33 ZIPs por SHA-256, foram lidos sequencialmente os 33 manifestos criptografados. Os **592 arquivos de conteúdo .dfenc** incluídos neles foram descriptografados em *streaming*, com autenticação GCM por objeto, hash SHA-256 e contagem de bytes comparados aos recibos do índice original, além de verificar a unicidade de cada par empresa de armazenamento/caminho/versão.

| Controle | Resultado |
| --- | ---: |
| Índice AES-256-GCM autenticado | Sim |
| ZIPs autenticados por SHA-256 | 33/33 |
| Manifestos individuais autenticados | **33/33** |
| Objetos copiados, descriptografados apenas em memória e validados por tamanho e SHA-256 | **592/592** |
| Bytes de conteúdo (não ZIP) com verificação individual | **6.489.242.325** |
| ZIPs com bytes físicos verificados | 6.489.970.080 |
| Conteúdo original extraído para disco em texto claro | **0 arquivos** |
| Objetos ausentes no inventário de 708 | **116** |
| Bytes de conteúdo faltantes | **1.968.840.906** |
| Restauração completa do histórico | **Não** |
| Conciliação com Cloud atual | **Não** |
| Aceite formal 6.2 | **Não** |

Os primeiros volumes tinham duas versões ligeiramente distintas de `part.json`; a conferência considerou corretamente a contagem de arquivos do manifesto criptografado mesmo quando o campo redundante `files` não estava presente no `part.json`. Não tratou diferenças de formato como corrupção.

## Reprodutibilidade técnica sem dados clínicos no Git

Um verificador Python de streaming foi adicionado ao repo em `scripts/recovery/verify-zip-payloads.py`, com testes de payloads falsos sob `tests/recovery/test_verify_zip_payloads.py`. Ele verifica integridade de ZIP e autenticação dos manifestos, descriptografa cada arquivo apenas em memória e confere os hashes sem revelar nomes, caminhos ou dados de pacientes no stdout. Usa `cryptography` e valida permissões restritas da chave.

Com **cópia de backup privada, chave local de modo 0600 e índice autenticado**, o operador autorizado pode executar em cofre isolado:

    python scripts/recovery/verify-zip-payloads.py --index INDICE.dfenc --key CHAVE.bin --volumes DIRETORIO_PRIVADO

A execução real desta rodada foi realizada em cofre local com os 33 volumes já materializados da Biblioteca. A ferramenta versionada mantém o mesmo contrato de autenticação e foi submetida a CI com dados exclusivamente sintéticos. O script nunca imprime identificadores reais.

## O que este resultado NÃO prova

A existência de 592 objetos íntegros e recuperáveis não comprova a integridade dos **116 objetos ausentes**, não prova restauração de todos os arquivos com suas relações clínicas em um destino de recuperação e não valida Auth, Storage, RLS ou pagamentos na base restaurada. A fotografia de 29/10 é histórica e não equivale ao estado atual. Para concluir 6.2 são necessários novos downloads de origem, autenticação de 708 objetos, restauração conjunta e conciliação com o banco e delta do Cloud.

**Nenhuma promoção de 6.2 a aceite integral nem alteração do percentual formal foi feita nesta rodada.**
