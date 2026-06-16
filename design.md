# Design

Phantom Ink uses a mobile-first shell centered on desktop so the table experience stays focused and easy to scan. The shell keeps the live lobby/room UI intact while the `Pad` and `Whispers` routes preview future game surfaces.

The palette is neutral ink, paper, muted brass, and restrained velvet purple. Purple is the accent, not the whole surface, so both light and dark modes keep enough contrast without feeling saturated.

## Background Motion

The background letter field treats loose letters as drifting spirit fragments. They fade in and out independently, rotate gently, and drift with a shared current so the field feels intentional instead of like random screen noise.

Letters should keep moving at a minimum speed, wrap around the viewport edges, and vary slightly per letter for velocity, rotation, pointer repulsion, letter-to-letter repulsion, and content collision response. Pointer movement should softly push nearby letters without making the field feel gamey or distracting.

The content card is a protected play surface. Letters bounce away from its bounds and puff into smoke on impact so collisions feel ghost-like while keeping the UI readable. Clicking or tapping a visible background letter should make it disappear immediately in a small smoke puff.

Buttons live in `apps/ui/src/lib/InkButton.svelte`. They support small, medium, and large sizing plus a primary accent state, with hover, press, disabled, and focus motion kept consistent for future screens.

The SVG wordmark in `PhantomLogo.svelte` follows the official Phantom Ink logo direction from Resonym's page while staying themeable for light and dark mode.
