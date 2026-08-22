# Deployment Runbook

## 1. GitHub

Push the repository to GitHub. Keep model artifacts required by the API in `models/`, or move them to a private artifact store and update the backend loader.

## 2. Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Copy the project URL and service-role key into Render secrets.
5. Enable Row Level Security and define policies before using real users or data.

## 3. Render backend

1. Create a Blueprint from the repository.
2. Render uses `render.yaml`.
3. Set `CORS_ORIGINS` to the deployed Vercel URL.
4. Confirm `GET /health` returns `status: ok`.
5. Test `/docs`, `/api/v1/score/single`, and `/api/v1/models/active`.

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

GitHub Actions in `.github/workflows/ci.yml` runs Python API tests and the complete frontend build on pushes and pull requests.