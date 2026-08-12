# Restoration and Optimization Plan

## Problem diagnosis
- **Blank Screens:** Authenticated routes (`/casos`, `/patients`) were rendering empty bodies. This was likely due to a combination of missing route loaders and the `defaultPendingMs` in `src/router.tsx` being set to a very high value, causing the UI to wait indefinitely for data that might have had hydration mismatches.
- **Patient Detail Errors:** Reports indicated patient details were not loading. The `fetchPatient` API was not fetching related cases in a single call, requiring multiple waterfall fetches.
- **Patient Selection:** The `PatientCombobox` had z-index and event propagation issues in the `NewCaseDialog`.
- **Photo Upload:** Storage buckets were initialized but RLS/grants needed verification for the "IPO" company context.

## Proposed Changes

### 1. Route Reliability & Hydration
- Add explicit (even if empty) loaders to all content routes to ensure TanStack Start correctly identifies and hydrates them.
- Adjust `src/router.tsx` to use more sensible `defaultPendingMs` values to avoid "infinite loading" blank screens.
- **Done:** Restored `src/routes/index.tsx` landing page logic.
- **Done:** Added loaders to `casos.tsx`, `patients.$id.tsx`, and fixed `_authenticated/route.tsx`.

### 2. Patient Module Improvements
- **Patient Detail:** Optimize `fetchPatient` in `src/lib/api.ts` to include related cases via Supabase's `.select("*, cases(*)")`.
- **Patient List:** Add a search bar to the patients page header and improve card layout.
- **Done:** Modified `src/routes/_authenticated/patients.tsx` with new header and search.

### 3. New Case Dialog Enhancements
- Integrate `PatientFormDialog` directly into the `NewCaseDialog` patient selection area.
- Add a "Plus" button next to the patient selector to allow creating a full patient profile without leaving the case creation flow.
- **Done:** Modified `src/components/NewCaseDialog.tsx` to include the shortcut.

### 4. Patient Photo & Attachments
- Verify that `PatientPhotoUpload` and `PatientAttachments` correctly handle the "IPO" clinic context by ensuring RLS policies allow the designated admin user to manage these files.
- **Done:** Created buckets in previous turns, verified component logic.

### 5. Final UI Polish
- Ensure the landing page (`/lp`) has a subtle reference to the "IPO" institute as requested, providing a "verified" feel.
- **Done:** Added a "Verified Partner" section to the landing page.

## Technical Details
- **Framework:** TanStack Start v1.
- **Database:** Supabase with RLS.
- **State Management:** TanStack Query for caching and optimistic updates.
- **Realtime:** Supabase Realtime for chat and case status updates.
