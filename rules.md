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

The pad has eight rows per team. Some spaces include an Eye marker that grants a letter reveal before the team takes its normal turn.

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

| Option           | Flow                                                                                                                                               | Result                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask a question   | Medium gives two question cards to the Spirit. The Spirit chooses one, discards the other, then slowly writes a clue in the team's next pad space. | The Medium can call "Silencio" to stop the clue once they think they know enough. The answered question is kept face down for reference. The Medium draws two new question cards. |
| Guess the object | Medium writes the guess one letter at a time in the team's next pad space and says each letter aloud.                                              | The Spirit confirms correct letters by knocking. On a wrong letter, the Spirit signals silence, the wrong letter is crossed out, and the turn ends. A full correct object wins.   |

## Clue Rules

| Rule                    | Summary                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Answer the chosen card  | A clue must answer the question card the Spirit selected.                                       |
| Letters and spaces only | Clues use letters and spaces.                                                                   |
| Shared language         | Clues should be in a language all players understand.                                           |
| No object forms         | A clue cannot contain the object or a form of the object.                                       |
| Flexible words          | Dictionary words, names, invented words, and phrases are allowed if they obey the restrictions. |

## Eye Spaces

When a team starts a turn on its own space with an Eye marker, its Medium chooses any clue already on the pad, from either team. The Spirit who wrote that clue adds the next letter. The team then continues its normal turn.

## End Conditions

| Condition                                                        | Outcome                                     |
| ---------------------------------------------------------------- | ------------------------------------------- |
| A team fully writes the correct object                           | That team wins.                             |
| Neither team guesses correctly after all eight pad rows are used | Both teams lose.                            |
| A Medium makes an incorrect guess                                | No direct penalty beyond spending the turn. |

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

## Notes for Implementation

The initial web implementation should treat the pad as persistent room state, not as full game rules enforcement. The high-value state for now is room membership, team and role seating, ready/start status, the eight-row pad, active team, snapshots, and action history.
