# Faithful transcription of the student's Appendix A (A.1-A.11), run headless.
# Only changes: matplotlib Agg backend, DATA_PATH, plt.show() removed, extra exports at the end.
import time, warnings, json, sys
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import sklearn
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.preprocessing import MinMaxScaler
import xgboost as xgb
import statsmodels
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing
SKIP_LSTM = "--no-lstm" in sys.argv
if not SKIP_LSTM:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Input
warnings.filterwarnings("ignore")
REPORT = []
def report(line=""):
    print(line); REPORT.append(str(line))
report(f"pandas {pd.__version__}, numpy {np.__version__}, matplotlib {matplotlib.__version__}")
report(f"scikit-learn {sklearn.__version__}, statsmodels {statsmodels.__version__}, xgboost {xgb.__version__}")

# A.2
DATA_PATH = 'DataCoSupplyChainDataset.csv'
df = pd.read_csv(DATA_PATH, encoding='latin1')
report(f"\nRaw rows: {len(df)}, columns: {df.shape[1]}")
# A.3
rows_before = len(df)
drop_cols = ['Product Description', 'Customer Email', 'Customer Password',
             'Customer Fname', 'Customer Lname', 'Customer Street',
             'Product Image', 'Order Zipcode', 'Customer Zipcode']
df = df.drop(columns=[c for c in drop_cols if c in df.columns])
df['order date (DateOrders)'] = pd.to_datetime(df['order date (DateOrders)'])
df['shipping date (DateOrders)'] = pd.to_datetime(df['shipping date (DateOrders)'])
valid_status = ['COMPLETE', 'CLOSED', 'PENDING', 'PENDING_PAYMENT', 'PROCESSING', 'ON_HOLD']
report(df['Order Status'].value_counts().to_string())
df = df[df['Order Status'].isin(valid_status)]
df = df.dropna(subset=['Latitude', 'Longitude'])
rows_after = len(df)
report(f"\nRows BEFORE cleaning: {rows_before}")
report(f"Rows AFTER cleaning: {rows_after} (dropped {rows_before - rows_after}, {100*(rows_before - rows_after)/rows_before:.1f}%)")
for col in ['Shipping Mode', 'Order Region', 'Market']:
    df[col] = df[col].astype(str).str.strip()
report(f"Date range after cleaning: {df['order date (DateOrders)'].min()} to {df['order date (DateOrders)'].max()}")
report(f"Unique products: {df['Product Card Id'].nunique()}, regions: {df['Order Region'].nunique()}, "
       f"customers: {df['Customer Id'].nunique()}, orders: {df['Order Id'].nunique()}")
# A.4
df['order_week'] = df['order date (DateOrders)'].dt.to_period('W').dt.start_time
weekly_full = df.groupby('order_week')['Order Item Quantity'].sum().sort_index()
monthly_lines = df.groupby(df['order date (DateOrders)'].dt.to_period('M')).size()
report("\nMonthly order lines, last 12 months of the raw data:")
report(monthly_lines.tail(12).to_string())
CUTOFF_DATE = pd.Timestamp('2017-09-30 23:59:59')
df_full = df
df = df[df['order date (DateOrders)'] <= CUTOFF_DATE].copy()
report(f"\nRows after the September 2017 cutoff: {len(df)}")
report(f"Orders after the cutoff: {df['Order Id'].nunique()}")
report(df['Shipping Mode'].value_counts().to_string())
report((100*df['Shipping Mode'].value_counts(normalize=True)).round(2).to_string())
# A.5
HOLDING_COST_RATE = 0.20
ORDERING_COST = 15
WEEKS_PER_YEAR = 52
mode_rate_per_km = {'Standard Class': 0.015, 'Second Class': 0.030, 'First Class': 0.060, 'Same Day': 0.150}
mode_fixed_cost = {'Standard Class': 2.0, 'Second Class': 3.5, 'First Class': 6.0, 'Same Day': 12.0}
# A.6
weekly = df.groupby('order_week')['Order Item Quantity'].sum().sort_index()
ts = weekly.asfreq('W-MON').ffill().bfill().astype(float)
n_filled = int(weekly.asfreq('W-MON').isna().sum())
N_WEEKS = len(ts)
report(f"\nWeekly series: {N_WEEKS} weeks ({ts.index.min().date()} to {ts.index.max().date()}), weeks filled: {n_filled}")
split = int(N_WEEKS * 0.8)
train, test = ts.iloc[:split], ts.iloc[split:]
report(f"Train: {len(train)} weeks, Test: {len(test)} weeks")
# A.7
timings = {}
def rolling_stat_forecast(fit_fn):
    preds = []
    for t in range(split, N_WEEKS):
        history = ts.iloc[:t]
        preds.append(float(fit_fn(history)))
    return np.array(preds)
