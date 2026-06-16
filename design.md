# Design

Phantom Ink uses a mobile-first shell centered on desktop so the table experience stays focused and easy to scan. The shell keeps the live lobby/room UI intact while the `Pad` and `Whispers` routes preview future game surfaces.

The palette is neutral ink, paper, muted brass, and restrained velvet purple. Purple is the accent, not the whole surface, so both light and dark modes keep enough contrast without feeling saturated.

## Background Motion

The background lives in `apps/ui/src/lib/AnimatedBackground.svelte` so the layout shell stays focused on app chrome. It renders a simple full-screen letter grid with configurable spacing, with the smallest spacing kept large enough that the field stays airy. The runtime keeps a fixed physical pool of grid cells and moves one `.letter-grid` container with a single transform instead of animating every letter position independently.

Each cell can be alive, spawning, dying, or empty. Cell life updates happen on a coarse tick rather than every frame, and the field should stabilize around roughly 70% alive cells: low density increases spawn pressure, high density increases natural decay pressure. Tapped letters disappear immediately in a stronger smoke puff; natural decay hides the letter quickly and renders its fainter smoke above the letter while following the same grid flow. Spawning, decay, smoke expansion, and individual letter spin are CSS animations attached to stable cells. A newly spawned glyph has a rare 2% chance to be one of `☺`, `☻`, or `☹` instead of a letter, and face glyphs always use the maximum letter scale.

Grid spacing and travel direction change on independent timers with randomized delays, now roughly three times less frequently than the first pass. Direction and spacing transitions share a cooldown so only one state change can start within any 10-second window. Once initialized, the grid should never reset position or rebuild visible letters: the cell pool is sized from the minimum spacing and only grows for larger viewports. Edge wrapping uses a DOM virtualized ring buffer, so when travel pushes a row or column safely offscreen, only that strip is moved to the opposite side. The hot path never remaps the full cell array at wrap boundaries.

Spacing changes tween cell spacing over a few seconds, preserving existing cell identity while positions flow into the new grid. When spacing expands and pushes alive cells out of the viewport, those cells create faint puffs near the nearest edge. Direction options cover every 15 degrees, and each direction change picks a target at least `30 + randomInt(0, 10) * 15` degrees away from the current direction when possible. Direction changes still decelerate the grid to a stop, rotate all visible letters to point in the new direction, then accelerate back to cruising speed. Individual letter spin uses a small set of CSS duration classes and pauses while the grid is changing direction. Motion, spin, smoke, and state transitions should stay slow and smooth.

The content card does not participate in the background logic. Letters pass behind it, and the animation loop avoids layout reads during motion. Per-frame work is limited to time integration for the grid transform and state machines; DOM-heavy changes happen only on cell life ticks, offscreen strip recycling, viewport growth, or explicit debug actions.

The tuning panel is disabled by default. Calling `DEBUG.backgroundConfig()` opens a fixed top-right panel and returns the live background config; calling `DEBUG.backgroundConfig(false)` closes it. The panel exposes sliders plus numeric inputs for scalar and range config values, text inputs for glyphs, special glyphs, spacing options, and direction options expressed in degrees, and buttons to immediately trigger direction or spacing changes.

Buttons live in `apps/ui/src/lib/InkButton.svelte`. They support small, medium, and large sizing plus a primary accent state, with hover, press, disabled, and focus motion kept consistent for future screens.

The SVG wordmark in `PhantomLogo.svelte` follows the official Phantom Ink logo direction from Resonym's page while staying themeable for light and dark mode.
