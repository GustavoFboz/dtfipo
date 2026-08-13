# Plan: Implement Requested Edits and Persistence

## 1. Visual Text Edits
Apply the requested text edit to `src/routes/index.tsx`. *Note: The request asks to change "Approve" to "Approve", which seems like a no-op, but I will ensure the file reflects the intended state.*

## 2. Global State Persistence
Implement robust state recovery across reloads by ensuring critical UI states (dialogs, active filters) are synchronized with the URL or `sessionStorage`.
- Migrate `NewCaseDialog` and `CaseDetailDialog` visibility to URL search parameters.
- Ensure the sidebar blur effect correctly handles refresh states.

## 3. Scroll Restoration & UX
Refine `src/router.tsx` and component-level layouts to guarantee scroll position is preserved exactly.
- Audit `AppShell` and `_authenticated` route for any layout shifts that break scroll restoration.

## 4. Cleanup & Optimization
- Remove all remaining `FloatingLog` references and debug logs from production paths.
- Ensure `sessionStorage` fallback for non-URL state.

## Technical Details
- Use `useSearch` and `useNavigate` from `@tanstack/react-router` for state persistence in dialogs.
- Clear out residual `console.log` and `addLog` calls from `patients.tsx` and `patients.$id.tsx`.
