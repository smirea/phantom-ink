# Continuous integration

`workflows/ci.yml` runs on pull requests, `master` pushes, and manual dispatches. Every check is its own job and the jobs run in parallel, so a run takes as long as its slowest check. A newer push to the same branch or pull request cancels the run in progress.

The jobs run the root `lint:ci`, `typecheck`, `test`, and `build` scripts, one each, with a 5-minute timeout. Each takes seconds, so they run on every change with no change detection in front of them. Keep CI checks read-only. The `build` job also uploads `apps/ui/build` as the `ui-build` artifact.

Actions are pinned to commit SHAs. `.bun-version` and `packageManager` pin Bun; update them together. CI caches package downloads, then always installs with `--frozen-lockfile`, so commit `bun.lock` after changing dependencies.

The pre-commit hook already ran lint, the type check, and the tests before the commit existed. CI repeats them for what a hook can't see: a merge, a machine without the hooks, and the build. A CI failure the hook could have caught is a hook bug, so fix the hook. A new check is a package script first. Add it to the hook if it finishes in seconds, and to the `task` matrix as its own job.

env-manager never runs in CI. Bun loads the tracked `.env` defaults, and the workspace scripts read `../../.env` explicitly, so keep those defaults harmless and complete enough for CI.

`mac-update.yml` is separate: on every `master` push it asks the Mac host to pull and redeploy the app.
