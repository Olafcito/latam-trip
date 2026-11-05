# Logos

The marks of airlines, booking services and Gmail that the flight sheet, the booked pane and the accommodation panes show. The logos remain the trademarks of their owners and are used here only to name who flies or sold a ticket.

- `airline-XX.svg`: from [Soaring Symbols](https://github.com/soaring-symbols/soaring-symbols) (MIT), the `logo.svg` of each airline, cropped to its drawing. XX is the airline's two letter code.
- `airline-JA.png`: JetSMART, from [airline-logos](https://github.com/Jxck-S/airline-logos) (`radarbox_banners/JAT.png`).
- `travellink.png`: Travellink's globe mark, cut from its listing on momondo.dk.
- `gmail.svg`: Google's four colour Gmail mark, as Google publishes it, with its view box cropped to the drawing.
- `booking.svg`, `expedia.svg`: from [Simple Icons](https://simpleicons.org) (CC0), in each brand's colour.
- `provider-<slug>.svg`: the marks of accommodation sellers, `provider-airbnb`, `provider-hotels-com`, `provider-tripadvisor`, `provider-trip-com`, `provider-trivago`, `provider-hilton` and `provider-marriott` from [Simple Icons](https://simpleicons.org) (CC0), filled with each brand's colour. `provider-google.svg` is the Google mark from [Gilbarbara's logos](https://github.com/gilbarbara/logos) through `@iconify-json/logos` (CC0). `-light` files (Hilton, Marriott) are the same mark in white for a dark ground. The logos remain the trademarks of their owners and are used here only to name where a stay is booked.
- `provider-hostelworld.svg`: Hostelworld's mark from its own site (a.hwstatic.com), trademark of Hostelworld Group plc.
- `provider-agoda.svg`: from Agoda's site (cdn6.agoda.net), and `provider-agoda-light.svg` from Agoda's press kit, trademark of Agoda.
- `provider-vrbo.svg`: from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Vrbo.svg), CC BY-SA 4.0 by Denise Neves, trademark of HomeAway.com, Inc.
- `provider-kayak.svg`: from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kayak_Logo.svg), public domain as a text logo, trademark of KAYAK.
- `provider-despegar.svg`: from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Despegar.com_logo.svg), public domain as a text logo, trademark of Despegar.com.
- `provider-priceline.png`: from Priceline's press site (press.priceline.com), trademark of Priceline.com LLC.
- `provider-hostelz.png`, `provider-hostelz-light.png`: the marks Hostelz.com shares for press, trademark of Hostelz.com.
- `provider-selina.svg`, `provider-selina-light.svg`: from the Selina project's downloads (selina-project.eu), trademark of Selina.

`planner/src/lib/purchase.ts` lists the files it knows. A new logo is a file here plus a line there. The app has no public folder, so these are bundled through `import.meta.glob`.
