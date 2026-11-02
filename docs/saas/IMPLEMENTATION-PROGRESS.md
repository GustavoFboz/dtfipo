# DentalFlow — avanço técnico do aceite versionado (02/11/2026)

**Indicador único de implementação para beta: 94,06%.** O banco de restauração descartável aprovou o ensaio de um contrato de documentos por versão: corpo SHA-256 imutável, aprovação obrigatória para publicação, função RPC com autenticação e propriedade da clínica, recibo idempotente e bloqueio a drafts e a empresas estranhas. O cliente TS foi integrado **inativo por padrão**, sem alterar checkout ou acesso em produção. [Evidência](evidence/versioned-legal-acceptance-engine-20261102.md).

A prova está limitada ao motor técnico; `published-versioned-terms-acceptance` continua não concluído. **Nenhuma minuta jurídica foi aprovada nem publicada**; produção, recuperação dos 116 objetos e parecer externo permanecem pendentes. O gate foi adicionado como entrega técnica independente em 6.4, sem eliminar a exigência de aceite real.

# DentalFlow — avanço de engenharia de 02/11/2026

**Indicador de implementação beta: 93,84%.** A PR #239 implementa verificador de versões Web/Windows/Android, hashes de arquivos relevantes e migrações, além de bloqueadores irremovíveis para assinatura, rollback, backup integral e termos legais. CI própria + testes de manipulação garantem que essa ferramenta não publica instaladores nem altera pagamentos. Este é um marco técnico de 7.4, **não** prova de candidato de distribuição assinado. A autorização comercial segue bloqueada.

O indicador anterior de 93,48% permanece como referência de 01/11; a revisão não removeu tarefas nem adiou marcos adicionais.

# DentalFlow — implementação para beta: novo escopo auditável (01/11/2026)

**Indicador único no painel Master: 93,48% de IMPLEMENTAÇÃO PARA BETA.** Essa mudança representa uma **recalibração de escopo solicitada pelo responsável**, não a entrega de 14,68 pontos de código entre medições. O indicador anterior era 78,80% e incluía na fórmula testes reais e aprovações externas. Ambos os valores não medem a mesma coisa; apenas o novo indicador aparece na interface.

A fórmula mantém **os mesmos 23 critérios e o mesmo peso por critério**: 13 originalmente aceitos; dos dez restantes, considera somente os gates de engenharia verificáveis por código, testes repetíveis e preparo técnico. Existem **20 verificações externas adiadas do cálculo**, mas NÃO canceladas: testes Windows/Android físicos e de 72 horas, Asaas Sandbox/provider e vigência real, sessões reais e piloto, revisão jurídica e decisão de abrir beta. As provas antigas e os aceites não foram alterados. A lista exata, com proibição de retirar futuros bloqueios arbitrariamente, está em `docs/saas/BETA-IMPLEMENTATION-SCOPE.json`.

O escopo reduzido soma **18 frentes de implementação sem bloqueio interno registrado** e **cinco com tarefas obrigatórias para fechar o 100% técnico**:
- `4.2`: determinar com evidências a origem dos 12 cadastros de pacientes sem `clinic_id`; não atribuir ou excluir sem prova. [Relatório agregado](evidence/unassigned-patients-aggregate-20261101.md).
- `6.2`: recuperar os **116 objetos históricos faltantes**, completar restauração conjunta e conciliação do Cloud; não foi adiado para beta.
- `6.3`: baseline técnico reproduzível de Web/banco/Realtime em staging isolado (não teste de carga pública).
- `6.4`: implementar o mecanismo técnico de aceite de **versões jurídicas aprovadas**; não publicar minutas sem aprovação.
- `7.4`: candidato de release com controle de versão, integridade, paridade de ambiente e plano de rollback verificável.

**Condição decisiva:** 100% nesta nova barra significa somente que a implementação/rehearsals internos exigidos estão prontos. **Não** significa sistema validado por usuários reais nem autorização de vender. O registro original mantém os dez critérios aguardando homologação, e o bloqueio de lançamento permanece ativo em `scripts/saas-sales-release-gate.mjs`. Beta com dados reais exige aprovação contratual/privacidade e condições adequadas de segurança e recuperação; beta sintético e fechado deve ter seu próprio plano de risco antes de ser disponibilizado.

A nova rotina de cálculo é `scripts/saas-beta-implementation-progress.mjs`; `scripts/sync-saas-dashboard-progress.mjs` alimenta o indicador único. CI verifica a lista fixa de exclusões, os fatos apresentados e que nenhum gate de backup, atribuição de propriedade, staging, aceite ou candidato de release foi escondido.

