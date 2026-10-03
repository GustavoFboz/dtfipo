# Stage 07 — self-service TOTP enrollment, 2026-10-03

Stage 05 provider inspection is on standby at the owner's request until Lovable credits return. No additional provider delegation is part of this change.

The Master replay MFA form now offers enrollment when the current account has no verified TOTP factor. Enrollment begins only after an explicit button click; QR/setup key stay in component memory, with no external QR service, logs, query cache or application storage. Verification requires six digits and AAL2. The setup text explains that other sessions may be signed out after MFA verification.

Account identity is checked before/after enrollment and verification, and before canceling. Sign-in/out and unmount invalidate UI operations and clear pending setup/code. A failed verification retains the pending factor for retry. Cancel checks the factor created by this flow and does not remove an existing verified factor. Leaving without completing may leave an unverified factor; the UI explains that it is not active protection. This implementation never automatically removes other pending factors.

The shared UI uses the existing Supabase facade on Web and Desktop/Android. This administrative setup requires internet; it does not alter local clinical access or entitlement policy. No schema migrations, operator grants or live enrollments are performed by the implementation.

Validation: 10 account/factor boundary tests plus 78 existing billing/storage/Desktop tests pass (88 total). Stage-06 and stage-09 checks and Desktop entitlement/bootstrap regression pass. TypeScript and production builds are checked before integration.

Remaining Stage 07: verify the authorized operator identity, assign that role through the controlled enrollment procedure, then prove published enrollment, login, rejection of unauthorized accounts and replay auditing. No live Master identity or MFA factor has been enrolled by this work. Stage 07 remains partial.

Reference: https://supabase.com/docs/reference/javascript/auth-mfa-enroll
