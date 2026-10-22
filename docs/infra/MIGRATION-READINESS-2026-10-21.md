# DentalFlow — avaliação de migração e independência (21/10/2026)

**Natureza:** proposta técnica SOMENTE DE LEITURA, sem provisionamento, cópia de dados, alterações de DNS, banco ou pagamentos.  
**Código de referência:** `saas/stage-03-asaas-checkout` (não `main`).  
**Objetivo:** permitir sair da hospedagem Lovable/Supabase gerenciada, conservando o DentalFlow, seus dados e os contratos Asaas, com custo mensurável, rollback e zero perda financeira.

## Decisão preliminar

1. **Caminho A — recomendação para protótipo isolado:** publicar a aplicação em hospedagem própria, mantendo temporariamente o backend atual; em segunda fase, clonar o PostgreSQL para uma instalação Supabase *self-hosted* (Auth/GoTrue, PostgREST, Realtime, Storage) em servidor próprio e S3 compatível para arquivos. Permite reaproveitar o SDK `@supabase/supabase-js`, RLS, RPCs e grande parte das regras. **Não elimina o software Supabase**: elimina a dependência da sua hospedagem gerenciada. Requer manutenção operacional e back-ups independentes.
2. **Caminho B — migração para PostgreSQL gerenciado + backend próprio:** maior independência do stack Supabase, porém exigirá substituição controlada de Auth, API REST, Realtime, Storage e funções; custo e risco de engenharia significativamente maiores. Não iniciar enquanto o protocolo SaaS ainda possuir critérios críticos sem aceite.
3. **Caminho C — manter o banco e trocar apenas hospedagem Web/API:** menor risco imediato de implantação e útil para demonstrar independência do Lovable, **mas não** resolve o objetivo de abandonar o Supabase gerenciado.

**Escolha comercial de fornecedor pendente**: VPS, suporte, backups, disponibilidade, tributação, região, latência, renovação e custo total dependem de medidas reais e ofertas contratáveis, não apenas preços promocionais. Uma VPS é ponto de partida para laboratório/piloto, não garantia de alta disponibilidade nem de 10 mil conexões simultâneas.

## Constatações no repositório

- O `package.json` usa `@supabase/supabase-js`; há implementações diferentes para Web, servidor e desktop em `src/integrations/supabase/`.
- Foram observados **138 arquivos** em `supabase/migrations/` e **176 SQLs** em `public/restore/migrations/` na árvore do ramo de referência (contagem estática, não atesta aplicações no banco ativo). Manter ambos e verificar paridade real antes de migrar. Não reaplicar sequencialmente migrations antigas no banco restaurado sem reconciliação do schema.
- **Sete endpoints** de cobrança em `src/routes/api/billing/`: checkout, webhook, worker, documento, renovação, cancelamento e replay.
- `src/lib/billing/asaas-database-scheduler.server.ts` depende das RPCs `billing_configure_database_scheduler` e `billing_database_scheduler_status`, além de detalhes de `pg_net`/PostgREST. Verificar extensões, Vault, cron e rede no novo ambiente; **desabilitar workers financeiros duplicados**.
- `src/components/DesktopRealtimeSync.tsx` utiliza `postgres_changes`; `src/lib/storage.ts` utiliza `supabase.storage` e RPCs de reserva, cota e exclusão. O R2 sozinho **não** substitui autenticação, políticas de acesso, URLs temporárias ou cotas.
- `src/integrations/supabase/client.desktop.ts` implementa identidade offline; novos endpoints e validade local precisam ser compatíveis com builds Windows/Android em circulação.
- O arquivo `.env` versionado contém somente nomes, URL e chaves **publishable** na auditoria pontual; isso não autoriza colocar segredos em repositório, APK ou frontend. Credenciais novas pertencem ao secret manager do servidor.
- `docs/saas/ACCEPTANCE-PROGRESS.md` registra em 21/10 **7/23 aceites integrais**, 16 pendentes e **0/7 etapas fechadas**. Esta migração NÃO muda esse contador.
- `docs/saas/evidence/first-production-payment-20261019.md` registra uma cobrança real em produção (R$ 5) e assinatura ativa; contratos, IDs Asaas, ledger e a trilha de auditoria devem ser preservados. Trata-se de prova histórica, não de nova verificação em tempo real.

## Inventário necessário no backend ativo (AINDA NÃO MEDIDO)

Registrar em relatório privado e sanitizado, sem CPF, dados clínicos ou secrets:

| Grupo | Métrica / evidência | Situação |
| --- | --- | --- |
| PostgreSQL | versão, extensões, tamanho total, tamanho de índices, número de conexões, top queries, RLS, cron, pg_net, Vault | Pendente acesso de leitura e medição |
| Auth | contas, provedores OAuth, configurações MFA/SMTP, tokens e redirects (apenas nomes e contagens) | Pendente |
| Storage | buckets, objetos, bytes, hashes, ACL/policies, multipart/TUS, URLs assinadas históricas | Pendente |
| Asaas | ambientes, IDs persistidos, eventos pendentes/dead letters, cron/worker ativos e health recente | Pendente; não realizar mutações |
| Apps | revisão publicada, URLs efetivas Web/API e versão de Windows/Android em uso | Pendente |
| Rede e experiência | p50/p95/p99 de login, casos, upload e chat; sessões simultâneas, reconexão e timeouts | Pendente |
| Custo | faturas atuais e consumo real por banco/CPU/RAM/storage/banda/requests | Pendente |

