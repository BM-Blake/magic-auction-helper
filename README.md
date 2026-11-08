# Magic Auction Helper

Fan-made Magic Auction database, tracker, and MCGG helper for Magic Chess: Go Go, season 7.1. It is a static page, so there is no build step, and it keeps working after the first load.

Live page: https://bm-blake.github.io/magic-auction-helper/

## What it tracks

- A hero and an auction house: Eruditio, Dawnlight, World, or Cosmic
- Revealed treasures by rarity, type, and size
- Exact prices the game has shown
- A treasure total and maximum counts
- An estimate of worth from the treasure catalog
- Three bids under Recommendations: highest profit, calculated risk at 1.3 times that bid, and never more than at 1.5 times that bid

The Magic Auction database lists the catalog treasures and filters them by name, rarity, type, and size.

A treasure with a missing rarity, type, or size stays under Unknown until that detail is filled in. Opening a rarity, type, or size lists the treasures in that group, so each one can keep its own price and other details.

## User manual

On the menu, the book in the top-right corner of the screen opens the guide. The same text is in [MANUAL.md](MANUAL.md).

## Use it offline

Open the page once while online. A service worker then saves the page and its data for later. Add it to the home screen from the browser menu to use it like an app.

## Data

House ranges and the rarity, type, and size lists live in `data/auction.json`. Catalog names, prices, and shapes live in `data/treasures.json`, recorded from the live Treasure Collection.

The estimate uses each catalog treasure at most once. A house range is the usual price band, and a revealed treasure can be worth more or less than that band.

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0). See [LICENSE](LICENSE). You may use and change this project for a noncommercial purpose. Selling it, or using it commercially, is not allowed.
