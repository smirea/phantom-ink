# Phantom Ink

Web groundwork for Phantom Ink. The current goal is room/state infrastructure, not full game enforcement.

## Rules

Rules notes and board references live in [rules.md](./rules.md). The source page is https://resonym.com/how-to-play/phantom-ink.

## Design

Design language notes live in [design.md](./design.md).

## Architecture

- `apps/server`: Bun API server. It stores users, rooms, and reducer actions in SQLite through Drizzle, rebuilds room state from the action log, and streams room snapshots over SSE.
- `apps/ui`: SvelteKit SPA. Vite proxies same-origin `/api/*` requests to the Bun server in development.
- `packages/shared`: shared TypeScript state, room types, and reducer-like actions used by both server and client.

Rooms use four-letter codes. Client identity is stored in localStorage, namespaced by `?DEBUG_ID=` so multiple browser tabs can act as separate users.

## Development

```sh
bun install
bun run dev
```

Local UI host: http://phantom-ink.localhost (via localias)

Useful checks:

```sh
bun run typecheck
bun run build
```

## Debugging

In a room, the browser exposes:

```js
window.DEBUG.getState();
window.DEBUG.setState(state);
window.DEBUG.loadState(state);
window.DEBUG.getRoom();
```

`setState` and `loadState` accept a state object, `{ state }`, or JSON. They send a room `load-state` action when connected.
