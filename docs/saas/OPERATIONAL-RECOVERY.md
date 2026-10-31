# Recuperação operacional de dados e arquivos

Preparação de 28/10/2026, Manaus. O prazo do contrato B não impede este trabalho.
O cancelamento A, a troca B, seus preços, períodos, pagamentos e a janela offline
de 72 horas permanecem preservados. O contador continua **13/23 (56,52%)** até o
aceite operacional descrito abaixo; disponibilizar uma ferramenta não encerra 6.2.

## Rotina implementada

`scripts/operational-recovery.mjs` é uma ferramenta de operação fora do aplicativo.
Não cria rota HTTP, não dá a gestores acesso ao banco global e não altera RLS,
credenciais, MFA, a flag financeira ou o schema publicado.

- Backup: conexão PostgreSQL somente leitura, snapshot `REPEATABLE READ`, cursores
  de 128 linhas; todas as tabelas de `public`, `auth`, `storage` e o histórico
  `supabase_migrations`, quando existente. Inclui dados clínicos, ledger, preços
  por período, auditoria, identidades, metadados de arquivos e sequências.
- Bytes dos objetos: GET autenticado do Storage, um arquivo por vez, intervalo
  padrão de 250 ms, prazo de 120 s por objeto, sem redirecionamento ou repetição.
  Há também adapter de arquivos locais para uma cópia já existente e para o CI.
- Cada entrada é criptografada com AES-256-GCM, nonce independente e nome
  autenticado; diretório `0700`, arquivos `0600`. Chave de 32 bytes em arquivo
  privado separado. Tabelas e objetos são processados em fluxo.
- O manifesto criptografado só é concluído depois de copiar todos os objetos,
  comparar tamanho e confirmar que o catálogo de objetos não mudou. Reservas
  pendentes, multipart uploads e referências `ready` quebradas interrompem a
  cópia. Falha remove somente o diretório que esta execução acabou de criar.
- `verify` autentica todas as entradas e compara SHA-256 e tamanho, sem banco.
- `restore` autentica tudo antes de conectar ao destino. Exige banco em
  `127.0.0.1`, nome `dentalflow_recovery_*`, marcador privado de uso único,
  ausência de usuários/pacientes/casos/assinaturas/objetos e nenhum cron ativo.
  Exige schema e sequências compatíveis, além do mesmo SQL consolidado.
- Restauração em transação única: tabelas, valores originais, sequência de
  próximos IDs e validação explícita de todas as chaves estrangeiras. Compara
  cada contagem e SHA-256. JSON financeiro permanece texto PostgreSQL para não
  perder precisão de `bigint` no JavaScript. Colunas geradas são recalculadas.
- Arquivos são recuperados num diretório privado novo com os mesmos caminhos
  bucket/objeto; cada byte é conferido. Uma falha de validação faz rollback do
  banco e remove somente esses arquivos recém-preparados. O marcador do banco
  impede repetir uma restauração sobre um destino já utilizado.

## Escopo do destino

O destino oferecido por esta rotina é **PostgreSQL local isolado + arquivos em
cofre offline**. Ela não publica um novo DentalFlow e não fornece uma instância
ativa de Auth/Storage. Não configura segredos externos nem copia/ativa `cron`,
`net` ou Vault. O registro do agendador em `public` é preservado como dado, mas
não há job, segredo ou runtime executando-o no destino.

Credenciais e fatores no banco são material sensível mesmo em backup: o pacote
e sua chave ficam separados; nunca em Git, logs ou artefatos do GitHub. Para
voltar a servir tráfego, preparar Auth/Storage e configurações do ambiente,
segredos e chaves de criptografia aplicáveis, política de revogação de sessões,
testes autenticados e uma decisão explícita de retomada. Este comando não
autoriza iniciar processamento financeiro numa cópia do ledger.

Não há transação distribuída entre PostgreSQL e filesystem. Antes do commit,
uma falha tratada reverte os dados e remove a preparação. Encerramento abrupto
exige conferir o marcador privado e descartar/conferir o diretório incompleto.
`RECOVERY-VERIFIED.json` só é escrito após commit; se sua gravação falhar, o
comando informa `RECOVERY_COMMITTED_RECEIPT_WRITE_FAILED` e preserva os dados e
arquivos já restaurados para inspeção. Não repetir a restauração no mesmo banco.

## Operação

Executar num host Linux privado com Node 22, dependência `postgres` do projeto e
acesso administrativo ao banco de origem. A API de consultas do conector não
substitui uma conexão PostgreSQL consistente e duradoura. Não foi obtida nem
copiada uma credencial desse banco para o workspace.

Variáveis da operação, fornecidas pelo operador fora de logs/Git:

