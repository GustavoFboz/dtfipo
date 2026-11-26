# DentalFlow — etapa 4/8: avanço seguro em 09/11/2026

**Estado:** CI de banco restaurado com dados **100% fictícios**, sem homologação autenticada pela interface Web. Etapa 4 continua pendente no contador beta.

## Ambiente QA independente

- Projeto remix `DentalFlow - Beta Web QA Isolado 20261102`, ainda **não publicado**; Lovable informa `get_database_status.enabled=true`.
- Tentativa **SELECT somente leitura** `current_database(), current_setting('server_version')` devolveu `400 query_error: Database is possibly not accessible at the moment`.
- Histórico de mensagens do próprio remix registra orientação explícita para **não inserir dados, executar migrations, atualizar/copiar secrets, ativar cron/webhook, usar Asaas nem publicar** antes de comprovar isolamento e revisar possíveis variáveis de faturamento herdadas. Esta orientação é mantida.
- **Não** usar banco IPO/produção nem criar contas de teste nesse remix até poder confirmar a origem isolada e a ausência/neutralização de integrações de cobrança. Nada foi alterado no QA ou na produção nesta rodada.

## O que podemos provar já, sem QA real

- O script existente `docs/saas/sql/staging-63-fixture-journal.sql` usa duas empresas/duas identidades SQL sintéticas, quatro pacientes, quatro casos e RLS, tudo dentro de `BEGIN/ROLLBACK` no banco Supabase descartável do CI.
- [PR #270](https://github.com/GustavoFboz/dtfipo/pull/270) verificou leituras, edições próprias e rejeição de edição em casos da outra empresa. [PR #271](https://github.com/GustavoFboz/dtfipo/pull/271) preparou validação HTTP de duas sessões autenticadas, mas **não a executou com tokens reais**.
- Novo ensaio adiciona **dois metadados de anexos totalmente artificiais** (`case_attachments`, uma associação por empresa) para provar que o papel A vê apenas o próprio e não apaga o do B; papel B deve repetir a prova no sentido inverso. As duas linhas devem permanecer e serão desfeitas pelo `ROLLBACK`.
- Esse teste de `case_attachments` não insere **bytes reais** em Supabase Storage nem prova download, URLs assinadas, upload ou exclusão efetiva de arquivos. Os testes autenticados de Storage já preparados em `src/lib/qa/fixture-storage.server.ts` exigem ambiente seguro separado, não autorizam produzir/anexar dados de pacientes.
- O CI do restore exige um marcador agregado de sucesso e não armazena caminhos, nomes de pacientes ou chaves.

## Próximo aceite indispensável da etapa 4

1. Auditar em modo leitura o isolamento do remix, URLs cliente/backend e ausências de segredos/cron/webhook de produção, **sem exibir valores**; reparar acesso ao banco QA sem copiar produção e somente com autorização pertinente.
2. Preparar duas empresas e contas *inteiramente fictícias* em ambiente QA auditado; testar CREATE/OPEN/EDIT, anexos e isolamento com **JWTs reais de cada usuário** e controles positivos para os dois.
3. Registrar resultados por operação, negar acesso cruzado em todas elas, garantir limpeza das fixtures, não alterar nenhum prontuário da IPO; só então decidir `step4=done`.

**Permanece em 3/8**, beta comercial e pagamentos ainda bloqueados. Esta rodada não aciona Asaas, Lovable AI ou deploy.
