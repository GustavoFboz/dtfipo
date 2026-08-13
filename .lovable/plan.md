# Plano de Melhoria Visual e Fluxo de Aprovação de Casos

Este plano visa alinhar o Dashboard do Solicitante à identidade visual premium do sistema e implementar o fluxo de aprovação de casos por protéticos.

## 1. Melhoria Visual (Dashboard do Solicitante)
- **SolicitanteDashboard.tsx**: 
    - Atualizar o layout para usar o mesmo padrão de `AppShell` e `CasesTable` da equipe.
    - Implementar contadores animados com `DashboardStats`.
    - Ajustar o container da tabela para `rounded-3xl` e sombra suave.
- **CasesTable.tsx**:
    - Refinar a exibição para garantir que, no dashboard do solicitante, as colunas e filtros sigam a estética premium (segunda imagem de referência).

## 2. Fluxo de Aprovação de Casos
- **Banco de Dados**:
    - Garantir que casos criados por `SOLICITANTE` iniciem com `status = 'pendente'` e `cadista_id = NULL`.
    - Corrigir a trigger `notify_proteticos_new_request` para assegurar que protéticos (incluindo o usuário específico citado) recebam notificações em tempo real.
- **API (lib/api.ts)**:
    - Adicionar função `acceptCaseRequest(caseId, cadistaId)` para permitir que um protético "assuma" o caso.
    - Atualizar `fetchCases` para que protéticos vejam uma aba "Solicitações" contendo casos onde `cadista_id` é nulo.
- **CasesTable.tsx**:
    - Adicionar o botão "Aceitar Caso" (ou "Aprovar") visível apenas para protéticos/admins em casos pendentes.
    - Ao aceitar, o caso deve ser atribuído ao protético logado e mudar para o status inicial de produção.

## 3. Correções de Atribuição e Notificação
- **Atribuição Indevida**: Corrigir a lógica para que a "Alycia" (ou qualquer solicitante) não seja atribuída automaticamente como protética do caso. O campo `cadista_id` deve permanecer vazio até a aceitação manual.
- **Notificações**: 
    - Validar o envio para `gustavovitorfa@gmail.com`.
    - Garantir que, ao aceitar um caso, ele suma da lista de "Solicitações" para outros protéticos (através de atualizações otimistas e realtime).

## Detalhes Técnicos
- Uso de `useMutation` para a ação de aceitar caso com feedback instantâneo (`toast`).
- Filtros no `CasesTable` para separar "Solicitações" de "Casos Ativos".
- Sincronização via `supabase.channel` para garantir que a lista de pendências seja atualizada globalmente.