**Não guardar um dump, token, log financeiro bruto ou arquivo odontológico no GitHub.** Dump de produção deve ficar criptografado em destino privado, com retenção, acesso mínimo e restauração comprovada.

## Fases e gates

### Fase 0 — auditoria, decisão e orçamento (este documento)
- [x] Identificar branch de referência, principais dependências, fluxos de cobrança e documentação.
- [ ] Medir consumos reais, quantificar dados e RTO/RPO aceitáveis.
- [ ] Comparar ofertas finais (preferir preço de renovação e custos auxiliares) e verificar região/residência de dados, LGPD, contrato e suporte.
- [ ] Identificar instalação pública efetiva e versionamento dos apps; verificar divergências `main` / branch SaaS.
- **Gate:** arquitetura e orçamento aprovados; sem alterações em produção.

### Fase 1 — prova em laboratório isolado
- [ ] Provisionar ambiente **sem dados reais de pacientes**; bloquear endpoints financeiros de produção e todo disparo automático.
- [ ] Restaurar schema de teste com verificação de versão Postgres, extensões, grants/RLS, triggers, functions, cron, Vault e políticas de Storage.
- [ ] Provar Auth, chat Realtime, upload STL, cotas, isolamento entre clínicas e validade offline.
- [ ] Registrar custo, latência e erros; testar backup e restore.
- **Gate:** bateria funcional, isolamento de dados e rollback aprovados.

### Fase 2 — cópia segura (sem cutover)
- [ ] Exportar `roles.sql`, `schema.sql`, `data.sql` usando procedimento oficial documentado pelo Supabase, com armazenamento privado.
- [ ] Testar restauração compatível com versão PostgreSQL e extensões; preservar `auth.users` e hashes das senhas quando possível. Planejar **novo login** se a assinatura JWT mudar; evitar pressupor sessões legadas válidas.
- [ ] Transferir objetos/buckets separadamente para backend S3 compatível, com contagem, tamanho e hash; preservar caminhos e políticas e validar URLs.
- [ ] Validar contagens, chaves estrangeiras, arquivos, usuários, RPCs, acesso por empresa, índices e planos financeiros.
- [ ] Reconfigurar secrets privados, SMTP/OAuth, HTTPS e URLs. Não reutilizar chaves do ambiente gerenciado cegamente.
- **Gate:** ambiente clonado consistente e dados protegidos, ainda sem efetuar cobranças reais.

### Fase 3 — homologação Asaas e paridade dos clientes
- [ ] Usar **Asaas Sandbox** no clone, com credenciais e webhooks próprios. Não criar clientes/assinaturas de Produção nesta fase.
- [ ] Testar webhook autenticado, atraso, duplicatas, eventos fora de ordem, reconciliação, idempotência, cotas e bloqueios.
- [ ] Testar browsers, Windows e Android instalados; sessão expirada, reconexão, desktop offline 72h, versões antigas e links de arquivos.
- [ ] Ensaiar reversão de endpoints sem perda de eventos nem pagamentos.
- **Gate:** zero cobrança duplicada, zero acesso cruzado entre empresas e aceite documentado.

### Fase 4 — transferência e corte controlados
- [ ] Definir janela, comunicação aos clientes e política temporária para escritas, uploads e novas contratações.
- [ ] Fazer sincronização incremental/final consistente com congelamento curto de escritas, conferir eventos pendentes, contagens e hashes.
- [ ] Garantir **exatamente um** processador/cron financeiro ativo e um receptor webhook de Produção autoritativo; trocar URL no Asaas **após** saúde confirmada.
- [ ] Publicar Web/API e entregar novas configurações/versões assinadas de desktop e Android. Revalidar login e renovação das sessões.
- [ ] Manter origem preservada, em modo controlado, durante período de observação. Reconciliação financeira deve decidir rollback; **não** aplicar snapshot antigo sobre pagamentos novos.
- **Gate:** pagamento, entitlement, uploads e eventos estáveis; encerramento somente com autorização explícita.

## Condições de bloqueio (não prosseguir)

- Sem cópia/restauração comprovada de banco e objetos; sem logs sanitizados de diferença.
- Versões de PostgreSQL/GoTrue/Storage/Realtime ou extensões incompatíveis.
- URLs antigas embutidas em instaladores sem estratégia de transição.
- Falta de proteção LGPD, criptografia, backups testados, DNS/HTTPS e monitoramento.
- Workers Asaas simultâneos, idempotência não comprovada, perda de eventos ou divergência de ledger.
- Estado ativo do SaaS não medido ou permissões de clientes comprometidas.

## Fontes primárias

- [Supabase: restaurar projeto gerenciado em self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Supabase: Docker self-hosted, requisitos e serviços](https://supabase.com/docs/guides/self-hosting/docker)
- [Supabase: limitações e responsabilidade do self-hosted](https://supabase.com/docs/guides/self-hosting)
- [Supabase: backend S3/R2 para Storage](https://supabase.com/docs/guides/self-hosting/self-hosted-s3)
- [Cloudflare R2: tarifas, operações e egress](https://developers.cloudflare.com/r2/pricing/)
- [Hostinger: VPS](https://www.hostinger.com/br/servidor-vps)
- [Documentação financeira interna](../saas/ACCEPTANCE-PROGRESS.md)

**Próxima ação recomendada:** levantamento sanitizado do consumo e das extensões reais no backend atual, mais prova em infraestrutura isolada. Não realizar cutover nem troca de provedor só com base nesta inspeção estática.
