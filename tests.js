// Regeneration test cases: every number the thesis reports, the value the rerun produces, and the rule used to compare them.
// kind: exact (rounded the way the thesis rounds), tol (deterministic but optimizer-dependent), stoch (random seeds differ).
(function (root) {
  'use strict';
  const r2 = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10, r0 = (x) => Math.round(x);
  const T = [
    // Chapter IV, Section 4.2 and Abstract
    { id: 'D1', loc: 'Abstract; 4.2', label: 'Raw order lines', thesis: 180519, get: (R) => R.data.counts.raw, kind: 'exact' },
    { id: 'D2', loc: '3.4.1; 4.2', label: 'Order lines after cleaning', thesis: 170872, get: (R) => R.data.counts.clean, kind: 'exact' },
    { id: 'D3', loc: 'Abstract; 4.2', label: 'Order lines after Sept. 2017 cutoff', thesis: 162775, get: (R) => R.data.counts.cut, kind: 'exact' },
    { id: 'D4', loc: '3.4.1; 4.2', label: 'Orders after cutoff', thesis: 54246, get: (R) => R.data.counts.orders_cut, kind: 'exact' },
    { id: 'D5', loc: 'Abstract; 4.3', label: 'Weeks in analysis window', thesis: 144, get: (R) => R.data.weekly.length, kind: 'exact' },
    { id: 'D6', loc: '3.3.3; 4.3', label: 'Training weeks', thesis: 115, get: (R) => R.fc.split, kind: 'exact' },
    { id: 'D7', loc: 'Abstract; 4.5', label: 'Product-region combinations', thesis: 1443, get: (R) => R.base.n, kind: 'exact' },
    // Table 4.1
    ...[['2017-02', 4611], ['2017-03', 5071], ['2017-04', 4926], ['2017-05', 4994], ['2017-06', 4674], ['2017-07', 4984], ['2017-08', 5059], ['2017-09', 4880], ['2017-10', 2145], ['2017-11', 1934], ['2017-12', 2009], ['2018-01', 2009]]
      .map(([m, v], i) => ({ id: 'T41-' + (i + 1), loc: 'Table 4.1', label: 'Order lines, ' + m, thesis: v, get: (R) => (R.data.monthly_tail.find((x) => x[0] === m) || [0, NaN])[1], kind: 'exact' })),
    // Table 4.2
    ...[['Naive', 111.07, 142.03, 4.87], ['ARIMA', 107.43, 139.80, 4.75], ['ES', 112.17, 147.49, 4.98], ['XGBoost', 134.17, 170.98, 5.98], ['LSTM', 103.05, 137.23, 4.59]].flatMap(([m, mae, rmse, mape]) => {
      const kind = m === 'Naive' || m === 'XGBoost' ? 'exact' : m === 'LSTM' ? 'stoch' : 'tol';
      const tol = { mae: { ARIMA: 3, ES: 4, LSTM: 6 }[m], rmse: { ARIMA: 3, ES: 4, LSTM: 6 }[m], mape: { ARIMA: 0.1, ES: 0.15, LSTM: 0.25 }[m] };
      const note = { ARIMA: 'statsmodels stops at a lower-likelihood optimum in several windows; the rerun maximizes the likelihood', ES: 'statsmodels stops at a local SSE minimum in the window ending week 130; the thesis value also differs from a rerun of the student code (111.99 / 147.45 / 4.97)', LSTM: 'different random-number streams than TensorFlow; compare the seed spread (SD 0.05)' }[m];
      return [['mae', mae, 'MAE'], ['rmse', rmse, 'RMSE'], ['mape', mape, 'MAPE (%)']].map(([k, v, lab]) => ({ id: 'T42-' + m + '-' + k, loc: 'Table 4.2', label: m + ' ' + lab, thesis: v, get: (R) => R.fc.metrics[m] && r2(R.fc.metrics[m][k]), kind, tol: tol[k], note }));
    }),
    { id: 'F44-sd', loc: '4.4 text', label: 'LSTM seed MAPE SD (pp)', thesis: 0.05, get: (R) => R.fc.lstmSeedMape && r2(R.fc.lstmSeedMape.sd), kind: 'stoch', tol: 0.05 },
    // Section 4.5-4.7
    { id: 'C1', loc: '4.5', label: 'Median annual demand (units)', thesis: 11.6, get: (R) => r1(R.base.demand.median), kind: 'exact' },
    { id: 'C2', loc: '4.5', label: 'Mean annual demand (units)', thesis: 88.9, get: (R) => r1(R.base.demand.mean), kind: 'exact' },
    { id: 'C3', loc: '4.5', label: 'Maximum annual demand (units)', thesis: 4172, get: (R) => r0(R.base.demand.max), kind: 'exact' },
    { id: 'C4', loc: 'Abstract; 4.5; Table 4.3', label: 'Separate Total Cost ($)', thesis: 367684, get: (R) => r0(R.base.tot.sep), kind: 'exact' },
    { id: 'C5', loc: '4.6; Table 4.3', label: 'Consolidated Total Cost ($)', thesis: 355822, get: (R) => r0(R.base.tot.joint), kind: 'exact' },
    { id: 'C6', loc: 'Abstract; 4.7', label: 'Savings ($)', thesis: 11861, get: (R) => r0(R.base.tot.savings), kind: 'exact' },
    { id: 'C7', loc: 'Abstract; 4.7', label: 'Savings (%)', thesis: 3.23, get: (R) => r2(R.base.tot.savingsPct), kind: 'exact' },
    { id: 'C8', loc: '4.6', label: 'Average order quantity, separate', thesis: 9.9, get: (R) => r1(R.base.avgQ), kind: 'exact' },
    { id: 'C9', loc: '4.6', label: 'Average order quantity, joint', thesis: 10.6, get: (R) => r1(R.base.avgQj), kind: 'exact' },
    { id: 'C10', loc: '4.6', label: 'Pairs choosing Standard Class', thesis: 1443, get: (R) => R.base.modeCount['Standard Class'] || 0, kind: 'exact' },
    { id: 'C11', loc: '4.7', label: 'Median pair saving (%)', thesis: 3.21, get: (R) => r2(R.base.pairSaving.median), kind: 'exact' },
    { id: 'C12', loc: '4.7', label: 'Largest pair saving (%)', thesis: 4.41, get: (R) => r2(R.base.pairSaving.max), kind: 'exact' },
    // Table 4.3
    { id: 'T43-1', loc: 'Table 4.3', label: 'Inventory cost, conventional ($)', thesis: 166775, get: (R) => r0(R.base.tot.sepInv), kind: 'exact' },
    { id: 'T43-2', loc: 'Table 4.3', label: 'Inventory cost, joint ($)', thesis: 167101, get: (R) => r0(R.base.tot.jInv), kind: 'exact' },
    { id: 'T43-3', loc: 'Table 4.3', label: 'Transportation cost, conventional ($)', thesis: 200909, get: (R) => r0(R.base.tot.sepTr), kind: 'exact' },
    { id: 'T43-4', loc: 'Table 4.3', label: 'Transportation cost, joint ($)', thesis: 188721, get: (R) => r0(R.base.tot.jTr), kind: 'exact' },
    { id: 'T43-5', loc: 'Table 4.3', label: 'Inventory change ($)', thesis: 327, get: (R) => r0(R.base.tot.jInv - R.base.tot.sepInv), kind: 'exact' },
    { id: 'T43-6', loc: 'Table 4.3', label: 'Transportation change ($)', thesis: -12188, get: (R) => r0(R.base.tot.jTr - R.base.tot.sepTr), kind: 'exact' },
    { id: 'T43-7', loc: 'Table 4.3', label: 'Inventory share, conventional (%)', thesis: 45.4, get: (R) => r1(100 * R.base.tot.sepInv / R.base.tot.sep), kind: 'exact' },
    { id: 'T43-8', loc: 'Table 4.3', label: 'Inventory share, joint (%)', thesis: 47.0, get: (R) => r1(100 * R.base.tot.jInv / R.base.tot.joint), kind: 'exact' },
    // Table 4.4
    ...[0.10, 0.15, 0.20, 0.25, 0.30].map((h, i) => ({ id: 'T44-h' + (i + 1), loc: 'Table 4.4', label: 'Savings at holding rate ' + Math.round(h * 100) + '%', thesis: 3.23, get: (R) => r2(R.sens.holdingRate[i].savings), kind: 'exact' })),
    ...[[5, 11.82], [10, 5.46], [15, 3.23], [20, 2.15], [25, 1.54], [30, 1.16]].map(([s, v], i) => ({ id: 'T44-s' + s, loc: 'Table 4.4', label: 'Savings at ordering cost $' + s, thesis: v, get: (R) => r2(R.sens.orderingCost[i].savings), kind: 'exact' })),
    ...[[0.5, 2.24], [0.75, 2.81], [1.0, 3.23], [1.25, 3.55], [1.5, 3.81], [2.0, 4.19]].map(([m, v], i) => ({ id: 'T44-m' + m, loc: 'Table 4.4', label: 'Savings at shipping-rate ×' + m, thesis: v, get: (R) => r2(R.sens.rateMult[i].savings), kind: 'exact' })),
    // Section 4.10 / Figure 4.6
    ...[['Low', 742, 3.25], ['Moderate', 540, 3.17], ['High', 161, 3.13]].flatMap(([g, n, v]) => [
      { id: 'F46-' + g + '-n', loc: '4.10; Fig. 4.6', label: g + ' variability: combinations', thesis: n, get: (R) => R.groups[g].pairs, kind: 'exact', note: 'Appendix A.11 code gives 765 / 523 / 155; the thesis counts cannot be produced from the published code' },
      { id: 'F46-' + g + '-s', loc: '4.10; Fig. 4.6', label: g + ' variability: savings (%)', thesis: v, get: (R) => r2(R.groups[g].savings), kind: 'exact', note: 'follows from the different group membership above' }]),
  ];
  // Internal consistency checks that do not depend on the thesis text
  const C = [
    { id: 'K1', label: 'Separate total = inventory + transportation', get: (R) => Math.abs(R.base.tot.sep - R.base.tot.sepInv - R.base.tot.sepTr) < 1e-6 },
    { id: 'K2', label: 'Joint total = inventory + transportation', get: (R) => Math.abs(R.base.tot.joint - R.base.tot.jInv - R.base.tot.jTr) < 1e-6 },
    { id: 'K3', label: 'Joint cost never exceeds separate cost (every pair)', get: (R) => R.base.rows.every((r) => r.joint <= r.sep + 1e-9) },
    { id: 'K4', label: 'Per-pair saving equals the EOQ closed form (max error < 1e-9 pp)', get: (R, E) => Math.max(...R.base.rows.map((r) => Math.abs(r.saving - 100 * E.closedFormSaving(15, 2, r.dist * 0.015)))) < 1e-9 },
    { id: 'K5', label: 'Savings % is invariant to the holding rate (identity)', get: (R) => R.sens.holdingRate.every((s) => Math.abs(s.savings - R.base.tot.savingsPct) < 1e-9) },
    { id: 'K6', label: 'True joint EOQ costs no more than the thesis joint model', get: (R) => R.trueJoint.tot.joint <= R.base.tot.joint + 1e-6 },
    { id: 'K7', label: 'Variability groups cover every combination once', get: (R) => R.groups.Low.pairs + R.groups.Moderate.pairs + R.groups.High.pairs === R.base.n },
    { id: 'K8', label: 'Weekly series sums to units in window', get: (R) => Math.abs(R.data.weekly.reduce((s, w) => s + w[1], 0) - R.data.pairs.reduce((s, p) => s + p[3], 0)) < 1e-6 },
    { id: 'K9', label: 'EOQ minimizes (D/Q)S + (Q/2)H on a grid (pair 1)', get: (R, E) => { const p = R.base.rows[0]; const f = (Q) => p.D / Q * 15 + Q / 2 * p.H; return [0.5, 0.9, 1.1, 2].every((k) => f(p.Q * k) >= f(p.Q)); } },
  ];
  function evaluate(R, E) {
    const rows = T.map((t) => { let v; try { v = t.get(R); } catch (e) { v = NaN; }
      const d = typeof v === 'number' ? v - t.thesis : NaN; const eq = Math.abs(d) < 1e-9;
      let status; if (v == null || Number.isNaN(v)) status = 'skipped'; else if (eq) status = 'match'; else if (t.kind !== 'exact' && Math.abs(d) <= t.tol) status = 'within'; else status = 'differs';
      return Object.assign({}, t, { value: v, diff: d, status }); });
    const checks = C.map((c) => { let ok = false; try { ok = !!c.get(R, E); } catch (e) { ok = false; } return Object.assign({}, c, { ok }); });
    const count = (s) => rows.filter((r) => r.status === s).length;
    return { rows, checks, summary: { total: rows.length, match: count('match'), within: count('within'), differs: count('differs'), skipped: count('skipped'), checksPassed: checks.filter((c) => c.ok).length, checks: checks.length } };
  }
  const API = { TESTS: T, CHECKS: C, evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Tests = API;
})(typeof window !== 'undefined' ? window : globalThis);
