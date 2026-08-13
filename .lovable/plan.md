# Plan: Performance and Persistence Improvements

## 1. Global Persistence
Implement robust state recovery across reloads by ensuring critical UI states (dialogs, active filters) are synchronized with the URL or `sessionStorage`.

## 2. Scroll Restoration & UX
Refine `src/router.tsx` and component-level layouts to guarantee scroll position is preserved exactly, even with layout transitions.

## 3. Cleanup & Optimization
Remove all remaining `FloatingLog` references and debug logs from production paths. Optimize `NewCaseDialog` and `CaseDetailDialog` to survive page refreshes by using URL search parameters for state.

## Technical Details
- Use `useSearch` and `useNavigate` from `@tanstack/react-router` for state persistence in dialogs.
- Ensure `sessionStorage` fallback for non-URL state.
- Audit `AppShell` and `_authenticated` route for any layout shifts that break scroll restoration.
