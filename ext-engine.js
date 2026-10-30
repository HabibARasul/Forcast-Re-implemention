// Forecast-to-Cost Lab engine: models defined as CSV tables, compiled, then run through
// (1) a forecasting benchmark, (2) joint lot-size and mode choice, (3) an (r, Q) inventory simulation.
// Depends on engine.js (Engine) for the forecasting kernels. Pure functions; Node and browser.
(function (root) {
  'use strict';
  const E = root.Engine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const { sum, mean, sd, median, rng } = E;

  // ---------- CSV ----------
  function parseTable(text) { // paren- and quote-aware: commas inside (...) or "..." do not split
    const lines = text.replace(/\r/g, '').split('\n'); const out = [];
    lines.forEach((ln, i) => { if (!ln.trim() || ln.trim().startsWith('#')) return; const cells = []; let cur = '', depth = 0, q = false;
      for (const ch of ln) { if (q) { if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === '(') { depth++; cur += ch; } else if (ch === ')') { depth--; cur += ch; }
        else if (ch === ',' && depth <= 0) { cells.push(cur.trim()); cur = ''; } else cur += ch; }
      cells.push(cur.trim()); out.push({ line: i + 1, cells }); });
    return out;
  }

  // ---------- distributions ----------
  const DISTS = { const: 1, exp: 1, tri: 3, uni: 2, norm: 2, lnorm: 2, erl: 2, gamma: 2, pois: 1, emp: -1 };
  function parseDist(s) {
    const m = /^\s*([a-z]+)\s*\(([^)]*)\)\s*$/i.exec(s || ''); if (!m) return { error: `"${s}" is not a distribution. Write it like norm(10, 3).` };
    const name = m[1].toLowerCase(); if (!(name in DISTS)) return { error: `Unknown distribution "${name}". Use one of ${Object.keys(DISTS).join(', ')}.` };
    const args = m[2].split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number);
    if (args.some((x) => !isFinite(x))) return { error: `Every argument of ${name}( ) must be a number.` };
    const need = DISTS[name]; if (need > 0 && args.length !== need) return { error: `${name}( ) takes ${need} argument${need > 1 ? 's' : ''}; found ${args.length}.` };
    if (name === 'emp' && !args.length) return { error: 'emp( ) needs at least one value.' };
    if ((name === 'norm' || name === 'lnorm') && args[1] < 0) return { error: 'Standard deviation cannot be negative.' };
    if (name === 'tri' && !(args[0] <= args[1] && args[1] <= args[2])) return { error: 'tri(min, mode, max) needs min ≤ mode ≤ max.' };
    if (name === 'uni' && args[0] > args[1]) return { error: 'uni(a, b) needs a ≤ b.' };
    if ((name === 'exp' || name === 'pois') && args[0] < 0) return { error: name + '( ) mean must be ≥ 0.' };
    if ((name === 'erl' || name === 'gamma') && (args[0] <= 0 || args[1] <= 0)) return { error: name + '( ) parameters must be positive.' };
    return { name, args, mean: distMean(name, args), sd: distSd(name, args) };
  }
  function distMean(n, a) { return { const: a[0], exp: a[0], tri: (a[0] + a[1] + a[2]) / 3, uni: (a[0] + a[1]) / 2, norm: a[0], lnorm: Math.exp(a[0] + a[1] * a[1] / 2), erl: a[1], gamma: a[0] * a[1], pois: a[0], emp: a.length ? mean(a) : 0 }[n]; }
  function distSd(n, a) { switch (n) { case 'const': return 0; case 'exp': return a[0]; case 'tri': { const [x, m, y] = a; return Math.sqrt((x * x + m * m + y * y - x * m - x * y - m * y) / 18); }
    case 'uni': return (a[1] - a[0]) / Math.sqrt(12); case 'norm': return a[1]; case 'lnorm': return Math.sqrt((Math.exp(a[1] ** 2) - 1) * Math.exp(2 * a[0] + a[1] ** 2));
    case 'erl': return a[1] / Math.sqrt(a[0]); case 'gamma': return Math.sqrt(a[0]) * a[1]; case 'pois': return Math.sqrt(a[0]); case 'emp': return a.length > 1 ? sd(a, 0) : 0; } return 0; }
  function sampler(d, R) {
    const g = (k) => { if (k < 1) { const u = R(); return g(1 + k) * Math.pow(u, 1 / k); } const dd = k - 1 / 3, c = 1 / Math.sqrt(9 * dd); for (;;) { let x, v; do { x = R.normal(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = R(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + dd * (1 - v + Math.log(v))) return dd * v; } };
    const a = d.args; switch (d.name) {
      case 'const': return () => a[0]; case 'exp': return () => -a[0] * Math.log(1 - R()); case 'uni': return () => a[0] + (a[1] - a[0]) * R();
      case 'tri': return () => { const [x, m, y] = a, u = R(), f = (m - x) / (y - x || 1); return u < f ? x + Math.sqrt(u * (y - x) * (m - x)) : y - Math.sqrt((1 - u) * (y - x) * (y - m)); };
      case 'norm': return () => a[0] + a[1] * R.normal(); case 'lnorm': return () => Math.exp(a[0] + a[1] * R.normal());
      case 'erl': return () => { let s = 0; for (let i = 0; i < a[0]; i++) s += -Math.log(1 - R()); return s * a[1] / a[0]; };
      case 'gamma': return () => g(a[0]) * a[1];
      case 'pois': return () => { if (a[0] > 50) return Math.max(0, Math.round(a[0] + Math.sqrt(a[0]) * R.normal())); let L = Math.exp(-a[0]), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };
      case 'emp': return () => a[Math.floor(R() * a.length)];
    } }

  // inverse standard normal (Acklam), |error| < 1.2e-9 after one Halley step
  function normInv(p) { const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
      c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    let x; if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    return x; } // Acklam (2003): relative error below 1.15e-9
  function erfc(x) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z); const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
  const normCdf = (x) => 0.5 * erfc(-x / Math.SQRT2);

  // ---------- schema ----------
  const SETTINGS = {
    name: { def: 'Untitled model', type: 'text', help: 'Model name shown in reports.' },
    weeks_per_year: { def: 52, type: 'num', min: 1, help: 'Converts weekly demand to annual demand.' },
    holding_rate: { def: 0.2, type: 'num', min: 0, help: 'Annual holding cost as a share of unit price.' },
    ordering_cost: { def: 15, type: 'num', min: 0, help: 'Cost per replenishment order, before shipping.' },
    price_floor: { def: 1, type: 'num', min: 0, help: 'Minimum price used for holding cost.' },
    service_level: { def: 0, type: 'num', min: 0, max: 0.9999, help: 'Cycle service level for safety stock. 0 means no safety stock (thesis model).' },
    review_weeks: { def: 0, type: 'num', min: 0, help: 'Review period added to lead time for safety stock.' },
    pipeline_holding: { def: 0, type: 'bool', help: '1 charges holding cost on stock in transit (Baumol and Vinod 1970).' },
    base_mode: { def: '', type: 'text', help: 'Mode the separate policy always uses. Blank means the cheapest fixed cost.' },
    demand_from: { def: 'items', type: 'enum', values: ['items', 'series', 'forecast'], help: 'Where annual demand comes from: the items table, the mean of the linked series, or the chosen forecast method.' },
    forecast_method: { def: 'Naive', type: 'text', help: 'Method whose forecast and error feed the cost model when demand_from is forecast.' },
    methods: { def: 'Naive;SES;Holt;ARIMA(2,1,2);GBT', type: 'text', help: 'Forecast methods to benchmark, separated by semicolons.' },
    train_share: { def: 0.8, type: 'num', min: 0.2, max: 0.95, help: 'Share of each series used before the first forecast origin.' },
    refit_every: { def: 1, type: 'num', min: 1, help: 'Refit statistical models every k test periods (1 = every period).' },
    lags: { def: 4, type: 'num', min: 1, max: 26, help: 'Lagged periods used as features by GBT and LSTM.' },
    season: { def: 52, type: 'num', min: 2, help: 'Season length for seasonal naive.' },
    sim_weeks: { def: 52, type: 'num', min: 4, max: 520, help: 'Weeks simulated per replication.' },
    sim_reps: { def: 10, type: 'num', min: 1, max: 200, help: 'Simulation replications.' },
    sim_items: { def: 25, type: 'num', min: 1, max: 2000, help: 'Simulate the top-N items by demand (keeps large models fast).' },
    seed: { def: 1, type: 'num', min: 0, help: 'Seed for generated series and simulation streams.' },
  };
  const COLS = {
    settings: { key: { req: 1 }, value: {} },
    modes: { mode: { req: 1, type: 'key' }, fixed_cost: { req: 1, type: 'num', min: 0 }, per_km: { type: 'num', min: 0, def: 0 }, per_unit: { type: 'num', min: 0, def: 0 }, transit_days: { type: 'num', min: 0, def: 0 }, capacity: { type: 'num', min: 0, def: 0 } },
    items: { item: { req: 1, type: 'key' }, price: { req: 1, type: 'num', min: 0 }, annual_demand: { type: 'num', min: 0 }, distance_km: { type: 'num', min: 0, def: 0 }, series: { type: 'ref' }, weekly_sd: { type: 'num', min: 0 },
      lead_days: { type: 'num', min: 0, def: 0 }, ordering_cost: { type: 'num', min: 0 }, holding_rate: { type: 'num', min: 0 }, demand_dist: { type: 'dist' }, allowed_modes: { type: 'text' } },
    series: { series: { req: 1 }, period: { req: 1, type: 'num' }, value: { req: 1, type: 'num' } },
    generators: { series: { req: 1, type: 'key' }, model: { req: 1, type: 'enum', values: ['const', 'iid', 'ar1', 'rw', 'trend', 'seasonal', 'intermittent'] }, n: { req: 1, type: 'num', min: 4 }, a: { type: 'num', def: 0 }, b: { type: 'num', def: 0 }, c: { type: 'num', def: 0 }, d: { type: 'num', def: 0 }, dist: { type: 'dist' } },
    scenarios: { scenario: { req: 1 }, table: { req: 1 }, key: { req: 1 }, column: { req: 1 }, value: { req: 1 } },
  };
  const TABLE_HELP = {
    settings: 'One row per setting (key,value). Unknown keys are errors.',
    modes: 'Shipping modes. Cost per shipment = trucks × (fixed_cost + distance × per_km) + per_unit × Q; trucks = ceil(Q / capacity) when capacity > 0, else 1.',
    items: 'Stock-keeping units or product-lane pairs. Blank annual_demand is taken from the linked series. allowed_modes lists modes separated by ";".',
    series: 'Demand history in long form: series,period,value.',
    generators: 'Synthetic series. Models: const(a); iid(dist); ar1(mean a, phi b, sd c); rw(start a, sd b); trend(level a, slope b, sd c); seasonal(level a, amplitude b, period c, sd d); intermittent(probability a, size dist).',
    scenarios: 'Each row changes one cell before the model runs: scenario name, table, row key (or setting key), column, new value.',
  };

  function genSeries(g, seed) {
    const R = rng(seed); const n = g.n, out = []; const noise = (s) => s * R.normal(); let prev = g.a, lvl = g.a; const smp = g.distObj ? sampler(g.distObj, R) : null;
    for (let t = 0; t < n; t++) { let v;
      switch (g.model) { case 'const': v = g.a; break; case 'iid': v = smp ? smp() : g.a + noise(g.b); break;
        case 'ar1': prev = g.a + g.b * (prev - g.a) + noise(g.c); v = prev; break; case 'rw': lvl += noise(g.b); v = lvl; break;
        case 'trend': v = g.a + g.b * t + noise(g.c); break; case 'seasonal': v = g.a + g.b * Math.sin(2 * Math.PI * t / (g.c || 52)) + noise(g.d); break;
        case 'intermittent': v = R() < g.a ? (smp ? smp() : g.b) : 0; break; }
      out.push(Math.max(0, v)); }
    return out;
  }

  // ---------- compiler ----------
  function compile(tables, scenario) {
    const errors = [], warn = []; const err = (table, line, msg) => errors.push({ table, line, msg });
    const parsed = {};
    for (const t of Object.keys(COLS)) { const txt = tables[t] || ''; const rows = parseTable(txt); if (!rows.length) { parsed[t] = { head: Object.keys(COLS[t]).filter((c) => COLS[t][c].req), rows: [] }; continue; }
      const head = rows[0].cells.map((c) => c.toLowerCase()); const spec = COLS[t];
      head.forEach((h) => { if (!spec[h]) err(t, rows[0].line, `Unknown column "${h}". Columns for ${t}: ${Object.keys(spec).join(', ')}.`); });
      Object.keys(spec).filter((c) => spec[c].req && !head.includes(c)).forEach((c) => err(t, rows[0].line, `Missing required column "${c}".`));
      const recs = rows.slice(1).map((r) => { const o = { _line: r.line }; if (r.cells.length > head.length) err(t, r.line, `Row has ${r.cells.length} cells but the header has ${head.length}.`); head.forEach((h, i) => o[h] = r.cells[i] == null ? '' : r.cells[i]); return o; });
      parsed[t] = { head, rows: recs }; }
    // scenario edits are applied to parsed cells before typing
    if (scenario) { const edits = parsed.scenarios.rows.filter((r) => r.scenario === scenario); if (!edits.length) err('scenarios', 0, `Scenario "${scenario}" has no rows.`);
      edits.forEach((e) => { const T = parsed[e.table]; if (!T || e.table === 'scenarios') return err('scenarios', e._line, `Table "${e.table}" does not exist.`);
        if (e.table === 'settings') { let r = T.rows.find((x) => x.key === e.key); if (!SETTINGS[e.key]) return err('scenarios', e._line, `Unknown setting "${e.key}".`); if (!r) T.rows.push(r = { key: e.key, _line: e._line }); r.value = e.value; return; }
        const keyCol = Object.keys(COLS[e.table]).find((c) => COLS[e.table][c].type === 'key'); if (!COLS[e.table][e.column]) return err('scenarios', e._line, `Column "${e.column}" is not in ${e.table}.`);
        const targets = e.key === '*' ? T.rows : T.rows.filter((x) => x[keyCol] === e.key); if (!targets.length) return err('scenarios', e._line, `No ${e.table} row with ${keyCol} "${e.key}". Use * for every row.`);
        targets.forEach((x) => { const v = e.value.trim(); x[e.column] = /^[*x]\s*[0-9.]+$/i.test(v) ? String(+x[e.column] * +v.slice(1)) : v; }); }); }
    // typing and range checks
    const typed = {};
    for (const t of Object.keys(COLS)) { if (t === 'settings' || t === 'scenarios') continue; const spec = COLS[t]; const seen = new Set();
      typed[t] = parsed[t].rows.map((r) => { const o = { _line: r._line };
        for (const c of Object.keys(spec)) { const s = spec[c], raw = r[c] == null ? '' : String(r[c]).trim();
          if (raw === '') { if (s.req) err(t, r._line, `"${c}" is empty.`); o[c] = s.def != null ? s.def : null; continue; }
          if (s.type === 'num') { const v = Number(raw); if (!isFinite(v)) { err(t, r._line, `"${c}" must be a number; found "${raw}".`); o[c] = null; continue; }
            if (s.min != null && v < s.min) err(t, r._line, `"${c}" cannot be below ${s.min}; found ${v}.`); o[c] = v; }
          else if (s.type === 'enum') { if (!s.values.includes(raw)) err(t, r._line, `"${c}" must be one of ${s.values.join(', ')}; found "${raw}".`); o[c] = raw; }
          else if (s.type === 'dist') { const d = parseDist(raw); if (d.error) err(t, r._line, d.error); else o[c + 'Obj'] = d; o[c] = raw; }
          else o[c] = raw; }
        const keyCol = Object.keys(spec).find((c) => spec[c].type === 'key'); if (keyCol && o[keyCol] != null) { if (seen.has(o[keyCol])) err(t, r._line, `Duplicate ${keyCol} "${o[keyCol]}".`); seen.add(o[keyCol]); }
        return o; }); }
    const set = {}; for (const k in SETTINGS) set[k] = SETTINGS[k].def; const seenK = new Set();
    parsed.settings.rows.forEach((r) => { const k = (r.key || '').trim(); if (!SETTINGS[k]) return err('settings', r._line, `Unknown setting "${k}".`); if (seenK.has(k)) err('settings', r._line, `Setting "${k}" appears twice.`); seenK.add(k);
      const s = SETTINGS[k], raw = (r.value || '').trim(); if (s.type === 'num' || s.type === 'bool') { const v = Number(raw); if (!isFinite(v)) return err('settings', r._line, `"${k}" must be a number.`);
        if (s.min != null && v < s.min) err('settings', r._line, `"${k}" cannot be below ${s.min}.`); if (s.max != null && v > s.max) err('settings', r._line, `"${k}" cannot exceed ${s.max}.`); set[k] = v; }
      else if (s.type === 'enum') { if (!s.values.includes(raw)) err('settings', r._line, `"${k}" must be one of ${s.values.join(', ')}.`); set[k] = raw; } else set[k] = raw; });
    // series: history + generators
    const series = {}; const sLines = {};
    typed.series.forEach((r) => { if (r.series == null) return; (series[r.series] = series[r.series] || []).push([r.period, r.value]); sLines[r.series] = r._line; if (r.value < 0) err('series', r._line, 'Demand cannot be negative.'); });
    for (const k in series) { series[k].sort((a, b) => a[0] - b[0]); for (let i = 1; i < series[k].length; i++) if (series[k][i][0] === series[k][i - 1][0]) err('series', sLines[k], `Series "${k}" repeats period ${series[k][i][0]}.`); series[k] = series[k].map((p) => p[1]); }
    typed.generators.forEach((g, i) => { if (series[g.series]) return err('generators', g._line, `Series "${g.series}" is defined in both series and generators.`);
      if (g.model === 'iid' && !g.distObj && !(g.b >= 0)) err('generators', g._line, 'iid needs dist or a ≥ 0, b ≥ 0.'); if (g.model === 'intermittent' && !(g.a > 0 && g.a <= 1)) err('generators', g._line, 'intermittent needs 0 < a ≤ 1 (demand probability).');
      if (g.model === 'ar1' && Math.abs(g.b) >= 1) err('generators', g._line, 'ar1 needs |phi| < 1 (column b).');
      series[g.series] = genSeries(g, (set.seed || 1) * 7919 + i * 104729 + 1); });
    // modes
    if (!typed.modes.length) err('modes', 1, 'Define at least one shipping mode.');
    const modes = typed.modes; if (set.base_mode && !modes.find((m) => m.mode === set.base_mode)) err('settings', (parsed.settings.rows.find((r) => r.key === 'base_mode') || {})._line || 1, `base_mode "${set.base_mode}" is not in the modes table.`);
    const baseMode = set.base_mode || (modes.slice().sort((a, b) => a.fixed_cost - b.fixed_cost || a.per_km - b.per_km)[0] || {}).mode;
    // items
    const items = typed.items.map((it) => { const o = Object.assign({}, it);
      if (o.series && !series[o.series]) err('items', it._line, `Series "${o.series}" is not defined in series or generators.`);
      if (o.allowed_modes) { o.modeList = o.allowed_modes.split(';').map((x) => x.trim()).filter(Boolean); o.modeList.forEach((m) => { if (!modes.find((x) => x.mode === m)) err('items', it._line, `Mode "${m}" is not in the modes table.`); }); } else o.modeList = modes.map((m) => m.mode);
      if (o.annual_demand == null && !o.series && !o.demand_distObj) err('items', it._line, 'Give annual_demand, a series or a demand_dist.');
      if (o.price != null && o.price <= 0 && set.price_floor <= 0) err('items', it._line, 'Price must be positive when price_floor is 0.');
      return o; });
    if (!items.length) err('items', 1, 'Define at least one item.');
    if (set.demand_from !== 'items' && items.some((i) => !i.series)) warn.push('Some items have no series; they use annual_demand.');
    const methods = set.methods.split(';').map((x) => x.trim()).filter(Boolean); methods.forEach((m) => { if (!parseMethod(m)) err('settings', (parsed.settings.rows.find((r) => r.key === 'methods') || {})._line || 1, `Unknown forecast method "${m}". Known: ${METHOD_NAMES}.`); });
    if (set.demand_from === 'forecast' && !parseMethod(set.forecast_method)) err('settings', 1, `forecast_method "${set.forecast_method}" is not a known method.`);
    const scenarios = [...new Set(parsed.scenarios.rows.map((r) => r.scenario))];
    if (!scenario) parsed.scenarios.rows.forEach((r) => { if (!parsed[r.table] || r.table === 'scenarios') err('scenarios', r._line, `Table "${r.table}" does not exist.`); else if (r.table !== 'settings' && !COLS[r.table][r.column]) err('scenarios', r._line, `Column "${r.column}" is not in ${r.table}.`); else if (r.table === 'settings' && !SETTINGS[r.key]) err('scenarios', r._line, `Unknown setting "${r.key}".`); });
    const model = { settings: set, modes, items, series, baseMode, methods, scenarios, scenario: scenario || null };
    return { ok: !errors.length, errors, warnings: warn, model, parsed };
  }

  // ---------- forecasting ----------
  const METHOD_NAMES = 'Naive, SNaive, Mean, MA(k), SES, Holt, Damped, ARIMA(p,1,q), ARIMA(p,0,q), Croston, GBT, LSTM, Ensemble';
  function parseMethod(s) { const m = /^\s*([A-Za-z]+)\s*(?:\(([^)]*)\))?\s*$/.exec(s || ''); if (!m) return null; const n = m[1].toLowerCase(), a = (m[2] || '').split(',').map((x) => x.trim()).filter(Boolean).map(Number);
    const map = { naive: 'Naive', snaive: 'SNaive', mean: 'Mean', ma: 'MA', ses: 'SES', holt: 'Holt', damped: 'Damped', arima: 'ARIMA', croston: 'Croston', gbt: 'GBT', xgboost: 'GBT', lstm: 'LSTM', ensemble: 'Ensemble' };
    if (!map[n]) return null; if (n === 'arima' && (a.length !== 3 || a[1] > 1 || a.some((x) => !(x >= 0)))) return null; if (n === 'ma' && !(a[0] >= 1)) return null; return { kind: map[n], args: a, label: s.trim() }; }

  function sesFit(y) { // SSE-optimal alpha, initial level by least squares
    const fit = (a) => { let l = 0; const u = []; let w = 1; const e0 = []; for (let i = 0; i < y.length; i++) { e0.push(y[i] - l); u.push(w); l = a * y[i] + (1 - a) * l; w *= (1 - a); } // e_i = y_i - (l_i(0) + w_i*l0)
      const l0 = sum(e0.map((e, i) => e * u[i])) / sum(u.map((x) => x * x)); const sse = sum(e0.map((e, i) => (e - l0 * u[i]) ** 2)); let lv = l0; for (const v of y) lv = a * v + (1 - a) * lv; return { sse, f: lv, a, l0 }; };
    let best = null; for (let a = 0.01; a <= 1.0001; a += 0.01) { const r = fit(Math.min(1, a)); if (!best || r.sse < best.sse) best = r; }
    const r2 = E.nelderMead((p) => fit(Math.min(1, Math.max(0, p[0]))).sse, [best.a], { step: 0.05 }); const fr = fit(Math.min(1, Math.max(0, r2.x[0]))); return fr.sse <= best.sse ? fr : best; }
  function dampedFit(y) { // damped trend, phi in [0.8, 0.98], alpha/beta by grid + NM, l0/b0 by least squares
    const run = (a, b, ph, l0, b0) => { let l = l0, t = b0; const e = []; for (const v of y) { const f = l + ph * t; e.push(v - f); const ln = a * v + (1 - a) * (l + ph * t); t = b * (ln - l) + (1 - b) * ph * t; l = ln; } return { e, f: l + ph * t }; };
    const fitLB = (a, b, ph) => { const e0 = run(a, b, ph, 0, 0).e, eu = run(a, b, ph, 1, 0).e, ev = run(a, b, ph, 0, 1).e; const u = eu.map((x, i) => e0[i] - x), v = ev.map((x, i) => e0[i] - x);
      const A = [[sum(u.map((x) => x * x)), sum(u.map((x, i) => x * v[i]))], [sum(u.map((x, i) => x * v[i])), sum(v.map((x) => x * x))]]; const [l0, b0] = E.solve(A, [sum(u.map((x, i) => x * e0[i])), sum(v.map((x, i) => x * e0[i]))]);
      const e = e0.map((x, i) => x - l0 * u[i] - b0 * v[i]); return { sse: sum(e.map((x) => x * x)), f: run(a, b, ph, l0, b0).f }; };
    const cl = (p) => { const a = Math.min(1, Math.max(0.0001, p[0])); return [a, Math.min(a, Math.max(0, p[1])), Math.min(0.98, Math.max(0.8, p[2]))]; };
    let best = null; for (let a = 0.1; a < 1; a += 0.2) for (let b = 0; b <= a; b += 0.1) for (const ph of [0.85, 0.95]) { const r = fitLB(a, b, ph); if (!best || r.sse < best.sse) best = Object.assign(r, { p: [a, b, ph] }); }
    const r = E.nelderMead((p) => fitLB(...cl(p)).sse, best.p, { step: 0.1 }); return fitLB(...cl(r.x)); }
  function crostonFit(y, a = 0.1) { let z = null, p = null, q = 1; for (const v of y) { if (v > 0) { if (z == null) { z = v; p = q; } else { z = a * v + (1 - a) * z; p = a * q + (1 - a) * p; } q = 1; } else q++; } return z == null ? 0 : z / p; }
  function arimaD0Fit(y, p, q) { const mu = mean(y); const z = y.map((v) => v - mu); const unpack = (x) => ({ phi: E.pacfToCoef(x.slice(0, p)), theta: E.pacfToCoef(x.slice(p)).map((c) => -c) });
    const obj = (x) => { const { phi, theta } = unpack(x); const r = E.armaFilter(z, phi, theta); return isFinite(r.nll) ? r.nll : 1e300; };
    let best = null; for (const s of [new Array(p + q).fill(0), new Array(p + q).fill(0.3)]) { if (!s.length) { best = { x: [], f: obj([]) }; break; } const r = E.nelderMead(obj, s, { step: 0.4 }); if (!best || r.f < best.f) best = r; }
    const { phi, theta } = unpack(best.x); const f = E.armaFilter(z, phi, theta); return { phi, theta, forecast: mu + f.next, loglik: -best.f }; }
  function arimaAny(y, p, d, q) { if (d === 1) { if (p + q === 0) return { forecast: y[y.length - 1] }; return E.arimaFit(y, p, q); } return arimaD0Fit(y, p, q); }

  function oneStep(meth, hist, set, cache) {
    const k = meth.kind, a = meth.args, n = hist.length;
    switch (k) {
      case 'Naive': return hist[n - 1];
      case 'SNaive': return n >= set.season ? hist[n - set.season] : hist[n - 1];
      case 'Mean': return mean(hist);
      case 'MA': return mean(hist.slice(-a[0]));
      case 'SES': return sesFit(hist).f;
      case 'Holt': return E.holtFit(hist).forecast;
      case 'Damped': return dampedFit(hist).f;
      case 'Croston': return crostonFit(hist, a[0] || 0.1);
      case 'ARIMA': return arimaAny(hist, a[0], a[1], a[2]).forecast;
    }
  }
  function evaluateSeries(y, set, methods, onProg) {
    const N = y.length, split = Math.max(set.lags + 2, Math.floor(N * set.train_share)); const actual = y.slice(split); const preds = {}; const time = {};
    for (const ms of methods) { const meth = parseMethod(ms); const t0 = Date.now(); onProg && onProg(ms);
      if (meth.kind === 'GBT' || meth.kind === 'LSTM') { const L = set.lags; const { X, Y } = E.makeLags(y, L); const si = split - L;
        if (meth.kind === 'GBT') preds[ms] = E.gbtFit(X.slice(0, si), Y.slice(0, si)).predict(X.slice(si));
        else { const lo = Math.min(...y.slice(0, split)), hi = Math.max(...y.slice(0, split)) || 1; const sc = y.map((v) => (v - lo) / (hi - lo || 1)); const S2 = E.makeLags(sc, L);
          const runs = (meth.args.length ? Array.from({ length: meth.args[0] }, (_, i) => i + 1) : [1, 2, 3]).map((s) => E.lstmFit(S2.X.slice(0, si), S2.Y.slice(0, si), { seed: s, epochs: meth.args[1] || 60 }).predict(S2.X.slice(si)).map((v) => v * (hi - lo || 1) + lo));
          preds[ms] = actual.map((_, i) => mean(runs.map((r) => r[i]))); } }
      else if (meth.kind === 'Ensemble') { continue; }
      else { const out = []; let last = null; for (let t = split; t < N; t++) { const refit = (t - split) % set.refit_every === 0;
          if (refit || last == null || ['Naive', 'SNaive', 'Mean', 'MA'].includes(meth.kind)) last = oneStep(meth, y.slice(0, t), set); else if (meth.kind !== 'Croston') last = last; out.push(last); }
        preds[ms] = out; }
      time[ms] = (Date.now() - t0) / 1000; }
    const ens = methods.find((m) => /^ensemble/i.test(m)); if (ens) { const base = Object.keys(preds); preds[ens] = actual.map((_, i) => mean(base.map((b) => preds[b][i]))); time[ens] = 0; }
    const scale = mean(y.slice(1, split).map((v, i) => Math.abs(v - y[i]))) || 1;
    const metrics = {}; for (const m in preds) { const p = preds[m]; const e = actual.map((v, i) => v - p[i]); const base = E.metrics(actual, p);
      metrics[m] = Object.assign(base, { smape: 100 * mean(actual.map((v, i) => (v + Math.abs(p[i]) === 0 ? 0 : 2 * Math.abs(v - p[i]) / (Math.abs(v) + Math.abs(p[i]))))), mase: base.mae / scale, bias: mean(e), errSd: sd(e, 1), fcMean: mean(p) }); }
    return { split, actual, preds, metrics, time, n: N };
  }
  function holm(ps) { const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]); const out = new Array(ps.length); let run = 0; idx.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, p * (ps.length - k))); out[i] = run; }); return out; }
  function forecastBench(model, opt = {}) {
    const set = model.settings; const ids = opt.series || Object.keys(model.series); const res = {}; const methods = model.methods;
    ids.forEach((id, j) => { res[id] = evaluateSeries(model.series[id], set, methods, (m) => opt.onProgress && opt.onProgress(`${id} (${j + 1}/${ids.length}): ${m}`)); });
    // aggregate: mean rank by MASE, wins, mean MASE
    const agg = {}; methods.forEach((m) => agg[m] = { rankSum: 0, wins: 0, mase: [], mape: [], n: 0 });
    for (const id of ids) { const M = res[id].metrics; const ord = methods.filter((m) => M[m]).sort((a, b) => M[a].mase - M[b].mase); ord.forEach((m, r) => { agg[m].rankSum += r + 1; agg[m].n++; agg[m].mase.push(M[m].mase); if (isFinite(M[m].mape)) agg[m].mape.push(M[m].mape); }); if (ord[0]) agg[ord[0]].wins++; }
    const summary = methods.map((m) => ({ method: m, meanRank: agg[m].rankSum / (agg[m].n || 1), wins: agg[m].wins, meanMASE: mean(agg[m].mase), medianMAPE: agg[m].mape.length ? median(agg[m].mape) : NaN }));
    // pairwise DM on the first (or only) series, Holm-adjusted
    let dm = null; if (ids.length >= 1) { const r = res[ids[0]]; const ms = Object.keys(r.preds); const pairs = []; for (let i = 0; i < ms.length; i++) for (let k = i + 1; k < ms.length; k++) { const t = E.dieboldMariano(r.actual, r.preds[ms[i]], r.preds[ms[k]]); pairs.push({ a: ms[i], b: ms[k], stat: t.stat, p: t.p }); }
      const adj = holm(pairs.map((x) => x.p)); pairs.forEach((x, i) => x.pHolm = adj[i]); dm = { series: ids[0], pairs }; }
    return { res, summary, dm, ids };
  }

  // ---------- cost model ----------
  function itemInputs(model, it, fc) {
    const set = model.settings; const W = set.weeks_per_year; const y = it.series ? model.series[it.series] : null;
    let D = it.annual_demand, sw = it.weekly_sd;
    if ((set.demand_from === 'series' || D == null) && y) D = mean(y) * W;
    if (D == null && it.demand_distObj) D = it.demand_distObj.mean * W;
    if (set.demand_from === 'forecast' && y && fc && fc.res[it.series] && fc.res[it.series].metrics[set.forecast_method]) { const m = fc.res[it.series].metrics[set.forecast_method]; D = Math.max(0, m.fcMean) * W; if (sw == null) sw = m.errSd; }
    if (sw == null) sw = y ? sd(y, 1) : it.demand_distObj ? it.demand_distObj.sd : 0;
    const S = it.ordering_cost != null ? it.ordering_cost : set.ordering_cost, h = it.holding_rate != null ? it.holding_rate : set.holding_rate;
    return { D: D || 0, sw: sw || 0, S, H: h * Math.max(it.price, set.price_floor), lead: it.lead_days || 0 };
  }
  function costAt(inp, m, Q, set, dist) {
    const trucks = m.capacity > 0 ? Math.ceil(Q / m.capacity - 1e-12) : 1; const n = inp.D / Q; const z = set.service_level > 0 ? normInv(set.service_level) : 0;
    const L = (inp.lead + m.transit_days) / 7 + set.review_weeks; const ss = z * inp.sw * Math.sqrt(Math.max(0, L));
    const c = { ordering: n * inp.S, fixedShip: n * trucks * m.fixed_cost, distanceShip: n * trucks * dist * m.per_km, unitFreight: inp.D * m.per_unit, cycle: Q / 2 * inp.H, safety: ss * inp.H,
      pipeline: set.pipeline_holding ? inp.D * (m.transit_days / 365) * inp.H : 0 };
    c.total = c.ordering + c.fixedShip + c.distanceShip + c.unitFreight + c.cycle + c.safety + c.pipeline; c.Q = Q; c.trucks = trucks; c.ss = ss; c.mode = m.mode; c.L = L; return c;
  }
  function bestQ(inp, m, dist, set) { // exact minimizer of a piecewise-EOQ cost (truck count k fixed on each piece)
    if (inp.D <= 0) return costAt(inp, m, 1, set, dist); const K1 = m.fixed_cost + dist * m.per_km;
    if (!(m.capacity > 0)) return costAt(inp, m, Math.sqrt(2 * inp.D * (inp.S + K1) / inp.H), set, dist);
    let best = null; const qFree = Math.sqrt(2 * inp.D * (inp.S + K1) / inp.H); const kMax = Math.max(1, Math.ceil(Math.sqrt(2 * inp.D * (inp.S + 50 * K1) / inp.H) / m.capacity) + 2);
    for (let k = 1; k <= kMax; k++) { const lo = (k - 1) * m.capacity, hi = k * m.capacity; const q = Math.min(hi, Math.max(lo + 1e-9, Math.sqrt(2 * inp.D * (inp.S + k * K1) / inp.H)));
      const c = costAt(inp, m, q, set, dist); if (!best || c.total < best.total) best = c; if (lo > 4 * qFree && k > 3) break; }
    return best;
  }
  const POLICIES = ['separate', 'thesis_joint', 'full_joint'];
  function runCostModel(model, fc) {
    const set = model.settings; const modeOf = (n) => model.modes.find((m) => m.mode === n); const base = modeOf(model.baseMode);
    const rows = model.items.map((it) => { const inp = itemInputs(model, it, fc); const dist = it.distance_km || 0; const allowed = it.modeList.map(modeOf);
      const bm = it.modeList.includes(base.mode) ? base : allowed[0];
      const sep = costAt(inp, bm, Math.max(1e-9, Math.sqrt(2 * inp.D * inp.S / inp.H) || 1e-9), set, dist);
      let tj = null; for (const m of allowed) { const c = costAt(inp, m, Math.max(1e-9, Math.sqrt(2 * inp.D * (inp.S + m.fixed_cost) / inp.H)), set, dist); if (!tj || c.total < tj.total) tj = c; }
      let fj = null; for (const m of allowed) { const c = bestQ(inp, m, dist, set); if (!fj || c.total < fj.total) fj = c; }
      return { item: it.item, price: it.price, dist, D: inp.D, sw: inp.sw, separate: sep, thesis_joint: tj, full_joint: fj }; }).filter((r) => r.D > 0);
    const keys = ['ordering', 'fixedShip', 'distanceShip', 'unitFreight', 'cycle', 'safety', 'pipeline', 'total'];
    const tot = {}; POLICIES.forEach((p) => { tot[p] = {}; keys.forEach((k) => tot[p][k] = sum(rows.map((r) => r[p][k]))); tot[p].modes = {}; rows.forEach((r) => tot[p].modes[r[p].mode] = (tot[p].modes[r[p].mode] || 0) + 1); tot[p].avgQ = mean(rows.map((r) => r[p].Q)); });
    const sav = (p) => 100 * (tot.separate.total - tot[p].total) / tot.separate.total;
    return { rows, tot, savings: { thesis_joint: sav('thesis_joint'), full_joint: sav('full_joint') }, n: rows.length, D: sum(rows.map((r) => r.D)) };
  }

  // ---------- (r, Q) inventory simulation, weekly periods, backorders ----------
  function simulateItem(row, it, model, policy, opt) {
    const set = model.settings, c = row[policy], W = set.weeks_per_year; const weeks = opt.weeks || set.sim_weeks; const R = rng(opt.seed); const Lw = Math.max(0, Math.round(c.L));
    const dw = row.D / W; const r = dw * Lw + c.ss; const Q = Math.max(1, c.Q);
    const demandGen = opt.demand ? null : it.demand_distObj ? sampler(it.demand_distObj, R) : (row.sw > 0 ? () => Math.max(0, dw + row.sw * R.normal()) : () => dw);
    let oh = Q + c.ss, ip = oh, pipe = []; const oh0 = oh; const log = []; let ordered = 0, received = 0, demand = 0, backlog = 0, filled = 0, orders = 0, holdArea = 0, stockoutWeeks = 0, pipeArea = 0;
    for (let w = 0; w < weeks; w++) {
      if (opt.delays && opt.delays[w]) pipe.forEach((p) => { p.due += opt.delays[w]; });
      const arr = pipe.filter((p) => p.due === w); pipe = pipe.filter((p) => p.due !== w); arr.forEach((p) => { oh += p.q; received += p.q; });
      const d = opt.demand ? opt.demand[w % opt.demand.length] : demandGen(); demand += d; const avail = Math.max(0, oh); filled += Math.min(avail, d); oh -= d; ip -= d; if (oh < 0) stockoutWeeks++;
      holdArea += Math.max(0, oh); pipeArea += sum(pipe.map((p) => p.q)); // end-of-week snapshot; an order placed now is in transit from next week
      let placed = 0; while (ip <= r) { ip += Q; placed += Q; orders++; } if (placed) { ordered += placed; if (Lw === 0) { oh += placed; received += placed; } else pipe.push({ q: placed, due: w + Lw + 1, sent: w }); }
      if (opt.log) log.push({ w, d, oh, ip, placed, arrived: sum(arr.map((p) => p.q)), pipe: pipe.map((p) => ({ q: p.q, due: p.due, sent: p.sent })) });
    }
    const inPipe = sum(pipe.map((p) => p.q)); const H = c.cycle * 2 / Q; // annual holding per unit
    const cost = { holding: holdArea / weeks * H, orders: orders * (c.ordering + c.fixedShip + c.distanceShip) / (row.D / Q || 1) * (W / weeks) };
    return { weeks, demand, filled, fill: demand ? filled / demand : 1, stockoutWeeks, orders, avgOnHand: holdArea / weeks, avgPipe: pipeArea / weeks, ordered, received, inPipe, ohEnd: oh, ohStart: oh0, r, Q, Lw, log, cost,
      balanceError: Math.abs(oh0 + received - demand - oh), pipeError: Math.abs(ordered - received - inPipe) };
  }
  function tCI(xs) { const n = xs.length, m = mean(xs); if (n < 2) return { mean: m, half: NaN }; return { mean: m, half: E.tQuantile(0.975, n - 1) * sd(xs, 1) / Math.sqrt(n) }; }
  function simulateModel(model, cost, opt = {}) {
    const set = model.settings; const N = Math.min(set.sim_items, cost.rows.length); const top = cost.rows.slice().sort((a, b) => b.D - a.D).slice(0, N); const policies = opt.policies || POLICIES; const reps = opt.reps || set.sim_reps;
    const out = {}; policies.forEach((p) => out[p] = { fill: [], holding: [], orders: [], balance: 0, pipe: 0 });
    for (let k = 0; k < reps; k++) for (const p of policies) { let dem = 0, fil = 0, hold = 0, ord = 0;
      top.forEach((row, j) => { const it = model.items.find((x) => x.item === row.item); const s = simulateItem(row, it, model, p, { seed: (set.seed + 1) * 1000003 + k * 7919 + j * 31 });
        dem += s.demand; fil += s.filled; hold += s.cost.holding; ord += s.cost.orders; out[p].balance = Math.max(out[p].balance, s.balanceError); out[p].pipe = Math.max(out[p].pipe, s.pipeError); });
      out[p].fill.push(dem ? fil / dem : 1); out[p].holding.push(hold); out[p].orders.push(ord); }
    const summary = {}; policies.forEach((p) => summary[p] = { fill: tCI(out[p].fill), cost: tCI(out[p].holding.map((h, i) => h + out[p].orders[i])), balance: out[p].balance, pipe: out[p].pipe, raw: out[p] });
    const paired = {}; if (policies.includes('separate')) policies.filter((p) => p !== 'separate').forEach((p) => paired[p] = tCI(out.separate.holding.map((h, i) => h + out.separate.orders[i] - out[p].holding[i] - out[p].orders[i])));
    return { items: top.map((r) => r.item), reps, summary, paired };
  }

  function runModel(tables, opt = {}) {
    const C = compile(tables, opt.scenario); if (!C.ok) return { compile: C };
    const m = C.model; const needFc = opt.forecast !== false && (m.settings.demand_from === 'forecast' || opt.forecast === true);
    const fc = needFc ? forecastBench(m, { onProgress: opt.onProgress, series: opt.forecastSeries }) : null;
    const cost = runCostModel(m, fc); const sim = opt.simulate ? simulateModel(m, cost, opt.sim || {}) : null;
    return { compile: C, model: m, fc, cost, sim };
  }

  const API = { parseTable, parseDist, sampler, normInv, normCdf, SETTINGS, COLS, TABLE_HELP, compile, genSeries, parseMethod, METHOD_NAMES, sesFit, dampedFit, crostonFit, arimaAny, evaluateSeries, forecastBench, holm,
    itemInputs, costAt, bestQ, runCostModel, POLICIES, simulateItem, simulateModel, tCI, runModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Lab = API;
})(typeof window !== 'undefined' ? window : globalThis);
