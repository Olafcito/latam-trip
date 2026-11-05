-- A booking gets the link to its confirmation mail, so the booked pane can open the mail in one press.
-- mail_url is a Gmail thread link, such as https://mail.google.com/mail/u/0/#all/<thread id>.
-- public.bookings stays owner only through the rule of 0013_bookings.sql, and never reaches a built file.

alter table public.bookings
  add column mail_url text
  check (mail_url is null or mail_url ~* '^https://');
