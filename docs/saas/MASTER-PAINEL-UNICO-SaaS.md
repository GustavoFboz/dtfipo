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

### Como atualizar subetapas antes de fechar uma etapa inteira

Para as etapas **5 e 7**, é possível comprovar uma subetapa individual e **deixar a etapa geral pendente**. No arquivo oficial `docs/saas/BETA-RELEASE-8-EXECUTIONS.json`, acrescentar ao `checkpoint` da etapa pertinente, **somente após revisão da prova real**, uma lista `verified_substeps`. Exemplo artificial de formato (não incluir este exemplo no estado real):

```json
{
  "verified_substeps": [
    {
      "id": "provider-1",
      "evidence": ["https://github.com/GustavoFboz/dtfipo/actions/runs/123456"]
    }
  ]
}
```

Os IDs possíveis para a etapa 5 são `provider-1` a `provider-5` (segundo ciclo, webhook, atraso/retorno, plano/preço e cancelamento/parada). Para a etapa 7 são `hosted-1` a `hosted-4` (QA isolado, versão/autenticação/casos, rollback hospedado, backup/paridade). A etapa 6 atualiza suas decisões `L01` a `L13` a partir do registro jurídico; a etapa 8 atualiza seus oito P0 pelo registro comercial. Links falsos, repetidos ou fora do repositório autorizado são recusados pelo gerador. Os `verified_substeps` devem apontar para recibos agregados sem prontuários, nunca para dados privados ou tokens. **Adicionar o URL não constitui por si só auditoria independente**: revisar o conteúdo primeiro. Só a comprovação de todos os critérios da etapa permite mudar o status geral para `done`.

A subetapa "ensaio local" já é mostrada como **comprovada no próprio escopo local**, mas não substitui a prova em hospedagem ou no Asaas real. O percentual principal continua ligado apenas aos marcos oficiais.

A CI principal executa `--check` e os testes. Se qualquer registro oficial mudou, mas o painel não foi regenerado, a compilação do PR **falha**. Nenhuma rotina dessa atualização consulta Asaas, Lovable, Storage, credenciais ou dados de pacientes. O painel *não é sincronização ao vivo com o GitHub*: mudanças só aparecem aos usuários depois que a versão revisada foi publicada.

A cópia sanitizada não inclui prontuários, nomes de pacientes, CPFs, chaves, URLs assinadas ou anexos. O nível de detalhe exibido resume nomes e estados; links de evidência ficam nos registros administrativos privados/repositório existente.

## Próximas decisões externas

Etapa 5: comprovar um segundo ciclo no Sandbox Asaas, webhook real, worker, ledger e acesso mensal. Etapa 6: avaliar e aprovar a oferta, termos/LGPD, suporte e aceites reais. Etapa 7: validar hospedagem de QA isolada, login, arquivos, SSR, API e rollback integrado. Etapa 8: conferir todos os P0 e obter autorização expressa para liberar o beta por convite.

**PRs draft #290 (proteções jurídicas) e #291 (prova de leitura no Sandbox) são preparações, não implantações.** Nada deste painel modifica o serviço produtivo.
