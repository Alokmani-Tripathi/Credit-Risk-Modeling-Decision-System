# Credit Risk API

FastAPI service for model scoring, portfolio ingestion, stress testing, and audit events.

## Local run

From the repository root:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app:app --reload --port 8000
```

Health check: `http://localhost:8000/health`

API documentation: `http://localhost:8000/docs`

The service loads the versioned artifacts from `models/`. The current fallback store is process memory for local/demo operation. Run the Supabase schema in `supabase/schema.sql` before replacing that store with database persistence.

Container run:

```powershell
docker build -t credit-risk-api .
docker run --rm -p 8000:8000 credit-risk-api
```

## Deploy on Render

Render detects the root `render.yaml` blueprint. Required environment variables:

- `CORS_ORIGINS`: comma-separated Vercel origin(s)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase key; never expose it to the browser

The free Render service sleeps after inactivity and has ephemeral local storage. Portfolio data must therefore be persisted in Supabase for deployment use.