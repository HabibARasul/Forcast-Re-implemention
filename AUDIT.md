# Computation audit (executed 2026-10-13)

Data: DataCoSupplyChainDataset.csv (180,519 x 53, md5 66ac372e9390a590654f4f0fc0367e3b), public copy matching the Kaggle/Mendeley v5 file.
Environment: Python 3, pandas, numpy, statsmodels 0.15.0, xgboost 3.4.1, tensorflow 2.21.0 (same versions the thesis reports).
Method: Appendix A transcribed verbatim (audit/student.py) and run end to end; independent JS reimplementation (engine.js); closed-form EOQ identity.

## Reproduced exactly
- Raw 180,519; cleaned 170,872; dropped 9,647 (5.3%): SUSPECTED_FRAUD 4,062, CANCELED 3,692, PAYMENT_REVIEW 1,893.
- 118 products, 23 regions, 20,159 customers, 62,193 orders; after cutoff 162,775 lines, 54,246 orders.
- Table 4.1 monthly counts (all 12 rows). Means 4,900 and 2,024 (drop 58.7%, "about 59%").
- Mode shares 59.73 / 19.55 / 15.34 / 5.38 (thesis 59.7 / 19.5 / 15.3 / 5.4).
- 144 weeks, 0 filled, 115 train / 29 test.
- Table 4.2: Naive, ARIMA, XGBoost, LSTM rows exact to 2 decimals; LSTM seed MAPEs 4.54-4.68, SD 0.05.
- Costs: Separate $367,683.58; Joint $355,822.42; saving $11,861.16 = 3.2259%; inventory +$326.69; transport -$12,187.85; shares 45.36/54.64 and 46.96/53.04.
- Pair savings: median 3.207%, max 4.415%, all 1,443 positive; average Q 9.93 -> 10.57; all pairs Standard Class.
- Annual demand median 11.6, mean 88.9, max 4,172.3.
- Table 4.4: every value exact (3.23 all h; 11.82, 5.46, 3.23, 2.15, 1.54, 1.16; 2.24, 2.81, 3.23, 3.55, 3.81, 4.19).

## Discrepancies
1. Table 4.2 Exponential Smoothing row: thesis 112.17 / 147.49 / 4.98; rerun of the student's own code gives 111.99 / 147.45 / 4.97. Small; likely a different run or library build. (Ch. IV Table 4.2; Abstract does not cite ES.)
2. Section 4.10 / Figure 4.6 group sizes: thesis 742 / 540 / 161 pairs with 3.25 / 3.17 / 3.13%; rerun of A.11 gives 765 / 523 / 155 pairs with 3.24 / 3.18 / 3.12%. Same with rank 'average' and ddof 0/1. Percentages round to within 0.01 but the counts cannot be reproduced from the appendix code. Terciles are over 100 products present in the window (34/33/33), not the 118 products stated in 3.4.1.
3. Timings (Section 4.4): thesis 0.1 / 1.4 / 11.8 / 40.5 s; rerun 0.1 / 0.6 / 3.2 / 29.4 s. Machine-dependent; report the hardware or drop exact times.
4. Code report labels say "Table 4.1" for forecast accuracy and "Table 4.2" for the cost breakdown; the thesis numbers them 4.2 and 4.3.

## Modeling findings (numbers are right, but they do not mean what the text says)
5. The "joint" model is not jointly optimal. Its lot size uses S + F but leaves out the distance cost d*r, which is also paid per shipment. The true joint EOQ uses K = S + F + d*r. With that, the saving is 16.38% ($60,221), five times the reported 3.23%. The reported saving is the EOQ cost penalty of ignoring part of the per-order cost, not the value of joint planning.
6. Closed form: each pair's saving depends only on S, F and d*r: saving = 1 - g(sqrt((S+F)/K)) / g(sqrt(S/K)), g(x) = (x + 1/x)/2. It does not depend on demand D or holding cost H. JS closed form matches the per-pair savings to 5e-14. Hence (a) holding-rate invariance is an identity, (b) demand variability can only enter through the distance mix of each group (corr. of pair saving with distance 0.95), so the RQ2 variability analysis cannot find an effect by construction.
7. Mode choice is vacuous. Standard Class has both the lowest fixed and per-km cost, so it dominates for every pair under any parameter values tested; RQ "chooses order quantity and shipping mode together" never exercises the mode decision.
8. Distance proxy uses DataCo "Latitude/Longitude", which the dataset's own description file defines as the location of the store, not the delivery location. The proxy is the spread of store coordinates among customers who ordered a product to a region (median 2,247 km; 54 pairs at 0 km). It is not a shipment distance.
9. ARIMA(2,1,2): statsmodels warned of non-invertible start values in every window and of non-convergence in three; 13 of 29 fits end with an MA root at the invertibility boundary (theta2 = -0.999). At t = 115 statsmodels' own log-likelihood is higher at the JS optimum (-727.14) than at its reported fit (-728.65). With better fits ARIMA MAPE is 4.80 (vs 4.75). Ranking is unchanged.
10. Holt ES: in one window (t = 130) statsmodels stopped at a local optimum (SSE 2,571,966 vs 2,563,448 found by the JS global search). ES MAPE becomes 5.06.
11. No accuracy difference is significant except against XGBoost. Diebold-Mariano (HLN, h = 1), LSTM vs ARIMA p = 0.81 (squared) / 0.65 (absolute); vs Naive p = 0.72 / 0.58; vs ES p = 0.34; vs XGBoost p = 0.005 / 0.010. The thesis says no test was done; with the test, "LSTM was the most accurate" is not supported.
12. Asymmetric protocol: ARIMA and ES are refit every week; XGBoost and LSTM are trained once on weeks 1-115. Stated in 3.3.3, but it favors the statistical models' adaptivity and should be named as a limitation.
13. Annual demand = units / 144 x 52, but week 1 (Dec 29 2014) has 4 days of data and week 144 has 6 days, so about 143.4 effective weeks; annual demand is understated by about 0.4% (dollar totals by about 0.2%; savings % unchanged because the saving does not depend on D).
14. MAPE is computed on the company-total weekly series (about 2,500 units/week), while the cost models run at product-region level with median annual demand 11.6 units. The forecasting stage and cost stage share no inputs.

## Independent checks
- JS engine (engine.js) reproduces: cleaning counts, all cost totals to 1e-9, sensitivity table exactly, XGBoost predictions to 0.001 units (float32), Naive exactly, LSTM ensemble MAPE 4.55 vs 4.59 (different random streams), seed SD 0.044 vs 0.052.
