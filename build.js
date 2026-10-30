const fs=require('fs');let h=fs.readFileSync('shell.html','utf8');
const rep=(k,f)=>{const t=fs.readFileSync(f,'utf8');if(t.includes('</script'))throw new Error(f+' contains </script');h=h.replace(k,()=>t);};
rep('/*DATA*/','data.js');rep('/*ENGINE*/','engine.js');rep('/*TESTS*/','tests.js');rep('/*APP*/','app.js');
fs.writeFileSync('dataco-rerun.html',h);console.log('bytes',h.length);