## Arquivo histórico: evidências sob o indicador anterior de homologação ampla

O conteúdo abaixo documenta avanços históricos sob o critério antigo; permanece preservado para auditoria, mas percentuais nele não substituem o novo indicador único.

# DentalFlow — progresso único do Protocolo SaaS (01/11/2026)

O painel Master apresenta **UMA porcentagem geral de implementação: 78,80%**. Essa é a referência oficial para acompanhar o trabalho até 100%, sem uma segunda barra concorrente.

| Indicador único | Resultado | Como é calculado |
| --- | ---: | --- |
| **Progresso geral do Protocolo SaaS** | **78,80%** | Os 23 critérios têm peso igual. Cada critério homologado conta por inteiro; critérios em andamento recebem crédito proporcional apenas por marcos comprovados e auditados. |

O acompanhamento mostra também **13 de 23 critérios integralmente validados**, como contagem de status, não como outra porcentagem. Os dez restantes seguem em implementação ou homologação. A contagem de aceites detalhados continua registrada, para auditoria histórica, em `ACCEPTANCE-PROGRESS.md`, mas **não é mais um indicador percentual separado no painel**.

A conclusão exige os 23 critérios integralmente homologados; nem o avanço de testes sintéticos, nem o preparo jurídico ou de backup permitem declarar 100% ou autorizar vendas antes das provas correspondentes. O cálculo é conservador e baseado em evidências, mas não estima com precisão o esforço ou o tempo restante. Agora os 23 critérios possuem uma trilha de evidência: 13 com homologação integral e dez com controles parciais auditados. Isso não significa que esses dez estejam homologados; as etapas físicas, jurídicas e financeiras ainda pendem.

**Fonte única:** `docs/saas/IMPLEMENTATION-PROGRESS.json`. O script `scripts/saas-implementation-progress.mjs` calcula **somente `overall_progress_percent`**, e `scripts/sync-saas-dashboard-progress.mjs` sincroniza o resumo em `src/data/saas-protocol-progress.json`. O componente `MasterSaasProtocolProgress` exibe esse resumo na rota protegida `/master`. A CI rejeita um painel com snapshot diferente do registro. O valor visível corresponde à última **versão efetivamente publicada**; um merge no GitHub, por si só, não atualiza os aplicativos nem a página já publicada.

## Provas computadas neste marco

