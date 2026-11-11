# DentalFlow — Restauração local e isolada do banco de 04/11

**Escopo restrito:** preparação e teste do banco atualizado **exclusivamente em PostgreSQL oficial do Supabase, descartável e local**, sem usar IA do Lovable, sem enviar dados ao GitHub, sem rede no container, sem Asaas e sem modificar a produção. **Não há restauração integrada de anexos.**

## Ambiente do projeto QA (verificação remota somente leitura, 05/11)

Projeto Lovable QA independente: `5a22f322-be46-40c0-a818-51719663572e`, **não publicado**. Banco conectado em PostgreSQL 17.11, 89 tabelas públicas, 0 usuários auth, 0 pacientes, 0 casos, 0 assinaturas, 0 pagamentos, 0 objetos Storage, 0 jobs `cron.job` e 0 rows em `billing_database_scheduler`. As tabelas `patients`, `cases`, `storage_files`, `case_attachments`, `account_subscriptions` têm RLS. Essas observações **não demonstram isolamento de rede nem comprovam que nenhuma Edge Function herdada possa chamar serviços externos**. Portanto, **não** inserir dump real nem restaurar dados de pacientes no Lovable QA antes de auditoria de egress/secrets e autorização adequada.

## Ferramenta de restauração local (sem dados clínicos no GitHub)

O workflow [DentalFlow Isolated Real DB Restore Tool](../../.github/workflows/saas-local-isolated-db-restore.yml) compila a GUI **DentalFlow-Restauracao-Isolada.exe**. Ela é offline e exige Docker Desktop para o segundo botão. O código é público; o executável é sem assinatura digital. Antes de executá-lo, conferir a origem no GitHub. Não alterar as configurações do banco da IPO.

1. No Windows, mantenha **o pacote CIFRADO do banco atual**, contendo somente `part-001.dfenc` e `catalog.dfenc`, numa pasta privada local. É o pacote que já foi autenticado após o retorno do Drive (**2.439.186 bytes** de origem). **NÃO** escolher a pasta de anexos com 14 partes.
2. Mantenha a **nova chave do banco** (`DentalFlow-Chave-Externa-*.bin`) fora do Google Drive, separada do backup. É diferente da chave dos 14 arquivos de anexos e da chave do índice histórico.
3. Abra **DentalFlow-Restauracao-Isolada.exe**; selecione a pasta cifrada do banco e a chave nova. Pressione **1. Verificar formato do banco**. Esse passo autentica AES-256-GCM, SHA-256 e manifesto e informa se o dump é SQL simples, `PGDMP` ou ZIP de um arquivo de banco, sem gravar plaintext em disco. **Se falhar, não tentar restaurar**.
4. Para tentar a recuperação real do banco, instale/inicie **Docker Desktop**. O programa baixa (se preciso) a imagem oficial `supabase/postgres:17.11.0.018` **antes** de enviar dados; inicia container com `--network none`, **sem portas abertas, sem volumes do host, camada de escrita efêmera para chave de Vault gerada exclusivamente no teste e área de dados `tmpfs` (memória), destruída no final**. O dump é transmitido à entrada de `psql` ou `pg_restore` dentro desse container. Não executa SQL em Supabase/Lovable e destrói o container ao sair, inclusive quando ocorre falha.
5. Marque a autorização de isolamento na GUI e clique **2. Restaurar em Supabase PG isolado**. A versão anterior falhou pela extensão ausente; esta usa o PostgreSQL 17 oficial do Supabase com as seis extensões (`pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`) verificadas por CI. Roles, esquemas e funções adicionais ainda podem provocar falha fechada; nunca apontar a ferramenta para o banco real. A saída não imprime mensagens SQL, nomes, documentos ou falhas com conteúdo clínico.
6. A chave `supabase_vault` criada pelo PostgreSQL isolado é **temporária e diferente da chave do ambiente original**. Esta ferramenta não verifica a descriptografia de segredos Vault antigos, nem restaura webhooks, Auth e Storage como serviços; nunca usar esse ambiente para cobrança real.
7. Se o banco restaurar, o programa retorna somente contagens de pacientes, casos, agendamentos e linhas de metadados Storage. Essas contagens são de diagnóstico; **não comprovam recuperação dos arquivos anexos**, nem de autenticação Supabase/Storage Functions.

