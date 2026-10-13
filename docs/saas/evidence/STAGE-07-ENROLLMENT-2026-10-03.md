# Stage 07 — self-service TOTP enrollment, 2026-10-03

Stage 05 provider inspection is on standby at the owner's request until Lovable credits return. No additional provider delegation is part of this change.

The Master replay MFA form now offers enrollment when the current account has no verified TOTP factor. Enrollment begins only after an explicit button click; QR/setup key stay in component memory, with no external QR service, logs, query cache or application storage. Verification requires six digits and AAL2. The setup text explains that other sessions may be signed out after MFA verification.

Account identity is checked before/after enrollment and verification, and before canceling. Sign-in/out and unmount invalidate UI operations and clear pending setup/code. A failed verification retains the pending factor for retry. Cancel checks the factor created by this flow and does not remove an existing verified factor. Leaving without completing may leave an unverified factor; the UI explains that it is not active protection. This implementation never automatically removes other pending factors.

The shared UI uses the existing Supabase facade on Web and Desktop/Android. This administrative setup requires internet; it does not alter local clinical access or entitlement policy. The implementation itself performs no schema migrations or operator grants. Live activation is documented separately below.

Validation: 10 account/factor boundary tests plus 78 existing billing/storage/Desktop tests pass (88 total). Stage-06 and stage-09 checks and Desktop entitlement/bootstrap regression pass. TypeScript and production builds are checked before integration.

## Live activation and verification on 2026-10-03

After the owner explicitly authorized the chosen account, the backend verified a single confirmed, non-deleted and non-banned auth user. A controlled administrative transaction enrolled that user in `platform_operators`, with the authorization recorded in `enrolled_by`. No company role or other account was promoted.

The dedicated account-security section was merged and published separately from the replay form. The owner then supplied a screenshot of the published `/master` dashboard showing “Autenticador confirmado nesta sessão”. A direct read-only backend check confirmed one enabled platform operator and one verified TOTP factor for that operator. Time-based enrollment is the expected TOTP mode. No setup keys, QR codes or verification codes are included in this evidence.

Permission guards were exercised in a read-only transaction with transaction-local authenticated role/JWT claims, followed by rollback:

- Non-operator with `aal2`: dashboard and replay both rejected with `PLATFORM_MASTER_FORBIDDEN`.
- Authorized operator with `aal1`: replay rejected with `PLATFORM_MASTER_REAUTH_REQUIRED`.

These SQL checks exercise deployed server guards; they do not represent an actual browser login as another account or verify JWT issuance. The published confirmation screen and verified backend factor are separate evidence of the owner's enrollment. The replay confirmation remains independent of the account-security confirmation.

No billing event was queued or replayed and no provider call, payment, subscription, price or entitlement was changed by these verification checks.

Remaining Stage 07: prove an appropriately reviewed real Sandbox replay and both audit records, and complete the published alternate-account/session checks. Provider-dependent verification stays on standby until the owner's requested resumption. Stage 07 remains partial.

Reference: https://supabase.com/docs/reference/javascript/auth-mfa-enroll
