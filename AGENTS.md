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
