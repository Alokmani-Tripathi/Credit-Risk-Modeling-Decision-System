# Credit Risk Modeling & Decision Platform

Industry-style **end-to-end credit risk lifecycle** on Lending Club data — not a single model notebook.

Aligned to *Credit Risk Modeling Steps*: Build → Validate → Deploy → Monitor, with PD/LGD/EAD and governance.

## What the platform covers

| Phase | Capability |
| --- | --- |
| 1–2 | Business strategy, default definition, KPIs, policy |
| 3–4 | Data load, DQ, EDA, leakage flags, PSI train→test |
| 5–6 | Application-time features, IV, monotone/WoE bins, corr filter, VIF |
| 7–8 | LR (WoE), RF, XGBoost · AUC/Gini/KS · deciles · lift/gains · thresholds |
| 9 | Global SHAP (XGB) · WoE attributions (LR) · local reason codes |
| 10 | PD, assumed LGD/EAD, EL/UL, grades, stress scenarios |
| 11 | Platt / isotonic calibration · ECE · validation checklist |
| 12 | Approve / Refer / Decline · limits · risk-based spread · reason codes |
| 13–14 | Batch scoring · vintage monitoring · data/prediction/performance drift · PSI alerts · registry · governance pack |

## Frontend (Vercel)

Production UI lives in `web/` (Next.js).

```powershell
cd D:\cv-project2\web
npm install
npm run dev
```

Open http://localhost:3000 — workspaces: Overview → Build → Validate → Decide → Monitor → Governance.

Deploy: set Vercel **Root Directory** to `web`.


## Data

Place cleaned Lending Club extract at:

`data/raw/xgb_credit_data_clean.csv`

Excluded as leakage: `grade`, `sub_grade`, `int_rate`.

## Key commands

| Command | Purpose |
| --- | --- |
| `python -m src.train` | Train LR/RF/XGB + IV selection |
| `python -m src.build_platform` | Build DQ, calibration, SHAP, scorecard, monitoring, governance |
| `streamlit run src/app.py` | Full lifecycle UI |

## Cloud architecture

The deployment target is Vercel for the Next.js frontend, Render for the FastAPI service in `backend/`, and Supabase PostgreSQL for persistent portfolio, snapshot, stress-run, and audit data. See [DEPLOYMENT.md](DEPLOYMENT.md) for the runbook.

## Identity

**EL = PD × LGD × EAD**
