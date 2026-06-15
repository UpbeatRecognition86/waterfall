# Waterfall

**A pay-yourself-first money cockpit for dual-income couples.** Private, runs in your browser, no account.

Most budgeting breaks down the same way: you try to save "whatever's left at the end of the month," and there's never anything left. Waterfall flips it. Your investments come out **first** and are locked. Your fixed bills come next. Whatever remains is your spending ceiling — and your card bill becomes the *only* number that varies. Overspend in a heavy month? It draws down a **Flex buffer** you built in good months — never your investments, never your emergency fund.

It's built for the situation a lot of young earning couples are in: no credit-card debt, decent income, but no real visibility into where ₹1.5–2L a month actually goes, and a vague sense of "we should be investing by now."

## The monthly ritual

Waterfall is something you *do* on payday, not just a calculator you visit. Each month you run a short check-in:

1. **Confirm your numbers** — salary, locked investments, and fixed bills come prefilled; tick or tweak.
2. **Add your card spend** — type the total, or **upload your statement PDFs** and let Waterfall total and categorize them.
3. **Allocate the leftover** — split it across your goals, loans, emergency fund, or buffer, with a smart suggested default.
4. **Lock it in** — the waterfall updates and the month is recorded.

## What it does

- **This month** — the start-of-month checklist, the verdict, and the waterfall cascading through locked tiers (investments → bills → spending → leftover).
- **Spending** — upload your credit-card statements (**HDFC, ICICI, Axis** supported today; Scapia coming), and Waterfall parses them **in your browser**, totals your spend, sorts it into categories, and tracks the trend month over month. Fix any category once and it's remembered.
- **Net worth** — assets minus liabilities, asset-class mix, and an emergency-fund-in-months read.
- **Goals** — each goal tagged near / medium / long-term, with the monthly contribution it needs.
- **Big buy** — compare a large purchase as **cash vs loan vs company lease**, including liquidity and job-lock-in trade-offs.
- **Settings** — every number is yours to edit.

## The core idea

```
Salary lands
   │
   ▼  1. Investments        ← LOCKED. Non-negotiable. Out first.
   ▼  2. Fixed bills        ← rent, utilities, insurance…
   ▼  3. Card spend         ← the ONLY variable
   ▼  4. Leftover           ← you split it: goals, loans, emergency fund, or a Flex buffer
            └─ Flex buffer absorbs the overspend months
```

## Use it

Open **`index.html`** in any browser — first run walks you through a quick setup, or load the sample couple to explore. No install, no build, no account.

> **Statement upload needs the hosted version.** Everything works when you open the file directly, **except** PDF statement parsing, which loads a PDF reader as a web module and is reliable over **https** (e.g. GitHub Pages) rather than a local `file://` path.

### Publish your own copy (free, on GitHub Pages)

1. Fork this repo.
2. **Settings → Pages → Source: `main` branch, `/root`**.
3. Open the URL it gives you. Done.

## Privacy

Everything you type is stored **only in your own browser** (`localStorage`). There's no account and no server. When you upload a statement, it is parsed **on your device** — the PDF is never uploaded; only the PDF-reading library (pdf.js) is fetched from a CDN, and only when you use statement upload.

The **one exception** is the optional **AI advisor**: when you tap it, a summary of your finances is sent to Anthropic's API (using a key you provide) to generate the plan. Everything else stays local. Use **Export** in Settings to back up to a JSON file or move your data to another device.

## How it's built

- **`index.html`** — the whole app: vanilla JS, custom CSS, commented. No framework, no build step.
- **`parser.js`** — the statement parsers and spending analyser (pure functions, coordinate-based per-bank parsing).
- Statement parsing uses **pdf.js**, loaded lazily from a CDN only when you upload a file.

The whole engine is config-driven, so it adapts to any income, any set of goals — no code changes needed for normal use.

## Not advice

Waterfall is a planning tool, not financial, tax, or investment advice. The "Big buy" comparison and any tax-related figures are illustrative — confirm specifics with a qualified adviser before making decisions.

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship your own version.
