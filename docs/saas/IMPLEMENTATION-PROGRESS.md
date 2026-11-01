# DentalFlow SaaS — progresso técnico com evidências (01/11/2026)

O progresso técnico deve variar quando melhorias são implementadas e verificadas pelo GitHub, mesmo que uma validação operacional final dependa do navegador Work ou de aparelho físico. Para não apagar os critérios anteriores nem anunciar vendas antes da hora, o Painel de Progresso passa a ter **dois indicadores de propósitos diferentes**.

| Indicador | Resultado | Critério |
| --- | ---: | --- |
| **Implementação — piso técnico comprovado** | **69,44%** (15,97 pontos / 23) | 13 aceites + 2/5 do 2.1, 2/4 do 2.2, 3/5 do 2.3, 4/7 do 4.2, 3/6 do 5.3 e 2/5 do 6.2. |
| **Aceites finais para vendas** | **56,52%** (13 / 23) | Somente itens com homologação integral e recibo; 10 permanecem pendentes. |

A implementação usa **crédito proporcional limitado a gates concluídos**, não porcentagem arbitrária dada pelo assistente. Cada um dos 23 itens tem peso igual. Neste registro, os quatro itens pendentes ainda não auditados no novo formato têm zero crédito **no cálculo conservador** (isso não significa que não tenham código). Para os seis itens auditados, cada gate completo recebe 1/N do item, e o último gate jamais pode somar 100% sem aceite oficial.

Assim, o índice de implementação é **um piso técnico com escopo explicitamente limitado**, não previsão de horas restantes, prontidão comercial, percentual de trabalho real ou certificação de produção. O valor não substitui a porcentagem oficial de aceites do `ACCEPTANCE-PROGRESS.md`.

## Provas computadas neste marco

**2.3 — 3 de 5 marcos técnicos**
- Implementado e testado: política offline de 72 horas.
- Compilação Windows e teste Android API35 aprovados; **Android API37 falhou no smoke**, apesar do workflow verde.
- PR213 integrada: regra uniforme de validade de assinatura e identidade do cache; CI geral e builds positivos.
- Não computados: testes completos de expiração/limpeza em aparelhos físicos; reautenticação/suspensão e distribuição em aparelhos reais. iOS continua fora da homologação.

**6.2 — 2 de 5 marcos técnicos**
- Rotina de recuperação com criptografia e restauração descartável verificadas.
- Cópia histórica do banco de 29/10 restaurada em ambiente isolado, com 125 tabelas, 14.024 linhas e 202 FKs.
- Não computados: 116 arquivos ainda ausentes da cópia histórica, restauração conjunta de todos os bytes, conciliação de dados e validação operacional atual. Os 592 arquivos copiados não são considerados um gate completo.

