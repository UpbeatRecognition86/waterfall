#!/usr/bin/env node
/* ============================================================
   Waterfall parser — regression tests
   Run: node parser.test.js
   Asserts per-bank detection, transaction count, and spend total
   against coordinate fixtures. Fixtures hold real statement data so
   they are gitignored (.claude/fixtures/); generate them with the
   pdfplumber snippet in the repo notes. The test SKIPS gracefully
   when fixtures are absent, so it is safe to commit + run in CI.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const P = require("./parser.js");

const DIRS = [path.join(__dirname, "test", "fixtures"), path.join(__dirname, ".claude", "fixtures")];
const FX = DIRS.find(d => fs.existsSync(d));

// known-good snapshots (from the real reference statements)
const EXPECT = {
  hdfc:  { count: 73, spend: 95248.58 },
  icici: { count: 2,  spend: 822 },
  axis:  { count: 11, spend: 35062.15 },
};

let pass = 0, fail = 0, skipped = 0;
const ok  = (name, cond, msg) => cond ? (pass++, console.log("  ✓ " + name)) : (fail++, console.error("  ✗ " + name + " — " + msg));

if (!FX) {
  console.log("No fixtures found (test/fixtures or .claude/fixtures) — skipping parser tests.");
  process.exit(0);
}
console.log("Fixtures: " + FX + "\n");

for (const bank of Object.keys(EXPECT)) {
  const fp = path.join(FX, bank + ".json");
  if (!fs.existsSync(fp)) { skipped++; console.log("• " + bank + ": fixture missing — skipped\n"); continue; }
  console.log("• " + bank);
  const fx = JSON.parse(fs.readFileSync(fp, "utf8"));
  const r = P.parseStatement(fx.pages);
  const e = EXPECT[bank];
  ok(bank + " detected", r.bank === bank, "detected " + r.bank);
  ok(bank + " count", r.count === e.count, "got " + r.count + ", want " + e.count);
  ok(bank + " spend", Math.abs(r.spend - e.spend) <= 2, "got " + r.spend + ", want ~" + e.spend);
  ok(bank + " every txn has date+amount+type", r.transactions.every(t => t.date && t.amount > 0 && (t.type === "debit" || t.type === "credit")), "some txn malformed");
  console.log("");
}

// subscription detection sanity (cross-month) — only if we have at least 2 banks of data
const months = {};
for (const bank of Object.keys(EXPECT)) {
  const fp = path.join(FX, bank + ".json");
  if (fs.existsSync(fp)) {
    const fx = JSON.parse(fs.readFileSync(fp, "utf8"));
    months[bank] = { transactions: P.parseStatement(fx.pages).transactions };
  }
}
if (Object.keys(months).length) {
  const subs = P.detectSubscriptions(months);
  ok("detectSubscriptions returns shape", subs && Array.isArray(subs.subs) && typeof subs.totalMonthly === "number", "bad shape");
}

console.log("\n" + pass + " passed, " + fail + " failed, " + skipped + " skipped");
process.exit(fail ? 1 : 0);
