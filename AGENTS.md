<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## DentalFlow cross-platform rule

All new product work must follow `docs/CROSS_PLATFORM_OFFLINE_CONTRACT.md`.
Features that belong in installed applications must be designed local-first and
must not add UI-level Cloud-only dependencies without a platform adapter/fallback.
The same UI contract should remain reusable by Web, Windows/Tauri and future
Android/iOS shells.

## Preserve the SaaS implementation

The connected branch contains Asaas checkout, renewal, billing history, Master
administration and mandatory storage reservations. Preserve these modules and
their migrations when fixing unrelated UI, types or Desktop behavior. The live
database can retain structures even if an editor removes the corresponding code.

Before integrating a change that touches SaaS, run the stage-06 and stage-09
checks, the billing tests and the Desktop entitlement regression tests. A type
error must be fixed at the error site; it must not be resolved by restoring an
older project snapshot or removing feature files, tests or restore entries.

## Permanent safety protocol for DentalFlow changes and beta

User requirement (2026-11-02): all changes, bug fixes, features, migrations, releases,
or optimizations must preserve prior code, customer information and verified advances.

1. **Before editing**, identify the connected source branch/commit and last
   published revision; inspect migration and schema dependencies, active case
   create/open/edit behavior, billing/Asaas (both environments), entitlements,
   company isolation, session identity, Storage/quotas, native offline behavior.
2. **Keep changes isolated and reversible.** Use a minimal branch/PR, do not
   force-push or rewrite Lovable history; do not delete user files, patient
   records, payment IDs, external contracts, migration history or backup volumes.
   Never use production data for fixtures, and do not expose secrets or PHI.
3. **Prove the delta.** Add a focused regression reproducing the bug, run the
   SaaS stage-06 and stage-09 checks plus affected billing, desktop/mobile and
   tenant-isolation tests, review the diff and CI, and document limitations.
   Passing a synthetic test never substitutes for authenticated production or
   physical device acceptance.
4. **Release only with recovery.** For beta paid invitations, assess
   `docs/saas/PAID-BETA-READINESS.json`; for general release retain the
   canonical 23 acceptances. Verify immutable backup/restore, rollback,
   approved legal terms, billing/renewal/cancellation and restricted data
   access. Stop new sales immediately on payment/data integrity concerns.
5. **Never inflate progress.** Keep technical implementation separate from
   the 23 official acceptances, identify incomplete checks, and never treat a
   written plan, self-attestation or green CI alone as commercial authorization.
