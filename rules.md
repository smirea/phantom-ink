# Phantom Ink Rules

Source: https://resonym.com/how-to-play/phantom-ink

Printable instructions referenced from the source page:
https://resonym.com/wp-content/uploads/2023/10/final_phantom_ink_instructions.pdf

## Goal

Two teams race to identify the same secret object. Each team has a Spirit who knows the object and a Medium who asks questions, interrupts clues, and makes guesses. The first team to fully write the correct object wins.

## Components

The source page includes this component diagram:

![Phantom Ink components](https://resonym.com/wp-content/uploads/2021/04/ghost_writer_instructions_diagram_components.png)

The older page image labels 100 question cards and 50 object cards. The current printable PDF linked from the same page lists 102 question cards and 52 object cards.

| Component      | Source image content                                                                     | Purpose                                               |
| -------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Pad            | Two columns: Sun team's side and Moon team's side                                        | Shared board where clues and guesses are written      |
| Question cards | Example card category: Variety; prompt asks what variety the object comes in             | Mediums submit questions for Spirits to answer        |
| Object cards   | Example list includes Apple, Calendar, Snowman, Chili, Fox, Table, with Calendar circled | Spirits choose the secret object from one shared card |
| Pencils        | Two pencils                                                                              | Spirits and Mediums write clues or guesses            |

## Board Reference

The pad has eight rows per team. Some spaces include an Eye marker that offers a letter reveal before the team takes its normal turn.

| Row | Sun space | Sun eye | Moon space | Moon eye | Co-op letter budget shown |
| --- | --------- | ------- | ---------- | -------- | ------------------------- |
| 1   | PAP       | No      | PLAN       | No       | 2                         |
| 2   | GOO       | No      | WOR        | No       | 2                         |
| 3   | S         | No      | OFF        | Yes      | 2                         |
| 4   | blank     | Yes     | blank      | No       | 3                         |
| 5   | blank     | No      | blank      | Yes      | 3                         |
| 6   | blank     | Yes     | blank      | Yes      | 4                         |
| 7   | blank     | Yes     | blank      | No       | 5                         |
| 8   | blank     | No      | blank      | No       | 5                         |

## Setup

The source page includes this seating diagram:

![Phantom Ink seating diagram](https://resonym.com/wp-content/uploads/2021/04/ghost_writer_instructions_diagram_seating-206x300.png)

| Step | Summary                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1    | Split players into Sun and Moon teams.                                                            |
| 2    | Each team chooses a Spirit and a Medium. Extra players join as additional Mediums on a team.      |
| 3    | Each Medium draws seven question cards and keeps them private.                                    |
| 4    | The two Spirits draw one object card, look at it privately, and agree on the object for the game. |

## Turn Options

The Sun team goes first. On a team's turn, rotate the pad toward that team. The Medium chooses one of two options.

| Option           | Flow                                                                                                                                             | Result                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask a question   | Medium gives two question cards to the Spirit. The Spirit chooses one, discards the other, then submits a complete clue for the chosen question. | The clue is revealed one letter at a time as the Medium asks for more letters. The Medium calls "Silencio" when they think they know enough. The answered question is kept face down for reference. The Medium draws two new question cards. |
| Guess the object | Medium writes the guess one letter at a time in the team's next pad space and says each letter aloud.                                            | The Spirit confirms correct letters by knocking. On a wrong letter, the Spirit signals silence, the wrong letter is crossed out, and the turn ends. A full correct object wins.                                                              |

## Standard Example

The source page's example turn has these important game-state pieces:

| Component        | Example value                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Medium           | Avery                                                                                     |
| Spirit           | Jordan                                                                                    |
| Question chosen  | Material question                                                                         |
| Secret object    | Calendar                                                                                  |
| Intended clue    | Paper                                                                                     |
| Visible pad text | PAP                                                                                       |
| Stop condition   | The Medium calls Silencio after enough letters are visible, so the rest stays unrevealed. |

## Clue Rules

| Rule                    | Summary                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Answer the chosen card  | A clue must answer the question card the Spirit selected.                                       |
| Letters and spaces only | Clues use letters and spaces.                                                                   |
| Shared language         | Clues should be in a language all players understand.                                           |
| No object forms         | A clue cannot contain the object or a form of the object.                                       |
| Flexible words          | Dictionary words, names, invented words, and phrases are allowed if they obey the restrictions. |

## Eye Spaces

When a team starts a turn on its own space with an Eye marker, its Medium may choose any clue already on the pad, from either team. If the team uses the Eye, the next letter of that clue is revealed. If the team skips it, the turn continues normally with no reveal.

Eye reveals are optional in the digital implementation. The source page treats Eye spaces as mandatory, but the app should let a team skip the hint when they do not need it.

## End Conditions

| Condition                                                        | Outcome                                     |
| ---------------------------------------------------------------- | ------------------------------------------- |
| A team fully writes the correct object                           | That team wins.                             |
| Neither team guesses correctly after all eight pad rows are used | Both teams lose.                            |
| A Medium makes an incorrect guess                                | No direct penalty beyond spending the turn. |

## Strategy and Clarifications

| Topic                        | Rule note                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Calling Silencio             | Mediums generally benefit from stopping clues early so the other team receives less information.                               |
| Digital clue reveal          | The Spirit submits the full clue first. The Medium controls how many letters are revealed, one at a time.                      |
| Finished clues               | In physical play, a completed clue gets a period. In digital play, a clue is complete when every submitted letter is revealed. |
| More than four players       | Add extra Mediums to teams. Teammate Mediums share question cards and may quietly coordinate.                                  |
| Bad question hand            | Each team may once discard its question cards and draw a fresh hand.                                                           |
| Looking up spelling          | Spelling help is allowed. Mediums should not search facts or autocomplete clue fragments.                                      |
| Spirit table talk            | Spirits should not add guidance beyond the written clue and required signals.                                                  |
| Spirits disagree on object   | If Spirits cannot agree on the object, choose one randomly.                                                                    |
| Eye spaces                   | Eye spaces are optional in the digital implementation, even though they are mandatory on the source page.                      |
| Guessing on the eighth turn  | A team is not forced to guess on its last space, though the source recommends it.                                              |
| Spirit question-card peeking | Competitive groups should keep each team's questions private; casual groups can allow Spirit peeking if agreed.                |
| Misspelled correct object    | The source recommends being charitable when the guess clearly identifies the object.                                           |

## Co-op Variant Diagram

The source page includes this co-op example:

![Phantom Ink co-op diagram](https://resonym.com/wp-content/uploads/2024/12/20240322_phantom_ink_coop_diagram-1024x715.png)

The co-op diagram shows clue fragments and a rising letter budget across the pad.

| Row | Letter budget | Sun example | Sun eye | Moon example | Moon eye |
| --- | ------------- | ----------- | ------- | ------------ | -------- |
| 1   | 2             | RO          | No      | WH           | No       |
| 2   | 2             | FA          | No      | CR           | No       |
| 3   | 2             | FO          | No      | empty symbol | Yes      |
| 4   | 3             | ORN         | Yes     | HUM          | No       |
| 5   | 3             | BRE         | No      | EA           | Yes      |
| 6   | 4             | CART        | Yes     | SCRA         | Yes      |
| 7   | 5             | EASTE       | Yes     | DELIC        | No       |
| 8   | 5             | OSTRI       | No      | EGG, circled | No       |

## Co-op Rules

| Topic            | Summary                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Players          | Use one Spirit and one or more Mediums for two- or three-player games.                                                                                     |
| No Silencio      | Mediums do not interrupt clues. The Spirit writes a fixed number of letters based on the current row's budget.                                             |
| Turn order       | Mediums alternate between the Sun side and Moon side of the pad.                                                                                           |
| Sun turn         | Ask a question as in the standard game, then receive the budgeted number of clue letters.                                                                  |
| Moon turn        | Either guess the object, or let the Spirit draw two question cards, discard one, and answer the other without showing the Mediums which question was used. |
| Co-op eye spaces | On Sun turns, Mediums choose any clue for the next-letter reveal. On Moon turns, the Spirit chooses a clue from the Moon side.                             |
| Score and end    | The group wins by guessing the object within eight rounds. The score is the number of rounds used; otherwise everyone loses.                               |

## Notes for Implementation

The initial web implementation should treat the pad as persistent room state, not as full game rules enforcement. The high-value state for now is room membership, team and role seating, ready/start status, the eight-row pad, active team, optional Eye reveals, hidden full clue text with revealed-letter count, snapshots, and action history.

The server persists this room state with Drizzle over Bun SQLite; the action log remains the source for rebuilding live room snapshots.
