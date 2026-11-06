# Gmail deep links

Why the `mail_url` on a booking opens the inbox instead of the mail on the phone, and what to do about it. Researched on 2026-11-06. Desktop results come from Simon's signed-in Chrome on one harmless newsletter. Phone results are pending: the test sheet is a private Artifact with every candidate link for that newsletter, and Simon taps through it on the phone.

Placeholders used below:

- `<hex>`: the Gmail API id of a message or thread, 16 hex digits.
- `<dec>`: the same number in decimal.
- `<token>`: the FMfcgz style token Gmail shows in the address bar.
- `<Message-ID>`: the mail's own Message-ID header.
- `<account>`: the Gmail address of the account.

## Conclusion

Google offers no supported way to link to a single message that opens on a phone. On desktop, several forms work reliably. On the phone, the link is either taken by the Gmail app on Android, which ignores the part after `#`, or opened in Safari on iPhone, where Gmail's mobile web uses its own address format. Any phone fix that works today is an observed, undocumented behaviour that Google can change without notice. The planner should not depend on the Gmail link to show the confirmation on the phone. The confirmation itself belongs in the private `bookings` bucket and is shown in the app. The Gmail link stays as a secondary desktop link.

## Why the current links open the inbox on mobile

Every form of Gmail web link puts the message id in the fragment, the part after `#`, such as `https://mail.google.com/mail/u/0/#all/<token>`. The fragment is never sent to a server. It only works when the desktop Gmail web app is already loaded in the browser and reads it. On the phone, three things get in the way.

1. **Android hands the link to the Gmail app.** `https://mail.google.com/.well-known/assetlinks.json` lists the Gmail app (`com.google.android.gm`) and Google Chat with `delegate_permission/common.handle_all_urls`. Gmail is therefore the verified handler for every `mail.google.com` link, and Android opens the app without asking. The app opens the inbox for these links. Several independent reports say the same, and none show a fragment format that the app honours. The user setting "Open supported links" for Gmail can be turned off, after which the link opens in Chrome.
2. **iPhone opens Safari, not the app.** `mail.google.com` publishes no Apple app site association of its own. Its `/.well-known/apple-app-site-association` redirects to `www.google.com`, and Apple's CDN copy for `mail.google.com` is the `www.google.com` file, which has no entry for the Gmail app and no `/mail` paths. So a tap opens Safari. There, a phone gets Gmail's mobile web (`/mail/mu/mp/`), which has its own fragment format (`#cv/<label>/<hex>` for a conversation, `#tl/<label>` for a list). It most likely does not understand the desktop `#all/<token>` form and falls back to the inbox. This is the hypothesis the phone test confirms or rejects.
3. **Sign in drops the fragment.** If the browser is not signed in to Google, `mail.google.com` redirects to `accounts.google.com` with a `continue` parameter. The fragment is not in `continue`, so after sign in the user lands in the inbox. A link whose id sits in the query string survives this. A link whose id sits in the fragment does not.

The account index matters too. `/mail/u/0/` is the first signed-in account in that browser, which on the phone may be a different account from the one on the PC. `?authuser=<account>` picks the account by address.

## What the FMfcgz token is

The token is not a secret or a session value. It is a reversible encoding of Gmail's permanent thread id, and anyone can build it from the API id. Verified by encoding the newsletter's API id and getting exactly the token that Gmail's own Copy link gave.

- The API hex id, read as a number, is the decimal id Gmail uses internally. `<hex>` and `<dec>` are the same id.
- For a thread, Gmail writes `thread-f:<dec>`. For a message, `msg-f:<dec>`. In a thread with one message, the thread id and the message id are equal.
- The token is that string with any leading `thread-` removed, base64 encoded without padding, then converted from the 64 character base64 alphabet to a 40 character alphabet of consonants. A thread token starts with `FMfcgz` because `f:` always encodes the same way. A message token starts with another letter and is longer.

```
BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
CONSONANTS = "BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz"

encode(plain):                      # plain is "thread-f:<dec>" or "msg-f:<dec>"
    if plain starts with "thread-": drop it
    b = base64(plain) without "=" padding
    return convert_base(b, from BASE64, to CONSONANTS)

decode(token):
    b = convert_base(token, from CONSONANTS, to BASE64)
    pad b with "=" to a multiple of 4
    return base64_decode(b)         # "f:<dec>" for a thread, "msg-f:<dec>" for a message

convert_base(s, from A, to B):      # treat s as a big number in alphabet A
    n = 0
    for ch in s: n = n * len(A) + index of ch in A
    out = ""
    while n > 0:
        n, r = divmod(n, len(B))
        out = B[r] + out
    return out
```

