# Magic Auction Helper

Fan-made Magic Auction database, tracker, and MCGG helper for Magic Chess: Go Go, season 7.1. It recommends a safe bet, a calculated risk, and a never more than price, and it keeps match history on the device. It is a static page, so there is no build step, and it keeps working after the first load.

Live page: https://bm-blake.github.io/magic-auction-helper/

## What it tracks

- A hero and an auction house: Eruditio, Dawnlight, World, or Cosmic
- Revealed treasures by rarity, type, and size
- Known prices the game has shown
- A treasure total and maximum counts. A new maximum replaces the previous one, and Max beside Total treasures saves the current count as the total
- Known counts that can be split across different rarities, types, and sizes
- An estimate of worth from the treasure catalog
- Three bids under Recommendations: safe bet at 80% of the cheapest possible worth, calculated risk uses half the average price wherever safe bet uses the lowest possible price, and it drops the tripling. Never more than uses the average price. A known color, type, or size uses the lower of 3 times the lowest possible price of what is known and half the average price of every treasure that can still fill that slot. Listed treasures that already fill a maximum do not raise that price. A maximum with nothing listed still leaves that color, type, or size out. Missing treasures fill a color that has a maximum first, cheapest color first. Anything left with no color maximum costs 3 times the sum of the cheapest possible price of each open color, divided by the weights gray 32, green 16, blue 8, purple 4, gold 2, and red 1. A color, type, or size that cannot appear is left out. The three prices stay at 0 until this game has a treasure, a total, or a maximum. Houses with logged match totals use the lowest logged count for all three prices until the treasure total is known
- Match history saves each finished round on the device, including the recommendation prices

The Magic Auction database lists the catalog treasures and filters them by name, rarity, type, and size.

A treasure with a missing rarity, type, or size stays under Unknown until that detail is filled in. Opening a rarity, type, or size with two or more treasures keeps the other categories available and lists those treasures, so each one can keep its own price and other details. One treasure opens on its own.

## User manual

On the menu, the book in the top-right corner of the screen opens the guide. The same text is in [MANUAL.md](MANUAL.md).

## Use it offline

Open the page once while online. A service worker then saves the page and its data for later. Add it to the home screen from the browser menu to use it like an app.

## Data

House price bands, logged treasure totals, and the rarity, type, and size lists live in `data/auction.json`. Catalog names, prices, and shapes live in `data/treasures.json`, recorded from the live Treasure Collection.

The estimate uses each catalog treasure at most once. A house range is the usual price band, and a revealed treasure can be worth more or less than that band.

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0). See [LICENSE](LICENSE). You may use and change this project for a noncommercial purpose. Selling it, or using it commercially, is not allowed.
