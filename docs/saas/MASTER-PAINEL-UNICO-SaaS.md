# DentalFlow — painel único do Protocolo SaaS

**Revisado em 11/11/2026. Esta mudança está em PR draft e NÃO foi publicada.**

## Um percentual principal, sem misturar métricas

O **único percentual destacado na interface Master** é calculado diretamente dos **oito marcos oficiais do caminho até o beta Web pago por convite**:

`100 × etapas com status done ÷ 8`

Checkpoint atual: **4/8 = 50%**. O percentual **não** mede esforço por linhas de código, não herda a antiga métrica técnica de 94,06% e não equivale à autorização de vendas.

Ainda no mesmo painel, mas **somente em contagens, sem outras porcentagens**:

- **13/23** aceites formais do protocolo SaaS completo, inclusive Android, Windows, operações e estados financeiros além do beta.
- **18/23** frentes sem lacuna técnica interna registrada na fotografia de 01/11; o número é histórico e **não** conclui validações externas.
- **0/8** requisitos P0 de lançamento pago com aceite independente.
- **0/13** decisões jurídicas LGPD/comerciais aprovadas.

As oito etapas podem avançar **fora da ordem**, mas a etapa 8 nunca pode ser marcada como concluída enquanto houver outra etapa, P0, aprovação ou publicação pendente.

## Organização da interface

1. Cabeçalho compacto com **um único percentual grande**, barra discreta, contador de marcos e status “Beta não publicado”.
2. “Próximos avanços”: as três primeiras etapas ainda pendentes e a ação mais próxima de concluí-las, sem prometer data.
3. Oito etapas em painéis expansíveis com suas **subetapas**, diferenciando:
   - **Comprovada:** aceite limitado registrado ou verificação formal concreta;
   - **Preparada:** código/minuta/teste local existente, ainda sem homologação real;
   - **A validar:** depende de evidência externa ou decisão.
4. Protocolo SaaS completo: sete grupos, todos os **23 critérios originais**, subverificações concluídas/pendentes e status individual. Nada é descartado por ter sido adiado para depois do beta.
5. Rodapé com data e informação clara de que a interface **não bloqueia tecnicamente** pagamentos: os controles de cobrança operam no backend, fora do componente.

## Fonte única e atualização a cada rodada

O painel do frontend lê **somente** `src/data/saas-master-launch-panel.json`, uma cópia pública sanitizada e gerada com base nos **cinco registros revisados**:

- `docs/saas/BETA-RELEASE-8-EXECUTIONS.json` — etapas 1–8 e respectivas evidências;
- `docs/saas/IMPLEMENTATION-PROGRESS.json` — 23 critérios e seus gates;
- `src/data/saas-protocol-progress.json` — fotografia técnica, separada do percentual principal;
- `docs/saas/PAID-BETA-READINESS.json` — oito travas obrigatórias P0;
- `docs/saas/legal/BETA6-LEGAL-APPROVAL-REGISTER.json` — 13 decisões e aprovações legítimas.

**Ao fim de toda rodada de implementação**, o executor deve: (a) registrar a evidência real nos documentos pertinentes sem inventar aprovações, (b) executar os comandos abaixo, (c) enviar ambos os arquivos alterados no mesmo PR, (d) aguardar CI e revisão e (e) publicar o código **somente após liberação operacional**.

```bash
node scripts/saas-build-master-dashboard.mjs --write
node scripts/saas-build-master-dashboard.mjs --check
node --test scripts/saas-master-dashboard-consistency.test.mjs
```

A CI principal executa `--check` e os testes. Se qualquer registro oficial mudou, mas o painel não foi regenerado, a compilação do PR **falha**. Nenhuma rotina dessa atualização consulta Asaas, Lovable, Storage, credenciais ou dados de pacientes. O painel *não é sincronização ao vivo com o GitHub*: mudanças só aparecem aos usuários depois que a versão revisada foi publicada.

A cópia sanitizada não inclui prontuários, nomes de pacientes, CPFs, chaves, URLs assinadas ou anexos. O nível de detalhe exibido resume nomes e estados; links de evidência ficam nos registros administrativos privados/repositório existente.

## Próximas decisões externas

Etapa 5: comprovar um segundo ciclo no Sandbox Asaas, webhook real, worker, ledger e acesso mensal. Etapa 6: avaliar e aprovar a oferta, termos/LGPD, suporte e aceites reais. Etapa 7: validar hospedagem de QA isolada, login, arquivos, SSR, API e rollback integrado. Etapa 8: conferir todos os P0 e obter autorização expressa para liberar o beta por convite.

**PRs draft #290 (proteções jurídicas) e #291 (prova de leitura no Sandbox) são preparações, não implantações.** Nada deste painel modifica o serviço produtivo.
