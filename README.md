# Magic Auction Helper

Fan-made Magic Auction database, tracker, and MCGG helper for Magic Chess: Go Go, season 7.1. It recommends a safe bet, a calculated risk, and a never more than price, and it keeps match history on the device. It is a static page, so there is no build step, and it keeps working after the first load.

Live page: https://bm-blake.github.io/magic-auction-helper/

## What it tracks

- A hero and an auction house: Eruditio, Dawnlight, World, Cosmic, or Secret
- Revealed treasures by rarity, type, and size
- Known prices the game has shown
- A treasure total and maximum counts. A new maximum replaces the previous one. A total entered with no category keeps Max on, and new treasures stop at that total. Max beside Total treasures saves the current count as the total, and tapping it again clears that one
- Known counts that can be split across different rarities, types, and sizes
- An estimate of worth from the treasure catalog, capped at the house's usual value for a whole pool
- Three bids under Recommendations. Safe bet is the cheapest the whole pool can be, so winning at or under it can't lose coins: every listed treasure, every treasure a color maximum still needs, and the rest of the treasure total get the cheapest catalog treasure each can still be, and each catalog treasure is used once. Calculated risk and Never more than are 80% of a worth where known prices count in full, and every other treasure adds half the average price of what can still fill its slot, or the average price. Listed treasures that already fill a maximum do not raise that price. A maximum with nothing listed still leaves that color, type, or size out. A listed treasure with no color fills a color that has a maximum first, cheapest color first. A remainder that can only be gold or red uses half the average of every gold and red treasure for Calculated risk, and the average for Never more than. Anything left with more than one open color uses the sum of each open color's price, divided by the weights gray 32, green 16, blue 8, purple 4, gold 2, and red 1. A color, type, or size that cannot appear is left out. That worth stops at the house's usual pool value, and neither price goes below Safe bet. The three prices stay at 0 until this game has a treasure, a total, or a maximum. Houses with logged match totals use the lowest logged count for all three prices until the treasure total is known
- Match history saves each finished round on the device, with the recommendation prices and the pool value, winning bid, and win or loss entered at End game. With a pool value, each price shows the profit or loss of winning at that price

The Magic Auction database lists the catalog treasures and filters them by name, rarity, type, and size.

A treasure with a missing rarity, type, or size stays under Unknown until that detail is filled in. Opening a rarity, type, or size with two or more treasures keeps the other categories available and lists those treasures, so each one can keep its own price and other details. One treasure opens on its own.

## User manual

On the menu, the book in the top-right corner of the screen opens the guide. The same text is in [MANUAL.md](MANUAL.md).

## Use it offline

Open the page once while online. A service worker then saves the page and its data for later. Add it to the home screen from the browser menu to use it like an app.

## Data

House pool ranges, logged treasure totals, and the rarity, type, and size lists live in `data/auction.json`. Catalog names, prices, and shapes live in `data/treasures.json`, recorded from the live Treasure Collection.

The estimate uses each catalog treasure at most once. A house range is the usual value of a whole pool, and its top caps Estimate worth, Calculated risk, and Never more than.

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0). See [LICENSE](LICENSE). You may use and change this project for a noncommercial purpose. Selling it, or using it commercially, is not allowed.
