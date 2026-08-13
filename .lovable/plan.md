# Plan - Dialog Persistence & Cleanup

Implement robust state recovery for main dialogs using URL search parameters and perform final log cleanup.

## User Review Required

> [!IMPORTANT]
> The text "Approve" was already localized to "Aprovar" in the source code (e.g., in the financial modules). If you still see "Approve" in English somewhere, please point out the specific page or component.

- **Dialog Persistence**: Does using URL parameters (e.g., `?case=...&tab=...`) for state recovery meet your expectations? This ensures that refreshing the page keeps the exact same dialog and tab open.

## Proposed Changes

### [Dialog State Persistence]

#### [NewCaseDialog]
- Migrate visibility state to use `?newCase=1` URL search parameter.
- Update `NewCaseDialog` to sync with this parameter.

#### [CaseDetailDialog]
- Migrate `open` and `tab` state to use `?case={id}` and `?tab={key}` URL search parameters.
- Ensure back button/navigation works naturally with these parameters.

### [Cleanup]

#### [Log Removal]
- Remove any remaining `FloatingLog` references or `console.log` calls in `patients.tsx` and `patients.$id.tsx`.

## Technical Details

- Using TanStack Router's `useSearch` and `useNavigate` for URL parameter management.
- Parameter keys: `case` (UUID), `tab` (string), `newCase` (boolean).
- Fallback to `sessionStorage` only for unsaved form data (Drafts).
