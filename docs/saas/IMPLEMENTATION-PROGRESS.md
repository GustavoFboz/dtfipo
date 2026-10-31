# DentalFlow SaaS — progresso técnico com evidências (31/10/2026)

O progresso técnico deve variar quando melhorias são implementadas e verificadas pelo GitHub, mesmo que uma validação operacional final dependa do navegador Work ou de aparelho físico. Para não apagar os critérios anteriores nem anunciar vendas antes da hora, o Painel de Progresso passa a ter **dois indicadores de propósitos diferentes**.

| Indicador | Resultado | Critério |
| --- | ---: | --- |
| **Implementação — piso técnico comprovado** | **60,87%** (14,00 pontos / 23) | 13 critérios com aceite + 3 de 5 marcos técnicos comprovados no 2.3 + 2 de 5 no 6.2. |
| **Aceites finais para vendas** | **56,52%** (13 / 23) | Somente itens com homologação integral e recibo; 10 permanecem pendentes. |

A implementação usa **crédito proporcional limitado a gates concluídos**, não porcentagem arbitrária dada pelo assistente. Cada um dos 23 itens tem peso igual. Neste primeiro registro, os oito itens pendentes ainda não auditados no novo formato têm zero crédito **no cálculo conservador** (isso não significa que não tenham código). Para os dois itens auditados, cada gate completo recebe 1/N do item, e o último gate jamais pode somar 100% sem aceite oficial.

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

Os demais itens ainda abertos (2.1, 2.2, 3.3, 4.2, 5.3, 6.3, 6.4 e 7.4) **não são estimados ou pontuados nesta revisão**. Serão auditados separadamente com marcos verificáveis, sem retirar nem inventar conclusões.

## Reproduzir e atualizar

O arquivo `docs/saas/IMPLEMENTATION-PROGRESS.json` guarda a lista de aceites oficiais e cada gate com status/evidência. Um script calcula ambos indicadores:

    node scripts/saas-implementation-progress.mjs

Os cinco testes em `scripts/saas-implementation-progress.test.mjs` recusam marcos sem evidência, duplicações, mudança artificial do denominador, pontuação de critérios já aceitos e 100% técnico antes da homologação formal. A CI de progresso usa fixtures e dados de status, não acessa Cloud/Asaas, não baixa nenhum objeto nem publica o sistema.

**Estado do produto após esta alteração:** a implementação de guardas offline foi integrada ao GitHub; os aplicativos instalados ainda não receberam a atualização e o requisito 2.3 segue sem aceite completo. O trabalho sobre o backup 6.2 continua independente e pendente de finalização. Para ultrapassar 60% **em aceites finais**, é obrigatório concluir integralmente 6.2 ou outro critério pendente, não apenas observar o índice técnico.
