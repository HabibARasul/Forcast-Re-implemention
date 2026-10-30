# Thesis Software – Reimplementation

**Thesis:** Benchmarking Conventional and AI-Driven Approaches for Joint Transportation-Inventory Optimization in Retail
**Author:** Sheikh Sad Habib-A-Rasul, M.S. Industrial Engineering, Lamar University

## Live demo
- Home: https://habibarasul.github.io/Forcast-Re-implemention/
- Forecast-to-Cost Lab: https://habibarasul.github.io/Forcast-Re-implemention/forecast-to-cost-lab.html
- DataCo Joint Cost Rerun: https://habibarasul.github.io/Forcast-Re-implemention/dataco-rerun.html

## Run locally
Open the folder in VS Code and use the Live Server extension on `index.html`,
or run `py -m http.server 8000` and open http://localhost:8000

## Rebuild the apps from source (Node.js)
- `node build.js` → builds `dataco-rerun.html` from shell.html + data.js + engine.js + tests.js + app.js
- `node build-ext.js` → builds `forecast-to-cost-lab.html` from ext-*.js files
- `node run_tests.js` → regenerates the Chapter IV numbers and compares them with the thesis
