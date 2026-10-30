import json, numpy as np, pandas as pd
from scipy import stats
o=json.load(open('student_out.json'))
P=pd.DataFrame(o['pairs'],columns=['pid','name','region','units','price','dist'])
P['D']=P.units/144*52
S=15;F=2;r=0.015;h=0.2
H=h*P.price.clip(lower=1);K=S+F+P.dist*r
Qs=np.sqrt(2*P.D*S/H);Qj=np.sqrt(2*P.D*(S+F)/H);Qt=np.sqrt(2*P.D*K/H)
tc=lambda Q:(P.D/Q)*K+Q*H/2
sep,joint,true=tc(Qs).sum(),tc(Qj).sum(),tc(Qt).sum()
print('sep',sep,'joint',joint,'trueopt',true)
print('student joint savings %.4f, true joint-opt savings %.4f%%, $%.0f'%(100*(sep-joint)/sep,100*(sep-true)/sep,sep-true))
# closed form per pair
x=np.sqrt(S/K); cf=1-1/(0.5*(x+1/x)); 
xj=np.sqrt((S+F)/K); pen=0.5*(xj+1/xj)
cfj=1-pen/(0.5*(x+1/x))
ps=100*(tc(Qs)-tc(Qj))/tc(Qs)
print('closed-form max abs err per pair', np.max(np.abs(ps-100*cfj)))
print('corr savings% vs distance', np.corrcoef(ps,P.dist)[0,1], 'vs D', np.corrcoef(ps,P.D)[0,1])
# DM tests
w=pd.DataFrame(o['weekly'],columns=['d','y']); a=w.y.values[115:]
pr=o['preds']; lstm=np.mean(pr['lstm_runs'],axis=0)
def dm(e1,e2,loss=lambda e:e**2):
    d=loss(e1)-loss(e2); n=len(d); T=d.mean()/np.sqrt(d.var(ddof=0)/n)
    # HLN correction h=1
    T*=np.sqrt((n+1-2+0)/n); p=2*stats.t.sf(abs(T),n-1); return T,p
for nm,p in [('ARIMA',pr['arima']),('Naive',pr['naive']),('ES',pr['es']),('XGB',pr['xgb'])]:
    for lossn,loss in [('sq',lambda e:e**2),('abs',np.abs)]:
        T,pv=dm(a-lstm,a-np.array(p),loss); print(f'DM LSTM vs {nm} {lossn}: t={T:.3f} p={pv:.3f}')
# ES without/with initialization variants
from statsmodels.tsa.holtwinters import ExponentialSmoothing
ts=w.y.values
for kw in [dict(),dict(initialization_method='estimated'),dict(initialization_method='heuristic'),dict(initialization_method='legacy-heuristic')]:
    pp=[ExponentialSmoothing(ts[:t],trend='add',**kw).fit().forecast(1)[0] for t in range(115,144)]
    e=a-np.array(pp); print('ES',kw,round(np.abs(e).mean(),2),round(np.sqrt((e**2).mean()),2),round(100*np.mean(np.abs(e)/a),2))
# group variants
pw=pd.DataFrame(o['product_week']).T
cv=(pw.std(axis=1)/pw.mean(axis=1)).fillna(0)
for lab,c in [('ddof1',cv),('ddof0',pw.std(axis=1,ddof=0)/pw.mean(axis=1))]:
  for m in ['first','average']:
    g=pd.qcut(c.rank(method=m),3,labels=['L','M','H'])
    P['g']=P.pid.astype(str).map(g); print(lab,m,P.g.value_counts().reindex(['L','M','H']).tolist())
nz=pw.replace(0,np.nan); c2=(nz.std(axis=1)/nz.mean(axis=1)).fillna(0)
g=pd.qcut(c2.rank(method='first'),3,labels=['L','M','H']); P['g']=P.pid.astype(str).map(g); print('nonzero weeks',P.g.value_counts().reindex(['L','M','H']).tolist())
print('products in window',len(pw),' products all', 118)