**4.2 — 4 de 7 marcos técnicos**
- Comprovados: login Master AAL2 e duas decisões de revisão individual auditadas em Sandbox em 24/10; teste de fronteira de etapas com cenário órfão/ausente entre empresas [PR #215](https://github.com/GustavoFboz/dtfipo/pull/215), [CI geral](https://github.com/GustavoFboz/dtfipo/actions/runs/41267138270).
- PR217/CI [workflow 41276846127](https://github.com/GustavoFboz/dtfipo/actions/runs/41276846127): proteção da continuidade da identidade no cache de perfis e pacientes instalados, criação offline e replay da outbox. Esse teste sintético foi separado dos testes de revogação real; é um marco técnico independente e **não substitui homologação Windows/Android**.
- Leitura agregada em 01/11: 104 pacientes, 12 sem clínica e sem casos, mas um possui vínculo de agendamento com empresa existente e criador compatível. Nenhum consta do ledger de criação segura. Titularidade de qualquer registro permanece não confirmada. O backend já possui dois gatilhos e RPC que exigem empresa ao cadastrar pacientes; portanto não adicionamos regra redundante nem alteramos registros históricos. [Evidência](evidence/patient-owner-continuity-20261101.md).
- Não computados: atribuição legítima dos 12 registros, provas reais de revogação/sessões e isolamento entre empresas e replay financeiro positivo autorizado. [Auditoria sem dados pessoais](evidence/tenant-security-review-20261031.md).

- PR219: implementado e testado o verificador de isolamento somente leitura, que exige controles positivos por empresa antes de conceder um resultado de acesso negativo. A CI isolada e geral, mais a restauração, passaram. **O ensaio autenticado real ainda não foi realizado**, pois as duas clínicas aprovadas de QA tinham 0 pacientes e 0 casos. Esse marco premia apenas a ferramenta comprovada, e mantém o teste autenticado como pendência separada. [Limites da evidência](evidence/tenant-readonly-positive-control-20261101.md).
- Diagnóstico nativo das PRs anteriores: Windows e Android API35 passaram, porém o job experimental Android API37 falhou antes de rodar o smoke do aplicativo, por `adb shell input keyevent 82` no emulador. O workflow agregado verde não altera essa conclusão. [Evidência](evidence/tenant-readonly-positive-control-20261101.md).

**2.1 — 2 de 5 marcos técnicos**
- Comprovados: renovação do período pago via reconciliação Sandbox sem webhook e cancelamento real de assinatura Sandbox com Master/MFA, uma escrita, provider INACTIVE e verificações 18/18. [Recibos de 24/10](evidence/events-recovery-master-20261024.md) e [28/10](evidence/master-cancellation-20261028.md).
- Pendentes: atraso/carência real, estorno/contestação e suspensão, reativação. Nenhuma transição foi simulada como evento real.

**2.2 — 2 de 4 marcos técnicos**
- Comprovados: preservação do período e ledger na renovação; cancelamento que preservou 701 arquivos, dados clínicos, três cobranças, histórico e vigência paga, conferidos por observação independente.
- Pendentes: preservar dados e cobrança em inadimplência/estorno e reativação. [Evidência](evidence/master-cancellation-20261028.md).

**5.3 — 3 de 6 marcos técnicos**
- Comprovados: agenda real de downgrade Growth para Inicial/R$5 no Asaas Sandbox em 18/12/2026, operação única auditada por Master MFA, termo local ainda `scheduled` e sem ativação ou cobrança antecipada. [Evidência](evidence/master-plan-change-20261028.md).
- Pendentes: confirmar vigência/pagamento futuro, cota pós-downgrade e falha financeira ambígua recuperada uma vez. **Não antecipar 18/12 nem modificar o contrato para obter aceites hoje.**

Os demais itens ainda abertos (3.3, 6.3, 6.4 e 7.4) **não são estimados ou pontuados nesta revisão**. Serão auditados separadamente com marcos verificáveis, sem retirar nem inventar conclusões.

## Reproduzir e atualizar

O arquivo `docs/saas/IMPLEMENTATION-PROGRESS.json` guarda a lista de aceites oficiais e cada gate com status/evidência. Um script calcula ambos indicadores:

    node scripts/saas-implementation-progress.mjs

Os nove testes em `scripts/saas-implementation-progress.test.mjs` recusam marcos sem evidência, duplicações, mudança artificial do denominador, pontuação de critérios já aceitos e 100% técnico antes da homologação formal. A CI de progresso usa fixtures e dados de status, não acessa Cloud/Asaas, não baixa nenhum objeto nem publica o sistema.

**Estado do produto após esta alteração:** proteções de guardas offline e continuidade de contas no cache do paciente foram integradas ao GitHub; os aplicativos instalados ainda não receberam a atualização e o requisito 2.3 segue sem aceite completo. O trabalho sobre o backup 6.2 continua independente e pendente de finalização. Para ultrapassar 60% **em aceites finais**, é obrigatório concluir integralmente 6.2 ou outro critério pendente, não apenas observar o índice técnico.