The same method is in the forensic tool ArsenalRecon GmailURLDecoder and in a public gist that reverse engineered it. Gmail also has the thread id in its page markup as `data-thread-perm-id="thread-f:<dec>"` and `data-legacy-thread-id="<hex>"`.

So a pasted Gmail link of any of the three forms (token, `thread-f` or `msg-f` decimals, or hex) can be turned back into `<hex>`, and from there into any other form.

## Candidates

"Desktop" is Simon's signed-in Chrome on Windows. "Phone" is left for the test sheet, numbers in brackets point to its rows.

| Candidate | Identifier and source | Status | Desktop | Phone (expected) |
|---|---|---|---|---|
| Connector link `/mail/?authuser=<account>#all/thread-f:<dec>\|msg-f:<dec>` (1, 1b) | Decimal ids, returned as the view link by the Gmail connector | Observed | Opens the mail, then Gmail rewrites the address to the message token | Android: Gmail app, inbox. iPhone: mobile web, likely inbox |
| Copied link `/mail/u/0/#inbox/<token>` (2) | Token, from Copy link or the address bar on desktop | Observed | Opens the mail. Breaks after archiving, because the view is the inbox | Same as above. This is what Simon reported |
| `/mail/u/0/#all/<token>` (3) | Token, built from `<hex>` with the encoder above | Observed | Opens the mail, also after archiving | Same as above |
| `/mail/u/0/#all/<hex>` (4) | API id, straight from the connector or decoded from any pasted link | Observed, the format of the old Gmail permalink | Opens the mail, rewritten to the token | Same as above |
| `/mail/u/0/#search/rfc822msgid:<Message-ID>` (6) | The mail's own Message-ID header, from the connector | Observed. The `rfc822msgid:` search operator is documented, the URL is not | A result list with exactly one row, one click from the mail. Survives a change of thread id, and is the same on every account that has the mail | Same fragment problem as above |
| Print view `/mail/u/0/?view=pt&search=all&permthid=thread-f:<dec>` (7) | Decimal thread id | Observed, undocumented | Server rendered page with the whole thread, no session token needed, opens the print dialog once. The id is in the query string, so it survives sign in | Likely shows the mail in the browser on iPhone. On Android the Gmail app still takes the link first |
| Mobile web `/mail/mu/mp/#cv/All%20Mail/<hex>` (8) and `#tl/search/rfc822msgid:...` (9) | Hex id or Message-ID | Observed format of an old interface | Untestable: a desktop browser is redirected to the inbox and the fragment is dropped | Might open the mail on iPhone. Android Gmail app still takes it |
| Android `intent://mail.google.com/mail/u/0/#all/<hex>#Intent;scheme=https;package=com.android.chrome;end` (10, 11) | Hex id | Android intent URLs are documented. Using them to bypass Gmail is a workaround | Not applicable | Forces Chrome, which then needs the fragment to be understood by Gmail web on a phone. Untested |
| Android intent to the Gmail app (12) | Hex id | As above | Not applicable | Same as a normal tap, expected to open the inbox |
| iOS `googlegmail://` (13) | None | Only the compose form `googlegmail:///co?...` is documented by others, no Google doc | Not applicable | Launches the app only |
| iOS `googlegmail:///cv=<hex>/accountId=1/` (14, 15) | Hex id | Undocumented, reported to have stopped working | Not applicable | Expected to open the app on its inbox or do nothing |
| iOS `googlechromes://` and `x-safari-https://` (16, 17) | Hex id | Documented schemes of Chrome and Safari | Not applicable | Picks the browser, and then has the same mobile web problem |

Official mechanisms, checked one by one:

- The Gmail API `Message` and `Thread` resources have no web link field. The API gives `id`, `threadId` and headers, nothing to open.
- Apps Script `GmailThread.getPermalink()` is the only official permalink. It is thread level, and Google's own reference says it only works with the classic Gmail interface. It builds the same `#all/<hex>` style link as above, with the same phone problems.
- Google documents no deep link into the Gmail app on Android or iOS for a given message.
- Neither platform has a universal link or app link for a message: Android routes every `mail.google.com` link to the app without a message route, and iOS routes none to the app.

## Recommendation

Make the confirmation itself the thing the phone shows. Keep Gmail as a secondary link for the desktop.

