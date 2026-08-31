# Stack

- Runtime: Bun API server
- Language: TypeScript, Svelte
- UI: SvelteKit SPA
- Styling: Svelte CSS with Tailwind CSS v4 available
- Data Fetching: TanStack Query
- Linting: Oxlint + oxfmt
- Git Hooks: Lefthook
- Utility helpers: prefer `es-toolkit` for common collection, object, and math helpers.

# Architecture

- Vite serves the UI in dev and proxies same-origin `/api/*` requests to Bun.
- The Bun server owns API routes and serves the built UI for `bun run start`.
- Shared environment parsing lives in `packages/shared/src/env.ts`.

# Environment

- Environment files are managed by `env-manager`.
- Keep `.env` tracked with harmless/default values and `.env.local` ignored for local values.

# Code Style

- Treat required data as required. Do not add fallback branches, placeholder states, or defensive existence checks for fields that are guaranteed by types, route invariants, or the surrounding flow. Fix the broken invariant at its source instead of adding UI or code paths for impossible states.

# Frontend

- Tailwind CSS v4 is wired through `@tailwindcss/vite`.
- Global styles are imported from `apps/ui/src/routes/layout.css`.
- Theme values live in `apps/ui/src/routes/theme.css` and are selected with `html[data-theme]`.
- TanStack Query is configured in `apps/ui/src/routes/+layout.svelte`.
- Prefer Svelte component CSS for styling. Use Tailwind only for small inline layout and spacing utilities when that is simpler than adding a class.
- Nest css class definitions in logical blocks where appropriate (one level is fine, don't over do it). Example for a custom `.table {} .table-row {} .table-cell {}` prefer defining them as `.table { .table-row {} .table-cell {} }`
- never add pure accessibility clutter, no aria attributes

# Local Dev Hosts

- UI: phantom-ink.localhost -> 6080

# Game QA

- `/debug/game` runs the shared game machine locally in sync mode. Use it for quick single-browser runs, switching the active player from the debug header and driving votes through every phase.
- Before changing game UI, trace every affected state for the active spirit, active mediums, opposing team, and spectators/TV. Preserve the intended information boundaries for each viewer instead of assuming one role's visible data applies to the others.
