-- Two facts of a booking that lived in its notes get their own columns, so the booked box can show them as rows.
-- seller_reference is the order number of whoever sold the ticket, next to the airline's own reference.
-- fare is the fare name, such as a basic or a flexible fare.
-- public.bookings stays owner only through the rule of 0013_bookings.sql, and never reaches a built file.

alter table public.bookings
  add column seller_reference text,
  add column fare text;
