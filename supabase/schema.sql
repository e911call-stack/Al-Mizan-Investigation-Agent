-- Run this once in your Supabase project's SQL Editor (Supabase dashboard,
-- no terminal needed) before deploying. Creates the two tables the app
-- needs: cases (the shared case-state object from the PRD) and audit_log.

create table if not exists cases (
  id text primary key,                          -- e.g. AM-2026-04217 (docket-style id)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  pipeline_started_at timestamptz default now(), -- anchors the simulated timing for stages still mocked

  status text default 'intake_pending',          -- intake_pending | needs_clarification | processing | ready_for_review | approved

  case_facts_raw text,                           -- the narrative text Intake read
  jurisdiction_signal text,
  claim_type text,
  claim_value_estimate numeric,
  claim_value_currency text,

  extracted jsonb,                               -- Intake Agent output (parties, keyDates w/ source anchors, ambiguities)
  research jsonb,                                 -- Research Agent output (stub-corpus findings)
  routing jsonb,                                  -- Court-Routing Agent output (stub fee table lookup)
  citation_verification jsonb,                    -- Citation Verification Agent output
  fact_consistency jsonb,                         -- Fact-Consistency Agent output (tiered)
  draft jsonb,                                    -- still mocked — placeholder for the eventual Drafting Agent output

  review_status text default 'pending',           -- pending | approved
  approved_at timestamptz,

  case_state_version text default '1.0'
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  case_id text references cases(id) on delete cascade,
  ts timestamptz default now(),
  agent text,
  action text
);

create index if not exists audit_log_case_id_idx on audit_log(case_id);

-- This is an internal attorney/office tool, not client- or public-facing —
-- so there is no anonymous read/write path at all. The server-side service
-- role key (used by every API route) bypasses RLS by design in Supabase;
-- these policies exist to make sure nothing else can touch the data.
alter table cases enable row level security;
alter table audit_log enable row level security;

drop policy if exists "no anon access" on cases;
create policy "no anon access" on cases for all using (false);

drop policy if exists "no anon access" on audit_log;
create policy "no anon access" on audit_log for all using (false);
