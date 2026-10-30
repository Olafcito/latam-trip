# Save Momondo prices from your own browser

The Momondo save script adds two buttons to a Momondo flight search and a Pick button to each result. One press stores the prices you are looking at in this repo, the same way the browser workers store theirs. The app then shows them next to the crawled prices, marked as saved by you.

The script never books, signs in or pays anywhere. It only reads the page and writes to this repo.

## 1. Install Tampermonkey

1. Open the Tampermonkey page for your browser: Chrome Web Store, Edge Add-ons or Firefox Add-ons. Search for Tampermonkey and pick the one by Jan Biniok.
2. Press Add to browser.
3. In Chrome and Edge, open the extension details for Tampermonkey (right click its icon, then Manage extension) and turn on Allow User Scripts. Older Chrome versions ask for Developer mode on the extensions page instead. Without this the script does not run.

## 2. Install the script

Open this address in the same browser:

https://raw.githubusercontent.com/Olafcito/latam-trip/main/plugin/userscripts/momondo-save.user.js

Tampermonkey shows an install page. Press Install. Tampermonkey checks the same address for updates, so a parser fix in the repo reaches your browser by itself.

## 3. Create a GitHub token

The token lets the script write a file to this repo. Give it as little as possible.

1. On github.com, open your picture at the top right, then Settings.
2. At the bottom of the left menu, open Developer settings.
3. Open Personal access tokens, then Fine-grained tokens, then Generate new token.
4. Token name: momondo save. Expiration: pick a date after the trip, for example 90 days.
5. Resource owner: Olafcito.
6. Repository access: Only select repositories, then pick latam-trip. Do not choose All repositories.
7. Permissions: open Repository permissions and set Contents to Read and write. GitHub adds Metadata as read only by itself. Leave everything else at No access.
8. Press Generate token and copy it. GitHub shows it only once.

Never paste the token into a chat, an issue or a file in the repo.

## 4. Give the token to the script

1. Open any Momondo flight search, for example https://www.momondo.dk/flight-search/CPH-GUA/2026-12-03/VVI-CPH/2027-02-03?sort=price_a
2. Click the Tampermonkey icon. Under Momondo save (latam-trip), choose Set GitHub token.
3. Paste the token and press OK. The status line says Token saved.
4. Choose Check GitHub token to test it. The status line says Token works for Olafcito/latam-trip.

The token stays inside Tampermonkey in this browser. Remove GitHub token in the same menu deletes it.

You can also skip the token. The buttons then open a filled in GitHub issue instead, and Claude imports the prices from there. See section 6.

## 5. The two buttons

The buttons sit in a small box at the bottom left of a Momondo flight search. The line under them tells you what happened.

**Save prices** stores every result in the list. Wait until the search is finished, then press it. The script opens each result card, reads its flight details and booking offers, and closes it again. It reads the Billigst tab and the Bedst tab, up to 40 results each, and goes back to the tab you started on. A result that shows in both tabs is saved once. Ads are left out. When it is done the line reads, for example, Saved 14 prices.

**Save trip** stores the one result you have opened. Open a result so its details show, then press Save trip and type a name, for example Panama stopover. The line reads Saved trip "Panama stopover". The name follows the price into the app, so you can find the trip again.

Route and dates come from the address of the search page, so the saved prices always match the search you ran.

**Pick** sits under Vælg on each result when you came from a leg in the planner, which searches one way. It chooses that exact flight for the leg. The script opens the result, reads its times, stops, price and booking site, closes it again and opens the planner in a new tab with the flight on the leg. A planner tab that is already open follows along. If you open a different departure, press Pick on that one instead and it replaces the first. Remove in the leg's flight sheet takes it off again. The planner has to be running, the desktop icon starts it. Pick needs no token and writes nothing to the repo.

## 6. What the status line means

**Saved 14 prices** or **Saved trip "name"**: the rows are in the repo, in a new file under data/sources/inbox.

**Ready: 14 prices are in a new GitHub issue**: you have no token, so a new tab shows a filled in GitHub issue. Press Submit there. When there are too many rows for one link, the script copies them to the clipboard and the issue asks you to paste the clipboard over its text before you press Submit.

**Not saved: GitHub answered 401, check the token**: the token is wrong, has expired or lacks Contents write. Nothing was lost. The rows went into a new GitHub issue instead, so press Submit there. Then make a new token as in section 3.

**Not saved: no rows were read from the page**, **Not saved: 3 of 14 rows have empty legs** or **Not saved: 2 of 14 rows have no price**: the script could not read Momondo's details. That usually means Momondo changed its page. The script saves nothing rather than half a price. It opens a GitHub issue of type fix_parser with the text of the result it could not read and the parser version. Press Submit, and Claude fixes the parser from that text. The fixed script then installs itself through the update in section 2.

**Not saved: open a result first, then press Save trip**: open a result card before you press Save trip.

## 7. How the prices reach the app

Each save adds one file named like data/sources/inbox/manual-20261029T143012Z.jsonl on the main branch. Each line is one price in the same format the browser workers use, with source momondo-manual, the time of the save in UTC and, for a trip, its name.

The next tripdb build reads the inbox, adds the rows to the price data and empties the inbox. The app shows them with the label saved by you. Prices that came in as a GitHub issue reach the inbox when Claude handles the issue.

## For developers

The script is generated. Do not edit plugin/userscripts/momondo-save.user.js by hand.

The parser is the crawler in plugin/skills/momondo-search/scripts/momondo_crawler.js. That file is the one source of truth. The build puts it into the userscript word for word, next to momondo-save.core.js (rows, checks, issue text) and momondo-save.ui.js (buttons and page clicks). The script version is SCRIPT_VERSION in build.js plus the parser version, so bumping either one makes Tampermonkey update the script. A change to the parser bumps PARSER_VERSION in the crawler, any other change bumps SCRIPT_VERSION.

After any change to the crawler, the core or the UI:

```
node plugin/userscripts/build.js
node --test "plugin/userscripts/**/*.test.js"
```

A test fails when the generated file differs from its sources. `node plugin/userscripts/build.js --check` does the same check alone.

The parser canary checks the parser on a saved dialog text and prints PASS or FAIL:

```
node plugin/skills/momondo-search/scripts/canary.js
node plugin/skills/momondo-search/scripts/canary.js dialog.txt expected.json
```

On a live page, paste momondo_crawler.js and then canary_live.js into the console of a finished Momondo search and run `canaryLive(["2026-12-03","2026-12-10"])` with one date per leg. It answers PASS, or FAIL followed by the dialog text. The header of canary_live.js explains the steps.
