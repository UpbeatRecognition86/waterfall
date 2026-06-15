/* ============================================================
   Waterfall — statement parser & spending analyser
   Pure, framework-free. Works on a normalized page model:
     pages = [{ width, height, words:[{text, x, y, w}] }]
   produced either by pdf.js (in-browser) or pdfplumber (tests).
   y increases downward (top-origin). Per-bank, coordinate-tuned.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- starter merchant dictionary (India) ---------- */
  const MERCHANT_RULES = [
    [/swiggy|zomato|eatfit|eatsure|dominos|mcdonald|kfc|starbucks|cafe|restaurant|biryani/i, "Food & Dining"],
    [/uber|ola|rapido|irctc|indigo|vistara|akasa|spicejet|makemytrip|goibibo|redbus|yatra|cleartrip|metro|fuel|petrol|hpcl|iocl|bharat petro|indian oil|shell/i, "Travel & Transport"],
    [/bigbasket|blinkit|zepto|dmart|grofers|jiomart|bbdaily|instamart|fresh|kirana|grocer/i, "Groceries"],
    [/amazon|flipkart|myntra|ajio|nykaa|meesho|tatacliq|reliance digital|croma|department store|misc store|retail/i, "Shopping"],
    [/netflix|spotify|hotstar|disney|prime|youtube|jio|airtel|\bvi\b|vodafone|tataplay|tata sky|sun direct|broadband|recharge|subscription/i, "Bills & Subscriptions"],
    [/apollo|pharmeasy|1mg|netmeds|practo|medplus|medical|hospital|clinic|nutrition|pharma|wellness|cult\.?fit|healthify/i, "Health"],
    [/bookmyshow|pvr|inox|cinema|movie/i, "Entertainment"],
    [/payment received|bbps|bharat bill|autopay|nach|neft|imps|rtgs|upi.*pay/i, "Payment / Transfer"],
  ];

  function titleCase(s) {
    return String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
  }

  /* Decide a category. Preference: bank's own category > user corrections > dictionary > Other */
  function categorize(merchant, bankCategory, master) {
    const m = String(merchant || "");
    if (master) {
      // exact-ish merchant memory: match on a normalized merchant key
      const key = merchantKey(m);
      if (master[key]) return master[key];
    }
    if (bankCategory && bankCategory.trim()) return titleCase(bankCategory);
    for (const [re, cat] of MERCHANT_RULES) if (re.test(m)) return cat;
    return "Other";
  }
  function merchantKey(m) {
    return String(m).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
  }

  /* ---------- row reconstruction (tolerance clustering) ---------- */
  function clusterRows(page, tol) {
    tol = tol || 2.5;
    const ws = page.words.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const out = []; let cur = null, cy = null;
    for (const w of ws) {
      if (cur && Math.abs(w.y - cy) <= tol) cur.push(w);
      else { cur = [w]; out.push(cur); }
      cy = w.y;
    }
    return out.map(r => r.sort((a, b) => a.x - b.x));
  }
  const allText = pages => pages.map(p => p.words.map(w => w.text).join(" ")).join(" ");

  const AMT = /^[`₹]?\(?\d[\d,]*\.\d{2}\)?$/;        // 1,234.56  (1,234.56)  `822.00
  const DATE = /^(\d{2})[\/-](\d{2})[\/-](\d{2,4})\|?$/; // 17/04/2026  17-04-2026 (maybe trailing |)
  const num = s => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
  const isAmt = t => AMT.test(t);
  const dateOf = t => { const m = String(t).match(DATE); if (!m) return null;
    let [_, d, mo, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${mo}-${d}`; };

  /* ---------- bank detection ---------- */
  function detectBank(pages) {
    const t = allText(pages);
    if (/HDFC\s*Bank|Diners\s*Club|Regalia|MyCards|Payeezz/i.test(t)) return "hdfc";
    if (/ICICI\s*Bank/i.test(t)) return "icici";
    if (/Axis\s*Bank|Flipkart\s*Axis|eDGE\s*Reward/i.test(t)) return "axis";
    return null;
  }

  /* ---------- HDFC (Diners / Regalia / Rupay) ----------
     row: date(x~50-185)|time HH:MM | merchant... | +points | [C] amount [l]
     amount = rightmost decimal; credit if desc has payment/cr keywords. */
  function parseHDFC(pages, master) {
    const txns = [];
    for (const pg of pages) {
      for (const row of clusterRows(pg)) {
        const first = row[0]; if (!first) continue;
        const date = dateOf(first.text); if (!date) continue;
        const amts = row.filter(w => isAmt(w.text));
        if (!amts.length) continue;
        const amtTok = amts[amts.length - 1];               // rightmost = transaction amount
        const amount = num(amtTok.text);
        // merchant = tokens after the time, before the points/amount zone (x < 430)
        const midTokens = row.filter(w => w.x > first.x + 25 && w.x < 410 && !/^\d{2}:\d{2}$/.test(w.text) && !/^\+$/.test(w.text));
        const merchant = midTokens.map(w => w.text).join(" ").replace(/\s+/g, " ").trim();
        const credit = /payment|received|reversal|refund|cashback|\bcr\b/i.test(merchant) || /\(/.test(amtTok.text);
        if (!merchant) continue;
        txns.push({ date, merchant, amount, type: credit ? "credit" : "debit",
          category: categorize(merchant, null, master) });
      }
    }
    return txns;
  }

  /* ---------- ICICI (Amazon Pay) ----------
     header: Date SerNo Transaction Details Reward Intl# Amount(in `)
     date x~216 | merchant x~300-430 | reward x~430 | amount x~490-520 [CR] */
  function parseICICI(pages, master) {
    const txns = [];
    for (const pg of pages) {
      for (const row of clusterRows(pg)) {
        const dTok = row.find(w => w.x < 245 && dateOf(w.text));
        if (!dTok) continue;
        const date = dateOf(dTok.text);
        const amts = row.filter(w => w.x > 470 && isAmt(w.text));
        if (!amts.length) continue;
        const amtTok = amts[amts.length - 1];
        const amount = num(amtTok.text);
        const credit = row.some(w => /^CR$/i.test(w.text) && w.x > amtTok.x - 5);
        const merchant = row.filter(w => w.x >= 295 && w.x < 470 && !/^\d+$/.test(w.text))
          .map(w => w.text).join(" ").replace(/\s+/g, " ").trim();
        if (!merchant) continue;
        txns.push({ date, merchant, amount, type: credit ? "credit" : "debit",
          category: categorize(merchant, null, master) });
      }
    }
    return txns;
  }

  /* ---------- Axis (Flipkart) ----------
     header: DATE TRANSACTION DETAILS | MERCHANT CATEGORY | AMOUNT(Rs.) Dr/Cr | CASHBACK Cr
     date x~106 | merchant x~145-310 | category x~320-360 | amount x~410-435 Dr/Cr | cashback x~470 */
  function parseAxis(pages, master) {
    const txns = [];
    for (const pg of pages) {
      for (const row of clusterRows(pg)) {
        const dTok = row.find(w => w.x < 130 && dateOf(w.text));
        if (!dTok) continue;                                  // real txn rows have date at far left
        const date = dateOf(dTok.text);
        const amts = row.filter(w => w.x > 400 && w.x < 460 && isAmt(w.text));
        if (!amts.length) continue;
        const amtTok = amts[0];
        const amount = num(amtTok.text);
        // Dr/Cr marker sits just right of the amount
        const drcr = row.find(w => /^(Dr|Cr)$/i.test(w.text) && w.x > amtTok.x && w.x < amtTok.x + 40);
        const credit = drcr && /^Cr$/i.test(drcr.text);
        const merchant = row.filter(w => w.x >= 140 && w.x < 315).map(w => w.text).join(" ").replace(/\s+/g, " ").trim();
        const bankCat = row.filter(w => w.x >= 315 && w.x < 400).map(w => w.text).join(" ").replace(/\s+/g, " ").trim();
        if (!merchant) continue;
        txns.push({ date, merchant, amount, type: credit ? "credit" : "debit",
          category: categorize(merchant, bankCat, master), bankCategory: bankCat || null });
      }
    }
    return txns;
  }

  const PARSERS = { hdfc: parseHDFC, icici: parseICICI, axis: parseAxis };

  /* ---------- public: parse a statement ---------- */
  function parseStatement(pages, opts) {
    opts = opts || {};
    const bank = opts.bank || detectBank(pages);
    if (!bank || !PARSERS[bank]) return { bank: null, error: "Unrecognised statement format", transactions: [] };
    const txns = PARSERS[bank](pages, opts.master || null);
    // Note: re-upload de-duplication is handled at the upload layer (per file+bank+period),
    // not here — identical rows (e.g. two same-value rides in a day) are legitimate.
    const spend = txns.filter(t => t.type === "debit").reduce((a, t) => a + t.amount, 0);
    const credits = txns.filter(t => t.type === "credit").reduce((a, t) => a + t.amount, 0);
    return { bank, transactions: txns, spend: round2(spend), credits: round2(credits), count: txns.length };
  }
  const round2 = n => Math.round(n * 100) / 100;

  /* ---------- public: roll transactions into category totals ---------- */
  function categoryTotals(txns) {
    const out = {};
    for (const t of txns) { if (t.type !== "debit") continue; out[t.category] = (out[t.category] || 0) + t.amount; }
    return Object.entries(out).map(([cat, amt]) => ({ category: cat, amount: round2(amt) }))
      .sort((a, b) => b.amount - a.amount);
  }

  /* ---------- recurring / subscription detection ---------- */
  const SUB_MERCHANTS = /netflix|spotify|hotstar|disney|prime\s*video|amazon\s*prime|youtube\s*premium|\bjio\b|airtel|vodafone|tata\s*play|sony\s*liv|zee5|aha|google\s*(one|storage)|icloud|apple\.com|adobe|microsoft|office\s*365|canva|notion|chatgpt|openai|claude|audible|kindle|linkedin|dropbox|github|grammarly|cult\.?fit|gym|membership|subscription/i;

  /* spendingByMonth: { "2026-05": { transactions:[...] }, ... } */
  function detectSubscriptions(spendingByMonth) {
    const byMerchant = {};
    Object.keys(spendingByMonth || {}).forEach(mk => {
      (spendingByMonth[mk].transactions || []).forEach(t => {
        if (t.type !== "debit") return;
        const k = merchantKey(t.merchant);
        if (!k) return;
        (byMerchant[k] = byMerchant[k] || { name: t.merchant, hits: [], category: t.category })
          .hits.push({ month: mk, amount: t.amount });
      });
    });
    const subs = [];
    Object.values(byMerchant).forEach(m => {
      const months = [...new Set(m.hits.map(h => h.month))].sort();
      const amts = m.hits.map(h => h.amount);
      const avg = amts.reduce((a, b) => a + b, 0) / amts.length;
      const similar = amts.every(a => Math.abs(a - avg) <= Math.max(25, avg * 0.18));
      const multiMonth = months.length >= 2 && similar;          // strong: same-ish charge across months
      const knownSub = SUB_MERCHANTS.test(m.name);               // fallback: looks like a subscription
      if (multiMonth || knownSub) {
        subs.push({
          name: m.name, monthly: Math.round(avg), category: m.category,
          monthsSeen: months.length, lastMonth: months[months.length - 1],
          status: multiMonth ? "recurring" : "suspected"
        });
      }
    });
    subs.sort((a, b) => b.monthly - a.monthly);
    const totalMonthly = subs.reduce((a, s) => a + s.monthly, 0);
    return { subs, totalMonthly: Math.round(totalMonthly), totalYearly: Math.round(totalMonthly * 12) };
  }

  const API = { parseStatement, categoryTotals, categorize, detectBank, clusterRows, merchantKey, detectSubscriptions, MERCHANT_RULES };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.WaterfallParser = API;
})(typeof window !== "undefined" ? window : globalThis);
