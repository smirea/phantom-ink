# Design

Phantom Ink is currently a navigation and motion prototype, not a game-content prototype. The real lobby, pad, and whispers content has been removed so the shell can be judged without placeholder product decisions leaking into the design.

The palette is neutral ink, paper, muted brass, and restrained velvet purple. Purple is the accent, not the whole surface, so both light and dark modes keep enough contrast without feeling saturated.

## App Shell

The app uses a mobile-first shell centered on desktop so the eventual table experience stays focused and easy to scan. The root route is a standalone start screen with the full logo and one large `Start` action. It intentionally has no content card so the first impression is the brand, the background, and a single clear entry point.

After start, the app moves into a compact screen shell with the text-only logo above one content card. The card owns the dummy navigation selector for `Start`, `Lobby`, `Pad`, and `Whispers`. `Lobby`, `Pad`, and `Whispers` are deliberately empty dummy screens with different content heights so navigation, card sizing, scrolling, and transitions can be tested without pretending the real game surfaces are designed.

Buttons live in `apps/ui/src/lib/InkButton.svelte`. They support small, medium, and large sizing plus a primary accent state, with hover, press, disabled, and focus motion kept consistent for future screens.

## Language

The UI voice should stay lightly occult without getting verbose. Use séance, room, side, ready, vote, and words as the plain operational terms, and reserve the more thematic terms for participant-facing atmosphere.

People in a room are called souls in visible copy: lobby counts say `1 soul` or `4 souls`, readiness problems say `At least 4 souls needed`, and fallback names use `Soul` rather than `Player`. Internally the code can still use `player` for domain objects, ids, and component names, but user-facing labels should avoid `player` unless a future rules explanation specifically needs a conventional game term.

Settings copy is intentionally direct: `Change Yourself`, `Abandon séance`, and `Use your own words` are preferred over longer explanatory labels. The app should sound slightly whimsical and ghostly, but controls should still be short, scannable, and obvious.

## Logo

The SVG wordmark in `PhantomLogo.svelte` follows the official Phantom Ink logo direction while staying themeable for light and dark mode. The design keeps the gothic serif wordmark, long pen, central eye-in-diamond mark, and faint rays from the reference, but translates them into the current neutral ink, muted brass, paper, and ghost-purple theme tokens.

The start screen uses the complete logo. The in-app shell uses a compact text-only version above the card so the brand remains present without crowding the working surface. The logo text is split into individual letter spans because the start-to-shell animation treats the letters as their own moving objects.

## Navigation Motion

Chrome and other supporting browsers use the View Transition API for route motion. SvelteKit `onNavigate` handles browser back/forward and programmatic navigation, while same-origin link clicks are explicitly wrapped with `document.startViewTransition(() => goto(...))` so normal app clicks reliably transition through SvelteKit instead of depending only on link interception timing.

The content card has a stable `view-transition-name` and animates between dummy screens as one surface. Root-level crossfades are disabled, and the old card image fades out quickly so old screen content does not linger under the new card.

The start-to-lobby transition is the special branded transition. Only moves to or from the start screen enable per-letter logo transition names through `html[data-logo-transition='letters']`; ordinary `Lobby`/`Pad`/`Whispers` navigation keeps logo letters out of the View Transition system to avoid ghosted duplicate logos. The logo art, including the eye and pen, fades away while the letters wobble into the compact shell position like a loose ghostly string.

Svelte `in:`/`out:` route transitions are intentionally not used for the card shell because they render old and new keyed panels at the same time. Browsers without native View Transitions should swap routes immediately rather than showing a slower fallback that muddies the interface.

## Background Motion

The active background is owned by `apps/ui/src/lib/BackgroundHost.svelte` so the layout shell stays focused on app chrome. The host creates one shared `BackgroundState`, mounts the WebGL renderer, and keeps the debug config panel separate. `apps/ui/src/lib/BackgroundConfigPanel.svelte` owns the debug controls, and `apps/ui/src/lib/backgroundState.svelte.ts` owns the tunable config, debug API, action bus, and lightweight frame metrics.

