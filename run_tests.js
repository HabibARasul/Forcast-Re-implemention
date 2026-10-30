// Node runner: regenerates every Chapter IV number from the embedded data and compares it with the thesis.
// Usage: node run_tests.js [--csv path/to/DataCoSupplyChainDataset.csv] [--fast]
const fs = require('fs');
const E = require('./engine.js'), Tests = require('./tests.js');
let data = require('./data.js');
const args = process.argv.slice(2);
const i = args.indexOf('--csv');
if (i >= 0) { const t0 = Date.now(); data = E.prepareFromCSV(fs.readFileSync(args[i + 1]).toString('latin1')); console.log(`Prepared from raw CSV in ${(Date.now() - t0) / 1000}s`, data.log.status); }
const fast = args.includes('--fast');
const t0 = Date.now();
const R = E.runAll(data, fast ? { lstm: false, arima: false } : {});
const res = Tests.evaluate(R, E);
const pad = (s, n) => String(s).padEnd(n);
for (const r of res.rows) console.log(pad(r.status.toUpperCase(), 8), pad(r.id, 16), pad(r.loc, 26), pad(r.label, 46), pad(r.thesis, 10), r.value);
for (const c of res.checks) console.log(c.ok ? 'PASS    ' : 'FAIL    ', pad(c.id, 4), c.label);
console.log('\nSummary', res.summary, `elapsed ${(Date.now() - t0) / 1000}s`);
console.log('DM tests (LSTM vs other):', R.dm && Object.fromEntries(Object.entries(R.dm).map(([k, v]) => [k, { t: +v.stat.toFixed(3), p: +v.p.toFixed(3) }])));
console.log('True joint saving %:', R.trueJoint.tot.savingsPct.toFixed(2), 'groups', R.groups);
fs.writeFileSync('test_results.json', JSON.stringify({ summary: res.summary, rows: res.rows.map(({ get, ...r }) => r), checks: res.checks.map(({ get, ...c }) => c), metrics: R.fc.metrics, dm: R.dm, trueJoint: R.trueJoint.tot }, null, 1));
const failedChecks = res.checks.filter((c) => !c.ok);
process.exit(failedChecks.length ? 1 : 0);
