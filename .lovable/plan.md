# Plan - Remove Patient Page Log and Restore State on Reload

Implementation of visual and functional adjustments as requested.

## Proposed Changes

### UI Adjustments
- Remove `FloatingLog` from `src/routes/_authenticated/patients.tsx`.
- Remove `FloatingLog` from `src/routes/_authenticated/patients.$id.tsx`.
- (Cleanup) Remove manual `addLog` calls and related state in both files.

### Session Persistence
- Implement state persistence using `sessionStorage` in `src/routes/_authenticated/route.tsx` or a global hook to remember the last active view, open dialogs (where applicable), and scroll position.
- Leverage TanStack Router's `scrollRestoration: true` which is already enabled in `src/router.tsx`, but ensure it works across reloads by verifying if custom wrappers or transitions interfere.
- Add a custom `useEffect` in `AppShell` or a root component to save/restore specific UI state (like active tabs or filters) that isn't captured by the URL.

## Technical Details
- **Log Removal:** Simple deletion of the `<FloatingLog />` component and its supporting `logs` state and `addLog` function.
- **Persistence:** 
  - The user wants "exact position, window or page".
  - Page/Route is handled by the URL.
  - "Window" (Dialogs): Some dialogs like `NewCaseDialog` or `CaseDetailDialog` currently use local state. To persist across refresh, these would need to be moved to URL search params (TanStack Router's preferred way for state that should survive refresh).
  - "Position" (Scroll): `scrollRestoration: true` in TanStack Router should handle this. I will verify if `PageTransition` or `AnimatePresence` in `AppShell` is breaking it.

## Steps
1. Remove logs from Patient List and Patient Detail pages.
2. Update `NewCaseDialog` and `CaseDetailDialog` triggers to use URL search params instead of local state where persistence is most critical.
3. Verify scroll restoration.
