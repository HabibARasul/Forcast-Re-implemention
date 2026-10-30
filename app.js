(function () {
  'use strict';
  const E = window.Engine, TS = window.Tests;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f0 = (x) => Math.round(x).toLocaleString('en-US'), f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);
  const usd = (x) => (x < 0 ? '−$' : '$') + f0(Math.abs(x));
  const ls = { get(k, d) { try { const v = localStorage.getItem('dcr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('dcr.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } } };

  // ---------- state ----------
  const S = {
    step: ls.get('step', 0), data: window.DATACO, source: 'Embedded aggregates of the public DataCo file (built by Appendix A.3–A.8)',
    fc: null, base: null, trueJoint: null, sens: null, groups: null, tests: null, busy: false, progress: '',
    params: { holdingRate: 0.20, orderingCost: 15, nWeeks: 144, weeksPerYear: 52, modes: JSON.parse(JSON.stringify(E.BASE.modes)) },
    variant: 'thesis', fcOpt: { trainShare: 0.8, lags: 4, seeds: [1, 2, 3, 4, 5], epochs: 100, arima: true, lstm: true },
    grids: { holdingRate: [0.10, 0.15, 0.20, 0.25, 0.30], orderingCost: [5, 10, 15, 20, 25, 30], rateMult: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] },
    filter: 'all', pairQuery: '', status: {},
  };
  const THESIS_42 = { Naive: [111.07, 142.03, 4.87], ARIMA: [107.43, 139.80, 4.75], ES: [112.17, 147.49, 4.98], XGBoost: [134.17, 170.98, 5.98], LSTM: [103.05, 137.23, 4.59] };
  const METHOD_LABEL = { Naive: 'Naive (last week)', ARIMA: 'ARIMA(2,1,2)', ES: 'Exponential Smoothing', XGBoost: 'XGBoost', LSTM: 'LSTM (mean of seeds)' };
  const METHOD_TYPE = { Naive: 'Benchmark', ARIMA: 'Traditional', ES: 'Traditional', XGBoost: 'AI', LSTM: 'AI' };
  const COLOR = { Actual: 'var(--ink)', Naive: 'var(--muted)', ARIMA: 'var(--c4)', ES: 'var(--ok)', XGBoost: 'var(--joint)', LSTM: 'var(--c5)' };

  // ---------- charts (SVG, drawn to one scale per axis) ----------
  function ticks(lo, hi, n = 5) { const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)); const st = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(10)); return out; }
  const tickFmt = (v) => Math.abs(v) >= 1000 ? (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k') : String(+v.toFixed(2));
  function frame(w, h, m, yLo, yHi, yLabel, title) {
    const yt = ticks(yLo, yHi); const lo = Math.min(yLo, yt[0]), hi = Math.max(yHi, yt[yt.length - 1]);
    const Y = (v) => m.t + (h - m.t - m.b) * (1 - (v - lo) / (hi - lo));
    let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title || yLabel || 'chart')}">`;
    if (title) s += `<text class="ttl" x="${m.l}" y="14">${esc(title)}</text>`;
    yt.forEach((v) => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line)" stroke-width="1"/><text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${tickFmt(v)}</text>`; });
    if (yLabel) s += `<text transform="translate(12 ${(m.t + h - m.b) / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
    return { s, Y, lo, hi };
  }
  function lineChart(o) {
    const w = o.w || 760, h = o.h || 300, m = { l: 62, r: 16, t: o.title ? 26 : 12, b: 44 }; const all = o.series.flatMap((s) => s.values.filter((v) => v != null));
    let yLo = o.yMin != null ? o.yMin : Math.min(...all), yHi = Math.max(...all); const pad = (yHi - yLo) * 0.06; if (o.yMin == null) yLo -= pad; yHi += pad;
    const F = frame(w, h, m, yLo, yHi, o.yLabel, o.title); const n = o.x.length; const X = (i) => m.l + (w - m.l - m.r) * (n === 1 ? 0.5 : i / (n - 1)); let s = F.s;
    const every = o.xEvery || Math.ceil(n / 8); for (let i = 0; i < n; i += every) s += `<text x="${X(i)}" y="${h - m.b + 16}" text-anchor="middle">${esc(o.x[i])}</text>`;
    if (o.vline) { const x = X(o.vline.i); s += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${h - m.b}" style="stroke:var(--bad)" stroke-dasharray="4 3"/><text x="${x + 4}" y="${m.t + 12}" style="fill:var(--bad)">${esc(o.vline.label)}</text>`; }
    if (o.band) { const x1 = X(o.band.i0), x2 = X(o.band.i1); s += `<rect x="${x1}" y="${m.t}" width="${x2 - x1}" height="${h - m.t - m.b}" style="fill:var(--sunk)" opacity="0.8"/><text x="${x1 + 4}" y="${h - m.b - 6}">${esc(o.band.label)}</text>`; }
    for (const se of o.series) { const pts = se.values.map((v, i) => v == null ? null : `${X(i).toFixed(1)},${F.Y(v).toFixed(1)}`).filter(Boolean).join(' ');
      s += `<polyline points="${pts}" fill="none" style="stroke:${se.color}" stroke-width="${se.width || 1.8}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round"><title>${esc(se.name)}</title></polyline>`;
      if (se.dots) se.values.forEach((v, i) => { if (v != null) s += `<circle cx="${X(i)}" cy="${F.Y(v)}" r="3.2" style="fill:${se.color}"><title>${esc(se.name)}: ${esc(o.x[i])} → ${tickFmt(v)}</title></circle>`; }); }
    if (o.xLabel) s += `<text x="${(m.l + w - m.r) / 2}" y="${h - 6}" text-anchor="middle">${esc(o.xLabel)}</text>`;
    return wrapChart(s + '</svg>', o.series);
  }
  function barChart(o) {
    const w = o.w || 760, h = o.h || 300, m = { l: 66, r: 16, t: o.title ? 26 : 12, b: 48 }; const cats = o.cats, ser = o.series;
    const tot = cats.map((_, i) => o.stacked ? ser.reduce((a, s) => a + s.values[i], 0) : Math.max(...ser.map((s) => s.values[i])));
    const F = frame(w, h, m, 0, Math.max(...tot) * 1.08, o.yLabel, o.title); let s = F.s; const bw = (w - m.l - m.r) / cats.length;
    cats.forEach((c, i) => { const x0 = m.l + i * bw; s += `<text x="${x0 + bw / 2}" y="${h - m.b + 16}" text-anchor="middle">${esc(c)}</text>`;
      if (o.stacked) { let acc = 0; const bx = x0 + bw * 0.25, ww = bw * 0.5; ser.forEach((se) => { const v = se.values[i]; const y1 = F.Y(acc + v), y0 = F.Y(acc);
        s += `<rect x="${bx}" y="${y1}" width="${ww}" height="${y0 - y1}" style="fill:${se.color}"><title>${esc(se.name)}, ${esc(c)}: ${o.fmt ? o.fmt(v) : tickFmt(v)}</title></rect>`;
        if (y0 - y1 > 16) s += `<text x="${bx + ww / 2}" y="${(y0 + y1) / 2 + 4}" text-anchor="middle" style="fill:var(--surface);font-weight:600">${o.fmt ? o.fmt(v) : tickFmt(v)}</text>`; acc += v; }); }
      else { const k = ser.length, gw = bw * 0.7, ww = gw / k; ser.forEach((se, j) => { const v = se.values[i]; const bx = x0 + bw * 0.15 + j * ww;
        s += `<rect x="${bx + 1}" y="${F.Y(v)}" width="${ww - 2}" height="${F.Y(0) - F.Y(v)}" style="fill:${se.color}"><title>${esc(se.name)}, ${esc(c)}: ${o.fmt ? o.fmt(v) : tickFmt(v)}</title></rect>`;
        if (o.labels) s += `<text x="${bx + ww / 2}" y="${F.Y(v) - 4}" text-anchor="middle" style="fill:var(--ink)">${o.fmt ? o.fmt(v) : tickFmt(v)}</text>`; }); } });
    return wrapChart(s + '</svg>', ser.length > 1 ? ser : null);
  }
  function scatterChart(o) {
    const w = o.w || 760, h = o.h || 300, m = { l: 62, r: 16, t: o.title ? 26 : 12, b: 44 }; const xs = o.points.map((p) => p.x), ys = o.points.map((p) => p.y).concat(o.curve ? o.curve.map((p) => p.y) : []);
    const xLo = 0, xHi = Math.max(...xs) * 1.03; const F = frame(w, h, m, Math.min(0, ...ys), Math.max(...ys) * 1.08, o.yLabel, o.title); let s = F.s;
    const X = (v) => m.l + (w - m.l - m.r) * (v - xLo) / (xHi - xLo); ticks(xLo, xHi, 7).forEach((v) => { s += `<text x="${X(v)}" y="${h - m.b + 16}" text-anchor="middle">${tickFmt(v)}</text>`; });
    o.points.forEach((p) => { s += `<circle cx="${X(p.x).toFixed(1)}" cy="${F.Y(p.y).toFixed(1)}" r="2.4" style="fill:${o.color}" opacity="0.55"></circle>`; });
    if (o.curve) s += `<polyline points="${o.curve.map((p) => `${X(p.x).toFixed(1)},${F.Y(p.y).toFixed(1)}`).join(' ')}" fill="none" style="stroke:var(--ink)" stroke-width="1.6" stroke-dasharray="5 3"/>`;
    s += `<text x="${(m.l + w - m.r) / 2}" y="${h - 6}" text-anchor="middle">${esc(o.xLabel)}</text>`;
    return wrapChart(s + '</svg>', o.legend);
  }
  function wrapChart(svg, legend) {
    const lg = legend ? `<div class="legend">${legend.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    return `<div class="chart">${svg}</div>${lg}`;
  }

  // ---------- UI helpers ----------
  const helpBtn = (tip) => `<button class="help-btn" data-tip="${esc(tip)}" aria-label="Explain this section">?</button>`;
  const panel = (title, tip, body, cap) => `<section class="panel"><header><h3>${title}</h3>${tip ? helpBtn(tip) : ''}</header>${cap ? `<p class="cap">${cap}</p>` : ''}${body}</section>`;
  const table = (head, rows, numCols = []) => `<div class="tbl"><table><thead><tr>${head.map((h, i) => `<th class="${numCols.includes(i) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${numCols.includes(i) ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const pill = (st) => `<span class="pill ${st}">${{ match: 'Match', within: 'Within tolerance', differs: 'Differs', skipped: 'Not run' }[st]}</span>`;
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }
  async function copyText(text, label) { try { await navigator.clipboard.writeText(text); toast(label + ' copied'); } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.width = '90vw'; ta.style.height = '50vh'; ta.style.zIndex = 90; document.body.appendChild(ta); ta.select();
    toast('Clipboard blocked. The text is selected; press Ctrl+C, then Esc.'); const close = (ev) => { if (ev.key === 'Escape') { ta.remove(); document.removeEventListener('keydown', close); } }; document.addEventListener('keydown', close); } }
  function compareRows(prefixes) { if (!S.tests) return ''; const rows = S.tests.rows.filter((r) => prefixes.some((p) => r.id.startsWith(p)));
    if (!rows.length) return ''; return panel('Thesis value versus rerun', 'Each row is one number printed in the thesis. "Match" means equal at the thesis rounding. "Within tolerance" applies to optimizer- or seed-dependent results. Open step 6 for the full list.',
      table(['Location', 'Quantity', 'Thesis', 'Rerun', 'Status'], rows.map((r) => [esc(r.loc), esc(r.label) + (r.note && r.status !== 'match' ? `<br><small style="color:var(--muted)">${esc(r.note)}</small>` : ''), r.thesis, r.value == null ? '—' : r.value, pill(r.status)]), [2, 3])); }

  // ---------- steps ----------
  const STEPS = [
    { key: 'data', title: 'Load the data', sub: 'Sections 3.2.1–3.2.2, 4.2–4.3', run: runData, render: renderData, prefixes: ['D', 'T41'] },
    { key: 'fc', title: 'Forecast weekly demand', sub: 'Section 3.5, 4.4 (RQ4)', run: runForecast, render: renderForecast, prefixes: ['T42', 'F44'] },
    { key: 'cost', title: 'Compare cost models', sub: 'Sections 3.2.7–3.2.9, 4.5–4.8 (RQ1, RQ3)', run: runCostStep, render: renderCost, prefixes: ['C', 'T43'] },
    { key: 'sens', title: 'Sensitivity analysis', sub: 'Section 3.2.10, 4.9 (RQ2)', run: runSens, render: renderSens, prefixes: ['T44'] },
    { key: 'groups', title: 'Demand variability', sub: 'Section 4.10 (RQ2)', run: runGroups, render: renderGroups, prefixes: ['F46'] },
    { key: 'tests', title: 'Test and regenerate', sub: '78 thesis numbers, 9 checks, Chapter IV', run: runTests, render: renderTests, prefixes: [] },
    { key: 'audit', title: 'Audit findings', sub: 'What the rerun shows', run: null, render: renderAudit, prefixes: [] },
  ];

  function runData() { S.status.data = 'ok'; }
  function renderData() {
    const d = S.data, c = d.counts, wf = d.weekly_full; const cutI = wf.findIndex((w) => w[0] > '2017-09-25');
    const modes = d.log && d.log.modes;
    return `${panel('Data source', 'The app ships with the aggregates that Appendix A.3–A.8 produces from the 180,519-row DataCo file. Load the raw CSV to rebuild them in your browser with the same cleaning rules.',
      `<p>${esc(S.source)}.</p><div class="controls"><div class="field"><label for="csvFile">Rebuild from the raw DataCo CSV (≈96 MB)</label><input type="file" id="csvFile" accept=".csv,text/csv" style="width:auto"></div>
       <button class="btn" id="useEmbedded">Use embedded data</button></div><p class="cap">The file stays in your browser. Statuses CANCELED, SUSPECTED_FRAUD and PAYMENT_REVIEW are removed; orders after September 30, 2017 are excluded.</p>`)}
     <div class="stats">${[[f0(c.raw), 'raw order lines'], [f0(c.clean), 'after cleaning'], [f0(c.cut), 'after Sept. 2017 cutoff'], [f0(c.orders_cut), 'orders in window'], [d.weekly.length, 'weeks in window'], [f0(d.pairs.length), 'product-region pairs']].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
     ${panel('Figure 4.1 Weekly order quantity, full series', 'Units ordered per Monday-start week, all cleaned orders. The dashed line marks the end of September 2017, after which the order count drops by about 59%.',
      lineChart({ x: wf.map((w) => w[0].slice(0, 7)), series: [{ name: 'Weekly units', values: wf.map((w) => w[1]), color: 'var(--accent)' }], yLabel: 'Units ordered', vline: { i: cutI, label: 'Cutoff, Sept. 30, 2017' }, xEvery: 13 }))}
     <div class="grid2">${panel('Table 4.1 Monthly order lines, February 2017 to January 2018', 'Counts of order lines per calendar month after cleaning.',
      table(['Month', 'Order lines', 'Period'], d.monthly_tail.map(([m, v]) => [m, f0(v), m <= '2017-09' ? 'Before cutoff' : 'After cutoff']), [1]))}
      ${modes ? panel('Shipping mode shares (analysis window)', '', table(['Mode', 'Lines', 'Share'], Object.entries(modes).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, f0(v), f2(100 * v / c.cut) + '%']), [1, 2])) :
      panel('Variable roles (Table 3.1)', 'Observed fields come from the dataset. Assumed fields are the illustrative cost parameters you can change in step 3.',
        table(['Variable', 'Source', 'Role'], [['Order Item Quantity', 'Observed', 'Weekly and annual demand'], ['Order date', 'Observed', 'Week index'], ['Product Price', 'Observed', 'Holding cost'], ['Latitude / Longitude', 'Observed (store location)', 'Distance proxy'], ['Order Region', 'Observed', 'Product-region grouping'], ['Holding rate, ordering cost, mode rates', 'Assumed', 'Cost models']]))}</div>
     ${compareRows(['D', 'T41'])}`;
  }
  async function loadCSV(file) {
    S.busy = true; S.progress = 'Reading ' + file.name + '…'; render();
    const buf = await file.arrayBuffer(); let text; try { text = new TextDecoder('windows-1252').decode(buf); } catch (e) { text = new TextDecoder().decode(buf); }
    setTimeout(() => { try { const d = E.prepareFromCSV(text); if (!d.weekly.length) throw new Error('no rows'); S.data = d; S.source = 'Rebuilt in this browser from ' + file.name;
      S.fc = S.base = S.sens = S.groups = S.tests = null; S.status = { data: 'ok' }; toast('Data rebuilt from ' + f0(d.counts.raw) + ' rows'); }
      catch (e) { toast('That file is not the DataCo CSV (expected columns such as "Order Status" and "Product Card Id").'); }
      S.busy = false; S.progress = ''; render(); }, 30);
  }

  // Forecasting runs in a Web Worker built from the engine source so the page stays responsive.
  function forecastAsync(onProgress) {
    const opt = Object.assign({}, S.fcOpt);
    return new Promise((resolve) => {
      let w = null; try { const src = $('#engine-src').textContent + '\nself.onmessage=function(e){var r=Engine.runForecasts(e.data.weekly,Object.assign({},e.data.opt,{onProgress:function(m){self.postMessage({progress:m});}}));self.postMessage({done:r});};';
        w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); } catch (e) { w = null; }
      if (w) { w.onmessage = (e) => { if (e.data.progress) onProgress(e.data.progress); else { w.terminate(); resolve(e.data.done); } };
        w.onerror = () => { w.terminate(); resolve(E.runForecasts(S.data.weekly, opt)); }; w.postMessage({ weekly: S.data.weekly, opt }); }
      else setTimeout(() => resolve(E.runForecasts(S.data.weekly, Object.assign(opt, { onProgress }))), 20);
    });
  }
  async function runForecast() {
    S.status.fc = 'run'; S.progress = 'Starting forecasts…'; renderRail(); if (S.step === 1) render();
    const fc = await forecastAsync((m) => { S.progress = 'Fitting ' + m + '…'; const p = $('#prog'); if (p) p.textContent = S.progress; });
    S.fc = fc; S.dm = fc.preds.LSTM ? Object.fromEntries(['ARIMA', 'Naive', 'ES', 'XGBoost'].filter((k) => fc.preds[k]).map((k) => [k, E.dieboldMariano(fc.actual, fc.preds.LSTM, fc.preds[k])])) : null;
    S.progress = ''; S.status.fc = 'ok';
  }
  function renderForecast() {
    const o = S.fcOpt; const ctl = panel('Settings', 'Defaults reproduce Section 3.5: 80/20 split (115 training and 29 test weeks), four lagged weeks as features, ARIMA(2,1,2) and Holt refit every week, XGBoost with 200 trees of depth 3, LSTM with 32 units for 100 epochs averaged over five seeds.',
      `<div class="controls"><div class="field"><label for="o-share">Training share</label><input id="o-share" type="number" step="0.05" min="0.5" max="0.95" value="${o.trainShare}"></div>
       <div class="field"><label for="o-lags">Lagged weeks (XGBoost, LSTM)</label><input id="o-lags" type="number" min="1" max="12" value="${o.lags}"></div>
       <div class="field"><label for="o-seeds">LSTM seeds</label><input id="o-seeds" type="number" min="1" max="10" value="${o.seeds.length}"></div>
       <div class="field"><label for="o-epochs">LSTM epochs</label><input id="o-epochs" type="number" min="5" max="300" value="${o.epochs}"></div>
       <label class="check"><input id="o-arima" type="checkbox" ${o.arima ? 'checked' : ''}> ARIMA (about 2 s)</label><label class="check"><input id="o-lstm" type="checkbox" ${o.lstm ? 'checked' : ''}> LSTM (about 15 s)</label></div>
       <p class="progress" id="prog">${esc(S.progress || (S.fc ? 'Last run took ' + f1(Object.values(S.fc.time).reduce((a, b) => a + b, 0)) + ' s.' : 'Not run yet. Press Run this step.'))}</p>`);
    if (!S.fc) return ctl;
    const fc = S.fc, ms = Object.keys(fc.metrics);
    const tbl = table(['Method', 'Type', 'MAE', 'RMSE', 'MAPE (%)', 'Thesis MAPE', 'Time (s)'], ms.map((m) => [METHOD_LABEL[m], METHOD_TYPE[m], f2(fc.metrics[m].mae), f2(fc.metrics[m].rmse), f2(fc.metrics[m].mape), THESIS_42[m][2].toFixed(2), f1(fc.time[m] || 0)]), [2, 3, 4, 5, 6]);
    const seed = fc.lstmSeedMape ? `<p class="cap">LSTM MAPE across ${fc.lstmRuns.length} seeds: ${f2(fc.lstmSeedMape.min)}% to ${f2(fc.lstmSeedMape.max)}%, standard deviation ${f2(fc.lstmSeedMape.sd)} points (thesis: 4.54% to 4.68%, SD 0.05).</p>` : '';
    const dm = S.dm ? panel('Is LSTM really more accurate? Diebold–Mariano test', 'Tests whether two forecast error series have equal expected loss (squared error, horizon 1, Harvey–Leybourne–Newbold correction, t with n−1 df). The thesis did not run this test (Section 4.4).',
      table(['LSTM versus', 'Mean loss difference', 'DM statistic', 'p-value', 'Reading'], Object.entries(S.dm).map(([k, v]) => [METHOD_LABEL[k], f0(v.meanDiff), f2(v.stat), v.p.toFixed(3), v.p < 0.05 ? (v.stat < 0 ? 'LSTM significantly better' : 'LSTM significantly worse') : 'No significant difference']), [1, 2, 3]),
      'Over 29 test weeks only the gap to XGBoost is significant at 5%.') : '';
    return `${ctl}${panel('Table 4.2 Forecast accuracy on the 29-week test period', 'Rolling one-step-ahead forecasts. MAE and RMSE are in units per week. MAPE skips weeks with zero demand (there are none).', tbl + seed)}
      <div class="grid2">${panel('Figure 4.2 MAE and RMSE by method', '', barChart({ cats: ms.map((m) => m === 'Naive' ? 'Naive' : m), series: [{ name: 'MAE', values: ms.map((m) => fc.metrics[m].mae), color: 'var(--muted)' }, { name: 'RMSE', values: ms.map((m) => fc.metrics[m].rmse), color: 'var(--joint)' }], yLabel: 'Error (units per week)', labels: true, fmt: (v) => f0(v), w: 460, h: 300 }))}
      ${dm}</div>
      ${panel('Figure 4.3 Actual and forecast weekly demand, test weeks', 'The last week (from Sept. 25, 2017) holds only six days of orders, so every method overpredicts it.',
        lineChart({ x: fc.dates.map((d) => d.slice(5)), series: [{ name: 'Actual demand', values: fc.actual, color: COLOR.Actual, width: 2.6, dots: true }, ...ms.filter((m) => m !== 'Naive').map((m) => ({ name: METHOD_LABEL[m], values: fc.preds[m], color: COLOR[m], dash: '5 3' }))], yLabel: 'Weekly order quantity', xEvery: 4 }))}
      ${compareRows(['T42', 'F44'])}`;
  }

  function costParamsFromUI() { const P = S.params; const v = (id) => parseFloat($('#' + id).value);
    if ($('#p-h')) { P.holdingRate = v('p-h') / 100; P.orderingCost = v('p-s'); P.nWeeks = v('p-w'); Object.keys(P.modes).forEach((m, i) => { P.modes[m].fixed = v('m-f' + i); P.modes[m].perKm = v('m-r' + i); }); S.variant = $('#p-var').value; } }
  function runCostStep() { costParamsFromUI(); S.base = E.runCost(S.data.pairs, S.params, 'thesis'); S.trueJoint = E.runCost(S.data.pairs, S.params, 'trueJoint'); S.status.cost = 'ok'; }
  function renderCost() {
    const P = S.params; const ctl = panel('Cost parameters (assumed, Table 3.1 and Appendix A.5)', 'Defaults are the thesis values. Change any of them and press Run this step. The "true joint" variant puts the distance cost into the lot-size formula as well; the thesis joint model leaves it out.',
      `<div class="controls"><div class="field"><label for="p-h">Holding rate (% of price per year)</label><input id="p-h" type="number" step="1" value="${f0(P.holdingRate * 100)}"></div>
       <div class="field"><label for="p-s">Ordering cost ($ per order)</label><input id="p-s" type="number" step="1" value="${P.orderingCost}"></div>
       <div class="field"><label for="p-w">Weeks in window</label><input id="p-w" type="number" value="${P.nWeeks}"></div>
       <div class="field"><label for="p-var">Joint model shown</label><select id="p-var" style="width:14rem"><option value="thesis" ${S.variant === 'thesis' ? 'selected' : ''}>Thesis joint model (Q from S + F)</option><option value="trueJoint" ${S.variant === 'trueJoint' ? 'selected' : ''}>True joint EOQ (Q from S + F + d·r)</option></select></div></div>
       ${table(['Shipping mode', 'Fixed cost per shipment ($)', 'Cost per km ($)'], Object.keys(P.modes).map((m, i) => [m, `<input id="m-f${i}" type="number" step="0.5" value="${P.modes[m].fixed}" style="width:6rem" aria-label="${m} fixed cost">`, `<input id="m-r${i}" type="number" step="0.005" value="${P.modes[m].perKm}" style="width:6rem" aria-label="${m} cost per km">`]))}`);
    if (!S.base) return ctl + `<p class="cap">Press Run this step to compute both models for every product-region pair.</p>`;
    const B = S.variant === 'trueJoint' ? S.trueJoint : S.base, t = B.tot, tj = S.trueJoint.tot;
    const stats = `<div class="stats">${[[usd(t.sep), 'Separate Total Cost'], [usd(t.joint), 'Consolidated Total Cost'], [usd(t.savings), 'Savings per year'], [f2(t.savingsPct) + '%', 'Savings'], [f1(B.avgQ) + ' → ' + f1(B.avgQj), 'Average order quantity'], [Object.entries(B.modeCount).map(([k, v]) => v + ' ' + k.split(' ')[0]).join(', '), 'Mode chosen']].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
    const t43 = table(['Component', 'Conventional (Separate)', 'Joint (Consolidated)', 'Change'], [['Inventory cost', `${usd(t.sepInv)} (${f1(100 * t.sepInv / t.sep)}%)`, `${usd(t.jInv)} (${f1(100 * t.jInv / t.joint)}%)`, (t.jInv - t.sepInv >= 0 ? '+' : '') + usd(t.jInv - t.sepInv)],
      ['Transportation cost', `${usd(t.sepTr)} (${f1(100 * t.sepTr / t.sep)}%)`, `${usd(t.jTr)} (${f1(100 * t.jTr / t.joint)}%)`, usd(t.jTr - t.sepTr)], ['<b>Total</b>', `<b>${usd(t.sep)}</b>`, `<b>${usd(t.joint)}</b>`, `<b>${usd(t.joint - t.sep)}</b>`]], [1, 2, 3]);
    const fig = barChart({ cats: ['Conventional (Separate)', 'Joint'], series: [{ name: 'Inventory cost', values: [t.sepInv, t.jInv], color: 'var(--c4)' }, { name: 'Transportation cost', values: [t.sepTr, t.jTr], color: 'var(--joint)' }], stacked: true, yLabel: 'Annual cost (USD)', fmt: (v) => '$' + tickFmt(v), w: 460, h: 300 });
    const sample = B.rows.filter((_, i) => i % 3 === 0).map((r) => ({ x: r.dist, y: r.saving })); const dmax = Math.max(...B.rows.map((r) => r.dist));
    const curve = Array.from({ length: 60 }, (_, i) => { const d = dmax * i / 59; const fx = P.modes['Standard Class'].fixed, rr = P.modes['Standard Class'].perKm;
      const y = S.variant === 'trueJoint' ? 100 * (1 - 1 / (0.5 * (Math.sqrt(P.orderingCost / (P.orderingCost + fx + d * rr)) + Math.sqrt((P.orderingCost + fx + d * rr) / P.orderingCost)))) : 100 * E.closedFormSaving(P.orderingCost, fx, d * rr); return { x: d, y }; });
    const q = S.pairQuery.toLowerCase(); const list = B.rows.filter((r) => !q || (r.name + ' ' + r.region).toLowerCase().includes(q)).sort((a, b) => b.D - a.D).slice(0, 12);
    const finding = `<div class="note find"><b>Audit finding.</b> The thesis joint model sets Q from ordering plus fixed shipment cost but leaves the distance cost (d × rate) out of the lot-size formula, although it is paid on every shipment. Putting it in gives the true joint EOQ: saving <b>${f2(tj.savingsPct)}%</b> (${usd(tj.savings)}) instead of ${f2(S.base.tot.savingsPct)}%. Each pair's saving depends only on S, F and d·r, so it follows the dashed closed-form curve exactly and cannot depend on demand or holding cost.</div>`;
    return `${ctl}${stats}${finding}
      <div class="grid2">${panel('Table 4.3 Cost breakdown by component', 'Annual costs summed over all product-region pairs, rounded to the dollar.', t43)}${panel('Figure 4.4 Annual inventory and transportation cost', '', fig)}</div>
      ${panel('Saving per pair against distance proxy', 'Every third pair plotted. The dashed line is the closed-form EOQ cost-penalty curve: saving = 1 − g(√((S+F)/K)) / g(√(S/K)) with K = S + F + d·r and g(x) = (x + 1/x)/2.',
        scatterChart({ points: sample, color: 'var(--accent)', curve, xLabel: 'Distance proxy (km, spread of store coordinates)', yLabel: 'Saving (%)', legend: [{ name: 'Pairs', color: 'var(--accent)' }, { name: 'Closed form', color: 'var(--ink)' }] }))}
      ${panel('Pair explorer', 'The 12 pairs with the highest annual demand that match your search.', `<div class="field"><label for="pairQ">Search product or region</label><input id="pairQ" type="search" value="${esc(S.pairQuery)}" style="width:min(22rem,100%)"></div>` +
        table(['Product', 'Region', 'D (units/yr)', 'Price', 'Distance (km)', 'Q sep', 'Q joint', 'Saving %'], list.map((r) => [esc(r.name), esc(r.region), f1(r.D), '$' + f2(r.price), f0(r.dist), f1(r.Q), f1(r.Qj), f2(r.saving)]), [2, 3, 4, 5, 6, 7]))}
      ${compareRows(['C', 'T43'])}`;
  }

  function runSens() { costParamsFromUI(); const parse = (id, def) => { const el = $('#' + id); if (!el) return def; const a = el.value.split(/[ ,;]+/).map(Number).filter((x) => isFinite(x) && x > 0); return a.length ? a : def; };
    S.grids = { holdingRate: parse('g-h', S.grids.holdingRate.map((x) => x * 100)).map((x) => (x > 1 ? x / 100 : x)), orderingCost: parse('g-s', S.grids.orderingCost), rateMult: parse('g-m', S.grids.rateMult) };
    const base = Object.assign({}, S.params); S.sens = {}; for (const k in S.grids) S.sens[k] = S.grids[k].map((v) => ({ value: v, savings: E.runCost(S.data.pairs, Object.assign({}, base, { [k]: v })).tot.savingsPct, trueJoint: E.runCost(S.data.pairs, Object.assign({}, base, { [k]: v }), 'trueJoint').tot.savingsPct }));
    S.status.sens = 'ok'; }
  function renderSens() {
    const g = S.grids; const ctl = panel('Parameter grids', 'Comma-separated values. Each value reruns both cost models for all pairs with the other parameters at their step-3 settings.',
      `<div class="controls"><div class="field"><label for="g-h">Holding rate (%)</label><input id="g-h" value="${g.holdingRate.map((x) => +(x * 100).toFixed(2)).join(', ')}" style="width:14rem"></div>
       <div class="field"><label for="g-s">Ordering cost ($)</label><input id="g-s" value="${g.orderingCost.join(', ')}" style="width:14rem"></div>
       <div class="field"><label for="g-m">Shipping-rate multiplier</label><input id="g-m" value="${g.rateMult.join(', ')}" style="width:14rem"></div></div>`);
    if (!S.sens) return ctl;
    const s = S.sens; const rows = [...s.holdingRate.map((r, i) => [i ? '' : 'Holding cost rate', Math.round(r.value * 100) + '%', f2(r.savings), f2(r.trueJoint)]), ...s.orderingCost.map((r, i) => [i ? '' : 'Ordering cost', '$' + r.value, f2(r.savings), f2(r.trueJoint)]), ...s.rateMult.map((r, i) => [i ? '' : 'Shipping rate multiplier', '×' + r.value.toFixed(2), f2(r.savings), f2(r.trueJoint)])];
    return `${ctl}${panel('Table 4.4 Savings from the joint model under different cost assumptions', 'The last column applies the true joint EOQ for comparison; it is not in the thesis.', table(['Parameter', 'Value', 'Savings (%)', 'True joint EOQ (%)'], rows, [2, 3]))}
     <div class="grid2">${panel('Figure 4.5a Savings against ordering cost', '', lineChart({ x: s.orderingCost.map((r) => '$' + r.value), series: [{ name: 'Thesis joint model', values: s.orderingCost.map((r) => r.savings), color: 'var(--joint)', dots: true }, { name: 'True joint EOQ', values: s.orderingCost.map((r) => r.trueJoint), color: 'var(--c3)', dots: true, dash: '5 3' }], yLabel: 'Savings from joint model (%)', yMin: 0, xEvery: 1, w: 460 }))}
     ${panel('Figure 4.5b Savings against shipping rate', '', lineChart({ x: s.rateMult.map((r) => '×' + r.value), series: [{ name: 'Thesis joint model', values: s.rateMult.map((r) => r.savings), color: 'var(--c4)', dots: true }, { name: 'True joint EOQ', values: s.rateMult.map((r) => r.trueJoint), color: 'var(--c3)', dots: true, dash: '5 3' }], yLabel: 'Savings from joint model (%)', yMin: 0, xEvery: 1, w: 460 }))}</div>
     <p class="note">Holding rate leaves the saving unchanged because every cost term scales with √H in both models. This is an algebraic identity of the model, not an empirical finding.</p>
     ${compareRows(['T44'])}`;
  }

  function runGroups() { if (!S.base) runCostStep(); S.groups = E.variabilityGroups(S.data.pairs, S.data.product_week, S.base); S.status.groups = 'ok'; }
  function renderGroups() {
    if (!S.groups) return panel('What this step does', '', '<p>Computes the coefficient of variation of weekly demand for each product over the 144 weeks (zero weeks included), splits products into terciles, and recomputes savings within each group. Press Run this step.</p>');
    const G = S.groups, ks = ['Low', 'Moderate', 'High'];
    return `<div class="grid2">${panel('Figure 4.6 Savings by demand-variability group', '', barChart({ cats: ks.map((k) => k + ' variability'), series: [{ name: 'Savings', values: ks.map((k) => G[k].savings), color: 'var(--joint)' }], yLabel: 'Savings from joint model (%)', labels: true, fmt: (v) => f2(v) + '%', w: 460 }))}
      ${panel('Group detail', 'Products in the window: ' + ks.reduce((a, k) => a + G[k].products, 0) + ' (the thesis says 118, which is the count before the cutoff).', table(['Group', 'Products', 'Combinations', 'Thesis combinations', 'Mean distance (km)', 'Savings (%)'], ks.map((k, i) => [k, G[k].products, G[k].pairs, [742, 540, 161][i], f0(G[k].meanDist), f2(G[k].savings)]), [1, 2, 3, 4, 5]))}</div>
      <div class="note find"><b>Audit finding.</b> The published Appendix A.11 code gives ${ks.map((k) => G[k].pairs).join(' / ')} combinations, not 742 / 540 / 161. Because a pair's saving depends only on its distance proxy, group savings differ only through the distance mix of each group. Demand variability cannot change the result in this model.</div>
      ${compareRows(['F46'])}`;
  }

  async function runTests() {
    if (!S.fc) await runForecast(); if (!S.base) runCostStep(); if (!S.sens) runSens(); if (!S.groups) runGroups();
    const R = { data: S.data, fc: S.fc, base: S.base, trueJoint: S.trueJoint, sens: { holdingRate: S.sens.holdingRate, orderingCost: S.sens.orderingCost, rateMult: S.sens.rateMult }, groups: S.groups };
    const thesisGrid = JSON.stringify(S.grids) === JSON.stringify({ holdingRate: [0.10, 0.15, 0.20, 0.25, 0.30], orderingCost: [5, 10, 15, 20, 25, 30], rateMult: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] });
    if (!thesisGrid) R.sens = E.sensitivity(S.data.pairs);
    S.tests = TS.evaluate(R, E); S.status.tests = S.tests.summary.differs ? 'warn' : 'ok';
    S.status.fc = statusFor(['T42', 'F44']); S.status.cost = statusFor(['C', 'T43']); S.status.sens = statusFor(['T44']); S.status.groups = statusFor(['F46']); S.status.data = statusFor(['D', 'T41']);
  }
  function statusFor(pre) { const rs = S.tests.rows.filter((r) => pre.some((p) => r.id.startsWith(p))); return rs.some((r) => r.status === 'differs') ? 'bad' : rs.some((r) => r.status === 'within') ? 'warn' : 'ok'; }
  function renderTests() {
    if (!S.tests) return panel('Regeneration tests', 'Runs every step with the thesis settings, then compares each of the 78 numbers the thesis prints in Chapter IV and the Abstract with the recomputed value.',
      '<p>Press <b>Run this step</b> (about 20 seconds). Steps that have not run yet run first.</p><p class="cap">Change parameters in steps 2–4 first if you want to see which thesis numbers move.</p>');
    const T = S.tests, s = T.summary; const rows = T.rows.filter((r) => S.filter === 'all' || r.status === S.filter);
    return `<div class="stats">${[[s.match, 'match exactly', 'var(--ok)'], [s.within, 'within tolerance', 'var(--warn)'], [s.differs, 'differ', 'var(--bad)'], [s.checksPassed + ' / ' + s.checks, 'model checks pass', 'var(--accent)']].map(([v, l, c]) => `<div class="stat" style="border-color:${c}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      ${panel('Regenerate Chapter IV', 'Builds the results chapter from the numbers on this page, in the thesis format, with every table and figure. Use the copy buttons to take it into Word or a doc.',
        `<div class="controls"><button class="btn primary" id="regen">Regenerate Chapter IV</button><button class="btn" id="copyHtml">Copy chapter as HTML</button><button class="btn" id="copyMd">Copy chapter as Markdown</button><button class="btn" id="copyCsv">Copy test table as CSV</button></div><div id="paperBox"></div>`)}
      ${panel('Thesis numbers', 'Tolerances: ARIMA MAPE ±0.10, ES ±0.15, LSTM ±0.25 points (MAE/RMSE ±3 to ±6 units). All other rows must match at the thesis rounding.',
        `<div class="field"><label for="tfilter">Show</label><select id="tfilter" style="width:12rem">${['all', 'match', 'within', 'differs'].map((k) => `<option value="${k}" ${S.filter === k ? 'selected' : ''}>${{ all: 'All rows', match: 'Matches', within: 'Within tolerance', differs: 'Differences' }[k]}</option>`).join('')}</select></div>` +
        table(['ID', 'Location', 'Quantity', 'Thesis', 'Rerun', 'Difference', 'Status'], rows.map((r) => [r.id, esc(r.loc), esc(r.label) + (r.note && r.status !== 'match' ? `<br><small style="color:var(--muted)">${esc(r.note)}</small>` : ''), r.thesis, r.value == null ? '—' : r.value, Number.isFinite(r.diff) ? (Math.abs(r.diff) < 1e-9 ? '0' : (+r.diff.toFixed(4)).toString()) : '—', pill(r.status)]), [3, 4, 5]))}
      ${panel('Model checks', 'Identities and conservation rules that must hold whatever the thesis says.', table(['ID', 'Check', 'Result'], T.checks.map((c) => [c.id, esc(c.label), c.ok ? '<span class="pill match">Pass</span>' : '<span class="pill differs">Fail</span>'])))}`;
  }

  // ---------- regenerated chapter ----------
  function chapterHTML() {
    const d = S.data, fc = S.fc, b = S.base.tot, B = S.base, sn = S.sens, G = S.groups; const ms = Object.keys(fc.metrics); const M = fc.metrics; const today = new Date().toISOString().slice(0, 10);
    const best = ms.slice().sort((x, y) => M[x].mape - M[y].mape); const sCost = S.params.orderingCost;
    const lowS = sn.orderingCost[0], highS = sn.orderingCost[sn.orderingCost.length - 1], m2 = sn.rateMult[sn.rateMult.length - 1], m05 = sn.rateMult[0];
    const t = (cap) => `<p class="tcap"><b>Table ${cap.split(' ')[0]}</b> <i>${cap.slice(cap.indexOf(' ') + 1)}</i></p>`; const fcap = (cap) => `<p class="fcap"><b>Figure ${cap.split(' ')[0]}</b> <i>${cap.slice(cap.indexOf(' ') + 1)}</i></p>`;
    const wf = d.weekly_full; const cutI = wf.findIndex((w) => w[0] > '2017-09-25');
    return `<div class="paper"><p class="gen">AI-generated regeneration of Chapter IV, ${today}. Every number, table and figure below was recomputed in the browser by the DataCo Joint Cost Rerun program from ${esc(S.source.toLowerCase())}. Text follows the structure of the original chapter; wording was produced by the program's templates.</p>
      <h4>Chapter IV</h4><h4>Implementation, Results and Discussion</h4>
      <h5>4.2 Data Preparation Summary</h5><p>The DataCo Smart Supply Chain Dataset contained ${f0(d.counts.raw)} raw order-line records. Cleaning removed ${f0(d.counts.raw - d.counts.clean)} records (${f1(100 * (d.counts.raw - d.counts.clean) / d.counts.raw)}%), leaving ${f0(d.counts.clean)}. After the September 2017 cutoff, ${f0(d.counts.cut)} order lines from ${f0(d.counts.orders_cut)} orders remained.</p>
      <h5>4.3 Demand Pattern and Cutoff Adjustment</h5><p>Figure 4.1 shows the full weekly order series and Table 4.1 the monthly order-line counts around the cutoff. The analysis window gives ${d.weekly.length} weekly observations; the first ${fc.split} weeks were used for training and the last ${fc.N - fc.split} for testing.</p>
      ${lineChart({ x: wf.map((w) => w[0].slice(0, 7)), series: [{ name: 'Weekly units', values: wf.map((w) => w[1]), color: '#333' }], yLabel: 'Units ordered', vline: { i: cutI, label: 'Cutoff' }, xEvery: 13 })}${fcap('4.1 Weekly Order Quantity for the Full Series, January 2015 to January 2018')}
      ${t('4.1 Monthly Order Lines, February 2017 to January 2018')}<table><thead><tr><th>Month</th><th class="num">Order lines</th><th>Period</th></tr></thead><tbody>${d.monthly_tail.map(([m, v]) => `<tr><td>${m}</td><td class="num">${f0(v)}</td><td>${m <= '2017-09' ? 'Before cutoff' : 'After cutoff'}</td></tr>`).join('')}</tbody></table>
      <h5>4.4 Forecast Accuracy Results</h5><p>Table 4.2 compares the forecasting methods on the same ${fc.N - fc.split} test weeks. ${METHOD_LABEL[best[0]]} had the lowest MAPE (${f2(M[best[0]].mape)}%), followed by ${METHOD_LABEL[best[1]]} (${f2(M[best[1]].mape)}%) and ${METHOD_LABEL[best[2]]} (${f2(M[best[2]].mape)}%). ${S.dm ? `A Diebold–Mariano test found no significant difference between LSTM and ARIMA (p = ${S.dm.ARIMA ? S.dm.ARIMA.p.toFixed(2) : 'n/a'}) or the naive benchmark (p = ${S.dm.Naive.p.toFixed(2)}); only the difference from XGBoost was significant (p = ${S.dm.XGBoost.p.toFixed(3)}).` : ''}</p>
      ${t('4.2 Forecast Accuracy on the ' + (fc.N - fc.split) + '-Week Test Period')}<table><thead><tr><th>Method</th><th>Type</th><th class="num">MAE</th><th class="num">RMSE</th><th class="num">MAPE (%)</th></tr></thead><tbody>${ms.map((m) => `<tr><td>${METHOD_LABEL[m]}</td><td>${METHOD_TYPE[m]}</td><td class="num">${f2(M[m].mae)}</td><td class="num">${f2(M[m].rmse)}</td><td class="num">${f2(M[m].mape)}</td></tr>`).join('')}</tbody></table>
      ${barChart({ cats: ms, series: [{ name: 'MAE', values: ms.map((m) => M[m].mae), color: '#888' }, { name: 'RMSE', values: ms.map((m) => M[m].rmse), color: '#c98a1c' }], yLabel: 'Error (units per week)', labels: true, fmt: (v) => f0(v) })}${fcap('4.2 Forecast Accuracy (MAE and RMSE) of the Forecasting Methods')}
      ${lineChart({ x: fc.dates.map((x) => x.slice(5)), series: [{ name: 'Actual demand', values: fc.actual, color: '#111', width: 2.4 }, ...ms.filter((m) => m !== 'Naive').map((m, i) => ({ name: METHOD_LABEL[m], values: fc.preds[m], color: ['#4472C4', '#70AD47', '#e0a032', '#C00000'][i], dash: '5 3' }))], yLabel: 'Weekly order quantity', xEvery: 4 })}${fcap('4.3 Actual and Forecasted Weekly Demand in the Test Weeks')}
      <h5>4.5 Conventional (Separate) Cost Model Results</h5><p>The cost models were applied to the ${f0(B.n)} product-region combinations with positive demand. Annual demand had median ${f1(B.demand.median)} units, mean ${f1(B.demand.mean)} units and maximum ${f0(B.demand.max)} units. The Separate Total Cost was ${usd(b.sep)} per year.</p>
      <h5>4.6 Joint (Consolidated) Cost Model Results</h5><p>The joint model gave a Consolidated Total Cost of ${usd(b.joint)} per year. ${Object.entries(B.modeCount).map(([k, v]) => `${f0(v)} combinations chose ${k}`).join('; ')}. The average order quantity rose from ${f1(B.avgQ)} to ${f1(B.avgQj)} units.</p>
      <h5>4.7 Comparative Analysis</h5><p>Joint optimization reduced total annual cost by ${usd(b.savings)}, or ${f2(b.savingsPct)}%. The median saving per combination was ${f2(B.pairSaving.median)}% and the largest ${f2(B.pairSaving.max)}%. When the distance cost is also included in the lot-size decision (true joint EOQ), the saving is ${f2(S.trueJoint.tot.savingsPct)}% (${usd(S.trueJoint.tot.savings)}).</p>
      <h5>4.8 Cost Breakdown: Inventory vs. Transportation</h5><p>Transportation cost changed by ${usd(b.jTr - b.sepTr)} and inventory cost by ${usd(b.jInv - b.sepInv)}.</p>
      ${t('4.3 Cost Breakdown by Component')}<table><thead><tr><th>Component</th><th class="num">Conventional (Separate)</th><th class="num">Joint (Consolidated)</th><th class="num">Change</th></tr></thead><tbody>
      <tr><td>Inventory cost</td><td class="num">${usd(b.sepInv)} (${f1(100 * b.sepInv / b.sep)}%)</td><td class="num">${usd(b.jInv)} (${f1(100 * b.jInv / b.joint)}%)</td><td class="num">${usd(b.jInv - b.sepInv)}</td></tr>
      <tr><td>Transportation cost</td><td class="num">${usd(b.sepTr)} (${f1(100 * b.sepTr / b.sep)}%)</td><td class="num">${usd(b.jTr)} (${f1(100 * b.jTr / b.joint)}%)</td><td class="num">${usd(b.jTr - b.sepTr)}</td></tr>
      <tr><td><b>Total</b></td><td class="num"><b>${usd(b.sep)}</b></td><td class="num"><b>${usd(b.joint)}</b></td><td class="num"><b>${usd(b.joint - b.sep)}</b></td></tr></tbody></table>
      ${barChart({ cats: ['Conventional (Separate)', 'Joint'], series: [{ name: 'Inventory cost', values: [b.sepInv, b.jInv], color: '#4472C4' }, { name: 'Transportation cost', values: [b.sepTr, b.jTr], color: '#e0a032' }], stacked: true, yLabel: 'Total cost (USD)', fmt: (v) => '$' + tickFmt(v), w: 560, h: 320 })}${fcap('4.4 Annual Inventory and Transportation Cost under the Conventional and Joint Models')}
      <h5>4.9 Sensitivity Analysis (RQ2)</h5><p>Savings ranged from ${f2(Math.min(...sn.holdingRate.map((r) => r.savings)))}% to ${f2(Math.max(...sn.holdingRate.map((r) => r.savings)))}% across holding rates, from ${f2(lowS.savings)}% at $${lowS.value} per order to ${f2(highS.savings)}% at $${highS.value}, and from ${f2(m05.savings)}% at ×${m05.value} the shipping rate to ${f2(m2.savings)}% at ×${m2.value}.</p>
      ${t('4.4 Savings from the Joint Model under Different Cost Assumptions')}<table><thead><tr><th>Parameter</th><th>Value</th><th class="num">Savings (%)</th></tr></thead><tbody>${sn.holdingRate.map((r, i) => `<tr><td>${i ? '' : 'Holding cost rate'}</td><td>${Math.round(r.value * 100)}%</td><td class="num">${f2(r.savings)}</td></tr>`).join('')}${sn.orderingCost.map((r, i) => `<tr><td>${i ? '' : 'Ordering cost'}</td><td>$${r.value}${r.value === sCost ? ' (baseline)' : ''}</td><td class="num">${f2(r.savings)}</td></tr>`).join('')}${sn.rateMult.map((r, i) => `<tr><td>${i ? '' : 'Shipping rate multiplier'}</td><td>×${r.value.toFixed(2)}</td><td class="num">${f2(r.savings)}</td></tr>`).join('')}</tbody></table>
      ${lineChart({ x: sn.orderingCost.map((r) => '$' + r.value), series: [{ name: 'Ordering cost', values: sn.orderingCost.map((r) => r.savings), color: '#e0a032', dots: true }], yLabel: 'Savings (%)', yMin: 0, xEvery: 1, w: 520, h: 260 })}${lineChart({ x: sn.rateMult.map((r) => '×' + r.value), series: [{ name: 'Shipping rate', values: sn.rateMult.map((r) => r.savings), color: '#4472C4', dots: true }], yLabel: 'Savings (%)', yMin: 0, xEvery: 1, w: 520, h: 260 })}${fcap('4.5 Savings Sensitivity to Ordering Cost and Shipping Rate')}
      <h5>4.10 Demand Scenario Analysis</h5><p>Savings were ${f2(G.Low.savings)}% for the low-variability group (${G.Low.pairs} combinations), ${f2(G.Moderate.savings)}% for the moderate group (${G.Moderate.pairs}) and ${f2(G.High.savings)}% for the high group (${G.High.pairs}).</p>
      ${barChart({ cats: ['Low variability', 'Moderate variability', 'High variability'], series: [{ name: 'Savings', values: ['Low', 'Moderate', 'High'].map((k) => G[k].savings), color: '#e0a032' }], yLabel: 'Savings (%)', labels: true, fmt: (v) => f2(v) + '%', w: 520 })}${fcap('4.6 Savings by Demand-Variability Group')}</div>`;
  }
  function inlineColors(html) { const cs = getComputedStyle(document.documentElement); return html.replace(/var\((--[a-z0-9-]+)\)/g, (_, v) => cs.getPropertyValue(v).trim() || '#333'); }
  function chapterMarkdown() { const box = document.createElement('div'); box.innerHTML = chapterHTML(); let md = '';
    box.querySelector('.paper').childNodes.forEach((n) => { if (n.nodeType !== 1) return; const tag = n.tagName;
      if (tag === 'H4') md += '## ' + n.textContent + '\n\n'; else if (tag === 'H5') md += '### ' + n.textContent + '\n\n'; else if (tag === 'P') md += n.textContent + '\n\n';
      else if (tag === 'TABLE') { const rows = [...n.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim())); md += '| ' + rows[0].join(' | ') + ' |\n|' + rows[0].map(() => '---').join('|') + '|\n' + rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n\n'; }
      else if (n.classList.contains('chart')) md += '[Figure: see the HTML version]\n\n'; }); return md; }

  // ---------- audit step ----------
  function renderAudit() {
    const F = [
      ['Reproduced', 'ok', 'Running the student’s Appendix A code on the public DataCo file with the same library versions reproduces the data counts, Table 4.1, four of five rows of Table 4.2, Table 4.3 and every value in Table 4.4.'],
      ['Joint model leaves cost out of the lot size', 'bad', 'The joint EOQ uses ordering plus fixed shipment cost but not the distance cost per shipment. With it, the joint saving is 16.38% rather than 3.23%. The reported saving measures the EOQ penalty for ignoring part of the order cost.'],
      ['Saving has a closed form', 'bad', 'Per pair, saving = 1 − g(√((S+F)/K)) / g(√(S/K)) with K = S + F + d·r. It does not involve demand or holding cost, so the holding-rate invariance and the near-equal variability groups follow from algebra, not from the data.'],
      ['Mode choice never operates', 'warn', 'Standard Class has the lowest fixed and per-km cost, so it is chosen for every pair at every tested setting. The joint model never trades mode against inventory.'],
      ['Distance proxy uses store coordinates', 'bad', 'The DataCo description file defines Latitude and Longitude as the store location. The proxy is the spread of store coordinates among customers who ordered a product to a region, not a shipping distance.'],
      ['Variability group sizes', 'bad', 'The published A.11 code gives 765 / 523 / 155 combinations; the thesis reports 742 / 540 / 161. Terciles are over 100 products in the window, not 118.'],
      ['Exponential Smoothing row', 'warn', 'A rerun of the student’s code gives 111.99 / 147.45 / 4.97 rather than 112.17 / 147.49 / 4.98. In one window statsmodels stops at a local SSE minimum; a global search gives MAPE 5.06.'],
      ['ARIMA fits', 'warn', 'statsmodels warns of non-invertible starting values in every window and does not converge in three; 13 of 29 fits end with an MA root on the unit circle. A higher-likelihood fit gives MAPE 4.80.'],
      ['No significance test', 'warn', 'Diebold–Mariano tests show LSTM is not significantly more accurate than ARIMA (p ≈ 0.81) or the naive forecast (p ≈ 0.72). Only XGBoost is significantly worse.'],
      ['Stages are not linked', 'warn', 'Forecasts are made for company-total weekly demand (about 2,500 units a week); the cost models use product-region average demand (median 11.6 units a year). The forecasts never reach the cost models.'],
      ['Partial edge weeks', 'warn', 'Week 1 holds 4 days and week 144 holds 6, so dividing by 144 understates annual demand by about 0.4%. Dollar totals move about 0.2%; savings percentages do not move.'],
    ];
    return `${panel('Summary of the computation audit', 'Every number below comes from executed code: the student’s Python rerun, this JavaScript engine, or the closed-form identity. Location references are to the thesis.',
      `<div class="tbl"><table><thead><tr><th>Finding</th><th>Severity</th><th>Detail</th></tr></thead><tbody>${F.map(([a, s, b]) => `<tr><td><b>${esc(a)}</b></td><td><span class="pill ${s === 'ok' ? 'match' : s === 'warn' ? 'within' : 'differs'}">${s === 'ok' ? 'Confirmed' : s === 'warn' ? 'Minor or major' : 'Major'}</span></td><td>${esc(b)}</td></tr>`).join('')}</tbody></table></div>`)}
      ${panel('Three implementations of the main result', 'K-validation: the same headline number from independent code paths.', table(['Implementation', 'Separate total', 'Joint total', 'Savings'], [['Student Python (Appendix A, rerun)', '$367,684', '$355,822', '3.23%'], ['This JavaScript engine', S.base ? usd(S.base.tot.sep) : '$367,684', S.base ? usd(S.base.tot.joint) : '$355,822', S.base ? f2(S.base.tot.savingsPct) + '%' : '3.23%'], ['Closed-form EOQ identity (per pair, summed)', 'identity', 'identity', 'max error < 1e-13 pp']], [1, 2, 3]))}`;
  }

  // ---------- rendering ----------
  function renderRail() {
    $('#rail').innerHTML = STEPS.map((st, i) => { const s = S.status[st.key]; const dot = s === 'run' ? 'run' : s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : s === 'bad' ? 'bad' : '';
      return `<li><button data-step="${i}" class="${s && s !== 'run' ? 'done' : ''}" ${i === S.step ? 'aria-current="step"' : ''}><span class="n">${i + 1}</span><span class="t">${st.title}<small>${st.sub}</small></span><span class="dot ${dot}" title="${dot === 'ok' ? 'Matches the thesis' : dot === 'warn' ? 'Within tolerance' : dot === 'bad' ? 'Some numbers differ' : dot === 'run' ? 'Running' : 'Not run'}"></span></button></li>`; }).join('');
  }
  function render() {
    renderRail(); const st = STEPS[S.step];
    $('#main').innerHTML = `<div class="stephead"><span class="eyebrow">Step ${S.step + 1} of ${STEPS.length} · ${st.sub}</span><h2>${st.title}</h2></div>${S.busy ? `<p class="progress">${esc(S.progress)}</p>` : ''}${st.render()}
      <div class="stepnav"><button class="btn" id="prevStep" ${S.step === 0 ? 'disabled' : ''}>← Previous step</button><button class="btn primary" id="nextStep" ${S.step === STEPS.length - 1 ? 'disabled' : ''}>Next step →</button></div>`;
    $('#runStep').disabled = !st.run || S.busy; ls.set('step', S.step);
    const cur = $('#rail [aria-current]'); if (cur && cur.scrollIntoView) { const nav = $('nav.rail'); nav.scrollLeft = Math.max(0, cur.offsetLeft - 16); }
  }
  async function runCurrent() { const st = STEPS[S.step]; if (!st.run || S.busy) return; S.busy = true; $('#runStep').disabled = true; $('#runAll').disabled = true;
    try { await st.run(); } finally { S.busy = false; $('#runAll').disabled = false; render(); } toast(st.title + ': done'); }
  async function runAll() { if (S.busy) return; S.busy = true; $('#runAll').disabled = true; $('#runStep').disabled = true;
    try { for (let i = 0; i < 6; i++) { S.step = i; S.progress = 'Running step ' + (i + 1) + ': ' + STEPS[i].title + '…'; render(); await new Promise((r) => setTimeout(r, 30)); await STEPS[i].run(); } }
    finally { S.busy = false; S.progress = ''; $('#runAll').disabled = false; render(); } toast('All steps done: ' + S.tests.summary.match + ' of ' + S.tests.summary.total + ' thesis numbers match exactly'); }
  function go(i) { if (i < 0 || i >= STEPS.length) return; S.step = i; render(); window.scrollTo({ top: 0 }); }

  // ---------- help, tips, tour ----------
  const HELP = `<h2>Help</h2>
    <p>This program reruns the computational work of the thesis <i>Benchmarking Conventional and AI-Driven Approaches for Joint Transportation–Inventory Optimization in Retail</i> (Lamar University, 2026) in your browser and checks every number the thesis prints.</p>
    <h3>Getting started</h3><ol><li>Press <b>Run all steps</b>. It takes about 20 seconds; the LSTM is the slow part.</li><li>Open step 6 to see how many thesis numbers match, and press <b>Regenerate Chapter IV</b> to rebuild the results chapter from your run.</li><li>Change a parameter in steps 2–4, run step 6 again, and see which thesis numbers move.</li></ol>
    <h3>The steps</h3><ol><li><b>Load the data.</b> Uses the aggregates that Appendix A.3–A.8 produces. Load the raw DataCo CSV to rebuild them here with the same rules.</li><li><b>Forecast.</b> Naive, ARIMA(2,1,2), Holt exponential smoothing, gradient-boosted trees (XGBoost settings) and an LSTM, all written in plain JavaScript. Adds a Diebold–Mariano test.</li><li><b>Cost models.</b> EOQ with separate Standard Class shipping against the joint model, plus the true joint EOQ.</li><li><b>Sensitivity.</b> Table 4.4 for any grid you enter.</li><li><b>Demand variability.</b> CV terciles over products.</li><li><b>Test and regenerate.</b> 78 thesis numbers, 9 model checks, and the regenerated chapter.</li><li><b>Audit findings.</b> What the rerun shows about the study.</li></ol>
    <h3>Keyboard</h3><p><kbd>←</kbd> <kbd>→</kbd> previous or next step · <kbd>1</kbd>–<kbd>7</kbd> jump to a step · <kbd>R</kbd> run this step · <kbd>A</kbd> run all · <kbd>T</kbd> tour · <kbd>?</kbd> help · <kbd>Esc</kbd> close</p>
    <h3>How the engine works</h3><p><b>ARIMA</b> is fitted by exact Gaussian maximum likelihood with a Kalman filter on the differenced series. AR and MA parameters go through the Monahan transform, so every fit is stationary and invertible; Nelder–Mead starts from several points and keeps the best likelihood. <b>Holt</b> smoothing picks α and β (0 ≤ β ≤ α ≤ 1) to minimize the sum of squared one-step errors; the initial level and trend are solved by least squares for each (α, β). <b>Gradient boosting</b> grows 200 depth-3 trees with learning rate 0.05, λ = 1, minimum child weight 1, split candidates at the unique training values and the starting score at the training mean, which is how XGBoost 3.x treats 111 rows. <b>LSTM</b>: one layer of 32 ReLU units, Glorot and orthogonal initialization, forget-gate bias 1, Adam (learning rate 0.001), batch 32, 100 epochs, min–max scaling fitted on training weeks. <b>Cost models</b> follow Appendix A.9 line by line.</p>
    <h3>Tests and tolerances</h3><p>Deterministic results must equal the thesis at the thesis rounding. ARIMA and Holt depend on where the optimizer stops, so they get small tolerances. LSTM depends on the random-number stream, which differs between TensorFlow and this program, so it gets ±0.25 MAPE points (five times the seed spread the thesis reports). The 9 model checks are identities that must hold for any parameter values.</p>
    <h3>Known differences from the thesis</h3><ul><li>Demand-variability group sizes cannot be produced from the published code (765 / 523 / 155 rather than 742 / 540 / 161).</li><li>Exponential Smoothing and ARIMA: this program finds better optima than statsmodels did in a few windows.</li><li>Run times depend on the computer.</li></ul>
    <h3>Questions</h3><p><b>Is the student’s data in here?</b> Only public DataCo aggregates. No student text is stored.</p><p><b>Why does the joint model always choose Standard Class?</b> It has both the lowest fixed and lowest per-km cost, and the model has no lead-time term.</p><p><b>Can I use my own data?</b> Any CSV with the DataCo columns works in step 1. The extension program handles general models.</p>
    <h3>References</h3><p>Harris (1913) for EOQ; Box et al. (2015) for ARIMA; Hyndman and Athanasopoulos (2021) for exponential smoothing; Chen and Guestrin (2016) for XGBoost; Hochreiter and Schmidhuber (1997) for LSTM; Diebold and Mariano (1995) and Harvey, Leybourne and Newbold (1997) for the accuracy test; Constante, Silva and Pereira (2019) for the dataset.</p>`;
  function openHelp() { $('#layer').innerHTML = `<div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Help"><div><div style="display:flex;justify-content:flex-end"><button class="btn" id="closeHelp">Close <kbd>Esc</kbd></button></div>${HELP}</div></div>`; $('#closeHelp').focus(); }
  function closeLayer() { $('#layer').innerHTML = ''; document.querySelectorAll('.pop,.tour,.tour-ring').forEach((e) => e.remove()); }
  function showTip(btn) { document.querySelectorAll('.pop').forEach((e) => e.remove()); const p = document.createElement('div'); p.className = 'pop'; p.textContent = btn.dataset.tip; document.body.appendChild(p);
    const r = btn.getBoundingClientRect(); p.style.top = Math.min(window.innerHeight - p.offsetHeight - 8, r.bottom + 6) + 'px'; p.style.left = Math.max(8, Math.min(window.innerWidth - p.offsetWidth - 8, r.left - p.offsetWidth / 2)) + 'px'; }
  const TOUR = [['#rail', 'Seven steps follow the thesis pipeline. The dot turns green when a step matches the thesis, amber when a result is within tolerance, red when a number differs.'],
    ['#runAll', 'Run all steps with the thesis settings. About 20 seconds.'], ['#runStep', 'Or run only the step on screen after changing its settings.'],
    ['#main .panel', 'Each step opens with its settings. Every panel has a ? button that explains what it shows.'], ['#helpBtn', 'Help covers the method, tolerances and known differences. Press ? at any time.']];
  function tour(i = 0) { document.querySelectorAll('.tour,.tour-ring').forEach((e) => e.remove()); if (i >= TOUR.length) return; const el = $(TOUR[i][0]); if (!el) return tour(i + 1);
    el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); const ring = document.createElement('div'); ring.className = 'tour-ring'; Object.assign(ring.style, { top: r.top - 4 + 'px', left: r.left - 4 + 'px', width: r.width + 8 + 'px', height: Math.min(r.height, window.innerHeight - 40) + 8 + 'px' });
    const box = document.createElement('div'); box.className = 'tour'; box.innerHTML = `<span class="eyebrow">Tour ${i + 1} of ${TOUR.length}</span><p>${TOUR[i][1]}</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="tourEnd">End</button><button class="btn primary" id="tourNext">${i === TOUR.length - 1 ? 'Finish' : 'Next'}</button></div>`;
    document.body.append(ring, box); const top = r.bottom + 12 + box.offsetHeight < window.innerHeight ? r.bottom + 12 : Math.max(8, r.top - box.offsetHeight - 12);
    box.style.top = top + 'px'; box.style.left = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left)) + 'px';
    $('#tourNext').onclick = () => tour(i + 1); $('#tourEnd').onclick = () => tour(99); $('#tourNext').focus(); ls.set('toured', true); }

  // ---------- events ----------
  document.addEventListener('click', (e) => { const t = e.target.closest('button'); if (!t) { document.querySelectorAll('.pop').forEach((p) => p.remove()); if (e.target.id === 'drawer') closeLayer(); return; }
    if (t.dataset.step) go(+t.dataset.step); else if (t.dataset.tip) showTip(t);
    else if (t.id === 'prevStep') go(S.step - 1); else if (t.id === 'nextStep') go(S.step + 1); else if (t.id === 'runStep') runCurrent(); else if (t.id === 'runAll') runAll();
    else if (t.id === 'helpBtn') openHelp(); else if (t.id === 'closeHelp') closeLayer(); else if (t.id === 'tourBtn') tour(0);
    else if (t.id === 'themeBtn') { const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.dataset.theme = dark ? 'light' : 'dark'; }
    else if (t.id === 'useEmbedded') { S.data = window.DATACO; S.source = 'Embedded aggregates of the public DataCo file (built by Appendix A.3–A.8)'; S.fc = S.base = S.sens = S.groups = S.tests = null; S.status = {}; render(); }
    else if (t.id === 'regen') { $('#paperBox').innerHTML = chapterHTML(); toast('Chapter IV regenerated'); }
    else if (t.id === 'copyHtml') copyText(inlineColors(chapterHTML()), 'Chapter HTML');
    else if (t.id === 'copyMd') copyText(chapterMarkdown(), 'Chapter Markdown');
    else if (t.id === 'copyCsv') copyText(['id,location,quantity,thesis,rerun,status', ...S.tests.rows.map((r) => [r.id, r.loc, r.label, r.thesis, r.value, r.status].map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(','))].join('\n'), 'Test table'); });
  document.addEventListener('change', (e) => { if (e.target.id === 'csvFile' && e.target.files[0]) loadCSV(e.target.files[0]); else if (e.target.id === 'tfilter') { S.filter = e.target.value; render(); }
    else if (e.target.id && e.target.id.startsWith('o-')) { const o = S.fcOpt; o.trainShare = +$('#o-share').value; o.lags = +$('#o-lags').value; o.seeds = Array.from({ length: Math.max(1, +$('#o-seeds').value) }, (_, i) => i + 1); o.epochs = +$('#o-epochs').value; o.arima = $('#o-arima').checked; o.lstm = $('#o-lstm').checked; } });
  document.addEventListener('input', (e) => { if (e.target.id === 'pairQ') { S.pairQuery = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#pairQ'); q.focus(); q.setSelectionRange(pos, pos); } });
  document.addEventListener('keydown', (e) => { if (e.target.closest('input,select,textarea')) return; if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') closeLayer(); else if (e.key === 'ArrowRight') go(S.step + 1); else if (e.key === 'ArrowLeft') go(S.step - 1); else if (/^[1-7]$/.test(e.key)) go(+e.key - 1);
    else if (e.key === 'r' || e.key === 'R') runCurrent(); else if (e.key === 'a' || e.key === 'A') runAll(); else if (e.key === 't' || e.key === 'T') tour(0); else if (e.key === '?') openHelp(); });

  S.status.data = 'ok'; render();
  window.__app = { S, runAll };
})();
