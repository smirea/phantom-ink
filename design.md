# Design

Phantom Ink uses a mobile-first shell centered on desktop so the table experience stays focused and easy to scan. The shell keeps the live lobby/room UI intact while the `Pad` and `Whispers` routes preview future game surfaces.

The palette is neutral ink, paper, muted brass, and restrained velvet purple. Purple is the accent, not the whole surface, so both light and dark modes keep enough contrast without feeling saturated.

## Background Motion

The background is a simple full-screen letter grid. Grid spacing is configurable in the layout code, with the smallest spacing kept large enough that the field stays airy. The whole grid moves at a constant cruising speed in one direction, and individual cells wrap smoothly from one edge of the padded grid span to the opposite edge.

Each cell can be alive, spawning, dying, or empty. The field should stabilize around roughly 70% alive cells: low density increases spawn pressure, high density increases natural decay pressure. Tapped letters disappear immediately in a stronger smoke puff; natural decay collapses the letter visibility quickly and renders its fainter smoke above the letter while following the same grid flow. A newly spawned glyph has a rare 2% chance to be one of `☺`, `☻`, or `☹` instead of a letter, and face glyphs always use the maximum letter scale.

Grid spacing and travel direction change on independent timers with randomized delays, now roughly three times less frequently than the first pass. Direction and spacing transitions share a cooldown so only one state change can start within any 10-second window. Once initialized, the grid should never reset position or rebuild visible letters: the layout keeps a fixed deterministic lattice sized from the minimum spacing and only grows that capacity for larger viewports. Spacing changes tween the lattice spacing over a few seconds, preserving existing cell identity while positions flow into the new grid. When spacing expands and pushes alive cells out of the viewport, those cells create faint puffs near the nearest edge. Direction options cover every 15 degrees, and each direction change picks a target at least `30 + randomInt(0, 10) * 15` degrees away from the current direction when possible. Direction changes still decelerate the grid to a stop, rotate all visible letters to point in the new direction, then accelerate back to cruising speed. Individual letter spin fades with speed and returns as the grid accelerates. Motion, spin, smoke, and state transitions should stay slow and smooth.

The content card does not participate in the background logic. Letters pass behind it, and the background loop avoids layout reads during animation so the number of animated DOM nodes stays bounded by the current grid spacing and viewport size.

`DEBUG.backgroundConfig` enables a fixed top-right tuning panel for the letter grid. It exposes sliders plus numeric inputs for the scalar and range config values, comma-separated spacing options, direction options expressed in degrees, and buttons to immediately trigger direction or spacing changes.

Buttons live in `apps/ui/src/lib/InkButton.svelte`. They support small, medium, and large sizing plus a primary accent state, with hover, press, disabled, and focus motion kept consistent for future screens.

The SVG wordmark in `PhantomLogo.svelte` follows the official Phantom Ink logo direction from Resonym's page while staying themeable for light and dark mode.
