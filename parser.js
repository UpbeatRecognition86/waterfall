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

  /* ============================================================
     CSV IMPORT — bank-agnostic. Most Indian banks export CSV/XLS;
     this covers the two common shapes:
       (a) separate Debit/Withdrawal + Credit/Deposit columns
       (b) a single Amount column with sign or a Dr/Cr indicator
     Column roles are detected from the header when present, else by
     scanning cell content. Date formats handled flexibly.
     ============================================================ */
  const pad2 = n => String(n).padStart(2, "0");
  const MONTHIDX = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  function flexDate(s){
    s = String(s || "").trim().replace(/['|"]/g, "");
    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/))) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${pad2(m[2])}-${pad2(m[1])}`; }
    if ((m = s.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3,})[-\/ ](\d{2,4})$/))) { const mo = MONTHIDX[m[2].slice(0,3).toLowerCase()]; if (mo) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${pad2(mo)}-${pad2(m[1])}`; } }
    if ((m = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/))) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    return null;
  }
  function csvNum(s){
    s = String(s == null ? "" : s).trim(); if (!s) return null;
    const cleaned = s.replace(/[₹$,\s]/g, "").replace(/[()]/g, "").replace(/(dr|cr)/ig, "");
    if (!/\d/.test(cleaned)) return null;
    const v = Number(cleaned); return isNaN(v) ? null : Math.abs(v);
  }
  function splitCSVLine(line, delim){
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++){ const c = line[i];
      if (q){ if (c === '"'){ if (line[i+1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; }
      else { if (c === '"') q = true; else if (c === delim){ out.push(cur); cur = ""; } else cur += c; }
    }
    out.push(cur); return out.map(s => s.trim());
  }
  function parseCSV(text, opts){
    opts = opts || {}; const master = opts.master || null;
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").filter(l => l.trim() !== "");
    if (!lines.length) return { bank:"csv", transactions:[], spend:0, credits:0, count:0, error:"empty file" };
    const head0 = lines[0];
    const delim = (head0.split("\t").length > head0.split(",").length) ? "\t"
                : (head0.split(";").length > head0.split(",").length) ? ";" : ",";
    const rows = lines.map(l => splitCSVLine(l, delim));
    const HEADER_RE = /date|amount|debit|credit|narration|description|particular|withdraw|deposit|transaction|details|balance|merchant|remarks/i;
    let headerIdx = rows.findIndex(r => r.filter(c => HEADER_RE.test(c)).length >= 2);
    let header = null, dataRows = rows;
    if (headerIdx >= 0){ header = rows[headerIdx].map(h => h.toLowerCase()); dataRows = rows.slice(headerIdx + 1); }
    const ncol = Math.max(1, ...dataRows.map(r => r.length));
    let dateCol = -1, descCol = -1, debitCol = -1, creditCol = -1, amountCol = -1, balanceCol = -1, typeCol = -1;
    if (header){
      header.forEach((h, i) => {
        if (dateCol < 0 && /date|txn date|transaction date/.test(h) && !/value/.test(h)) dateCol = i;
        if (debitCol < 0 && /withdraw|debit|\bdr\b|paid out|spent/.test(h)) debitCol = i;
        if (creditCol < 0 && /deposit|credit|\bcr\b|paid in|received/.test(h)) creditCol = i;
        if (amountCol < 0 && /amount|amt|value/.test(h) && !/balance/.test(h)) amountCol = i;
        if (balanceCol < 0 && /balance/.test(h)) balanceCol = i;
        if (descCol < 0 && /narration|description|particular|detail|remark|transaction|merchant|name/.test(h)) descCol = i;
        if (typeCol < 0 && /type|dr.?cr|indicator/.test(h)) typeCol = i;
      });
      // a header like "Transaction Date" can match both date & description rules — don't let
      // description borrow a column already claimed as date/amount/debit/credit/balance.
      if ([dateCol, amountCol, debitCol, creditCol, balanceCol].includes(descCol)) descCol = -1;
    }
    const sample = dataRows.slice(0, 50);
    const colScore = test => { const sc = new Array(ncol).fill(0), cnt = new Array(ncol).fill(0);
      sample.forEach(r => { for (let i = 0; i < ncol; i++){ const c = r[i]; if (c == null || c === "") continue; cnt[i]++; if (test(c)) sc[i]++; } });
      return sc.map((s, i) => cnt[i] ? s / cnt[i] : 0); };
    if (dateCol < 0){ const ds = colScore(c => flexDate(c)); const mx = Math.max(...ds); if (mx >= 0.5) dateCol = ds.indexOf(mx); }
    if (amountCol < 0 && debitCol < 0 && creditCol < 0){ const as = colScore(c => csvNum(c) != null); const mx = Math.max(...as); if (mx > 0) amountCol = as.indexOf(mx); }
    if (descCol < 0){ const len = new Array(ncol).fill(0), cnt = new Array(ncol).fill(0);
      sample.forEach(r => { for (let i = 0; i < ncol; i++){ if ([dateCol, amountCol, debitCol, creditCol, balanceCol].includes(i)) continue; const c = r[i] || ""; if (flexDate(c) || csvNum(c) != null) continue; len[i] += c.length; cnt[i]++; } });
      const avg = len.map((l, i) => cnt[i] ? l / cnt[i] : 0); const mx = Math.max(...avg); if (mx > 0) descCol = avg.indexOf(mx); }
    if (dateCol < 0) return { bank:"csv", transactions:[], spend:0, credits:0, count:0, error:"couldn't find a date column" };
    const txns = [];
    dataRows.forEach(r => {
      const date = flexDate(r[dateCol]); if (!date) return;
      const merchant = String((descCol >= 0 ? r[descCol] : "") || "").replace(/\s+/g, " ").trim() || "Transaction";
      let amount = null, type = null;
      if (debitCol >= 0 || creditCol >= 0){
        const d = debitCol >= 0 ? csvNum(r[debitCol]) : null, c = creditCol >= 0 ? csvNum(r[creditCol]) : null;
        if (d && d > 0){ amount = d; type = "debit"; }
        else if (c && c > 0){ amount = c; type = "credit"; }
      }
      if (amount == null && amountCol >= 0){
        const v = csvNum(r[amountCol]); if (v == null || v === 0) return;
        amount = v;
        const cell = String(r[amountCol] || ""), tcell = typeCol >= 0 ? String(r[typeCol] || "") : "";
        const isCr = /cr\b|credit|deposit/i.test(cell + " " + tcell) || /^\+/.test(cell.trim());
        const isDr = /dr\b|debit/i.test(cell + " " + tcell) || /^[(\-]/.test(cell.trim());
        type = isCr && !isDr ? "credit" : "debit";
      }
      if (amount == null || !(amount > 0)) return;
      txns.push({ date, merchant, amount: round2(amount), type, category: categorize(merchant, null, master) });
    });
    const spend = txns.filter(t => t.type === "debit").reduce((a, t) => a + t.amount, 0);
    const credits = txns.filter(t => t.type === "credit").reduce((a, t) => a + t.amount, 0);
    return { bank:"csv", transactions: txns, spend: round2(spend), credits: round2(credits), count: txns.length };
  }

  const API = { parseStatement, parseCSV, flexDate, categoryTotals, categorize, detectBank, clusterRows, merchantKey, detectSubscriptions, MERCHANT_RULES };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.WaterfallParser = API;
})(typeof window !== "undefined" ? window : globalThis);