**2.3 — 3 de 5 marcos técnicos**
- Implementado e testado: política offline de 72 horas.
- Compilação Windows, inicialização Android API35 e **API37 no emulador** aprovadas; a falha antiga do runner API37 foi corrigida na [PR225](https://github.com/GustavoFboz/dtfipo/pull/225), com os **dois jobs Android concluídos em success** na [run 41330255173](https://github.com/GustavoFboz/dtfipo/actions/runs/41330255173). A instalação física e o fluxo offline 72h ainda não foram homologados.
- PR213 integrada: regra uniforme de validade de assinatura e identidade do cache; CI geral e builds positivos.
- Não computados: testes completos de expiração/limpeza em aparelhos físicos; reautenticação/suspensão e distribuição em aparelhos reais. iOS continua fora da homologação.

**6.2 — 3 de 6 marcos técnicos**
- Rotina de recuperação com criptografia e restauração descartável verificadas.
- Cópia histórica do banco de 29/10 restaurada em ambiente isolado, com 125 tabelas, 14.024 linhas e 202 FKs.
- Os **33 ZIPs privados** do snapshot histórico tiveram tamanho e SHA-256 dos **6.489.970.080 bytes de ZIP** validados. A prova foi ampliada: **33 manifestos autenticados e 592/592 objetos preservados descriptografados somente em memória e conferidos por SHA-256**, totalizando **6.489.242.325 bytes de conteúdo** íntegros. Nenhum prontuário foi escrito em texto claro. [Recibo físico](evidence/full-storage-volumes-hash-20261101.md) e [recibo do conteúdo](evidence/copied-592-content-aesgcm-20261101.md).
- Não computados: **116 objetos ainda ausentes (1.968.840.906 bytes)** da cópia histórica, restauração conjunta de todos os bytes, conciliação de dados e validação operacional atual. A verificação dos ZIPs não é restauração dos 592 objetos nem conclusão do Storage.

**4.2 — 5 de 8 marcos técnicos**
- Comprovados: login Master AAL2 e duas decisões de revisão individual auditadas em Sandbox em 24/10; teste de fronteira de etapas com cenário órfão/ausente entre empresas [PR #215](https://github.com/GustavoFboz/dtfipo/pull/215), [CI geral](https://github.com/GustavoFboz/dtfipo/actions/runs/41267138270).
- PR217/CI [workflow 41276846127](https://github.com/GustavoFboz/dtfipo/actions/runs/41276846127): proteção da continuidade da identidade no cache de perfis e pacientes instalados, criação offline e replay da outbox. Esse teste sintético foi separado dos testes de revogação real; é um marco técnico independente e **não substitui homologação Windows/Android**.
- Leitura agregada em 01/11: 104 pacientes, 12 sem clínica e sem casos, mas um possui vínculo de agendamento com empresa existente e criador compatível. Nenhum consta do ledger de criação segura. Titularidade de qualquer registro permanece não confirmada. O backend já possui dois gatilhos e RPC que exigem empresa ao cadastrar pacientes; portanto não adicionamos regra redundante nem alteramos registros históricos. [Evidência](evidence/patient-owner-continuity-20261101.md).
- Não computados: atribuição legítima dos 12 registros, provas reais de revogação/sessões e isolamento entre empresas e replay financeiro positivo autorizado. [Auditoria sem dados pessoais](evidence/tenant-security-review-20261031.md).

- PR226: ensaio transacional no PostgreSQL descartável com duas empresas e dois pacientes fictícios, papel SQL `authenticated` e controle positivo de acesso próprio; confirmou recusa de leitura/alteração/exclusão cruzadas e empresa forjada por INSERT/RPC. Foi executado pelo workflow de restauração com resultado aprovado. **Não é teste de JWT HTTP, revogação de token, MFA ou sessão real**. [Prova](evidence/patient-rls-sql-rehearsal-20261101.md).
- PR219: implementado e testado o verificador de isolamento somente leitura, que exige controles positivos por empresa antes de conceder um resultado de acesso negativo. A CI isolada e geral, mais a restauração, passaram. **O ensaio autenticado real ainda não foi realizado**, pois as duas clínicas aprovadas de QA tinham 0 pacientes e 0 casos. Esse marco premia apenas a ferramenta comprovada, e mantém o teste autenticado como pendência separada. [Limites da evidência](evidence/tenant-readonly-positive-control-20261101.md).
- Histórico da falha Android 37: o emulador originalmente falhava antes do smoke; a execução posterior da PR225 confirmou a configuração do AVD e o teste de inicialização do aplicativo no próprio emulador, sem dispensar a prova em aparelho físico. [Diagnóstico anterior](evidence/tenant-readonly-positive-control-20261101.md) e [resultado atual](evidence/android37-input-ready-smoke-20261101.md).

**2.1 — 2 de 5 marcos técnicos**
- Comprovados: renovação do período pago via reconciliação Sandbox sem webhook e cancelamento real de assinatura Sandbox com Master/MFA, uma escrita, provider INACTIVE e verificações 18/18. [Recibos de 24/10](evidence/events-recovery-master-20261024.md) e [28/10](evidence/master-cancellation-20261028.md).
- Pendentes: atraso/carência real, estorno/contestação e suspensão, reativação. Nenhuma transição foi simulada como evento real.

**2.2 — 2 de 4 marcos técnicos**
- Comprovados: preservação do período e ledger na renovação; cancelamento que preservou 701 arquivos, dados clínicos, três cobranças, histórico e vigência paga, conferidos por observação independente.
- Pendentes: preservar dados e cobrança em inadimplência/estorno e reativação. [Evidência](evidence/master-cancellation-20261028.md).

**5.3 — 3 de 6 marcos técnicos**
- Comprovados: agenda real de downgrade Growth para Inicial/R$5 no Asaas Sandbox em 18/12/2026, operação única auditada por Master MFA, termo local ainda `scheduled` e sem ativação ou cobrança antecipada. [Evidência](evidence/master-plan-change-20261028.md).
- Pendentes: confirmar vigência/pagamento futuro, cota pós-downgrade e falha financeira ambígua recuperada uma vez. **Não antecipar 18/12 nem modificar o contrato para obter aceites hoje.**

**6.3 — 3 de 6 marcos técnicos**
- Baseline agregado da conexão real ao PostgreSQL coletado via duas consultas `SELECT` sem carga, com 15 conexões totais, uma ativa e nenhuma `idle in transaction`. Esse marco **não** prova capacidade, Realtime ou latência; o ensaio gradual continua pendente. [Recibo](evidence/db-readonly-baseline-20261101.md).
- Implementado script de pré-ensaio com alvo limitado a serviço HTTP descartável em 127.0.0.1, máximo de 40 GETs, concorrência 4 e timeout 3s. Testes herméticos de segurança e relatório de falha passaram na [PR223](https://github.com/GustavoFboz/dtfipo/pull/223).
- **Novo marco PR236:** o banco restaurado descartável executou uma fixture de staging com 2 empresas, 2 papéis SQL autenticados, 4 pacientes e 4 casos fictícios, verificou controles positivos sem leituras cruzadas e reverteu tudo. [Diário](evidence/disposable-staging-fixtures-20261101.md). **Não é staging HTTP nem login real**, carga ou Realtime.
- **Não computados:** benchmark do produto HTTP/Realtime real em staging, métricas completas de CPU/RAM/latência, testes físicos e aprovação de escala. Não há ensaio de 10 mil usuários nem promessa de desempenho. [Plano](evidence/isolated-capacity-pilot-20261101.md).

**6.4 — 3 de 5 marcos técnicos**
- Protocolo L01–L08 e mapa preliminar de responsabilidades foram preparados; três minutas internas (Termos SaaS, Aviso de Privacidade e DPA), checklist e controle em CI também estão prontos na [PR222](https://github.com/GustavoFboz/dtfipo/pull/222).
- **Novo marco PR235:** inventário técnico de fornecedores encontrados no código (Supabase/Lovable/Asaas), janelas de acesso 72h e URLs 300s verificadas, registro-modelo de incidentes com ANPD e teste automático de consistência. **As regiões, contratos/DPA, subprocessadores, prazos clínicos e execução real de incidentes não estão aprovados**. [Registro](legal/SUPPLIERS-RETENTION-INCIDENT-REGISTER.md).
- **Não computados:** revisão jurídica/privacidade e aprovação comercial, assinatura e publicação dos documentos com aceite versionado. São minutas **não aprovadas**, não uma declaração de conformidade LGPD ou liberação para venda. [Checklist](legal/REVIEW-GATES.md).

**3.3 — 3 de 6 marcos técnicos**
- A base compartilhada Web/Windows/Android e os builds nativos existentes foram verificados; a PR233 fortaleceu o cache por identidade/empresa, filtrou a própria consulta por clínica e passou em testes de troca de sessão, links privados, cota, rollback e exclusão. [Escopo](evidence/storage-company-platform-20261101.md).
- **Não comprovados:** upload/download e abertura de arquivos em Android e Windows físicos, cache clínico offline e limpeza de 72h nesses aparelhos. Este marco não reconta o aceite 3.1; mede apenas a distribuição do mesmo contrato e a proteção da identidade na UI multiplataforma.

**7.4 — 2 de 5 marcos técnicos**
- Auditoria de liberação **somente leitura** e aviso Master foram integrados na PR233; dez critérios abertos continuam impedindo autorização de lançamento pelo protocolo. Mesmo com 23/23, será necessária decisão manual. O alerta **não bloqueia tecnicamente o checkout existente**. [Limites](evidence/saas-sales-guard-20261101.md).
- **Não comprovados:** versão final e rollback aprovados, minutas jurídicas assinadas, piloto e decisão de abrir vendas. O produto NÃO está autorizado para liberação comercial por esta revisão.

Todos os dez critérios ainda abertos foram auditados quanto aos marcos parciais, mas cada um mantém as exigências de homologação final. **Os 13 aceites integrais permanecem inalterados**, sem pontuação dupla e sem vender o SaaS antes da aprovação.

## Reproduzir e atualizar

O arquivo `docs/saas/IMPLEMENTATION-PROGRESS.json` guarda a lista de aceites oficiais e cada gate com status/evidência. Um script calcula o único percentual geral do protocolo:

    node scripts/saas-implementation-progress.mjs

Os testes em `scripts/saas-implementation-progress.test.mjs` recusam marcos sem evidência, duplicações, mudança artificial do denominador, pontuação de critérios já aceitos e 100% de progresso antes da homologação formal. A CI de progresso usa fixtures e dados de status, não acessa Cloud/Asaas, não baixa nenhum objeto nem publica o sistema.

**Estado do produto após esta alteração:** proteções de guardas offline e continuidade de contas no cache do paciente foram integradas ao GitHub; os aplicativos instalados ainda não receberam a atualização e o requisito 2.3 segue sem aceite completo. O trabalho sobre o backup 6.2 continua independente e pendente de finalização. Para atingir 100% do indicador único, todos os 23 critérios devem estar integralmente homologados. O valor parcial do backup não significa que os 116 objetos faltantes estejam recuperados.
