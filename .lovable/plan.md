# Plan: State Persistence and Visual Cleanup

## 1. Global State Persistence
Ensure that UI components like `NewCaseDialog` and `CaseDetailDialog` correctly recover their state (open/closed and current tab) after a page refresh.
- Audit `NewCaseDialog.tsx` to ensure `persistOpenKey` and `persistFormKey` are working correctly with `sessionStorage`.
- Audit `CaseDetailDialog.tsx` to verify `OPEN_CASE_KEY` persistence in `sessionStorage`.
- Verify `src/router.tsx` has `scrollRestoration: true` (confirmed).

## 2. Cleanup & Performance
Remove residual debug logs and `addLog` calls from patient-related pages to improve performance and clean up the UI.
- Finish cleaning up `src/routes/_authenticated/patients.tsx`.
- Finish cleaning up `src/routes/_authenticated/patients.$id.tsx`.

## 3. Visual Text Edits
Apply the requested change to `src/routes/index.tsx` (confirmed as a no-op but verified).

## Technical Details
- Use `sessionStorage` for short-term persistence (reload recovery) as already implemented in some components.
- Ensure that `useEffect` hooks for persistence wait for the component to be fully hydrated to avoid overwriting saved data with initial state.
