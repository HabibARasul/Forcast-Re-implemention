// Validation suite for the Forecast-to-Cost Lab. Categories: exact (closed form), bound (statistical or inequality),
// published (value printed in a source), approx (known approximation; a gap is reported, not failed), conservation (laws checked on every example).
(function (root) {
  'use strict';
  const E = root.Engine || require('./engine.js'), L = root.Lab || require('./ext-engine.js'), X = root.Examples || require('./examples.js');
  const ex = (id) => X.EXAMPLES.find((e) => e.id === id).tables;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const CASES = [
    { id: 'X1', cat: 'exact', name: 'Harris EOQ: Q* = 200, cost $100', src: 'Harris (1913)', run() { const r = L.runModel(ex('eoq'), { forecast: false }); const c = r.cost.rows[0].full_joint; return { ok: near(c.Q, 200, 1e-9) && near(c.total, 100, 1e-9), got: `Q = ${c.Q.toFixed(6)}, cost = ${c.total.toFixed(6)}`, want: 'Q = 200, cost = 100' }; } },
    { id: 'X2', cat: 'exact', name: 'EOQ cost penalty (x + 1/x)/2 at x = 1/2', src: 'Hax and Candea (1984)', run() { const r = L.runModel(ex('penalty'), { forecast: false }); const s = r.cost.rows[0]; const ratio = s.separate.total / s.full_joint.total;
      return { ok: near(ratio, 1.25, 1e-12) && near(s.separate.total, 250, 1e-9) && near(s.full_joint.total, 200, 1e-9), got: `ratio ${ratio.toFixed(12)}, ${s.separate.total} vs ${s.full_joint.total}`, want: 'ratio 1.25, 250 vs 200' }; } },
    { id: 'X3', cat: 'published', name: 'Thesis totals: $367,684 separate, $355,822 joint, 3.23%', src: 'Thesis Table 4.3', run() { const r = L.runModel(ex('thesis'), { forecast: false }); const t = r.cost.tot;
      return { ok: Math.round(t.separate.total) === 367684 && Math.round(t.thesis_joint.total) === 355822 && r.cost.savings.thesis_joint.toFixed(2) === '3.23', got: `${Math.round(t.separate.total)} / ${Math.round(t.thesis_joint.total)} / ${r.cost.savings.thesis_joint.toFixed(2)}%`, want: '367684 / 355822 / 3.23%' }; } },
    { id: 'X4', cat: 'exact', name: 'Full joint optimum equals the closed form K = S + F + d·r (all 1,443 pairs)', src: 'EOQ identity', run() { const r = L.runModel(ex('thesis'), { forecast: false }); let mx = 0;
      r.cost.rows.forEach((row) => { const H = 0.2 * Math.max(row.price, 1); const K = 15 + 2 + row.dist * 0.015; mx = Math.max(mx, Math.abs(row.full_joint.total - Math.sqrt(2 * row.D * K * H))); });
      return { ok: mx < 1e-8, got: `max |error| $${mx.toExponential(2)}; saving ${r.cost.savings.full_joint.toFixed(2)}%`, want: 'error < 1e-8; saving 16.38%' }; } },
    { id: 'X5', cat: 'exact', name: 'Truckload piecewise optimum equals a 0.01-unit grid search', src: 'Piecewise EOQ', run() { const r = L.runModel(ex('truckload'), { forecast: false }); const set = r.model.settings; let worst = 0;
      r.cost.rows.forEach((row) => { const it = r.model.items.find((i) => i.item === row.item); const inp = L.itemInputs(r.model, it, null); let best = Infinity;
        for (const m of r.model.modes) for (let q = 1; q <= 6000; q += 0.01) best = Math.min(best, L.costAt(inp, m, q, set, 0).total); worst = Math.max(worst, row.full_joint.total - best); });
      return { ok: worst <= 1e-6, got: `optimizer − grid = ${worst.toExponential(2)}`, want: '≤ 0 (optimizer no worse than grid)' }; } },
    { id: 'X6', cat: 'exact', name: 'Baumol–Vinod: mode and cost equal an exhaustive search', src: 'Baumol and Vinod (1970)', run() { const r = L.runModel(ex('baumol'), { forecast: false }); const set = r.model.settings; let ok = true, txt = [];
      r.cost.rows.forEach((row) => { const it = r.model.items.find((i) => i.item === row.item); const inp = L.itemInputs(r.model, it, null); let best = { total: Infinity };
        for (const m of r.model.modes) for (let q = 1; q <= 20000; q += 0.5) { const c = L.costAt(inp, m, q, set, row.dist); if (c.total < best.total) best = c; }
        ok = ok && best.mode === row.full_joint.mode && row.full_joint.total <= best.total + 1e-6; txt.push(`${row.item}: ${row.full_joint.mode} $${row.full_joint.total.toFixed(2)} (search ${best.mode} $${best.total.toFixed(2)})`); });
      return { ok, got: txt.join('; '), want: 'same mode, cost ≤ search' }; } },
    { id: 'X7', cat: 'exact', name: 'Inverse normal: z(0.95) = 1.644854, z(0.99) = 2.326348', src: 'Abramowitz and Stegun (1964)', run() { const a = L.normInv(0.95), b = L.normInv(0.99), c = L.normInv(0.5);
      return { ok: near(a, 1.6448536269514722, 5e-9) && near(b, 2.3263478740408408, 5e-9) && near(c, 0, 1e-12), got: `${a.toFixed(9)}, ${b.toFixed(9)}`, want: '1.644853627, 2.326347874' }; } },
    { id: 'X8', cat: 'exact', name: 'Kalman ARMA(1,1) likelihood equals the dense Gaussian likelihood', src: 'Harvey (1989)', run() {
      const R = E.rng(5); const z = Array.from({ length: 12 }, () => R.normal()); const phi = 0.6, th = -0.3; const n = z.length;
      const g0 = (1 + 2 * phi * th + th * th) / (1 - phi * phi), g1 = (1 + phi * th) * (phi + th) / (1 - phi * phi); const G = (k) => k === 0 ? g0 : g1 * Math.pow(phi, k - 1);
      const S = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => G(Math.abs(i - j))));
      // Cholesky
      const Lc = S.map((r) => r.map(() => 0)); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = S[i][j]; for (let k = 0; k < j; k++) s -= Lc[i][k] * Lc[j][k]; Lc[i][j] = i === j ? Math.sqrt(s) : s / Lc[j][j]; }
      const y = []; for (let i = 0; i < n; i++) { let s = z[i]; for (let k = 0; k < i; k++) s -= Lc[i][k] * y[k]; y.push(s / Lc[i][i]); }
      const q = y.reduce((a, b) => a + b * b, 0), logdet = 2 * Lc.reduce((a, r, i) => a + Math.log(r[i]), 0); const s2 = q / n;
      const dense = 0.5 * (n * Math.log(2 * Math.PI * s2) + logdet + n); const kal = E.armaFilter(z, [phi], [th]).nll;
      return { ok: near(dense, kal, 1e-9), got: `Kalman ${kal.toFixed(10)} vs dense ${dense.toFixed(10)}`, want: 'equal to 1e-9' }; } },
    { id: 'X9', cat: 'exact', name: 'ARIMA(0,1,0) and SES with α = 1 reproduce the naive forecast', src: 'Hyndman and Athanasopoulos (2021)', run() { const y = [5, 7, 6, 9, 12, 10, 11]; const a = L.arimaAny(y, 0, 1, 0).forecast;
      let l = y[0]; for (const v of y) l = 1 * v + 0 * l; return { ok: a === 11 && l === 11, got: `${a}, ${l}`, want: '11, 11' }; } },
    { id: 'X10', cat: 'exact', name: 'Holt on an exact line forecasts the next point', src: 'Holt (1957)', run() { const y = Array.from({ length: 30 }, (_, t) => 100 + 2 * t); const f = E.holtFit(y).forecast; return { ok: near(f, 160, 1e-6), got: f.toFixed(8), want: '160' }; } },
    { id: 'X11', cat: 'exact', name: 'Seasonal naive on a pure seasonal series has zero error', src: 'Definition', run() { const y = Array.from({ length: 60 }, (_, t) => 100 + 30 * Math.sin(2 * Math.PI * t / 12)); const set = { season: 12, train_share: 0.8, lags: 4, refit_every: 1 };
      const r = L.evaluateSeries(y, set, ['SNaive']); return { ok: r.metrics.SNaive.mae < 1e-9, got: 'MAE ' + r.metrics.SNaive.mae.toExponential(2), want: '0' }; } },
    { id: 'X12', cat: 'exact', name: 'Croston on a regular pattern returns size ÷ interval', src: 'Croston (1972)', run() { const y = []; for (let i = 0; i < 40; i++) y.push(i % 4 === 3 ? 8 : 0); const f = L.crostonFit(y, 0.1); return { ok: near(f, 2, 1e-12), got: String(f), want: '2' }; } },
    { id: 'X13', cat: 'exact', name: 'One boosted stump learns a step function exactly', src: 'Chen and Guestrin (2016)', run() { const X = [[1], [2], [3], [4], [5], [6]], y = [0, 0, 0, 10, 10, 10]; const m = E.gbtFit(X, y, { n_estimators: 1, max_depth: 1, learning_rate: 1, lambda: 0 });
      const p = m.predict([[2.5], [4.5]]); return { ok: near(p[0], 0, 1e-12) && near(p[1], 10, 1e-12), got: p.join(', '), want: '0, 10' }; } },
    { id: 'X14', cat: 'exact', name: 'MASE on a toy series', src: 'Hyndman and Koehler (2006)', run() { const y = [10, 12, 11, 13, 12, 14, 13, 15, 14, 16]; const r = L.evaluateSeries(y, { train_share: 0.8, lags: 2, refit_every: 1, season: 2 }, ['Naive']);
      // in-sample naive MAE over y[0..7] = (2+1+2+1+2+1+2)/7 = 11/7; test errors |14-15| = 1, |16-14| = 2 -> MAE 1.5
      return { ok: near(r.metrics.Naive.mase, 1.5 / (11 / 7), 1e-12), got: r.metrics.Naive.mase.toFixed(12), want: (1.5 / (11 / 7)).toFixed(12) }; } },
    { id: 'X15', cat: 'exact', name: 'Constant demand: fill 100%, average stock SS + (Q − d)/2, pipeline = d·L', src: 'Little (1961); sawtooth', run() {
      const r = L.runModel(ex('const'), { forecast: false }); const row = r.cost.rows[0]; row.full_joint.Q = 1000; const it = r.model.items[0]; const s = L.simulateItem(row, it, r.model, 'full_joint', { seed: 1, weeks: 1040 });
      // d = 50, Q = 1000 = 20d, L = 2 weeks; end-of-week stock cycles SS..SS+Q-d -> mean (Q-d)/2 = 475
      return { ok: s.fill === 1 && near(s.avgOnHand, 475, 1e-9) && near(s.avgPipe, 100, 1e-9), got: `fill ${s.fill}, avg stock ${s.avgOnHand}, avg pipeline ${s.avgPipe}`, want: 'fill 1, avg stock 475, avg pipeline 100' }; } },
    { id: 'B1', cat: 'bound', name: 'AR(1) φ recovered within ±0.06 (n = 2,000)', src: 'Box et al. (2015)', run() { const y = L.genSeries({ model: 'ar1', n: 2000, a: 0, b: 0.7, c: 1 }, 11); const r = L.arimaAny(y, 1, 0, 0); return { ok: Math.abs(r.phi[0] - 0.7) < 0.06, got: 'φ̂ = ' + r.phi[0].toFixed(4), want: '0.64–0.76' }; } },
    { id: 'B2', cat: 'bound', name: 'Diebold–Mariano size near 5% under the null (600 replications)', src: 'Harvey, Leybourne and Newbold (1997)', run() { const R = E.rng(3); let rej = 0; const n = 60, reps = 600;
      for (let k = 0; k < reps; k++) { const a = Array(n).fill(0), p1 = Array.from({ length: n }, () => R.normal()), p2 = Array.from({ length: n }, () => R.normal()); if (E.dieboldMariano(a, p1, p2).p < 0.05) rej++; }
      const rate = rej / reps; return { ok: rate > 0.025 && rate < 0.08, got: (100 * rate).toFixed(1) + '%', want: '2.5%–8%' }; } },
    { id: 'B3', cat: 'bound', name: 'Random walk: Naive RMSE within 20% of the step SD', src: 'Theory', run() { const r = L.runModel(ex('rw'), { forecast: true }); const m = r.fc.res.RW.metrics.Naive.rmse; return { ok: m > 16 && m < 24, got: m.toFixed(2), want: '16–24' }; } },
    { id: 'B4', cat: 'bound', name: 'Full joint cost ≤ thesis joint ≤ separate is not guaranteed; full joint ≤ both is', src: 'Optimality', run() { let ok = true; for (const e of X.EXAMPLES) { const r = L.runModel(e.tables, { forecast: false }); if (!r.cost) continue; r.cost.rows.forEach((row) => { if (row.full_joint.total > row.separate.total + 1e-6 || row.full_joint.total > row.thesis_joint.total + 1e-6) ok = false; }); }
      return { ok, got: ok ? 'holds for every item in every example' : 'violated', want: 'full ≤ separate and full ≤ thesis joint' }; } },
    { id: 'A1', cat: 'approx', name: 'Simulated fill rate versus 95% cycle service target (Gulf Coast, 20 reps)', src: 'Normal approximation', run() { const r = L.runModel(ex('gulf'), { forecast: false, simulate: true, sim: { reps: 20, policies: ['full_joint'] } }); const f = r.sim.summary.full_joint.fill;
      return { ok: true, gap: true, got: `fill ${(100 * f.mean).toFixed(2)}% ± ${(100 * f.half).toFixed(2)}`, want: 'cycle service 99% is a different measure; fill rate is usually higher than CSL for continuous demand, lower for lumpy demand' }; } },
    { id: 'A2', cat: 'approx', name: 'AR(1) example: ARIMA(1,0,0) RMSE versus innovation SD 10', src: 'Theory', run() { const r = L.runModel(ex('ar1'), { forecast: true }); const m = r.fc.res.AR.metrics['ARIMA(1,0,0)'].rmse; return { ok: true, gap: true, got: m.toFixed(2), want: '≈10 (60 test weeks, sampling error ±1)' }; } },
  ];
  // conservation laws applied to every example
  function conservation(e, r) {
    const out = []; const add = (name, ok, got) => out.push({ id: 'C:' + e.id + ':' + out.length, cat: 'conservation', name: `${e.title}: ${name}`, ok, got });
    const c = r.cost; const P = L.POLICIES;
    add('cost components sum to total (all policies)', c.rows.every((row) => P.every((p) => { const x = row[p]; return Math.abs(x.ordering + x.fixedShip + x.distanceShip + x.unitFreight + x.cycle + x.safety + x.pipeline - x.total) < 1e-6 * Math.max(1, x.total); })), 'checked ' + c.rows.length + ' items');
    add('mode counts sum to item count', P.every((p) => Object.values(c.tot[p].modes).reduce((a, b) => a + b, 0) === c.n), `${c.n} items`);
    add('orders per year × Q = annual demand', c.rows.every((row) => P.every((p) => { const x = row[p]; return Math.abs(x.ordering / (r.model.items.find((i) => i.item === row.item).ordering_cost ?? r.model.settings.ordering_cost) * x.Q - row.D) < 1e-6 * Math.max(1, row.D) || x.ordering === 0; })), 'flow balance');
    add('vehicles carry every unit (trucks × capacity ≥ Q)', c.rows.every((row) => P.every((p) => { const m = r.model.modes.find((mm) => mm.mode === row[p].mode); return !(m.capacity > 0) || row[p].trucks * m.capacity >= row[p].Q - 1e-9; })), 'capacity');
    if (r.sim) add('inventory balance and pipeline balance in simulation', P.every((p) => !r.sim.summary[p] || (r.sim.summary[p].balance < 1e-6 && r.sim.summary[p].pipe < 1e-6)), 'start + received − demand = end; ordered = received + in transit');
    return out;
  }
  function runSuite(opt = {}) { const results = [];
    for (const c of CASES) { const t0 = Date.now(); let r; try { r = c.run(); } catch (err) { r = { ok: false, got: 'error: ' + err.message }; } results.push(Object.assign({ id: c.id, cat: c.cat, name: c.name, src: c.src, ms: Date.now() - t0 }, r)); opt.onProgress && opt.onProgress(c.id); }
    for (const e of X.EXAMPLES) { if (opt.skipHeavy && ['fc2cost', 'rq4', 'grocery'].includes(e.id)) continue; const r = L.runModel(e.tables, { forecast: false, simulate: true, sim: { reps: 2 } }); if (!r.cost) { results.push({ id: 'C:' + e.id, cat: 'conservation', name: e.title + ': compiles', ok: false, got: r.compile.errors.map((x) => x.msg).join('; ') }); continue; }
      conservation(e, r).forEach((x) => results.push(x)); opt.onProgress && opt.onProgress(e.id); }
    const by = (cat) => results.filter((r) => r.cat === cat); return { results, summary: { exact: by('exact'), bound: by('bound'), published: by('published'), approx: by('approx'), conservation: by('conservation') }, failed: results.filter((r) => !r.ok) };
  }
  const API = { CASES, runSuite, conservation };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Suite = API;
})(typeof window !== 'undefined' ? window : globalThis);
