# DentalFlow — Etapa 3/8 em um programa Windows (DF-EID-01)

**Estado:** utilitário em validação técnica de CI; só marcar concluído após **execução no computador privado** e revisão do recibo. Este programa NÃO publica o beta, NÃO executa Asaas e NÃO acessa produção.

## Downloads

1. Programa: GitHub Actions → workflow **DentalFlow Stage 3 Integrated Recovery One-Click EXE** → execução aprovada → **Artifacts → DentalFlow-Etapa3-Integrada-Windows-unsigned**. Extrair o único `DentalFlow-Etapa3-Integrada.exe` do ZIP do GitHub. Ele será unsigned. Verificar origem e checksum exibido no passo de build, nunca desabilitar permanentemente o Windows Defender.
2. [Docker Desktop Windows — site oficial](https://docs.docker.com/desktop/setup/install/windows-install/). Se já está instalado, NÃO reinstale.
3. Com Docker Desktop aberto e internet **ainda conectada**, abrir PowerShell e executar uma vez:
   
   `docker pull supabase/postgres:17.11.0.018`

4. Os backups **não estão no GitHub**: utilizar os que já foram obtidos pelo proprietário; não baixar novamente 592 objetos nem anexar chaves ou prontuários ao chat. Caso algum pacote realmente não esteja no computador, recuperá-lo **somente do cofre/Drive privado de origem**, jamais de um link de GitHub público.

## Preparar os arquivos

Copiar (NÃO mover nem alterar originais) para uma área local privada, fora do Google Drive/OneDrive sincronizado, com disco criptografado. Deixar **as três chaves separadas** dos volumes cifrados e do Drive.

| Seleção no EXE | Selecionar |
| --- | --- |
| 1. Índice histórico | `DentalFlow_Anexos_2026-10-29_Indice.dfenc` que já foi encontrado |
| 2. Chave original | `DentalFlow_Chave_2026-10-29.bin` que já foi encontrado |
| 3. 33 ZIPs históricos | Pasta contendo `DentalFlow_Anexos_2026-10-29_Parte_01.zip` até `Parte_33.zip` (592 objetos preservados) |
| 4. Pacote recuperado | Pasta contendo **`part-001.dfenc` até `part-014.dfenc` e `catalog.dfenc`** (116 objetos; exatamente 15 arquivos) |
| 5. Chave dos 14 | Arquivo privado `.bin` NOVO que foi criado ao criptografar os 13 ZIPs + o item adicional |
| 6. Banco 04/11 | Pasta contendo **somente `part-001.dfenc` e `catalog.dfenc`**, cópia cifrada do banco 04/11 |
| 7. Chave do banco | Arquivo `DentalFlow-Chave-Externa-*.bin` correspondente ao pacote do banco; diferente das outras duas |

**Não misturar** a pasta dos 14 anexos com a pasta do banco que tem 1 parte. Não é necessário buscar o antigo arquivo de backup sem a chave.

## Passo a passo curto

1. Instale/inicie o Docker Desktop e execute o comando acima **uma vez** para armazenar a imagem oficial localmente.
2. Desconecte a internet (o Docker já deve estar funcionando e a imagem baixada). O programa não usa acesso remoto.
3. Execute `DentalFlow-Etapa3-Integrada.exe` e escolha os **sete** itens do quadro.
4. Clique em **Executar ensaio integrado**. O programa restaura o banco em um PostgreSQL Supabase descartável, compara o inventário de metadados com **até 12** anexos reais escolhidos da cópia histórica e da cópia de 116, lê/decodifica somente os selecionados, ensaia reversão e **apaga o contêiner** ao terminar.
5. Se a tela apresentar `SAMPLED_INTEGRATED_OK`, clique em **Salvar recibo sem dados pessoais**.
6. Compartilhe **apenas as contagens e o status** ou o recibo agregado. Não envie índice, chave, caminho, PDF, ZIP, foto, prontuário ou print com informações privadas. Se falhar, informe **apenas o código**.

## O que o programa realmente comprova

- Recuperação operacional **da amostra** de ambos os conjuntos dentro do mesmo ensaio que restaura o banco 04/11 (base conhecida 93 pacientes, 86 casos, 8 agendamentos, 702 metadados).
- Leitura/decodificação real por parser nos formatos disponíveis (imagem, PDF, STL, ZIP). Formato não suportado é indicado sem falsificar abertura.
- Comparação agregada de vínculos presentes em `storage_files` e `case_attachments`, reproduzindo bytes escolhidos no `tmpfs` do contêiner sem portas/mounts/rede; verificação SHA e reversão SQL real. Os originais nunca são alterados.
- Os 24 itens recuperados sem digest histórico **continuam sem prova criptográfica de origem**. Quatro vínculos históricos conhecidos são mantidos, sem relink.

**Limitações importantes:** não replica o serviço Supabase Storage integral nem Auth/Vault, não abre todos os 708 individualmente e não testa acesso pela interface Web com duas contas QA. A etapa 4 usa contas e arquivos **fictícios** separados. O aceite final 3/8 só deve ser atualizado após conferir o recibo e as obrigações restantes pertinentes; o utilitário sozinho **não autoriza beta pago**.

Em caso de erro, nenhuma tentativa automática será feita contra o Cloud. Não recomeçar os 592 testes completos sem discrepância objetiva.
