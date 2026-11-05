# Product backlog

Requests Simon has made that are not yet specified or built. One line each, with the date and where it came from. A request leaves this list when it becomes a FEAT spec or is dropped.

| Date | Request | Notes |
|---|---|---|
| 2026-11-05 | Add reservations made on other portals, not only the sites the app links to | Said while rethinking the task runner. Add booking reads a confirmation already, so this is about the portals the booking form and the lodging links accept |
| 2026-11-05 | Search support for Airbnb, from a search link such as an Airbnb homes search for a place with check in and check out dates | Airbnb has no connector and its pages are behind a bot check for a plain fetch, so this needs a browser on the PC or an official API |
| 2026-11-05 | Mark a picked stay as booked from the app, with its confirmation | Asked after picking a room left the row on Not booked. Today a stay is booked only through the connector's `add_booking`. The bus and boat legs already open the booking form in a modal from the leg, and Add booking reads a confirmation for flights, so the stay row could reuse both |
| 2026-11-05 | Room level Booking.com prices from the app, without the PC | The connector gives one price per property and no rooms. The rooms, photos and room prices of a Booking.com place now come from the PC through the queued `stay_details` task, so this is only about reading them from the app itself, with no PC. A headless browser on the PC reads the hotel page, but Booking.com gives a bot challenge to a plain fetch from a server |
