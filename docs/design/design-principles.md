# Design principles

Accepted principles only. They are what the accepted decisions in `design-decisions.md` add up to. A principle changes only when its decision is reconsidered.

| Id | Principle | Rests on |
| --- | --- | --- |
| P-001 | Form carries the meaning. An icon, a state, a position, a colour, a weight or the control itself says it. A sentence is the last resort. | DES-001, DES-002 |
| P-002 | Status comes first, editing second. The most important fact of a screen is the most obvious one. Controls that edit recede until wanted. | DES-003, DES-007 |
| P-003 | Show it, never say it. No instruction lines, no recap sentences, no question marks, no semicolons, dashes, dots or asterisks as separators. | DES-001, DES-009, DES-008 |
| P-004 | Common path first. Detail waits one level deeper in a tap, a sheet or an expanded state. | DES-004 |
| P-005 | Restraint without hiding. Cut repeated labels and meta text, but never hide what the traveller needs to decide. | DES-005 |
| P-006 | When text grows, rethink the component. Subtext under a row usually wants to be a mark on the row. | DES-006 |
| P-007 | Local and honest numbers. Prices in Danish kroner, times as local clock times. | DES-011 |
| P-008 | Apple design leads. Wallet, Maps and Flighty are the references for the booking views. | DES-001 |
| P-009 | A warning shows only when something needs attention. No build line, log text or chip appears while everything is fine. | DES-022 |
| P-010 | An unknown value is never zero and never the word for it. It gets its own mark, dimmed and distinct, so an absence is never mistaken for a number. | DES-013 |
| P-011 | One formatter, used everywhere. Money and durations each have exactly one function, always carrying their unit, never a bare decimal. | DES-025 |
| P-012 | One fact, one mark. Facts are never strung together with dots or asterisks. A term of the booking is a chip among the properties, and detail the provider already shows is a link, not a line. | DES-034, DES-001, DES-006 |