start = time.time()
arima_pred = rolling_stat_forecast(lambda h: ARIMA(h, order=(2, 1, 2)).fit().forecast(1).iloc[0])
timings['ARIMA'] = time.time() - start
start = time.time()
es_pred = rolling_stat_forecast(lambda h: ExponentialSmoothing(h, trend='add', seasonal=None).fit().forecast(1).iloc[0])
timings['Exponential Smoothing'] = time.time() - start
naive_pred = ts.shift(1).iloc[split:].values
n_lags = 4
def make_lags(vals, n_lags=4):
    X, y = [], []
    for i in range(n_lags, len(vals)):
        X.append(vals[i - n_lags:i]); y.append(vals[i])
    return np.array(X), np.array(y)
X_all, y_all = make_lags(ts.values, n_lags)
split_idx = split - n_lags
X_train, y_train = X_all[:split_idx], y_all[:split_idx]
X_test, y_test = X_all[split_idx:], y_all[split_idx:]
start = time.time()
xgb_model = xgb.XGBRegressor(n_estimators=200, max_depth=3, learning_rate=0.05, random_state=42)
xgb_model.fit(X_train, y_train)
xgb_pred = xgb_model.predict(X_test)
timings['XGBoost'] = time.time() - start
lstm_runs = []
if not SKIP_LSTM:
    scaler = MinMaxScaler(); scaler.fit(ts.values[:split].reshape(-1, 1))
    ts_scaled = scaler.transform(ts.values.reshape(-1, 1)).flatten()
    Xs_all, ys_all = make_lags(ts_scaled, n_lags)
    Xs_train = Xs_all[:split_idx].reshape(-1, n_lags, 1); ys_train = ys_all[:split_idx]
    Xs_test = Xs_all[split_idx:].reshape(-1, n_lags, 1)
    start = time.time()
    for seed in [1, 2, 3, 4, 5]:
        tf.keras.utils.set_random_seed(seed)
        model = Sequential([Input(shape=(n_lags, 1)), LSTM(32, activation='relu'), Dense(1)])
        model.compile(optimizer='adam', loss='mse')
        model.fit(Xs_train, ys_train, epochs=100, verbose=0)
        p = model.predict(Xs_test, verbose=0).flatten()
        lstm_runs.append(scaler.inverse_transform(p.reshape(-1, 1)).flatten())
    timings['LSTM (5 seeds)'] = time.time() - start
actual = test.values
assert np.allclose(actual, y_test)
def metrics(pred):
    mae = mean_absolute_error(actual, pred)
    rmse = np.sqrt(mean_squared_error(actual, pred))
    mape = np.mean(np.abs((actual - pred) / actual)) * 100
    return mae, rmse, mape
results = {'Naive': metrics(naive_pred), 'ARIMA': metrics(arima_pred), 'ES': metrics(es_pred), 'XGBoost': metrics(xgb_pred)}
if lstm_runs:
    lstm_pred = np.mean(lstm_runs, axis=0); results['LSTM'] = metrics(lstm_pred)
    lstm_mapes = [metrics(r)[2] for r in lstm_runs]
    report(f"LSTM MAPE seeds: {[round(m,3) for m in lstm_mapes]} mean {np.mean(lstm_mapes):.2f} SD {np.std(lstm_mapes, ddof=1):.3f}")
