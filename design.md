# Design

Phantom Ink should feel like a small occult table: quiet, tactile, and a little strange, but still fast to read and easy to use on a phone. The document's job is to explain how the interface should function, not how the implementation is built.

## Product Principles

- Mobile first. Every primary flow should work comfortably in a narrow viewport, including forms and turn actions while the phone keyboard is open.
- Keep the current decision obvious. Each screen should make the next useful action feel clear without adding instructional copy.
- Prefer compact, direct controls over explanation. The interface can be atmospheric, but commands should stay short and scannable.
- Treat the server and shared game state as authoritative. Local UI can feel immediate, but room state should always settle back to the broadcast room snapshot.
- Preserve table presence. The background, logo, room code, avatars, and team marks should make the app feel like one shared place.

## Visual Direction

The palette is neutral ink, paper, muted brass, sun gold, moon violet, and restrained velvet purple. Purple is an accent, not the whole surface. Light and dark modes should keep contrast high without feeling saturated.

The app uses one focused mobile-width shell on desktop. Cards and controls should be compact, dense, and stable rather than decorative. Buttons, pills, team sides, and action docks should feel tactile through small hover, press, loading, and disabled states.

## Language

The voice is lightly occult but operational. Use séance, room, side, ready, vote, clue, guess, and word as plain game terms. Use souls for visible participant copy: `1 soul`, `4 souls`, `nearby souls`, and fallback identity names. Keep `player` for code and domain objects, not user-facing labels.

Preferred labels are short:

- `Start`
- `Who are you?`
- `Convene a new séance`
- `Use your own words`
- `Ready?`
- `Change Yourself`
- `Abandon séance`

Avoid helper text unless a missing requirement or failure needs to be surfaced.

## Screens

### Start

The root screen is only the full logo and one large `Start` action. It should sell the brand, background, and entry point without a card or extra copy.

### Setup

Setup captures the user's table identity. The user chooses an icon, color, and name, can randomize icon/color quickly, and continues back to the route they were trying to reach. Invalid or unsaved identity should redirect here before private room flows.

### Lobby

The lobby is for finding or creating a séance. The primary action starts a new room. Open rooms are rows with room code, soul count, participant pills, and started state. Nearby souls provide presence without becoming a chat or social feed.

Long soul lists should collapse cleanly and expand in place. Joining or creating should show immediate pending feedback and avoid route jumps that feel accidental.

### Room Lobby

The room lobby is the staging table. It should show the room code clearly, then let souls choose Sun or Moon, vote on word mode, and ready up. Spectators or late arrivals sit in a waiting area until they choose a side.

Team columns should behave as large touch targets. A soul's current side should be visually obvious. Empty sides should be visible without feeling like errors.

Word mode is a shared vote. `Use your own words` toggles between standard and custom words, with vote dots showing who has agreed. Readiness uses the same consensus language: show who is ready, block start until the room satisfies the rules, and replace the action label with the current start problem when needed.

When the game starts, lobby controls leave the foreground and the room moves into the game surface.

### Game

The game surface should be phase-driven. Show only the controls that matter for the current role, team, and phase, while keeping the shared board readable for everyone.

Core flow:

- Spirits choose the shared secret word from the object card.
- The active team's Mediums choose whether to ask, use an available Eye hint, or guess.
- To ask, Mediums offer two question cards. The Spirit chooses one, discards the other, and writes the full clue privately.
- Clues reveal one letter at a time until the Mediums call `Silencio` or the clue is exhausted.
- Eye hints are optional and reveal the next letter of an existing clue from either side.
- Guesses are entered one letter at a time. A wrong letter ends the turn; a complete correct word wins.
- If neither side wins before the board is full, the table loses.

Votes should feel lightweight and social. Eligible souls can change a vote before consensus. Pending votes should be visible without cluttering the screen, and consensus should advance the phase immediately.

The game UI should favor a sticky action area, compact board rows, clear Sun/Moon ownership, and visible handoffs between teams. Private information should be shown only to the role that needs it.

### Placeholder Routes

`/pad` and `/whispers` are still layout probes. They should remain visibly unfinished and should not imply final product decisions until those surfaces are designed.

## App Shell

After start/setup, the app uses a compact shell with a top brand or room marker, user profile trigger, and one content card. Room screens use the room code as the primary mark and keep the compact logo secondary.

The user menu owns cross-screen personal actions: theme toggle, `Change Yourself`, and `Abandon séance` inside a room. Closing the menu should feel immediate from outside taps, Escape, or choosing an action.

`InkButton` is the shared button language. It should keep sizing, primary state, loading, disabled state, vote badges, and press feedback consistent across setup, lobby, room, and game controls.

## Motion

Route motion should make navigation feel continuous without slowing down the table. Browsers with View Transitions should animate shell/card changes and special logo moves. Browsers without that support should swap immediately.

The start/setup/room transitions can use the logo letters as branded motion. Ordinary in-shell navigation should keep the logo stable so duplicate ghost logos do not distract from the task.

Reduced-motion preferences should remove decorative movement while preserving state changes and feedback.

## Background

The background is a full-screen field of drifting letters behind the interface. It should stay atmospheric and responsive without becoming the main content.

Desired behavior:

- The grid stays airy and continuously moving; spacing changes should preserve visible letter identity instead of resetting the field.
- Letters can spawn, fade, and disappear naturally, with the field settling around a mostly filled state.
- Tapped letters vanish immediately with a small flame flash.
- Rare face glyphs can appear as little surprises, but they should stay uncommon.
- Direction changes should feel deliberate: decelerate to a stop over 2 seconds, rotate visible letters toward the new travel direction over another 2 seconds, then accelerate back to cruising speed.
- Spacing and direction events should be slow, smooth, and infrequent.
- The card never participates in background logic. Letters pass behind it.
- Hidden tabs should pause without jumping on resume; blurred windows can keep a low-frame-rate version alive.
- Interaction flame effects and idle animation frames should stay bounded and avoid steady memory churn.

The debug background panel is for tuning only. `DEBUG.backgroundConfig()` or `?debugBackground=true` can expose live controls, but those controls should not affect the normal interface.

## Debug Game Route

`/debug/game` is a direct playground for the game flow. It should stay route-local, minimal, and useful for testing phases without multiple browser sessions. The debug route can expose player selection and phase controls, but it should reuse the same interaction language the real game surface wants.
