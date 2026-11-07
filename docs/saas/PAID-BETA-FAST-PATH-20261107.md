# DentalFlow — beta pago por convite: plano de liberação sem auditoria redundante

**Revisão:** 07/11/2026. **Escopo:** preservar dados clínicos e Asaas, acelerar testes P0 sem declarar aceite prematuro. Não autoriza produção, publicação ou cobrança.

## Evidências que não serão refeitas sem indício de falha

- **Banco:** PGDMP de 04/11 exportado, autenticado e restaurado em PostgreSQL Supabase isolado: **93 pacientes, 86 casos, 8 agendamentos, 702 registros Storage**. Contêiner destruído ao final.
- **592 históricos de 29/10:** volumes criptografados já autenticados em verificação anterior com SHA-256/GCM, com índice original. Revalidar os 33 ZIPs integralmente é **opcional**, somente mediante erro/alteração/perda material; não é condição de release.
- **116 recuperados:** 14/14 partes AES-256-GCM autenticadas e 116/116 objetos legíveis em conferência local de 07/11; 92 correspondem aos ETag MD5, 24 não possuem hash original comparável. **Não afirmar equivalência criptográfica de origem dos 24.**
- **Inventário:** 708/708 objetos nos 4 buckets do snapshot histórico já reconciliados por metadados. Metadados não são validação de leitura/funcionamento de arquivos no novo sistema.

## Trabalho mínimo que ainda impede o lançamento

| Frente | Validação essencial | Critério |
|---|---|---|
| Recuperação operacional (etapa 3) | Em ambiente offline/QA isolado, demonstrar reconstituição e leitura de arquivos **representativos dos dois conjuntos** (592 + 116), suas permissões/caminhos e vínculos com o banco restaurado; preservar o snapshot e executar falha/reversão | Dados intactos; acesso por caso/titular correto; nenhum processo ou chamada financeira habilitado; não extrapolar a amostra para garantir todos os 708 bytes |
| Casos e segurança entre empresas (etapa 4) | Criar, abrir e editar caso usando contas fictícias de 2 empresas; negar troca de empresa e acesso cruzado; conferir RLS e anexos | Zero acesso não autorizado; sem corrupção de registros |
| Asaas (etapa 5) | Ciclo de assinatura completo com fixtures/Webhooks de sandbox: plano/valor, cobrança simulada, renovação, cancelamento, inadimplência, reativação, idempotência e bloqueio | Nenhuma cobrança duplicada e nenhum usuário não autorizado ativo; teste em produção só se escopo de operação real explicitamente aprovado |
| Privacidade e aceite (etapa 6) | Termos/privacidade reais aprovados; aceite versionado; logs sem PHI; canal suporte e convites limitados | Regras contratuais e LGPD tratadas antes de aceitar dados reais de beta testers |
| Deploy e rollback (etapa 7) | Verificar SHA servido, versão Web e backend; abortar deploy se ambiente/segredos/schedulers divergem; simular rollback de publicação | Reversão confiável e identificada sem prejudicar clientes reais |
| Publicação (etapa 8) | Reunir evidências dos 8 P0 do `PAID-BETA-READINESS.json`, aprovação operacional específica e smoke pós-deploy | Vendas por convite autorizadas explicitamente, nunca presumidas |

**Ensaio posterior já protocolado:** [DF-EID-01 — Recuperação integrada direcionada, abertura dos anexos, autorização e rollback](./PROTOCOL-INTEGRATED-TARGETED-ATTACHMENTS-DF-EID-01.md). Estado: **preparado, não executado**; reusa os backups já conferidos, prova funcionamento na amostra, não afirma leitura individual dos 708 arquivos.

**Sequência paralela:** não aguardar a etapa 3 terminar para começar testes sintéticos de casos, Asaas, termos, logging ou plano de rollback. Registrar resultados separados; não transformar porcentagem técnica em aprovação comercial. Repetir teste já aprovado somente se houver mudança relevante de código/infra/dados que o invalide.

**Risco residual explícito:** a amostragem de Storage é teste operacional, não atestado de recuperação byte a byte dos 708 objetos. Se um arquivo específico falhar em beta, interromper novos convites, preservar dados e usar o backup para recuperação controlada. Antes do primeiro tester real, o plano de resposta ao incidente e cópia restaurável devem estar disponíveis.

**Situação atual:** 2/8 etapas formalmente concluídas. Nenhum dos oito P0 é marcado como aprovado sem sua evidência concreta. PR opcional de nova auditoria dos 592 volumes encerrada sem merge: [#268](https://github.com/GustavoFboz/dtfipo/pull/268). O código permanece recuperável no GitHub, caso surja motivo objetivo para nova verificação.

**Rastreamento:** [Issue #241](https://github.com/GustavoFboz/dtfipo/issues/241), `docs/saas/BETA-RELEASE-8-EXECUTIONS.json`, `docs/saas/PAID-BETA-READINESS.json`.
