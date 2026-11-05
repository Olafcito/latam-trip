# Logos

The marks of airlines, booking services and Gmail that the flight sheet and the booked pane show. The logos remain the trademarks of their owners and are used here only to name who flies or sold a ticket.

- `airline-XX.svg`: from [Soaring Symbols](https://github.com/soaring-symbols/soaring-symbols) (MIT), the `logo.svg` of each airline, cropped to its drawing. XX is the airline's two letter code.
- `airline-JA.png`: JetSMART, from [airline-logos](https://github.com/Jxck-S/airline-logos) (`radarbox_banners/JAT.png`).
- `travellink.png`: Travellink's globe mark, cut from its listing on momondo.dk.
- `gmail.svg`: Google's four colour Gmail mark, as Google publishes it, with its view box cropped to the drawing.
- `booking.svg`, `expedia.svg`: from [Simple Icons](https://simpleicons.org) (CC0), in each brand's colour.
- `provider-<slug>.svg`: the marks of accommodation sellers, `provider-airbnb`, `provider-hotels-com`, `provider-tripadvisor`, `provider-trip-com`, `provider-trivago`, `provider-hilton` and `provider-marriott` from [Simple Icons](https://simpleicons.org) (CC0), filled with each brand's colour. `provider-google.svg` is the Google mark from [Gilbarbara's logos](https://github.com/gilbarbara/logos) through `@iconify-json/logos` (CC0). `-light` files (Hilton, Marriott) are the same mark in white for a dark ground. The logos remain the trademarks of their owners and are used here only to name where a stay is booked.

`planner/src/lib/purchase.ts` lists the files it knows. A new logo is a file here plus a line there. The app has no public folder, so these are bundled through `import.meta.glob`.
