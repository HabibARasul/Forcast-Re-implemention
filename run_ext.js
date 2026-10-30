const S=require('./ext-tests.js');const t0=Date.now();
const r=S.runSuite({onProgress:(x)=>process.stderr.write(x+' ')});
console.log('\n');for(const x of r.results) console.log((x.ok?(x.gap?'GAP ':'PASS'):'FAIL'),x.cat.padEnd(12),x.id.padEnd(22),x.name.slice(0,80),'|',String(x.got).slice(0,140));
console.log('failed',r.failed.length,'of',r.results.length,'in',(Date.now()-t0)/1000,'s');