1. **Primary: the confirmation in the private bucket.** When a mail is attached to a booking, store a PDF of the confirmation in the `bookings` bucket with `attach_booking_file`, which is owner only and already shown by the planner. If the mail has a PDF attachment that is the confirmation, store that. Otherwise render the mail's HTML body to a PDF, for example with Playwright `page.pdf`. The bucket takes only PDF and images today, so a rendered PDF fits without a schema change. This works offline and on any phone, and does not depend on Google.
2. **Secondary: one canonical Gmail link.** Store `mail_url` as `https://mail.google.com/mail/u/0/#all/<hex thread id>`. The `#all` view keeps working after the mail is archived or relabelled, the hex id is what the connector returns and what every pasted form decodes to, and it opens the mail reliably on the desktop. The UI can keep the mail icon as it is. Expect it to open the inbox on the phone until the phone test says otherwise.
3. **Optional: the Message-ID.** The `#search/rfc822msgid:<Message-ID>` link is the most robust desktop link, because it does not depend on the thread id and lands one click from the mail. Storing it needs a place, a new column or a note, which is a schema decision and needs its own review. Not part of this fix.

```
attach_mail(booking, source):
    # source is either a connector message, or a link Simon pasted
    if source is a connector message:
        hex = source.threadId
    else:
        hex = hex_from_link(source)
        if hex is None: keep the link as pasted and stop   # unknown form, keep what we have

    mail_url = "https://mail.google.com/mail/u/0/#all/" + hex
    update_booking(booking.id, mail_url=mail_url)

    if source is a connector message:
        pdf = confirmation_attachment(source) or render_html_to_pdf(source.html_body)
        attach_booking_file(booking.id, "confirmation.pdf", base64(pdf))

hex_from_link(url):
    frag = part of url after the first "#", url decoded
    id = last path segment of frag            # after "inbox/", "all/", a label, and so on
    if id matches 16 hex digits: return lowercase id
    if id contains "thread-f:" or "msg-f:": return hex(decimal after the last "f:")
    if id starts with a consonant token: return hex(decimal in decode(id) after "f:")
    return None
```

The `mail_url` comment in migration `0016_booking_mail.sql` already names the `#all/<thread id>` form, so normalising to it matches the record. The planner's pasted link check (`isMailLink` in `planner/src/lib/stayConfirm.ts`) only checks the host and keeps the link as pasted, so the normalising step would go where the link is saved. The semicolons inside the Android intent links in the table are part of that URL syntax.

## Fallback

If the bucket copy is missing and Simon is on the phone:

- **Android:** turn off "Open supported links" for Gmail in the system app settings. Gmail links then open in Chrome, where they behave like Gmail web on a phone. It is a user setting, not something the app can do.
- **iPhone:** open the mail from the Gmail app by searching for the booking reference or the sender. The link cannot do it.
- **Fragile options, not the fix:** the print view link and the old mobile web format may show the mail in a phone browser today. Both are undocumented and may stop at any time, so the planner should not build them in unless the phone test shows they work and Simon accepts that risk.

## Sources

- Android app links of Gmail: https://mail.google.com/.well-known/assetlinks.json
- Apple app site association served for Gmail: https://app-site-association.cdn-apple.com/a/v1/mail.google.com
- Gmail API message resource, no web link field: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages
- Apps Script `getPermalink`, classic Gmail only: https://developers.google.com/apps-script/reference/gmail/gmail-thread#getPermalink()
- Gmail search operators, `rfc822msgid`: https://support.google.com/mail/answer/7190
- Linking Gmail messages on Android and the app intercepting them: https://davesteele.github.io/google/gmail/android/2026/01/02/how-to-hyperlink-gmail-messages-on-android
- Gmail links opening the inbox in the app: https://akiflow.featurebase.app/p/mobile-gmail-links-directly-opens-on-the-gmail-mobile-app
- Gmail links on the phone opening only the web: https://talk.dynalist.io/t/gmail-link-on-mobile-opens-only-the-web-not-the-app/6226
- The iOS Gmail URL scheme, compose only: https://www.macstories.net/links/gmail-for-ios-url-scheme/
- No working iOS scheme for a message: https://talk.macpowerusers.com/t/request-a-shortcut-that-when-run-opens-a-gmail-link-in-the-native-gmail-ios-app/29205
- Token decoder: https://github.com/ArsenalRecon/GmailURLDecoder
- Token encoding reverse engineered: https://gist.github.com/juancampa/d7205a7f404709fc0e1ddb5c09cbe329
- Old permanent Gmail links: https://www.labnol.org/internet/gmail-emails-have-permanent-web-address/6811/
