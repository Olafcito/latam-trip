# Product decisions

Ids never change. Status is Proposed, Accepted or Reconsidered. Only Simon accepts.

## PROD-001 The earliest stop wins

- **Decision.** When two stops compete for the same days, the earlier one keeps them.
- **Reasoning.** Simon plans in travel order, so a change late in the trip must not push the start around.
- **Applies to.** Every rule that moves dates.
- **Date.** 2026-10-30. **Status.** Accepted.

## PROD-002 No silent spare days

- **Decision.** Days that no stop covers are shown as free nights, never absorbed without a word. Adding a stop uses the free nights and asks only when there are none.
- **Reasoning.** Lost days on a two month trip are expensive and easy to miss.
- **Applies to.** Trip page, trip map, any date change.
- **Date.** 2026-10-30. **Status.** Accepted.

## PROD-003 Items open in place

- **Decision.** A stop, leg or booking opens where it sits, not on a separate page.
- **Reasoning.** Simon keeps his place in the trip while looking at one part of it.
- **Applies to.** Every list and map item.
- **Date.** 2026-10-30. **Status.** Accepted.

## PROD-004 The frontend shows all the data the database holds

- **Decision.** If a table holds a fact for what a screen presents, the screen shows it.
- **Reasoning.** Data that is saved but never shown is data Simon cannot trust or correct.
- **Applies to.** Every screen.
- **Date.** 2026-10-29. **Status.** Accepted.

## PROD-005 Private facts stay private

- **Decision.** Booking references, prices paid, names and attachments live only in owner only tables and a private bucket, never in a built file or a commit.
- **Reasoning.** The repo and the web bucket are public.
- **Applies to.** Every feature that stores or shows a booking.
- **Date.** 2026-11-01. **Status.** Accepted.
