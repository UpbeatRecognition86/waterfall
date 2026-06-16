# Arth

**Your money, in one calm place.** A premium personal-finance app for dual-income Indian households — net-worth command centre, effortless spending tracking, and a pay-yourself-first plan. Private, runs in your browser, no account.

Arth blends the calm polish of **Copilot** with the net-worth/cash-flow command centre of **Monarch**, tuned for India. Its opinion: most budgeting fails because you try to save "whatever's left," and nothing's left. Arth flips it — your investments come out **first** and are locked, fixed bills come next, and your card spend becomes the *only* number that varies. Overspend in a heavy month? It draws down a **Flex buffer** you built in good months — never your investments, never your emergency fund.

## The app

- **Home** — your command centre: net worth and its trajectory, this month's cash flow (income → invested → bills → card spend → leftover), savings rate, goals at a glance, and insights spotted in your numbers.
- **Accounts** — a real balance sheet: assets grouped by class (cash, investments, gold, property) + your savings pots + liabilities, all rolling up to net worth, with asset mix and an emergency-fund-in-months read.
- **Spending** — get transactions in three ways: **import a CSV** from virtually any bank, **upload statement PDFs** (HDFC · ICICI · Axis, parsed on your device), or **add by hand**. Everything is auto-categorised, rolled into a breakdown, and tracked month over month. Fix a category once and it's remembered. Recurring charges and subscriptions are detected automatically.
- **Plan** — the monthly pay-yourself-first ritual: confirm your numbers, enter your card spend, see the waterfall cascade through locked tiers, and split the leftover across goals, loans, your emergency fund, or the Flex buffer.
- **Goals** — each goal tagged near / medium / long-term with the monthly contribution it needs, plus a feasibility plan and an optional AI advisor.

## Getting your data in

No bank linking required. You can:
- **CSV import** — export from your bank or card portal and drop it in. Arth auto-detects the date, amount, and description columns and handles both common shapes (separate debit/credit columns, or a single signed/Dr-Cr amount column).
- **PDF statements** — HDFC, ICICI, and Axis are parsed locally in your browser (password-protected files work — you'll be asked for the password).
- **Manual quick-add** — type a transaction in seconds; the category is detected from the description.

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

## Your data is yours

Everything you enter is stored **only in your own browser** (`localStorage`) and saved automatically — there's no account and no server. Statements and CSVs are parsed **on your device**; the files are never uploaded. Because it's local, **download a backup** from Settings (or when Arth reminds you) so a cleared cache or a new phone can't wipe your history — restore it here or on another device in one tap.

The **one exception** is the optional **AI advisor**: when you tap it, a summary of your finances is sent to Anthropic's API (using a key you provide) to generate the plan. Everything else stays local.

## Use it

Open **`index.html`** in any browser — a quick setup walks you through your income, bills, and goals, or load the sample household to explore. No install, no build, no account.

> **Statement upload needs the hosted version.** Everything works when you open the file directly, **except** PDF statement parsing, which loads a PDF reader as a web module and is reliable over **https** (e.g. GitHub Pages) rather than a local `file://` path. CSV and manual entry work everywhere.

## How it's built

- **`index.html`** — the whole app: vanilla JS, custom CSS, a token-based design system (light/dark), commented. No framework, no build step. GSAP (vendored in `gsap.min.js`) adds motion and is feature-detected, so the app works without it.
- **`parser.js`** — the statement parsers, CSV importer, and spending analyser (pure functions; coordinate-based per-bank PDF parsing + bank-agnostic CSV).
- **`parser.test.js`** — a Node regression harness (`node parser.test.js`) asserting per-bank transaction counts and totals.

The whole engine is config-driven, so it adapts to any income and any set of goals — no code changes needed for normal use.

## Not advice

Arth is a planning tool, not financial, tax, or investment advice. Figures are illustrative — confirm specifics with a qualified adviser before making decisions.

## License

MIT — see [LICENSE](LICENSE).