report("\n=== Forecast accuracy ===")
for name, (mae, rmse, mape) in results.items():
    report(f"{name:10s} MAE={mae:8.2f} RMSE={rmse:8.2f} MAPE={mape:5.2f}%")
for k, v in timings.items(): report(f"time {k}: {v:.1f}s")
# A.8
pair_units = df.groupby(['Product Card Id', 'Product Name', 'Order Region']).agg(
    total_units=('Order Item Quantity', 'sum'), unit_price=('Product Price', 'mean')).reset_index()
pair_units['mean_weekly_demand'] = pair_units['total_units'] / N_WEEKS
pair_units['annual_demand'] = pair_units['mean_weekly_demand'] * WEEKS_PER_YEAR
demand = pair_units[pair_units['annual_demand'] > 0].copy()
avg_dist = df.groupby(['Product Card Id', 'Order Region']).apply(
    lambda g: np.mean(np.sqrt((g['Latitude'] - g['Latitude'].mean())**2 +
                              (g['Longitude'] - g['Longitude'].mean())**2) * 111)
).reset_index(name='distance_km')
demand = demand.merge(avg_dist, on=['Product Card Id', 'Order Region'], how='left')
demand['distance_km'] = demand['distance_km'].fillna(demand['distance_km'].mean())
report(f"\nPairs: {len(demand)}, price<1: {int((demand['unit_price'] < 1).sum())}")
report(f"Annual demand median {demand['annual_demand'].median():.1f} mean {demand['annual_demand'].mean():.1f} max {demand['annual_demand'].max():.1f}")
report(f"distance_km median {demand['distance_km'].median():.1f} mean {demand['distance_km'].mean():.1f} max {demand['distance_km'].max():.1f}; zero-distance pairs {(demand['distance_km']==0).sum()}")
# A.9
def eoq(D, S, H): return np.sqrt((2 * D * S) / H)
def run_models(data, h_rate=HOLDING_COST_RATE, s_cost=ORDERING_COST, rate_mult=1.0):
    rates = {k: v * rate_mult for k, v in mode_rate_per_km.items()}
    rows = []
    for _, r in data.iterrows():
        D = r['annual_demand']; price = max(r['unit_price'], 1); dist = r['distance_km']
        H = h_rate * price
        Q = eoq(D, s_cost, H)
        sep_inv = (D / Q) * s_cost + (Q / 2) * H
        m0 = 'Standard Class'
        sep_tr = (D / Q) * (mode_fixed_cost[m0] + dist * rates[m0])
        best = (np.inf, None, None, None, None)
        for m, rate in rates.items():
            fixed = mode_fixed_cost[m]
            Qj = eoq(D, s_cost + fixed, H)
            inv_j = (D / Qj) * s_cost + (Qj / 2) * H
            tr_j = (D / Qj) * (fixed + dist * rate)
            if inv_j + tr_j < best[0]:
                best = (inv_j + tr_j, inv_j, tr_j, m, Qj)
        rows.append({'sep_inv': sep_inv, 'sep_tr': sep_tr, 'sep_total': sep_inv + sep_tr, 'sep_Q': Q,
                     'joint_inv': best[1], 'joint_tr': best[2], 'joint_total': best[0], 'joint_mode': best[3], 'joint_Q': best[4]})
    return pd.DataFrame(rows, index=data.index)
def savings_pct(res):
    return 100 * (res['sep_total'].sum() - res['joint_total'].sum()) / res['sep_total'].sum()
base = run_models(demand)
tot_sep, tot_joint = base['sep_total'].sum(), base['joint_total'].sum()
report(f"\nSeparate {tot_sep:,.2f} Joint {tot_joint:,.2f} Savings {tot_sep-tot_joint:,.2f} ({savings_pct(base):.4f}%)")
pair_sav = 100 * (base['sep_total'] - base['joint_total']) / base['sep_total']
report(f"pair savings median {pair_sav.median():.3f} min {pair_sav.min():.3f} max {pair_sav.max():.3f} any {100*(pair_sav>1e-9).mean():.1f}%")
report(base['joint_mode'].value_counts().to_string())
report(f"avg Q sep {base['sep_Q'].mean():.3f} joint {base['joint_Q'].mean():.3f}")
for label, inv, tr in [('Sep', base['sep_inv'].sum(), base['sep_tr'].sum()), ('Joint', base['joint_inv'].sum(), base['joint_tr'].sum())]:
    t = inv + tr; report(f"{label} inv {inv:,.2f} ({100*inv/t:.2f}%) tr {tr:,.2f} ({100*tr/t:.2f}%) total {t:,.2f}")
