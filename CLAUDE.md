@AGENTS.md

# Working rules

## Worktrees and builds
- Turbopack rejects symlinked node_modules. In a new worktree run `npm ci` or use an APFS clone (`cp -c -R`). Never symlink node_modules from the main checkout.
- If a pre-push or build step needs env vars, use dummy placeholder values in the shell. Never use `--no-verify`. Never copy real secrets into a worktree.
- Never start dev servers or preview tools in the main checkout; it has the real env. Use the worktree.

## Merge protocol
- Merge with `gh pr merge <N> --squash --match-head-commit <FULL 40-char SHA>`. Short SHAs fail.
- Before merging: all CI checks green and actually run (not cancelled in the queue), branch up to date with main, no conflicts, no AI attribution in the PR body or commits.
- Contributor PRs (e.g. Rafa): squash-merge under their authorship, no co-author trailers, then a short thank-you comment.
- Never merge with `--admin`. If CI jobs stay queued over 10 minutes, check githubstatus.com, re-run up to 3 times, then stop and report.
- Conflict or failed gate: STOP and report.
- After merging: confirm the production deploy (Docker publish run and image platforms), run the smoke checks below, remove the worktree and branch.

## Shell and verification
- Shell is zsh. Quote variables next to colons (`"${C}:r"`), because `$C:r` is a zsh path modifier.
- Time-box verification. If a non-critical check cannot be confirmed in a few attempts, report it as UNVERIFIED and move on.
- Secrets marked Sensitive in Vercel (e.g. `DATABASE_URL`) cannot be pulled. Database checks are done by Mike in the Neon console; give him the SQL.

## Smoke checks
- CI green on main.
- Docker publish finished and `docker buildx imagetools inspect ghcr.io/crawlseo/crawlseo:edge` lists linux/amd64 and linux/arm64. A main merge moves `:edge`, not `:latest`; `:latest` moves only on a version tag (check `:X.Y.Z` and `:latest` after a release).

## Standing rules
- No AI attribution anywhere.
- No em dashes in UI, docs or comments.
- Never print or commit secrets.
- This is the open-source repo: GEO / cloud code never goes into it.
