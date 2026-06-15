# Design

Phantom Ink uses a mobile-first shell centered on desktop so the table experience stays focused and easy to scan. The shell keeps the live lobby/room UI intact while the `Pad` and `Whispers` routes preview future game surfaces.

The palette is neutral ink, paper, muted brass, and restrained velvet purple. Purple is the accent, not the whole surface, so both light and dark modes keep enough contrast without feeling saturated.

The background letter field treats loose letters as drifting spirit fragments. Pointer movement repels them, and the content card pushes them away so the play surface stays readable.

Buttons live in `apps/ui/src/lib/InkButton.svelte`. They support small, medium, and large sizing plus a primary accent state, with hover, press, disabled, and focus motion kept consistent for future screens.

The SVG wordmark in `PhantomLogo.svelte` follows the official Phantom Ink logo direction from Resonym's page while staying themeable for light and dark mode.