report(f"Change inv {base['joint_inv'].sum()-base['sep_inv'].sum():+,.2f} tr {base['joint_tr'].sum()-base['sep_tr'].sum():+,.2f}")
# A.10
sens = {'h': [], 's': [], 'm': []}
for h in [0.10, 0.15, 0.20, 0.25, 0.30]:
    v = savings_pct(run_models(demand, h_rate=h)); sens['h'].append((h, v)); report(f"h {h}: {v:.4f}")
for s in [5, 10, 15, 20, 25, 30]:
    v = savings_pct(run_models(demand, s_cost=s)); sens['s'].append((s, v)); report(f"S {s}: {v:.4f}")
for m in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]:
    v = savings_pct(run_models(demand, rate_mult=m)); sens['m'].append((m, v)); report(f"mult {m}: {v:.4f}")
# A.11
pw = df.groupby(['Product Card Id', 'order_week'])['Order Item Quantity'].sum().unstack(fill_value=0)
pw = pw.reindex(columns=ts.index, fill_value=0)
cv = (pw.std(axis=1) / pw.mean(axis=1)).replace([np.inf, -np.inf], np.nan).fillna(0)
groups = pd.qcut(cv.rank(method='first'), q=3, labels=['Low variability', 'Moderate variability', 'High variability'])
demand['scenario'] = demand['Product Card Id'].map(groups)
scen = []
for g in ['Low variability', 'Moderate variability', 'High variability']:
    sub = demand[demand['scenario'] == g]
    v = savings_pct(base.loc[sub.index]); scen.append((g, len(sub), v))
    report(f"{g:22s} n={len(sub):4d} products={int((groups==g).sum())} savings {v:.4f}%")

# ---- exports for the JS apps and audit ----
out = {
  'weekly_full': [[str(k.date()), float(v)] for k, v in weekly_full.items()],
  'weekly': [[str(k.date()), float(v)] for k, v in ts.items()],
  'monthly_tail': [[str(k), int(v)] for k, v in monthly_lines.tail(12).items()],
  'pairs': [[int(r['Product Card Id']), r['Product Name'], r['Order Region'], int(r['total_units']),
             round(float(r['unit_price']), 4), round(float(r['distance_km']), 6)] for _, r in demand.iterrows()],
  'product_week': {str(int(pid)): [int(x) for x in row] for pid, row in pw.iterrows()},
  'preds': {'arima': arima_pred.tolist(), 'es': es_pred.tolist(), 'naive': naive_pred.tolist(), 'xgb': xgb_pred.tolist(),
            'lstm_runs': [r.tolist() for r in lstm_runs]},
  'results': {k: list(v) for k, v in results.items()},
  'cost': {'sep': tot_sep, 'joint': tot_joint, 'sep_inv': base['sep_inv'].sum(), 'sep_tr': base['sep_tr'].sum(),
           'joint_inv': base['joint_inv'].sum(), 'joint_tr': base['joint_tr'].sum(),
           'avgQsep': base['sep_Q'].mean(), 'avgQjoint': base['joint_Q'].mean(),
           'pair_med': pair_sav.median(), 'pair_max': pair_sav.max(), 'pair_min': pair_sav.min(),
           'median_D': demand['annual_demand'].median(), 'mean_D': demand['annual_demand'].mean(), 'max_D': demand['annual_demand'].max()},
  'sens': sens, 'scen': scen,
  'counts': {'raw': rows_before, 'clean': rows_after, 'cut': len(df), 'orders_cut': int(df['Order Id'].nunique())},
  'timings': timings,
}
json.dump(out, open('student_out.json', 'w'))
open('results_summary.txt', 'w').write('\n'.join(REPORT))
