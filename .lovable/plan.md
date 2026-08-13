# Plan - Case Management and Dashboard Improvements

Refine the case management system by adding archiving functionality, improving the "All" tab logic, and ensuring proper flow for pending solicitations.

## User Requirements
- Remove "Abrir pasta" (Open Folder) from case options and replace it with "Arquivar" (Archive).
- The "Todos" (All) tab should display all cases from the period: Ongoing, Finished, Archived, and All.
- Fix the solicitation flow: cases requested by Solicitantes should appear as "Solicitações" (Pending) and allow staff members (like Gustavo) to approve/reject them.

## Proposed Changes

### Database & API (`src/lib/api.ts`)
- Update `fetchCases`:
    - Refine `active` scope to strictly exclude `pendente`, `arquivado`, and `cancelado`.
    - Refine `all` scope to include everything *except* `cancelado` (or as per period if filters applied).
    - Ensure `solicitacoes` scope correctly identifies cases with `status = 'pendente'` and no `cadista_id`.

### Case Management (`src/components/CasesTable.tsx`)
- **Menu Actions**:
    - Remove "Abrir pasta" from the dropdown menu (it's already accessible via the check-icons anyway).
    - Add "Arquivar caso" action to the dropdown menu.
    - Implement a `bulkArchive` and `archiveCase` mutation (already partially there, but needs solid integration).
- **Filtering Logic**:
    - Update `filtered` useMemo to match the new "Todos" requirements (showing finished and archived in that view).
- **UI Adjustments**:
    - Ensure the "Solicitações" tab is visible and functional for staff.
    - Update the `CaseDetailDialog` if necessary to show approval actions.

### Dashboard (`src/components/SolicitanteDashboard.tsx` & `src/routes/_authenticated/casos.tsx`)
- Ensure "Solicitações" is the priority for staff when there are pending items.
- Verify counts logic in `casos.tsx` to reflect the new visibility rules.

## Technical Details
- Use TanStack Query mutations for the status transitions.
- Maintain existing RLS security (Solicitantes only see their own, Staff see all).
- Use `Archive` icon from `lucide-react`.

## Verification Plan
- Check if "Arquivar" appears in the menu instead of "Abrir pasta".
- Verify that clicking "Arquivar" moves the case to the "Arquivados" tab.
- Verify that the "Todos" tab now includes finished and archived cases.
- Create a test solicitation and verify it appears in the "Solicitações" tab for a staff user.