`BackgroundWebGL.svelte` is the only committed background renderer. It uses a glyph atlas for every letter and draws the grid with instanced WebGL attributes: the CPU uploads per-cell data only when cell identity, life state, glyph, or grid coordinates change, while grid motion, display rotation, individual spin, spawn scaling, and decay fading are calculated in shaders from uniforms and instance attributes. Atlas creation happens only when glyph inputs change, and the renderer uses WebGL vertex array objects when available so attribute setup is cached instead of replayed every draw. Glyph color comes from a background-specific theme token so light mode uses dark letters while dark mode keeps a muted ghost tone. The renderer keeps one reusable instance buffer and updates only dirty cell ranges after the initial upload or capacity growth. Tap and edge burn effects are drawn as bounded instanced quads rather than a full-screen shader pass. Tapped-letter flames are screen anchored so they flash at the tapped letter position; edge effects stay grid anchored so they flow with the field. Each burn stays a single WebGL instance and uses a procedural shader for a quick hot core, orange flame tongues, ember edges, and subtle flicker. The flame shader uses the same top-left screen origin as pointer events and glyph centers.

The background displays a simple full-screen letter grid with configurable spacing, with the smallest spacing kept large enough that the field stays airy. Spacing changes only move the grid cell centers farther apart or closer together; glyph size is controlled separately by the letter-size scale range over a fixed base pixel size. The runtime keeps a fixed physical pool of grid cells and moves the grid continuously in the selected direction instead of rebuilding visible state.

Each cell can be alive, spawning, dying, or empty. Cell life updates happen on a coarse tick rather than every frame, and the field should stabilize around roughly 85% alive cells: low density increases spawn pressure, high density increases natural decay pressure. Tapped letters disappear immediately in a quick flame flash; natural decay now only zooms the glyph down and fades it out without a burn effect. A newly spawned glyph has a rare 2% chance to be one of `☺`, `☻`, or `☹` instead of a letter, and face glyphs always use the maximum letter scale.

Grid spacing and travel direction changes share one autonomous event scheduler. After a spacing or direction transition finishes, the next random event is scheduled `rand(10, 30)` seconds later, and autonomous events do not start while the window is blurred or hidden. Once initialized, the grid should never reset position or rebuild visible letters. Before a spacing tween starts, the virtual grid origin is rebased around the viewport center so existing cells keep their exact screen positions while column and row indexes stay local. During spacing compression, capacity is grown from projected target edge coverage as soon as the tween starts, so newly exposed strips are already spawning before the viewport opens instead of appearing after blank bands. Edge wrapping uses a virtualized grid ring buffer, so when travel pushes a row or column safely offscreen, only that strip is moved to the opposite side. Normal wrapping stays recycled for performance; excess rows and columns created by spacing changes are only untracked after they leave the viewport, and the WebGL instance buffer shrinks after meaningful drops.

Spacing changes tween cell spacing over a few seconds, preserving existing cell identity while positions flow into the new grid. Random spacing targets are chosen from the configured spacing bounds and are at least 30% different from the previous spacing whenever the bounds allow it. When spacing expands and pushes alive cells out of the viewport, those cells create faint puffs near the nearest edge. Direction options cover every 15 degrees, and autonomous direction changes pick a target at least 30 degrees away while excluding exact 180-degree reversals. Direction changes decelerate grid travel to a stop over 2 seconds, then rotate every visible letter from its frozen current rotation to the new travel direction over another 2 seconds before accelerating back to cruising speed. Individual letter spin restarts from the aligned direction once cruising resumes, so it never catches up to hidden elapsed time. Motion, spin, flame flashes, and state transitions should stay slow and smooth.

The content card does not participate in the background logic. Letters pass behind it, and the animation loop avoids layout reads during motion. The renderer pauses when the page is hidden, keeps animating at a 15 fps cap when the window is blurred, uses a paused engine clock after hidden-page resumes so the grid does not jump, and exposes FPS, DPR cap, and antialias settings for performance testing. Window resizing is scheduled through one animation-frame resize pass and skips backing-store reallocations when the canvas dimensions are unchanged. Per-frame CPU work is limited to engine time integration, uniform updates, dirty cell uploads, and a small bounded flame instance upload. Cell life work stays on a coarse tick and avoids transient arrays; the remaining known spike risks are edge wrapping and spacing expansion paths that still scan the cell list when they need to move or inspect strips.

The tuning panel is disabled by default. Calling `DEBUG.backgroundConfig()` opens a fixed top-right panel and returns the live background config; calling `DEBUG.backgroundConfig(false)` closes it. `?debugBackground=true` opens the same panel for browser testing. The panel intentionally exposes a small set of live controls: density, spacing, direction, movement speed, rotation speed, tap flame, face chance, FPS, DPR cap, antialias, letter size, opacity, flame duration, and immediate random direction/spacing buttons. Debug actions bypass the autonomous transition cooldown so the controls respond immediately.
