# Plan: Implement Requested Edits and Persistence

## 1. Visual Text Edits
Apply the requested text edit to `src/routes/index.tsx`. Although the request asks to change "approve" to "approve" (which is a no-op), I will ensure the file content is correct and the change is acknowledged.

## 2. Global State Persistence
Implement robust state recovery across reloads for critical UI components.
- **Dialogs**: Update `NewCaseDialog` and `CaseDetailDialog` to use URL search parameters (e.g., `?newCase=true` or `?caseId=123&tab=galeria`) so they stay open after a refresh.
- **Filters**: Ensure the active filter on the `/casos` page is correctly synchronized with the URL or `sessionStorage`.
- **UI State**: Ensure the sidebar blur effect and other layout states persist correctly.

## 3. Scroll Restoration & Performance
- **Scroll**: Verify `src/router.tsx` settings and ensure that layout transitions don't interfere with `@tanstack/react-router`'s built-in scroll restoration.
- **Cleanup**: Remove any remaining `FloatingLog` references and debug logs that might affect performance or user experience.

## Technical Details
- Migrate `sessionStorage` logic in `NewCaseDialog.tsx` to use URL state where appropriate.
- Update `CaseDetailDialog.tsx` to sync its `open` and `tab` state with the URL hash/search params more reliably.
- Clean up `src/routes/_authenticated/patients.tsx` and `patients.$id.tsx` to remove residual `addLog` or `console.log` calls.
