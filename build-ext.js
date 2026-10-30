const fs=require('fs');let h=fs.readFileSync('ext-shell.html','utf8');
const rep=(k,f)=>{const t=fs.readFileSync(f,'utf8');if(t.includes('</script'))throw new Error(f);h=h.replace(k,()=>t);};
rep('/*ENGINE*/','engine.js');rep('/*EXTDATA*/','ext-data.js');rep('/*LAB*/','ext-engine.js');rep('/*EXAMPLES*/','examples.js');rep('/*SUITE*/','ext-tests.js');rep('/*APP*/','ext-app.js');
fs.writeFileSync('forecast-to-cost-lab.html',h);console.log('bytes',h.length);
