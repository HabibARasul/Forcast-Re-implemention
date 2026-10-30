// Example library for the Forecast-to-Cost Lab. Each example is a set of CSV tables.
(function (root) {
  'use strict';
  const D = root.EXT_DATA || (typeof require !== 'undefined' ? require('./ext-data.js') : null);
  const kv = (o) => "key,value\n" + Object.entries(o).map(([k, v]) => `${k},"${v}"`).join("\n");
  const DATACO_MODES = 'mode,fixed_cost,per_km,per_unit,transit_days,capacity\nStandard Class,2,0.015,0,4,0\nSecond Class,3.5,0.03,0,2,0\nFirst Class,6,0.06,0,1,0\nSame Day,12,0.15,0,0,0';
  const THESIS_SET = { name: 'Thesis baseline (DataCo, 1,443 product-region pairs)', weeks_per_year: 52, holding_rate: 0.2, ordering_cost: 15, price_floor: 1, service_level: 0, pipeline_holding: 0, base_mode: 'Standard Class', demand_from: 'items', methods: 'Naive' };
  const EX = [
    { id: 'thesis', group: 'Thesis', title: 'Thesis baseline', about: 'The study as published: 1,443 DataCo product-region pairs, EOQ with Standard Class for the separate policy, the thesis joint rule, and the full joint optimum.',
      expect: 'Separate $367,684; thesis joint $355,822 (3.23%); full joint 16.38% when the distance cost enters the lot size.',
      tables: { settings: kv(THESIS_SET), modes: DATACO_MODES, items: D.pairs } },
    { id: 'thesis-scen', group: 'Thesis', title: 'Thesis sensitivity as scenarios', about: 'Table 4.4 written as scenario rows that edit cells before each run. Compare the thesis joint rule with the full joint optimum under each change.',
      expect: 'Thesis joint: 11.82% at $5 ordering cost, 1.16% at $30, 4.19% at twice the shipping rate.',
      tables: { settings: kv(THESIS_SET), modes: DATACO_MODES, items: D.pairs,
        scenarios: 'scenario,table,key,column,value\nOrdering $5,settings,ordering_cost,value,5\nOrdering $30,settings,ordering_cost,value,30\nHolding 10%,settings,holding_rate,value,0.10\nShipping ×2,modes,*,per_km,x2\nShipping ×0.5,modes,*,per_km,x0.5' } },
    { id: 'thesis-ss', group: 'Thesis', title: 'Thesis plus lead time and safety stock', about: 'The 100 DataCo products with demand and variability from their weekly series, 95% cycle service, in-transit holding and the observed scheduled shipping days. Faster modes can now lower safety stock.',
      expect: 'Mode choice becomes a real trade-off; the full joint policy no longer uses Standard Class for every item.',
      tables: { settings: kv(Object.assign({}, THESIS_SET, { name: 'DataCo products with service level', service_level: 0.95, pipeline_holding: 1, demand_from: 'series', sim_items: 20 })), modes: DATACO_MODES, items: D.products, series: D.productSeries } },
    { id: 'thesis-cap', group: 'Thesis', title: 'Thesis plus vehicle capacity', about: 'Thesis pairs with a 20-unit capacity on Standard and Second Class shipments. Fixed and distance cost are paid per vehicle.',
      expect: 'High-volume pairs split orders across vehicles or move to the uncapacitated modes.',
      tables: { settings: kv(Object.assign({}, THESIS_SET, { name: 'Thesis pairs with vehicle capacity' })), modes: 'mode,fixed_cost,per_km,per_unit,transit_days,capacity\nStandard Class,2,0.015,0,4,20\nSecond Class,3.5,0.03,0,2,20\nFirst Class,6,0.06,0,1,0\nSame Day,12,0.15,0,0,0', items: D.pairs } },
    { id: 'fc2cost', group: 'Thesis', title: 'Forecast-to-cost link', about: 'Closes the thesis’s main gap: each forecast method’s mean forecast sets annual demand and its error spread sets safety stock for the 100 DataCo products. Compare total cost by method.',
      expect: 'Forecast accuracy now has a dollar value; switch forecast_method and rerun.',
      tables: { settings: kv({ name: 'DataCo products, forecast-driven', holding_rate: 0.2, ordering_cost: 15, service_level: 0.95, pipeline_holding: 1, base_mode: 'Standard Class', demand_from: 'forecast', forecast_method: 'Holt', methods: 'Naive;SES;Holt;Croston;GBT;Ensemble', refit_every: 4, train_share: 0.8, sim_items: 15 }), modes: DATACO_MODES, items: D.products, series: D.productSeries,
        scenarios: 'scenario,table,key,column,value\nUse Naive,settings,forecast_method,value,Naive\nUse SES,settings,forecast_method,value,SES\nUse GBT,settings,forecast_method,value,GBT\nUse Ensemble,settings,forecast_method,value,Ensemble' } },
    { id: 'rq4', group: 'Thesis', title: 'RQ4 forecast benchmark, extended', about: 'The thesis series (company-total weekly units) with more methods, MASE, sMAPE, bias and Holm-adjusted Diebold–Mariano tests.',
      expect: 'No method is significantly better than the naive forecast once p-values are adjusted for multiple comparisons.',
      tables: { settings: kv({ name: 'DataCo total weekly demand', methods: 'Naive;SNaive;Mean;MA(4);SES;Holt;Damped;ARIMA(2,1,2);ARIMA(1,0,1);GBT;Ensemble', train_share: 0.8, refit_every: 1, demand_from: 'series' }),
        modes: DATACO_MODES, items: 'item,price,distance_km,series\nAll products,50,2000,TOTAL', series: D.total } },
    // ---- literature benchmarks with known answers ----
    { id: 'eoq', group: 'Benchmark', title: 'Harris EOQ', about: 'One item, D = 1,000 per year, S = $10, H = $0.50 per unit-year, free shipping (Harris 1913).', expect: 'Q* = 200 units; annual cost $100 (ordering $50 + holding $50).',
      tables: { settings: kv({ name: 'Harris EOQ', holding_rate: 0.2, ordering_cost: 10 }), modes: 'mode,fixed_cost\nFree,0', items: 'item,price,annual_demand\nWidget,2.5,1000' } },
    { id: 'penalty', group: 'Benchmark', title: 'EOQ cost penalty', about: 'Ordering cost $10 and a $30 shipment fee. The separate policy sizes lots on $10 only.', expect: 'Separate Q = 200, cost $250; joint Q = 400, cost $200; saving 20%, matching (x + 1/x)/2 with x = 1/2.',
      tables: { settings: kv({ name: 'EOQ penalty', holding_rate: 0.2, ordering_cost: 10 }), modes: 'mode,fixed_cost\nTruck,30', items: 'item,price,annual_demand\nWidget,2.5,1000' } },
    { id: 'baumol', group: 'Benchmark', title: 'Baumol–Vinod mode choice', about: 'Rail, truck and air for one item with safety stock and in-transit holding (Baumol and Vinod 1970). Speed lowers pipeline and safety stock; cost per shipment rises.',
      expect: 'The validation suite checks the chosen mode and cost against an exhaustive search over Q and mode.',
      tables: { settings: kv({ name: 'Baumol–Vinod', holding_rate: 0.25, ordering_cost: 40, service_level: 0.95, pipeline_holding: 1 }), modes: 'mode,fixed_cost,per_km,per_unit,transit_days\nRail,250,0.05,0.4,12\nTruck,450,0.12,0.8,4\nAir,900,0.6,3.0,1', items: 'item,price,annual_demand,distance_km,weekly_sd\nValve body,180,5200,800,35\nGasket kit,12,20000,800,120' } },
    { id: 'truckload', group: 'Benchmark', title: 'Truckload versus LTL', about: 'Full truckload costs $400 per truck of 1,000 units; less-than-truckload costs $80 per shipment plus $0.50 per unit.', expect: 'Exact piecewise-EOQ optimum, checked against a fine grid search.',
      tables: { settings: kv({ name: 'Truckload versus LTL', holding_rate: 0.2, ordering_cost: 50 }), modes: 'mode,fixed_cost,per_unit,capacity\nFTL,400,0,1000\nLTL,80,0.5,0', items: 'item,price,annual_demand\nPallet goods,10,10000\nSlow mover,10,600' } },
    { id: 'speed', group: 'Benchmark', title: 'Value of speed', about: 'Two items, same demand, different value. Safety stock and pipeline holding scale with unit value.', expect: 'The $2,000 item takes the fast mode; the $20 item stays on the slow, cheap mode.',
      tables: { settings: kv({ name: 'Value of speed', holding_rate: 0.25, ordering_cost: 25, service_level: 0.98, pipeline_holding: 1 }), modes: 'mode,fixed_cost,per_unit,transit_days\nGround,20,0.5,7\nExpress,60,4,1', items: 'item,price,annual_demand,weekly_sd\nController board,2000,520,6\nCable set,20,520,6' } },
    { id: 'ar1', group: 'Benchmark', title: 'AR(1) with known φ', about: 'Generated AR(1): mean 200, φ = 0.7, innovation SD 10, 300 weeks.', expect: 'ARIMA(1,0,0) is the right model; its one-step RMSE should be near the innovation SD of 10.',
      tables: { settings: kv({ name: 'AR(1)', methods: 'Naive;Mean;SES;ARIMA(1,0,0);ARIMA(2,1,2)', demand_from: 'series' }), modes: 'mode,fixed_cost\nTruck,20', items: 'item,price,series\nA,10,AR', generators: 'series,model,n,a,b,c\nAR,ar1,300,200,0.7,10' } },
    { id: 'rw', group: 'Benchmark', title: 'Random walk', about: 'Random walk with step SD 20, 200 weeks.', expect: 'Naive is optimal; its RMSE should be near 20.',
      tables: { settings: kv({ name: 'Random walk', methods: 'Naive;Mean;SES;Holt;ARIMA(0,1,0)', demand_from: 'series' }), modes: 'mode,fixed_cost\nTruck,20', items: 'item,price,series\nA,10,RW', generators: 'series,model,n,a,b\nRW,rw,200,500,20' } },
    { id: 'trend', group: 'Benchmark', title: 'Linear trend', about: 'Level 100, slope 2 per week, noise SD 5, 150 weeks.', expect: 'Holt tracks the trend; Naive lags by the slope. Holt RMSE should approach 5.',
      tables: { settings: kv({ name: 'Linear trend', methods: 'Naive;SES;Holt;Damped', demand_from: 'series' }), modes: 'mode,fixed_cost\nTruck,20', items: 'item,price,series\nA,10,TR', generators: 'series,model,n,a,b,c\nTR,trend,150,100,2,5' } },
    { id: 'seasonal', group: 'Benchmark', title: 'Seasonal demand', about: 'Level 100, amplitude 30, 13-week season, noise SD 5, 156 weeks.', expect: 'Seasonal naive beats naive and SES by a wide margin.',
      tables: { settings: kv({ name: 'Seasonal', methods: 'Naive;SNaive;SES;Holt;GBT', season: 13, lags: 13, demand_from: 'series' }), modes: 'mode,fixed_cost\nTruck,20', items: 'item,price,series\nA,10,SE', generators: 'series,model,n,a,b,c,d\nSE,seasonal,156,100,30,13,5' } },
    { id: 'intermittent', group: 'Benchmark', title: 'Intermittent demand', about: 'Demand occurs in 25% of weeks with gamma(2, 4) sizes (Croston 1972).', expect: 'Croston and SES beat Naive on MASE; MAPE is undefined in zero weeks and is skipped there.',
      tables: { settings: kv({ name: 'Intermittent', methods: 'Naive;Mean;SES;Croston;Croston(0.2)', demand_from: 'series' }), modes: 'mode,fixed_cost\nTruck,20', items: 'item,price,series\nSpare,40,IN', generators: 'series,model,n,a,dist\nIN,intermittent,200,0.25,gamma(2 4)'.replace('gamma(2 4)', 'gamma(2, 4)') } },
    { id: 'const', group: 'Benchmark', title: 'Constant demand simulation', about: 'Constant 50 units a week, integer lead time, no variability. The (r, Q) simulation must reproduce the textbook sawtooth.', expect: 'Fill rate 100%; average end-of-week stock = SS + (Q − d)/2 for Q a multiple of d.',
      tables: { settings: kv({ name: 'Constant demand', holding_rate: 0.2, ordering_cost: 125, sim_weeks: 104, sim_reps: 2 }), modes: 'mode,fixed_cost,transit_days\nTruck,0,14', items: 'item,price,annual_demand,weekly_sd\nBox,10,2600,0' } },
    // ---- showcases (fictional data, clearly labeled) ----
    { id: 'gulf', group: 'Showcase', title: 'Gulf Coast MRO parts (fictional)', about: 'A fictional maintenance-parts warehouse serving refineries: high-value, slow-moving items, 99% service, truck, LTL and expedited air. Scenarios cover fuel prices, hurricane-season lead times and electronic ordering.',
      expect: 'Expensive items move to faster modes; the hurricane scenario raises safety stock most for long-lead items.',
      tables: { settings: kv({ name: 'Gulf Coast MRO (fictional)', holding_rate: 0.22, ordering_cost: 60, service_level: 0.99, pipeline_holding: 1, sim_items: 8, sim_reps: 20 }),
        modes: 'mode,fixed_cost,per_km,per_unit,transit_days,capacity\nLTL,95,0.35,0.6,5,0\nFTL,650,1.4,0,3,400\nAir,180,0,12,1,0',
        items: 'item,price,annual_demand,distance_km,weekly_sd,lead_days,demand_dist\nPump seal kit,850,180,420,2.1,10,gamma(1.2, 2.9)\nControl valve,4200,36,420,0.9,21,pois(0.7)\nGasket assortment,65,2600,420,14,5,norm(50, 14)\nInstrument transmitter,2900,60,680,1.3,14,pois(1.15)\nBolting set,22,9100,250,40,3,norm(175, 40)\nHeat-exchanger tube bundle,18500,4,680,0.3,35,pois(0.08)\nLubricant drum,310,780,250,5,4,norm(15, 5)\nPPE carton,48,5200,120,22,2,norm(100, 22)',
        scenarios: 'scenario,table,key,column,value\nFuel +30%,modes,*,per_km,x1.3\nHurricane season,items,*,lead_days,x2\nEDI ordering,settings,ordering_cost,value,15\nService 95%,settings,service_level,value,0.95' } },
    { id: 'grocery', group: 'Showcase', title: 'Regional grocery DC (fictional)', about: 'A fictional regional grocery distribution center with seasonal, trending and steady items, generated from known models, run through the full forecast-to-cost pipeline.',
      expect: 'SNaive wins on the seasonal item, Holt on the trending one; the cost model uses each forecast and its error.',
      tables: { settings: kv({ name: 'Regional grocery (fictional)', holding_rate: 0.3, ordering_cost: 20, service_level: 0.97, pipeline_holding: 1, demand_from: 'forecast', forecast_method: 'Ensemble', methods: 'Naive;SNaive;SES;Holt;Ensemble', season: 13, refit_every: 2, sim_items: 4 }),
        modes: 'mode,fixed_cost,per_km,per_unit,transit_days,capacity\nReefer FTL,380,1.1,0,2,1200\nReefer LTL,90,0.4,0.25,4,0',
        items: 'item,price,distance_km,series\nBottled water case,4.5,300,WATER\nSeasonal produce,2.2,300,PRODUCE\nPlant-based milk,3.1,300,MILK\nCanned soup,1.4,300,SOUP',
        generators: 'series,model,n,a,b,c,d\nWATER,seasonal,156,900,350,13,60\nPRODUCE,seasonal,156,1500,600,13,120\nMILK,trend,156,200,4,25\nSOUP,ar1,156,700,0.6,60' } },
    { id: 'apparel', group: 'Showcase', title: 'DataCo apparel, policy comparison', about: 'The 100 DataCo products with a service target, comparing all three policies under the thesis sensitivity changes plus a capacity limit.',
      expect: 'The gap between the thesis joint rule and the full joint optimum is widest when shipping is expensive.',
      tables: { settings: kv({ name: 'DataCo products, policies', holding_rate: 0.2, ordering_cost: 15, service_level: 0.95, pipeline_holding: 1, base_mode: 'Standard Class', demand_from: 'series', sim_items: 10 }), modes: DATACO_MODES, items: D.products, series: D.productSeries,
        scenarios: 'scenario,table,key,column,value\nOrdering $5,settings,ordering_cost,value,5\nShipping ×2,modes,*,per_km,x2\nCapacity 30,modes,Standard Class,capacity,30\nCapacity 30,modes,Second Class,capacity,30' } },
  ];
  const API = { EXAMPLES: EX };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Examples = API;
})(typeof window !== 'undefined' ? window : globalThis);
