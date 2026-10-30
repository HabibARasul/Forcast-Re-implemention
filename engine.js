// Reimplementation engine for "Benchmarking Conventional and AI-Driven Approaches for Joint
// Transportation-Inventory Optimization in Retail" (Lamar University thesis, 2026).
// Pure functions, no libraries. Runs in Node and in the browser.
(function (root) {
  'use strict';

  // ---------- small numeric helpers ----------
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => sum(a) / a.length;
  const sd = (a, ddof = 1) => { const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - ddof)); };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

  // Seeded PRNG (mulberry32) and normal deviates
  function rng(seed) {
    let t = seed >>> 0;
    const u = () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
    u.normal = () => { let a = 0, b = 0; while (a === 0) a = u(); b = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
    return u;
  }

  // Nelder-Mead minimizer
  function nelderMead(f, x0, opt = {}) {
    const n = x0.length, maxIt = opt.maxIt || 2000 * n, tol = opt.tol || 1e-10, step = opt.step || 0.1;
    let S = [x0.slice()];
    for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] = x[i] !== 0 ? x[i] * (1 + step) : step; S.push(x); }
    let F = S.map(f);
    for (let it = 0; it < maxIt; it++) {
      const idx = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = idx.map((i) => S[i]); F = idx.map((i) => F[i]);
      if (Math.abs(F[n] - F[0]) <= tol * (Math.abs(F[0]) + tol)) break;
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
      const pt = (a) => c.map((cj, j) => cj + a * (S[n][j] - cj));
      const xr = pt(-1), fr = f(xr);
      if (fr < F[0]) { const xe = pt(-2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
      else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
      else { const xc = fr < F[n] ? pt(-0.5) : pt(0.5), fc = f(xc);
        if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc; }
        else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); } } }
    }
    const b = F.indexOf(Math.min(...F)); return { x: S[b], f: F[b] };
  }

  // Solve linear system (Gaussian elimination with partial pivoting)
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let k = 0; k < n; k++) {
      let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      [M[k], M[p]] = [M[p], M[k]];
      for (let i = k + 1; i < n; i++) { const r = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= r * M[k][j]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }

  // Student t CDF (for Diebold-Mariano p-values) via regularized incomplete beta
  function lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const ci of c) s += ci / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; d = 1 / d; let h = d;
    for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; c = 1 + aa / c; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; c = 1 + aa / c; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
  function ibeta(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
  const tTwoSided = (t, df) => ibeta(df / 2, 0.5, df / (df + t * t));
  function tQuantile(p, df) { let lo = 0, hi = 100; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (1 - tTwoSided(m, df) / 2 < p) ? lo = m : hi = m; } return (lo + hi) / 2; }

  // ---------- Step 1-3: raw CSV -> cleaned aggregates (same rules as Appendix A.3-A.8) ----------
  function parseCSV(text, onRow) {
    let i = 0, field = '', row = [], q = false; const n = text.length;
    while (i < n) { const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; onRow(row); row = []; }
      else field += ch; i++; }
    if (field !== '' || row.length) { row.push(field); onRow(row); }
  }
  function parseDate(s) { // "1/31/2018 22:56" -> ms (UTC clock used as local clock)
    const [d, t] = s.trim().split(' '); const [m, dd, y] = d.split('/').map(Number); const [hh, mm] = (t || '0:0').split(':').map(Number);
    return Date.UTC(y, m - 1, dd, hh, mm);
  }
  const DAY = 86400000;
  const weekStart = (ms) => { const d = new Date(ms); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY; };
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

  const VALID_STATUS = ['COMPLETE', 'CLOSED', 'PENDING', 'PENDING_PAYMENT', 'PROCESSING', 'ON_HOLD'];
  function prepareFromCSV(text, opt = {}) {
    const cutoff = opt.cutoff != null ? opt.cutoff : Date.UTC(2017, 8, 30, 23, 59, 59);
    let header = null, col = {}; const log = { raw: 0, status: {}, dropped: 0 };
    const rows = [];
    parseCSV(text, (r) => {
      if (!header) { header = r; header.forEach((h, k) => col[h.trim()] = k); return; }
      if (r.length < header.length - 2) return; log.raw++;
      const st = r[col['Order Status']]; log.status[st] = (log.status[st] || 0) + 1;
      const lat = r[col['Latitude']], lon = r[col['Longitude']];
      if (!VALID_STATUS.includes(st) || lat === '' || lon === '') { log.dropped++; return; }
      rows.push({ t: parseDate(r[col['order date (DateOrders)']]), q: +r[col['Order Item Quantity']], pid: +r[col['Product Card Id']], name: r[col['Product Name']],
        region: r[col['Order Region']].trim(), price: +r[col['Product Price']], lat: +lat, lon: +lon, mode: r[col['Shipping Mode']].trim(), oid: r[col['Order Id']], cid: r[col['Customer Id']] });
    });
    log.clean = rows.length;
    log.products = new Set(rows.map((r) => r.pid)).size; log.regions = new Set(rows.map((r) => r.region)).size;
    log.customers = new Set(rows.map((r) => r.cid)).size; log.orders = new Set(rows.map((r) => r.oid)).size;
    // weekly full series and monthly counts
    const wk = new Map(), mon = new Map();
    for (const r of rows) { const w = weekStart(r.t); wk.set(w, (wk.get(w) || 0) + r.q); const d = new Date(r.t); const k = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); mon.set(k, (mon.get(k) || 0) + 1); }
    const weekly_full = [...wk.keys()].sort((a, b) => a - b).map((k) => [iso(k), wk.get(k)]);
    const monthly_tail = [...mon.keys()].sort().slice(-12).map((k) => [k, mon.get(k)]);
    const cut = rows.filter((r) => r.t <= cutoff);
    log.cut = cut.length; log.orders_cut = new Set(cut.map((r) => r.oid)).size;
    const modes = {}; for (const r of cut) modes[r.mode] = (modes[r.mode] || 0) + 1; log.modes = modes;
    // weekly series in window, filled to a regular Monday grid
    const wk2 = new Map(); for (const r of cut) { const w = weekStart(r.t); wk2.set(w, (wk2.get(w) || 0) + r.q); }
    const ks = [...wk2.keys()].sort((a, b) => a - b); const weekly = []; let filled = 0, last = null;
    for (let w = ks[0]; w <= ks[ks.length - 1]; w += 7 * DAY) { let v = wk2.get(w); if (v == null) { v = last; filled++; } weekly.push([iso(w), v]); last = v; }
    log.filled = filled;
    // product-region pairs: units, mean price, distance proxy
    const g = new Map();
    for (const r of cut) { const k = r.pid + '|' + r.name + '|' + r.region; let o = g.get(k); if (!o) g.set(k, o = { pid: r.pid, name: r.name, region: r.region, units: 0, ps: 0, n: 0, lat: [], lon: [] });
      o.units += r.q; o.ps += r.price; o.n++; o.lat.push(r.lat); o.lon.push(r.lon); }
    const pairs = [...g.values()].sort((a, b) => a.pid - b.pid || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.region < b.region ? -1 : a.region > b.region ? 1 : 0)).map((o) => {
      const mlat = mean(o.lat), mlon = mean(o.lon); let s = 0; for (let i = 0; i < o.n; i++) s += Math.sqrt((o.lat[i] - mlat) ** 2 + (o.lon[i] - mlon) ** 2) * 111;
      return [o.pid, o.name, o.region, o.units, o.ps / o.n, s / o.n]; }).filter((p) => p[3] > 0);
    // product x week matrix (zero-filled over the analysis weeks)
    const idx = new Map(weekly.map((w, i) => [w[0], i])); const pw = {};
    for (const r of cut) { const i = idx.get(iso(weekStart(r.t))); (pw[r.pid] = pw[r.pid] || new Array(weekly.length).fill(0))[i] += r.q; }
    return { weekly_full, weekly, monthly_tail, pairs, product_week: pw, counts: { raw: log.raw, clean: log.clean, cut: log.cut, orders_cut: log.orders_cut }, log };
  }

  // ---------- Step 4: forecasting ----------
  function metrics(actual, pred) {
    const n = actual.length; let ae = 0, se = 0, pe = 0, m = 0;
    for (let i = 0; i < n; i++) { const e = actual[i] - pred[i]; ae += Math.abs(e); se += e * e; if (actual[i] !== 0) { pe += Math.abs(e / actual[i]); m++; } }
    return { mae: ae / n, rmse: Math.sqrt(se / n), mape: 100 * pe / m };
  }

  function naiveForecast(y, split) { return y.slice(split - 1, y.length - 1); }

  // Holt linear (additive trend) exponential smoothing; SSE-optimal alpha, beta; l0, b0 by least squares
  function holtErrors(y, a, b, l0, b0) { let l = l0, t = b0; const e = new Array(y.length);
    for (let i = 0; i < y.length; i++) { const f = l + t; e[i] = y[i] - f; const ln = a * y[i] + (1 - a) * (l + t); t = b * (ln - l) + (1 - b) * t; l = ln; } return { e, l, t }; }
  function holtFit(y) {
    const fitLB = (a, b) => { // errors are affine in (l0,b0): e = e0 - l0*u - b0*v
      const e0 = holtErrors(y, a, b, 0, 0).e, eu = holtErrors(y, a, b, 1, 0).e, ev = holtErrors(y, a, b, 0, 1).e;
      const u = eu.map((x, i) => e0[i] - x), v = ev.map((x, i) => e0[i] - x);
      const A = [[sum(u.map((x) => x * x)), sum(u.map((x, i) => x * v[i]))], [sum(u.map((x, i) => x * v[i])), sum(v.map((x) => x * x))]];
      const rhs = [sum(u.map((x, i) => x * e0[i])), sum(v.map((x, i) => x * e0[i]))];
      const [l0, b0] = solve(A, rhs); const e = e0.map((x, i) => x - l0 * u[i] - b0 * v[i]); return { l0, b0, sse: sum(e.map((x) => x * x)) };
    };
    const clamp = (p) => { const a = Math.min(1, Math.max(0, p[0])); return [a, Math.min(a, Math.max(0, p[1]))]; }; // statsmodels bounds: 0<=beta<=alpha<=1
    const obj = (p) => { const [a, b] = clamp(p); return fitLB(a, b).sse + 1e3 * ((p[0] - a) ** 2 + (p[1] - b) ** 2); };
    let best = null; for (let a = 0.05; a < 1; a += 0.1) for (let b = 0.0; b <= a; b += 0.1) { const f = obj([a, b]); if (!best || f < best.f) best = { x: [a, b], f }; }
    const r = nelderMead(obj, best.x, { step: 0.2, tol: 1e-14 }); const [a, b] = clamp(r.x); const lb = fitLB(a, b);
    const s = holtErrors(y, a, b, lb.l0, lb.b0); return { alpha: a, beta: b, l0: lb.l0, b0: lb.b0, sse: lb.sse, forecast: s.l + s.t };
  }
  function holtRolling(y, split) { const out = []; for (let t = split; t < y.length; t++) out.push(holtFit(y.slice(0, t)).forecast); return out; }

  // ARIMA(p,1,q) by exact Gaussian maximum likelihood (Kalman filter on the differenced series)
  function pacfToCoef(u) { // unconstrained -> stationary AR coefficients (Monahan / Jones)
    const r = u.map((x) => x / Math.sqrt(1 + x * x)); const p = r.length; let y = [];
    for (let k = 0; k < p; k++) { const yn = y.slice(); for (let i = 0; i < k; i++) yn[i] = y[i] - r[k] * y[k - i - 1]; yn[k] = r[k]; y = yn; } return y;
  }
  function armaFilter(z, phi, theta) {
    const p = phi.length, q = theta.length, m = Math.max(p, q + 1);
    const T = new Float64Array(m * m), R = new Float64Array(m);
    for (let i = 0; i < m; i++) { T[i * m] = phi[i] || 0; if (i + 1 < m) T[i * m + i + 1] = 1; R[i] = i === 0 ? 1 : theta[i - 1] || 0; }
    // stationary covariance: P = T P T' + R R'
    const mm = m * m, A = Array.from({ length: mm }, () => new Array(mm).fill(0)), b = new Array(mm);
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { const r = i * m + j; b[r] = R[i] * R[j]; A[r][r] += 1;
      for (let k = 0; k < m; k++) for (let l = 0; l < m; l++) A[r][k * m + l] -= T[i * m + k] * T[j * m + l]; }
    const P = Float64Array.from(solve(A, b)); const a = new Float64Array(m), K = new Float64Array(m), Ta = new Float64Array(m), TP = new Float64Array(mm), NP = new Float64Array(mm);
    let sumlogF = 0, ssq = 0;
    for (let t = 0; t < z.length; t++) {
      const v = z[t] - a[0], F = P[0]; if (!(F > 0)) return { nll: Infinity };
      sumlogF += Math.log(F); ssq += v * v / F;
      for (let i = 0; i < m; i++) { let s = 0, s2 = 0; for (let k = 0; k < m; k++) { s += T[i * m + k] * P[k * m]; s2 += T[i * m + k] * a[k]; } K[i] = s / F; Ta[i] = s2; }
      for (let i = 0; i < m; i++) a[i] = Ta[i] + K[i] * v;
      for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < m; k++) s += T[i * m + k] * P[k * m + j]; TP[i * m + j] = s; }
      for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < m; k++) s += TP[i * m + k] * T[j * m + k]; NP[i * m + j] = s + R[i] * R[j] - K[i] * K[j] * F; }
      P.set(NP);
    }
    const n = z.length, s2 = ssq / n; return { nll: 0.5 * (n * Math.log(2 * Math.PI * s2) + sumlogF + n), sigma2: s2, next: a[0] };
  }
  function arimaFit(y, p = 2, q = 2, starts) {
    const z = y.slice(1).map((v, i) => v - y[i]);
    const unpack = (x) => ({ phi: pacfToCoef(x.slice(0, p)), theta: pacfToCoef(x.slice(p)).map((c) => -c) });
    const obj = (x) => { const { phi, theta } = unpack(x); const r = armaFilter(z, phi, theta); return isFinite(r.nll) ? r.nll : 1e300; };
    let best = null;
    for (const s of starts || [new Array(p + q).fill(0), [0.3, 0.1, -0.5, 0.1].slice(0, p + q), [-0.3, 0.1, 0.5, 0.1].slice(0, p + q), [0.8, -0.2, -0.9, 0.3].slice(0, p + q)]) {
      let r = nelderMead(obj, s, { step: 0.5, tol: 1e-12 }); r = nelderMead(obj, r.x, { step: 0.05, tol: 1e-14 }); if (!best || r.f < best.f) best = r; }
    const { phi, theta } = unpack(best.x); const f = armaFilter(z, phi, theta);
    return { phi, theta, sigma2: f.sigma2, loglik: -best.f, forecast: y[y.length - 1] + f.next, x: best.x };
  }
  function arimaRolling(y, split, p = 2, q = 2) { const out = []; let warm = null;
    for (let t = split; t < y.length; t++) { const st = [new Array(p + q).fill(0)]; if (warm) st.push(warm); st.push([0.3, 0.1, -0.5, 0.1].slice(0, p + q), [0.8, -0.2, -0.9, 0.3].slice(0, p + q));
      const r = arimaFit(y.slice(0, t), p, q, st); warm = r.x; out.push(r.forecast); } return out; }

  // Lag matrix shared by XGBoost and LSTM
  function makeLags(v, k = 4) { const X = [], Y = []; for (let i = k; i < v.length; i++) { X.push(v.slice(i - k, i)); Y.push(v[i]); } return { X, Y }; }

  // Gradient-boosted regression trees, squared error, XGBoost-style (hist cuts at unique values, lambda=1, min_child_weight=1)
  function gbtFit(X, y, opt = {}) {
    const nT = opt.n_estimators || 200, depth = opt.max_depth || 3, eta = opt.learning_rate || 0.05, lam = opt.lambda != null ? opt.lambda : 1, mcw = opt.min_child_weight || 1;
    const n = X.length, d = X[0].length, base = mean(y);
    const cuts = []; for (let j = 0; j < d; j++) cuts.push([...new Set(X.map((r) => r[j]))].sort((a, b) => a - b).slice(1));
    const pred = new Array(n).fill(base), trees = [];
    const build = (idx, g, lvl) => {
      const G = sum(idx.map((i) => g[i])), H = idx.length;
      if (lvl < depth) {
        let best = null; const parent = G * G / (H + lam);
        for (let j = 0; j < d; j++) { const sorted = idx.slice().sort((a, b) => X[a][j] - X[b][j]); let gl = 0, hl = 0, k = 0;
          for (const c of cuts[j]) { while (k < sorted.length && X[sorted[k]][j] < c) { gl += g[sorted[k]]; hl++; k++; }
            const hr = H - hl; if (hl < mcw || hr < mcw) continue; const gr = G - gl; const gain = gl * gl / (hl + lam) + gr * gr / (hr + lam) - parent;
            if (gain > 1e-6 && (!best || gain > best.gain)) best = { gain, j, c }; } }
        if (best) { const L = idx.filter((i) => X[i][best.j] < best.c), R = idx.filter((i) => !(X[i][best.j] < best.c));
          return { j: best.j, c: best.c, l: build(L, g, lvl + 1), r: build(R, g, lvl + 1) }; }
      }
      return { leaf: -G / (H + lam) * eta };
    };
    const evalT = (t, x) => { while (!('leaf' in t)) t = x[t.j] < t.c ? t.l : t.r; return t.leaf; };
    for (let m = 0; m < nT; m++) { const g = pred.map((p, i) => p - y[i]); const t = build([...Array(n).keys()], g, 0); trees.push(t); for (let i = 0; i < n; i++) pred[i] += evalT(t, X[i]); }
    return { predict: (Xn) => Xn.map((x) => base + sum(trees.map((t) => evalT(t, x)))), trees, base };
  }

  // LSTM(32, relu) + Dense(1), Adam, MSE, batch 32, shuffled epochs (Keras defaults reproduced)
  function lstmFit(X, y, opt = {}) {
    const H = opt.units || 32, epochs = opt.epochs || 100, bs = opt.batch || 32, lr = opt.lr || 0.001, R = rng(opt.seed || 1);
    const act = opt.activation === 'tanh' ? Math.tanh : (x) => (x > 0 ? x : 0), dact = opt.activation === 'tanh' ? (a) => 1 - a * a : (a, x) => (x > 0 ? 1 : 0);
    const sig = (x) => 1 / (1 + Math.exp(-x)); const G4 = 4 * H;
    const lim = Math.sqrt(6 / (1 + G4)); const Wx = Array.from({ length: G4 }, () => (R() * 2 - 1) * lim);
    // orthogonal recurrent kernel (H x 4H) via Gram-Schmidt on rows of a Gaussian matrix
    const M = Array.from({ length: H }, () => Array.from({ length: G4 }, () => R.normal()));
    for (let i = 0; i < H; i++) { for (let k = 0; k < i; k++) { const dt = sum(M[i].map((v, j) => v * M[k][j])); M[i] = M[i].map((v, j) => v - dt * M[k][j]); } const nr = Math.sqrt(sum(M[i].map((v) => v * v))); M[i] = M[i].map((v) => v / nr); }
    const Wh = M; const b = new Array(G4).fill(0); for (let k = H; k < 2 * H; k++) b[k] = 1;
    const lim2 = Math.sqrt(6 / (H + 1)); const Wd = Array.from({ length: H }, () => (R() * 2 - 1) * lim2); let bd = 0;
    const params = [Wx, ...Wh, b, Wd]; const mA = params.map((p) => new Array(p.length).fill(0)), vA = params.map((p) => new Array(p.length).fill(0)); let step = 0;
    const forward = (seq) => { let h = new Array(H).fill(0), c = new Array(H).fill(0); const cache = [];
      for (const xt of seq) { const z = new Array(G4); for (let k = 0; k < G4; k++) { let s = b[k] + Wx[k] * xt; for (let j = 0; j < H; j++) s += h[j] * Wh[j][k]; z[k] = s; }
        const ig = [], fg = [], gg = [], og = [], cn = [], hn = [];
        for (let u = 0; u < H; u++) { ig[u] = sig(z[u]); fg[u] = sig(z[H + u]); gg[u] = act(z[2 * H + u]); og[u] = sig(z[3 * H + u]); cn[u] = fg[u] * c[u] + ig[u] * gg[u]; hn[u] = og[u] * act(cn[u]); }
        cache.push({ xt, hp: h, cp: c, z, ig, fg, gg, og, c: cn, h: hn }); h = hn; c = cn; }
      return { out: bd + sum(h.map((v, j) => v * Wd[j])), cache, h }; };
    const n = X.length; const order = [...Array(n).keys()];
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (let s0 = 0; s0 < n; s0 += bs) { const batch = order.slice(s0, s0 + bs), B = batch.length;
        const gWx = new Array(G4).fill(0), gWh = Array.from({ length: H }, () => new Array(G4).fill(0)), gb = new Array(G4).fill(0), gWd = new Array(H).fill(0); let gbd = 0;
        for (const ii of batch) { const f = forward(X[ii]); const dy = 2 * (f.out - y[ii]) / B; gbd += dy; let dh = Wd.map((w) => w * dy); f.h.forEach((v, j) => gWd[j] += v * dy); let dc = new Array(H).fill(0);
          for (let t = f.cache.length - 1; t >= 0; t--) { const C = f.cache[t]; const dz = new Array(G4); const dcp = new Array(H);
            for (let u = 0; u < H; u++) { const ac = act(C.c[u]); const dO = dh[u] * ac; const dC = dc[u] + dh[u] * C.og[u] * dact(ac, C.c[u]);
              dz[u] = dC * C.gg[u] * C.ig[u] * (1 - C.ig[u]); dz[H + u] = dC * C.cp[u] * C.fg[u] * (1 - C.fg[u]); dz[2 * H + u] = dC * C.ig[u] * dact(C.gg[u], C.z[2 * H + u]); dz[3 * H + u] = dO * C.og[u] * (1 - C.og[u]); dcp[u] = dC * C.fg[u]; }
            const dhp = new Array(H).fill(0);
            for (let k = 0; k < G4; k++) { gWx[k] += dz[k] * C.xt; gb[k] += dz[k]; for (let j = 0; j < H; j++) { gWh[j][k] += C.hp[j] * dz[k]; dhp[j] += Wh[j][k] * dz[k]; } }
            dh = dhp; dc = dcp; } }
        step++; const grads = [gWx, ...gWh, gb, gWd]; const b1 = 0.9, b2 = 0.999, eps = 1e-7, lrt = lr * Math.sqrt(1 - b2 ** step) / (1 - b1 ** step);
        grads.forEach((g, pi) => { const p = params[pi], m = mA[pi], v = vA[pi]; for (let k = 0; k < g.length; k++) { m[k] = b1 * m[k] + (1 - b1) * g[k]; v[k] = b2 * v[k] + (1 - b2) * g[k] * g[k]; p[k] -= lrt * m[k] / (Math.sqrt(v[k]) + eps); } });
        const mb = (mA.bd = b1 * (mA.bd || 0) + (1 - b1) * gbd), vb = (vA.bd = b2 * (vA.bd || 0) + (1 - b2) * gbd * gbd); bd -= lrt * mb / (Math.sqrt(vb) + eps);
      } }
    return { predict: (Xn) => Xn.map((x) => forward(x).out) };
  }

  function runForecasts(weekly, opt = {}) {
    const y = weekly.map((w) => w[1]); const N = y.length, split = Math.floor(N * (opt.trainShare || 0.8)), k = opt.lags || 4;
    const actual = y.slice(split); const out = { split, N, actual, dates: weekly.slice(split).map((w) => w[0]), preds: {}, time: {} };
    const prog = opt.onProgress || (() => {});
    const tm = (name, f) => { prog(name); const t0 = Date.now(); out.preds[name] = f(); out.time[name] = (Date.now() - t0) / 1000; };
    tm('Naive', () => naiveForecast(y, split));
    if (opt.arima !== false) tm('ARIMA', () => arimaRolling(y, split, 2, 2));
    tm('ES', () => holtRolling(y, split));
    const { X, Y } = makeLags(y, k); const si = split - k;
    tm('XGBoost', () => gbtFit(X.slice(0, si), Y.slice(0, si), opt.xgb).predict(X.slice(si)));
    if (opt.lstm !== false) { const lo = Math.min(...y.slice(0, split)), hi = Math.max(...y.slice(0, split)); const sc = (v) => (v - lo) / (hi - lo);
      const L = makeLags(y.map(sc), k); const seeds = opt.seeds || [1, 2, 3, 4, 5]; const runs = [];
      const t0 = Date.now(); for (const s of seeds) { prog('LSTM seed ' + s + ' of ' + seeds.length); runs.push(lstmFit(L.X.slice(0, si), L.Y.slice(0, si), { seed: s, epochs: opt.epochs || 100 }).predict(L.X.slice(si)).map((v) => v * (hi - lo) + lo)); }
      out.time.LSTM = (Date.now() - t0) / 1000; out.lstmRuns = runs; out.preds.LSTM = actual.map((_, i) => mean(runs.map((r) => r[i]))); }
    out.metrics = {}; for (const m in out.preds) out.metrics[m] = metrics(actual, out.preds[m]);
    if (out.lstmRuns) { const mp = out.lstmRuns.map((r) => metrics(actual, r).mape); out.lstmSeedMape = { mean: mean(mp), sd: sd(mp), min: Math.min(...mp), max: Math.max(...mp) }; }
    return out;
  }

  // Diebold-Mariano test, horizon 1, with the Harvey-Leybourne-Newbold small-sample correction
  function dieboldMariano(actual, p1, p2, loss = 'sq') {
    const L = loss === 'sq' ? (e) => e * e : Math.abs; const d = actual.map((a, i) => L(a - p1[i]) - L(a - p2[i])); const n = d.length;
    if (!(sd(d, 0) > 1e-12)) return { stat: 0, p: 1, meanDiff: mean(d) }; const dm = mean(d) / Math.sqrt(sd(d, 0) ** 2 / n); const stat = dm * Math.sqrt((n - 1) / n); return { stat, p: tTwoSided(stat, n - 1), meanDiff: mean(d) };
  }

  // ---------- Step 5-7: cost models ----------
  const BASE = { holdingRate: 0.20, orderingCost: 15, weeksPerYear: 52, nWeeks: 144, priceFloor: 1, kmPerDegree: 111, baseMode: 'Standard Class',
    modes: { 'Standard Class': { fixed: 2.0, perKm: 0.015 }, 'Second Class': { fixed: 3.5, perKm: 0.03 }, 'First Class': { fixed: 6.0, perKm: 0.06 }, 'Same Day': { fixed: 12.0, perKm: 0.15 } } };
  const eoq = (D, S, H) => Math.sqrt(2 * D * S / H);

  function costPair(p, P, variant = 'thesis') {
    const D = p.units / P.nWeeks * P.weeksPerYear, H = P.holdingRate * Math.max(p.price, P.priceFloor), S = P.orderingCost, dist = p.dist;
    const rate = (m) => P.modes[m].perKm * (P.rateMult || 1);
    const m0 = P.baseMode; const Q = eoq(D, S, H); const sepInv = (D / Q) * S + (Q / 2) * H; const sepTr = (D / Q) * (P.modes[m0].fixed + dist * rate(m0));
    let best = null;
    for (const m in P.modes) { const fx = P.modes[m].fixed; const Kj = variant === 'trueJoint' ? S + fx + dist * rate(m) : S + fx; const Qj = eoq(D, Kj, H);
      const inv = (D / Qj) * S + (Qj / 2) * H, tr = (D / Qj) * (fx + dist * rate(m)); if (!best || inv + tr < best.total) best = { total: inv + tr, inv, tr, mode: m, Q: Qj }; }
    return { D, H, Q, sepInv, sepTr, sep: sepInv + sepTr, jInv: best.inv, jTr: best.tr, joint: best.total, mode: best.mode, Qj: best.Q, saving: 100 * (sepInv + sepTr - best.total) / (sepInv + sepTr) };
  }
  function runCost(pairs, params = {}, variant = 'thesis') {
    const P = Object.assign({}, BASE, params, { modes: params.modes || BASE.modes });
    const rows = pairs.map((r) => ({ pid: r[0], name: r[1], region: r[2], units: r[3], price: r[4], dist: r[5] })).filter((p) => p.units > 0).map((p) => Object.assign(p, costPair(p, P, variant)));
    const S = (k) => sum(rows.map((r) => r[k]));
    const tot = { sep: S('sep'), joint: S('joint'), sepInv: S('sepInv'), sepTr: S('sepTr'), jInv: S('jInv'), jTr: S('jTr') };
    tot.savings = tot.sep - tot.joint; tot.savingsPct = 100 * tot.savings / tot.sep;
    const modeCount = {}; rows.forEach((r) => modeCount[r.mode] = (modeCount[r.mode] || 0) + 1);
    const sv = rows.map((r) => r.saving), Ds = rows.map((r) => r.D);
    return { rows, tot, modeCount, n: rows.length, avgQ: mean(rows.map((r) => r.Q)), avgQj: mean(rows.map((r) => r.Qj)),
      pairSaving: { median: median(sv), min: Math.min(...sv), max: Math.max(...sv), anyShare: 100 * sv.filter((v) => v > 1e-9).length / sv.length },
      demand: { median: median(Ds), mean: mean(Ds), max: Math.max(...Ds) } };
  }
  // closed form: saving per pair depends only on S, F and distance (EOQ cost-penalty identity)
  function closedFormSaving(S, F, dr) { const K = S + F + dr; const x = Math.sqrt(S / K), xj = Math.sqrt((S + F) / K); return 1 - (0.5 * (xj + 1 / xj)) / (0.5 * (x + 1 / x)); }

  function sensitivity(pairs, grids = {}) {
    const g = Object.assign({ holdingRate: [0.10, 0.15, 0.20, 0.25, 0.30], orderingCost: [5, 10, 15, 20, 25, 30], rateMult: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] }, grids);
    const out = {}; for (const k in g) out[k] = g[k].map((v) => ({ value: v, savings: runCost(pairs, { [k]: v }).tot.savingsPct })); return out;
  }

  // Demand-variability groups: CV of weekly demand per product (zeros included), terciles by rank (pandas qcut on rank 'first')
  function variabilityGroups(pairs, productWeek, base) {
    const ids = Object.keys(productWeek).map(Number).sort((a, b) => a - b);
    const cv = ids.map((id) => { const v = productWeek[id]; const m = mean(v); const s = sd(v, 1); return m > 0 ? s / m : 0; });
    const ord = ids.map((_, i) => i).sort((a, b) => cv[a] - cv[b] || a - b); const rank = new Array(ids.length); ord.forEach((i, r) => rank[i] = r + 1);
    const n = ids.length; const q1 = 1 + (n - 1) / 3, q2 = 1 + 2 * (n - 1) / 3; // qcut edges on ranks 1..n
    const grp = {}; ids.forEach((id, i) => grp[id] = rank[i] <= q1 ? 'Low' : rank[i] <= q2 ? 'Moderate' : 'High');
    const res = base || runCost(pairs); const out = {};
    for (const G of ['Low', 'Moderate', 'High']) { const rs = res.rows.filter((r) => grp[r.pid] === G); const s = sum(rs.map((r) => r.sep)), j = sum(rs.map((r) => r.joint));
      out[G] = { pairs: rs.length, products: ids.filter((id) => grp[id] === G).length, savings: 100 * (s - j) / s, meanDist: mean(rs.map((r) => r.dist)) }; }
    return out;
  }

  // ---------- Full pipeline ----------
  function runAll(data, opt = {}) {
    const fc = runForecasts(data.weekly, opt);
    const base = runCost(data.pairs);
    return { data, fc, base, trueJoint: runCost(data.pairs, {}, 'trueJoint'), sens: sensitivity(data.pairs), groups: variabilityGroups(data.pairs, data.product_week, base),
      dm: fc.preds.LSTM ? Object.fromEntries(['ARIMA', 'Naive', 'ES', 'XGBoost'].filter((k) => fc.preds[k]).map((k) => [k, dieboldMariano(fc.actual, fc.preds.LSTM, fc.preds[k])])) : null };
  }

  const API = { sum, mean, sd, median, rng, nelderMead, solve, tTwoSided, tQuantile, parseCSV, prepareFromCSV, weekStart, iso, metrics, naiveForecast, holtFit, holtRolling,
    arimaFit, arimaRolling, armaFilter, pacfToCoef, makeLags, gbtFit, lstmFit, runForecasts, dieboldMariano, BASE, eoq, costPair, runCost, closedFormSaving, sensitivity, variabilityGroups, runAll };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Engine = API;
})(typeof window !== 'undefined' ? window : globalThis);
