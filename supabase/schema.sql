-- Persistent schema for the credit-risk API. Enable RLS before production use.
create table if not exists model_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  champion_model text not null,
  calibration_method text,
  feature_columns jsonb not null,
  metrics jsonb,
  created_at timestamptz not null default now()
);

create table if not exists batch_uploads (
  id uuid primary key default gen_random_uuid(),
  source_batch text not null,
  scored_count integer not null,
  approved_count integer not null,
  declined_count integer not null,
  model_version text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references batch_uploads(id),
  application_id text,
  model_version text not null,
  policy_version text not null default 'config.yaml',
  loan_amnt numeric not null,
  ead numeric not null,
  pd numeric not null,
  lgd numeric not null,
  expected_loss numeric not null,
  unexpected_loss numeric not null,
  risk_grade text not null,
  credit_score numeric,
  dti numeric,
  created_at timestamptz not null default now()
);

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  model_version text not null,
  metrics jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists stress_runs (
  id uuid primary key default gen_random_uuid(),
  portfolio_snapshot_id uuid references portfolio_snapshots(id),
  scenario_name text not null,
  assumptions jsonb not null,
  baseline_metrics jsonb not null,
  stressed_metrics jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);