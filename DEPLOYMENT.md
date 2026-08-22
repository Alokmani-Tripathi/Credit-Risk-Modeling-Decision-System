# Deployment Runbook

## 1. GitHub

Push the repository to GitHub. The Render service loads these versioned runtime
artifacts directly from `models/` at startup:

- `logistic_regression.joblib`
- `schema.json`
- `scorecard.json`
- `woe_bins.json`
- `metrics.json`

They must be committed with the deployment. The remaining generated model files
stay ignored because they are not needed by the API.

## 2. Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Copy the project URL and service-role key into Render secrets.
5. Enable Row Level Security and define policies before using real users or data.

## 3. Render backend

1. Create a Blueprint from the repository.
2. Render uses `render.yaml`.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the Supabase project.
4. Initially set `CORS_ORIGINS=http://localhost:3000`; after Vercel is deployed,
   replace it with the exact Vercel production URL (and any preview origins you
   explicitly intend to allow), then redeploy Render.
5. Confirm `GET /health` returns `status: ok` and `storage: supabase`.
6. Test `/docs`, `/api/v1/score/single`, and `/api/v1/models/active`.

Render can use the native Python settings in `render.yaml` or the repository `Dockerfile`. The native blueprint is the simpler free-tier option.

## 4. Vercel frontend

1. Import the repository.
2. Set the project root directory to `web`.
3. Add `NEXT_PUBLIC_API_BASE_URL=https://your-api.onrender.com`.
4. Redeploy and test the Monitor and Decide workflows.

When `NEXT_PUBLIC_API_BASE_URL` is configured, use `web/src/lib/api.ts` for server-backed calls. Do not put `SUPABASE_SERVICE_ROLE_KEY`, API signing secrets, or private backend credentials in Vercel `NEXT_PUBLIC_*` variables.

## 5. Production hardening

- Move the current backend in-memory portfolio store to Supabase tables.
- Add authentication and role-based authorization.
- Add request rate limits and upload virus/content checks.
- Add model, policy, and scenario version records to every decision.
- Add database-backed audit events and scheduled snapshots.
- Add CI checks for Python tests, TypeScript, build, and dependency scanning.

## Deployment order

1. Commit and push the source and the five API runtime artifacts above.
2. Create Supabase and execute `supabase/schema.sql`.
3. Deploy Render, set the two Supabase secrets, then copy its HTTPS URL.
4. Deploy Vercel with `NEXT_PUBLIC_API_BASE_URL` set to that Render URL.
5. Update Render `CORS_ORIGINS` with the Vercel URL and redeploy it.
6. Verify `/health`, a single decision, a portfolio batch upload, and a stress run.

`SUPABASE_SERVICE_ROLE_KEY` is strictly a Render server secret. Never set it in
Vercel or prefix it with `NEXT_PUBLIC_`.

GitHub Actions in `.github/workflows/ci.yml` runs Python API tests and the complete frontend build on pushes and pull requests.
