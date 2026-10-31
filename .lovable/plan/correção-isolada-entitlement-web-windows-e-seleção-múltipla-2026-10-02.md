# Correção isolada: entitlement Web/Windows e seleção múltipla da arcada

## Escopo confirmado
A fonte canônica já é a função de contexto de assinatura do servidor. A Web a consulta diretamente. No Windows, o mesmo contexto é usado, mas um cache ainda válido pode ser devolvido primeiro enquanto a atualização online acontece em segundo plano. A correção será somente nessa precedência: conectado, o retorno confirmado pelo servidor prevalece; offline, permanece o último contexto confirmado e ainda seguro.

O menu de trabalho já envia alterações para o grupo de dentes rosados, porém os controles exibem apenas o estado do dente em foco. Em seleções mistas, isso pode aplicar ou remover parâmetros com base no dente errado. O título também mostra apenas o dente em foco e uma contagem.

## Arquivos que serão modificados
- `src/lib/subscriptions.desktop.ts`
- `scripts/check-desktop-entitlement-bootstrap-032.mjs`
- Um teste unitário isolado para os cenários de entitlement, junto aos testes de `src/lib/`.
- `src/lib/tooth-selection.ts`
- `src/lib/tooth-selection.test.ts`
- `src/components/NewCaseDialog.tsx`
- `src/components/ToothWorkPanel.tsx`

Nenhum outro arquivo entra no escopo. Se a implementação revelar necessidade fora dessa lista, a execução para antes dessa alteração.

## 1. Assinatura IPO: mesma autoridade na Web e no Windows
- Manter intacta a lógica canônica do servidor e continuar consultando a mesma função já usada pela Web.
- Quando houver conexão e identidade online validada, consultar o servidor antes de liberar ou bloquear pelo cache; persistir e devolver exatamente o contexto recebido.
- Usar o cache somente quando estiver offline ou quando a consulta online realmente falhar, sem transformar ou criar privilégios.
- Preservar o acesso vitalício quando o servidor retornar acesso completo pelo mecanismo interno existente; não usar nome da IPO, e-mail, dispositivo ou qualquer exceção local.
- Não criar regra paralela de assinatura e não alterar checkout, cobrança ou fluxos Asaas.

## 2. Arcada e edição em lote
- Manter Ctrl/Cmd para alternar dentes individuais e Shift para intervalos na ordem do odontograma.
- Fazer o menu representar o estado conjunto dos dentes rosados, e não somente o dente em foco.
- Para cada parâmetro: se nem todos os selecionados possuírem a opção escolhida, aplicá-la a todos; se todos já a possuírem, removê-la de todos. Isso permite operações aditivas e subtrativas inclusive em grupos com configurações diferentes.
- Preservar configurações existentes ao apenas retirar um dente da seleção; apagar parâmetros somente por uma ação explícita do menu.
- Ao selecionar novamente um ou mais dentes configurados, abrir o mesmo menu para edição conjunta.
- Resumir a seleção na ordem odontológica com setas, por exemplo `11 → 14, 24 → 26, 31, 41`, mantendo tipografia e espaço atuais.
- Exibir, ao passar o cursor sobre o resumo, a lista completa dos dentes selecionados por meio do balão de ajuda já usado pela interface.

## 3. Regressões e validação
- Cobrir quatro cenários de entitlement: acesso vitalício retornado pelo servidor, conta comum ativa, conta comum inativa e fallback offline sem concessão nova.
- Cobrir seleção individual, intervalos, grupos separados, ordem odontológica, resumo compacto, seleção mista e operações aditivas/subtrativas.
- Executar os testes direcionados, verificação de tipos, regressão Desktop existente e compilação da prévia.
- Conferir visualmente o menu da arcada e o resumo em tela.

## Fora do escopo e proteção do trabalho paralelo
- Nenhuma migration ou alteração em tabelas, dados, RLS, policies, triggers ou funções do banco.
- Nenhuma alteração em RPCs financeiras, webhooks Asaas, checkout, planos, billing worker, páginas ou componentes SaaS/Asaas.
- Nenhuma publicação, deploy ou merge na `main`.
