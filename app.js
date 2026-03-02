'use strict';

/* ============================================================
   TON APR Calculator — app.js
   ============================================================ */

// ── State ──────────────────────────────────────────
const S = {
  tonUsd: null,
  usdUzs: null,
  usdRub: null,
  tonUzs: null,
  tonRub: null,
  amount: 500,
  apr: 12,
  compound: true,
};

// ── Formatting ─────────────────────────────────────
const fmtTon = (n) => {
  if (n === null || isNaN(n)) return '—';
  if (Math.abs(n) < 0.000001) return n.toExponential(4) + ' TON';
  if (Math.abs(n) < 0.001) return n.toFixed(8) + ' TON';
  if (Math.abs(n) < 1) return n.toFixed(6) + ' TON';
  if (Math.abs(n) < 10) return n.toFixed(4) + ' TON';
  if (Math.abs(n) < 1000) return n.toFixed(2) + ' TON';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n) + ' TON';
};

const fmtUsd = (n) => {
  if (n === null || isNaN(n)) return '— USD';
  if (Math.abs(n) < 0.01) return '$' + n.toFixed(6);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
};

const fmtRub = (n) => {
  if (n === null || isNaN(n)) return '— ₽';
  if (Math.abs(n) < 0.01) return n.toFixed(6) + ' ₽';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(n);
};

const fmtUzs = (n) => {
  if (n === null || isNaN(n)) return '— UZS';
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' UZS';
};

const fmtPrice = (n) => {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(n);
};

const fmtBigNum = (n) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n));

// ── DOM Helper ─────────────────────────────────────
const $ = (id) => document.getElementById(id);
const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };

// ── Fetch Prices ───────────────────────────────────
async function fetchPrices() {
  const dot = $('status-dot');
  const txt = $('status-text');
  const ref = $('refresh-btn');

  dot.className = 'status-dot pulsing';
  txt.textContent = 'Обновление...';
  ref.classList.add('spinning');

  try {
    // Fetch TON/USD from CoinGecko (free, no key)
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd',
      { signal: AbortSignal.timeout(7000) }
    );
    const data = await res.json();
    S.tonUsd = data['the-open-network']?.usd ?? null;

    // Fetch USD/UZS and USD/RUB from exchangerate-api (free tier)
    const res2 = await fetch(
      'https://open.er-api.com/v6/latest/USD',
      { signal: AbortSignal.timeout(7000) }
    );
    const data2 = await res2.json();
    S.usdUzs = data2?.rates?.UZS ?? 12500;
    S.usdRub = data2?.rates?.RUB ?? 90;

    if (S.tonUsd) {
      S.tonUzs = S.tonUsd * S.usdUzs;
      S.tonRub = S.tonUsd * S.usdRub;
      setText('price-usd', fmtPrice(S.tonUsd));
      setText('price-rub', fmtBigNum(S.tonRub) + ' ₽');
      setText('price-uzs', fmtBigNum(S.tonUzs) + ' UZS');
      dot.className = 'status-dot live';
      txt.textContent = 'Онлайн';
    } else {
      throw new Error('no data');
    }
  } catch (e) {
    // Use hardcoded fallback prices if API fails
    S.tonUsd = S.tonUsd ?? 5.5;
    S.usdUzs = S.usdUzs ?? 12750;
    S.usdRub = S.usdRub ?? 90;
    S.tonUzs = S.tonUsd * S.usdUzs;
    S.tonRub = S.tonUsd * S.usdRub;
    setText('price-usd', fmtPrice(S.tonUsd) + '*');
    setText('price-rub', fmtBigNum(S.tonRub) + ' ₽*');
    setText('price-uzs', fmtBigNum(S.tonUzs) + ' UZS*');
    dot.className = 'status-dot error';
    txt.textContent = 'Офлайн (прибл.)';
  } finally {
    ref.classList.remove('spinning');
    updateAll();
  }
}

// ── Calculate Earnings ─────────────────────────────
/**
 * Returns TON earned over `seconds` with compound or simple interest.
 */
function calcEarnings(principal, aprPct, seconds, compound) {
  const apr = aprPct / 100;
  if (compound) {
    // Compounded monthly
    const months = seconds / (30.4375 * 24 * 3600);
    return principal * (Math.pow(1 + apr / 12, months) - 1);
  } else {
    // Simple interest
    const years = seconds / (365.25 * 24 * 3600);
    return principal * apr * years;
  }
}

