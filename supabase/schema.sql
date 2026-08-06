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

-- ============================================================
-- REAL LEGAL CORPUS (RAG) — added when moving beyond the stub
-- corpus toward real, verifiable Jordanian statute data.
-- ============================================================

-- pgvector powers semantic search over corpus entries. Supabase
-- projects support this extension out of the box.
create extension if not exists vector;

create table if not exists legal_corpus (
  id bigint generated always as identity primary key,
  jurisdiction text not null,              -- e.g. 'jordan-civil'
  law_name_ar text,
  law_name_en text,
  article_number text,
  chapter text,
  citation text not null,                  -- e.g. "قانون الضمان الاجتماعي الأردني — المادة 4"
  text_ar text not null,
  text_en text,                            -- optional, if a translation exists
  tier text not null default 'extracted-unverified',
    -- 'extracted-unverified': pulled from a source PDF, cleaned, not yet
    --   spot-checked against an authoritative copy — this is where every
    --   newly ingested law starts.
    -- 'corpus-verified': a human has confirmed this entry against an
    --   authoritative source (Official Gazette or equivalent). Only this
    --   tier should ever be treated as citeable-grade by Drafting once
    --   Drafting is real.
  source_note text,                        -- where this came from, any caveats
  embedding vector(1024),                  -- voyage-multilingual-2 dimension
  created_at timestamptz default now()
);

create index if not exists legal_corpus_embedding_idx
  on legal_corpus using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table legal_corpus enable row level security;
drop policy if exists "no anon access" on legal_corpus;
create policy "no anon access" on legal_corpus for all using (false);

-- Vector similarity search, called via supabase.rpc() from the app —
-- the JS client can't do vector math itself, so this Postgres function
-- does the actual cosine-distance ranking.
create or replace function match_legal_corpus(
  query_embedding vector(1024),
  match_jurisdiction text,
  match_count int default 5
)
returns table (
  id bigint,
  citation text,
  text_ar text,
  tier text,
  source_note text,
  similarity float
)
language sql stable
as $$
  select
    legal_corpus.id,
    legal_corpus.citation,
    legal_corpus.text_ar,
    legal_corpus.tier,
    legal_corpus.source_note,
    1 - (legal_corpus.embedding <=> query_embedding) as similarity
  from legal_corpus
  where legal_corpus.jurisdiction = match_jurisdiction
  order by legal_corpus.embedding <=> query_embedding
  limit match_count;
$$;

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