| Variável | Uso |
| --- | --- |
| `DENTALFLOW_RECOVERY_KEY_FILE` | Arquivo privado contendo exatamente 32 bytes aleatórios. |
| `DENTALFLOW_RECOVERY_SOURCE_DB_URL` | Conexão PostgreSQL da origem, com TLS quando remota; cliente impõe somente leitura. |
| `DENTALFLOW_RECOVERY_STORAGE_URL` | Origem HTTPS do Storage correspondente ao banco. |
| `DENTALFLOW_RECOVERY_STORAGE_KEY` | Chave do servidor para baixar os objetos, nunca no navegador. |
| `DENTALFLOW_RECOVERY_SOURCE_FILES` | Alternativa explícita para uma cópia local prévia, em `bucket/caminho`. |
| `DENTALFLOW_RECOVERY_SCHEMA_FILE` | SQL consolidado compatível; padrão `public/restore.sql`. |
| `DENTALFLOW_RECOVERY_REVISION` | SHA do código correspondente ao schema. |
| `DENTALFLOW_RECOVERY_INTERVAL_MS` | Intervalo entre objetos; padrão 250. |
| `DENTALFLOW_RECOVERY_TARGET_DB_URL` | Banco local novo com nome `dentalflow_recovery_*`. |
| `DENTALFLOW_RECOVERY_GUARD_TOKEN` | Token privado de 64 caracteres hexadecimais para o destino. |

```bash
node scripts/operational-recovery.mjs backup /destino/privado/copia-nova
node scripts/operational-recovery.mjs verify /destino/privado/copia-nova
node scripts/operational-recovery.mjs restore /destino/privado/copia-nova /destino/privado/arquivos-novos
```

Provisionar o Supabase PostgreSQL isolado, aplicar as mesmas migrations/restore
e criar o banco com nome de recuperação antes da restauração. Manter o banco
`postgres` que os serviços internos do Supabase usam; o CI clona sua estrutura
inicial num banco separado, com dados clínicos vazios e sem jobs ativos. O operador cria no destino o schema
`recovery_guard`, sem acesso de clientes, e a tabela `destination(singleton
boolean primary key check(singleton), mode text not null, token_hash text not
null)`. Inserir uma linha `true`, `isolated-offline-no-runtime` e SHA-256 do token
privado do destino. A ferramenta não cria esse marcador automaticamente numa
conexão arbitrária. Não usar um túnel para a origem como destino.

Reter a cópia criptografada e a chave separadamente em locais aprovados, registrar
data/revisão/recibo e conferir espaço/egresso antes da cópia integral. Não agendar
cópias automaticamente: esta entrega fornece execução manual controlada.

## Ensaio e aceite 6.2

O workflow `saas-operational-recovery.yml` usa dois bancos Supabase descartáveis,
schema real, duas empresas fictícias, pacientes, casos, contratos/pagamentos e
arquivos reais (UTF-8, binário de mais de 2 MiB e vazio). O backup é efetivamente
criptografado e recuperado. Uma referência de paciente é quebrada **depois** dos
inserts para exigir rollback verdadeiro; depois ocorre restauração íntegra.
Nenhum dado clínico real, credencial Cloud ou pagamento Asaas entra nesse CI.

O recibo sanitizado informa explicitamente que o Storage API Cloud e a recuperação
de Produção não foram aceitos. Esses limites são preservados mesmo se o CI passar.
Para encerrar 6.2, falta executar e conferir uma cópia operacional do ambiente
autorizado, recuperar dados e arquivos no destino isolado, validar referências,
acesso e o plano de retomada/rollback, e registrar cobertura, volume e duração
medidos. O ensaio de CI fornece regressão e prova da rotina, não prova de cópia
integral dos **701 arquivos / 8.374.117.446 bytes** observados na origem em 28/10.

Referências oficiais consultadas:

- [Supabase — backups](https://supabase.com/docs/guides/platform/backups): cópias
  do banco não incluem os bytes dos objetos do Storage.
- [Supabase — backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore): banco,
  objetos, configurações e chaves de criptografia têm etapas próprias.

## Prova executada em 28/10, 22h50 Manaus

O [ensaio 40808635407](https://github.com/GustavoFboz/dtfipo/actions/runs/40808635407)
passou **16/16 verificações**, recuperando **158 tabelas, 269 registros e três
arquivos reais (2.097.208 bytes)** em destinos descartáveis. Foram verificadas
268 chaves estrangeiras, precisão de bigint/colunas geradas, sequências, ledger
e preço futuro programado sem ativação antecipada. Falha de vínculo e término
real da conexão PostgreSQL produziram rollback; uma recuperação íntegra passou
em seguida. O tempo de 7.214 ms é do ensaio pequeno, não previsão para a origem.

Transações usam conexão explicitamente reservada, conferência de geração e
recusa de continuar após desconexão. O teste cobre a queda real do backend e a
não reconexão durante uma operação parcial; a versão do driver do aplicativo
não foi alterada. Ver [recibo e limites](evidence/operational-recovery-20261028.md).

No Cloud, foram observados 14 backups diários e a opção nativa Export data.
A abertura da exportação excedeu o prazo do navegador; não há confirmação das
etapas Export/Start export nem de download novo. O único objeto de exportação
identificado por metadados é de 05/09 UTC, anterior a esta implementação.
O navegador e o ambiente de execução ficaram indisponíveis nesta rodada.
Não restaurar um backup sobre o ambiente ativo para contornar essa limitação.
A exportação nativa do banco e os arquivos separados continuam como caminho
para a cópia real; não é necessário esperar pela vigência financeira de B.

Referência atual do fornecedor: [Lovable — backups e exportação](https://docs.lovable.dev/features/database-backups).
O export nativo contém estrutura e dados, incluindo contas/hashes de senha;
não inclui arquivos, segredos ou configurações de autenticação. A documentação
informa um export a cada 24 horas; nenhuma solicitação concluída foi presumida.