// Time constants (seconds)
const T = {
  second: 1,
  week: 7 * 24 * 3600,
  month: 30.4375 * 24 * 3600,
  season: 3 * 30.4375 * 24 * 3600,
  year: 365.25 * 24 * 3600,
};

// ── Main Update ────────────────────────────────────
function updateAll() {
  const amt = S.amount;
  const apr = S.apr;
  const cmp = S.compound;
  const usd = S.tonUsd;
  const uzs = S.tonUzs;

  // Update APR hero
  setText('apr-hero-val', apr.toFixed(apr % 1 === 0 ? 0 : 2) + '%');
  updateRing(apr);

  // Earnings per period
  const periods = [
    { key: 'second', s: T.second },
    { key: 'week', s: T.week },
    { key: 'month', s: T.month },
    { key: 'season', s: T.season },
    { key: 'year', s: T.year },
  ];

  const prefix = { second: 'es', week: 'ew', month: 'em', season: 'ess', year: 'ey' };

  periods.forEach(({ key, s }) => {
    const tonEarned = calcEarnings(amt, apr, s, cmp);
    const p = prefix[key];

    // Flash animation
    const tonEl = $(`${p}-ton`);
    if (tonEl) {
      tonEl.classList.remove('flash');
      void tonEl.offsetWidth;
      tonEl.textContent = fmtTon(tonEarned);
      tonEl.classList.add('flash');
    }

    if (usd) {
      setText(`${p}-usd`, fmtUsd(tonEarned * usd));
      setText(`${p}-rub`, fmtRub(tonEarned * (S.tonRub ?? 0)));
      setText(`${p}-uzs`, fmtUzs(tonEarned * (uzs ?? 0)));
    } else {
      setText(`${p}-usd`, '— USD');
      setText(`${p}-rub`, '— ₽');
      setText(`${p}-uzs`, '— UZS');
    }
  });

  // Daily for ring
  const daily = calcEarnings(amt, apr, 24 * 3600, cmp);
  setText('ring-daily', fmtTon(daily));

  // Growth bar (1 year)
  const yearEarned = calcEarnings(amt, apr, T.year, cmp);
  const total = amt + yearEarned;
  const principalPct = (amt / total) * 100;
  const profitPct = (yearEarned / total) * 100;
  const gb_p = $('gb-principal');
  const gb_pr = $('gb-profit');
  if (gb_p) gb_p.style.width = principalPct.toFixed(2) + '%';
  if (gb_pr) gb_pr.style.width = profitPct.toFixed(2) + '%';

  const totalFmt = total >= 1000
    ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(total)
    : total.toFixed(2);
  const amtFmt = amt >= 1000
    ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(amt)
    : amt;
  setText('growth-formula', `${amtFmt} TON → ${totalFmt} TON`);

  // Equivalent block
  if (usd) {
    const totalUsd = amt * usd;
    const totalRub = amt * (S.tonRub ?? 0);
    const totalUzs = amt * (uzs ?? 0);
    setText('eq-usd', fmtUsd(totalUsd));
    setText('eq-rub', fmtRub(totalRub));
    setText('eq-uzs', fmtUzs(totalUzs));
    setText('amount-usd-hint', '≈ ' + fmtUsd(totalUsd));
    setText('amount-rub-hint', '≈ ' + fmtRub(totalRub));
  } else {
    setText('amount-usd-hint', '...');
    setText('amount-rub-hint', '...');
  }

  // Payback period
  updatePayback(amt, apr, cmp);
}

// ── Payback Period ─────────────────────────────
/**
 * Find number of months until totalEarnings >= principal.
 * Compound: principal*(1+r)^n - principal = principal => (1+r)^n = 2 => n = ln(2)/ln(1+r)
 * Simple:   principal * apr/12 * n_months = principal => n_months = 12/apr*100
 */
