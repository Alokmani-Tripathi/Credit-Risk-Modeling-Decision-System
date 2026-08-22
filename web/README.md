# Credit Risk Decision Platform (Frontend)

Production-grade Next.js UI for the credit risk lifecycle. Deploy this `web/` app to **Vercel**.

## Workspaces

| Workspace | Routes | Purpose |
| --- | --- | --- |
| Overview | `/` | Champion KPIs, lifecycle map |
| Build | `/build/*` | Business, DQ, IV/VIF, models |
| Validate | `/validate/*` | Evaluation, calibration, SHAP, scorecard, EL, checklist |
| Decide | `/decide/*` | Single decision, batch+PSI, policy |
| Monitor | `/monitor/*` | Vintage dashboard, alerts, drift |
| Governance | `/governance/*` | Registry + governance pack |

## Local run

```powershell
cd D:\cv-project2\web
npm install
npm run dev
```

Open http://localhost:3000

## Sync artifacts after Python retrain

```powershell
cd D:\cv-project2
python -m src.build_platform
# then copy models/*.json (+ woe_bins, batch CSVs) into web/public/artifacts and web/public/batch-examples
```

## Vercel

1. Import the Git repo in Vercel  
2. Set **Root Directory** to `web`  
3. Framework: Next.js  
4. Deploy  

Decision/batch scoring currently runs **client-side** from the WoE scorecard artifacts (transparent LR path). Tree-model live scoring can be added later via a FastAPI backend.