## Tratamento seguro de conflitos no backup PGDMP

Na execução anterior, o proprietário obteve o código `DF_RESTORE_OBJECT_CONFLICT`: o PostgreSQL Supabase inicializa estruturas que também constam no backup `PGDMP` completo. A documentação oficial do Supabase destaca que `pg_dump` bruto pode incluir objetos internos que conflitam com uma instância Supabase já preparada.

A partir da versão de diagnóstico de 06/11, **somente para o formato PGDMP e dentro do contêiner descartável**, a importação usa `pg_restore --clean --if-exists --single-transaction --exit-on-error --no-owner --no-privileges`. O programa não disponibiliza endereço ou senha de banco externo, exige `--network none`, sem portas e sem volumes externos, e verifica esses isolamentos por `docker inspect` antes de transmitir o dump. O servidor é iniciado com `cron.launch_active_jobs=off` e o programa confere essa configuração antes de importar qualquer arquivo, impedindo a execução dos agendamentos copiados durante o ensaio. Na limpeza, executa `docker rm -f -v`; nenhuma operação da rotina atinge o Cloud ou a produção.

O CI gera dados **totalmente fictícios**, reproduz conflito de objetos preexistentes em Supabase PostgreSQL 17, e valida importação transacional. Um teste de ponta a ponta gera um PGDMP fictício, protege-o com o mesmo pacote AES-GCM, depois restaura com a ferramenta real em contêiner separado. Esses testes **não** comprovam ainda a recuperação do banco real de 04/11, das funções especiais, dos serviços Auth/Storage, ou dos anexos.

Se qualquer objeto interno não puder ser removido/recriado, se surgir uma dependência ausente, ou se o PostgreSQL rejeitar SQL, a importação aborta e reverte sua transação **somente nesse contêiner**; o resultado é falha fechada. A chave do Vault criada nesse contêiner é efêmera, não substitui a chave original dos segredos, portanto nenhuma função financeira deve ser considerada recuperada ou autorizada.

## Requisitos para concluir de fato a etapa 3/8

- Ter acesso autorizado, **privado**, aos 33 volumes históricos cifrados de 29/10 (592 objetos) e aos 14 arquivos cifrados retornados do Drive (116 objetos), com suas chaves **sem upload ao repositório público**.
- Restaurar as **708 versões** dos quatro buckets históricos e conciliar os **21 exportes históricos extras** por regra de retenção; validar os 24 arquivos sem digest comparável no inventário de origem.
- Restaurar **o banco atual** em ambiente Supabase realmente compatível com Auth, Storage e extensões, e comparar as contagens; verificar abertura de anexos e consistência relacional com casos/usuários.
- Reproduzir o cenário de reversão de forma isolada; assegurar nenhuma chamada a Asaas produção e nenhum job/webhook ativo.
- Submeter evidências agregadas; **somente depois** revisar o aceite 3/8. O beta comercial continua bloqueado.

**Limitações atuais:** a inicialização isolada do PostgreSQL Supabase com seis extensões foi validada em CI com dados fictícios. Não se pode afirmar que o PGDMP real será restaurado até obter o resultado do Windows.  o arquivo novo e a chave estão no Windows/Drive do proprietário, **não estão acessíveis para execução neste ambiente ChatGPT**. A GUI permite executar o ensaio diretamente no dispositivo, sem expor dados. O ensaio sintético do workflow GitHub **usa apenas registros inventados**; não se pode descrevê-lo como uma restauração bem-sucedida da produção.

**Rastreamento:** `docs/saas/BETA-RELEASE-8-EXECUTIONS.json` · [Issue #241](https://github.com/GustavoFboz/dtfipo/issues/241).