function updatePayback(principal, aprPct, compound) {
  const apr = aprPct / 100;
  let months;
  if (compound) {
    const monthlyR = apr / 12;
    if (monthlyR <= 0) { setText('payback-value', '∞'); return; }
    months = Math.log(2) / Math.log(1 + monthlyR);
  } else {
    if (apr <= 0) { setText('payback-value', '∞'); return; }
    months = 12 / apr;
  }

  // Format nicely
  let label;
  if (months < 1) {
    const days = Math.round(months * 30.4375);
    label = days + ' ' + pluralDays(days);
  } else if (months < 12) {
    const m = Math.round(months * 10) / 10;
    label = m + ' ' + pluralMonths(m);
  } else {
    const years = months / 12;
    const y = Math.floor(years);
    const m = Math.round((years - y) * 12);
    label = y + ' ' + pluralYears(y) + (m > 0 ? ' ' + m + ' ' + pluralMonths(m) : '');
  }
  setText('payback-value', label);

  // End date
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + Math.round(months));
  setText('payback-end-label', endDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }));

  // Bar: map payback months to visual (max 5 years = 60 months => 100%)
  const barPct = Math.min(months / 60, 1) * 200;
  const bar = $('payback-bar');
  if (bar) bar.setAttribute('width', barPct.toFixed(1));
}

function pluralDays(n) {
  const r = n % 10, r100 = n % 100;
  if (r === 1 && r100 !== 11) return 'день';
  if (r >= 2 && r <= 4 && (r100 < 10 || r100 >= 20)) return 'дня';
  return 'дней';
}
function pluralMonths(n) {
  const r = Math.round(n) % 10, r100 = Math.round(n) % 100;
  if (r === 1 && r100 !== 11) return 'месяц';
  if (r >= 2 && r <= 4 && (r100 < 10 || r100 >= 20)) return 'месяца';
  return 'месяцев';
}
function pluralYears(n) {
  const r = n % 10, r100 = n % 100;
  if (r === 1 && r100 !== 11) return 'год';
  if (r >= 2 && r <= 4 && (r100 < 10 || r100 >= 20)) return 'года';
  return 'лет';
}

// ── Ring animation ─────────────────────────────────
function updateRing(apr) {
  const maxApr = 200;
  const pct = Math.min(apr / maxApr, 1);
  const circumference = 2 * Math.PI * 52; // ~327
  const offset = circumference * (1 - pct);
  const fill = $('ring-fill');
  if (fill) fill.style.strokeDashoffset = offset.toFixed(2);
}

// ── Slider sync ────────────────────────────────────
function syncSlider(inputId, sliderId, callback) {
  const inp = $(inputId);
  const sld = $(sliderId);
  if (!inp || !sld) return;

  const updateBg = () => {
    const min = parseFloat(sld.min);
    const max = parseFloat(sld.max);
    const val = parseFloat(sld.value);
    const pct = ((val - min) / (max - min)) * 100;
    sld.style.background =
      `linear-gradient(to right, var(--ton) 0%, var(--ton) ${pct}%, rgba(74,158,255,0.15) ${pct}%)`;
  };

  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value) || 0;
    sld.value = Math.min(Math.max(v, parseFloat(sld.min)), parseFloat(sld.max));
    updateBg();
    callback(v);
  });

  sld.addEventListener('input', () => {
    inp.value = sld.value;
    updateBg();
    callback(parseFloat(sld.value));
  });

  updateBg();
}

// ── Init ───────────────────────────────────────────
function init() {
  // Amount
  syncSlider('inp-amount', 'slider-amount', (v) => { S.amount = v > 0 ? v : 0.01; updateAll(); });

  // APR
  syncSlider('inp-apr', 'slider-apr', (v) => {
    S.apr = v > 0 ? v : 0.01;
    // Highlight matching preset
    document.querySelectorAll('.preset-btn').forEach((b) => {
      b.classList.toggle('active', parseFloat(b.dataset.apr) === v);
    });
    updateAll();
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = parseFloat(btn.dataset.apr);
      $('inp-apr').value = v;
      $('slider-apr').value = v;
      const min = parseFloat($('slider-apr').min);
      const max = parseFloat($('slider-apr').max);
      const pct = ((v - min) / (max - min)) * 100;
      $('slider-apr').style.background =
        `linear-gradient(to right, var(--ton) 0%, var(--ton) ${pct}%, rgba(74,158,255,0.15) ${pct}%)`;
      S.apr = v;
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateAll();
    });
  });

  // Compound toggle
  $('compound-toggle').addEventListener('change', (e) => {
    S.compound = e.target.checked;
    updateAll();
  });

  // Refresh button
  $('refresh-btn').addEventListener('click', fetchPrices);

  // Initial calc with placeholder prices
  updateAll();

  // Highlight 12% preset on load
  document.querySelector('[data-apr="12"]')?.classList.add('active');

  // Fetch live prices
  fetchPrices();

  // Auto-refresh every 60 seconds
  setInterval(fetchPrices, 60000);
}

document.addEventListener('DOMContentLoaded', init);
