# Al Mizan — Legal Investigation Agent (Next.js + Supabase)

React (Next.js App Router) version of the tool, with a real database. Same visual design as the earlier static prototype — same colors, fonts, docket rail, seal motif — now backed by real persistence and a landing page.

## What's real vs. mocked

**Real:** Intake, Research, Court-Routing, Citation Verification, Fact-Consistency — all persisted to Supabase, Tier 1 edits genuinely re-trigger Fact-Consistency + Citation Verification.

**Still mocked:** Drafting, Assembler (their pipeline stages show a timed placeholder), and the drafted document text on the review screen (shows extracted facts, not an actual generated filing).

**Still placeholder, not real legal data:** the Jordan-only stub corpus and stub fee table — labeled as such everywhere they appear, per the earlier agreement to defer the real corpus.

## One-time setup: Supabase

1. Create a project at supabase.com (free tier is fine to start).
2. Open the SQL Editor in the Supabase dashboard (web UI, no terminal).
3. Paste in the contents of `supabase/schema.sql` and run it. This creates the `cases`, `audit_log`, and `legal_corpus` tables, associates `cases` with an `owner_id` (the attorney who created it), and sets row-level security. The service role key writes through RLS by design; the anon key can only touch each user's own rows.
4. **Enable Google sign-in.** In the Supabase dashboard: Authentication → Sign In / Providers → enable **Google**, and paste your Google OAuth Client ID and Client Secret (create them at Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs). Set the site URL to your app and add `/auth/callback` as an allowed redirect.
5. From Project Settings → API, copy the **Project URL**, the **anon (public) key**, and the **service_role key**. The service role key is what the server uses to write; it must never be exposed to the browser (it only lives in Vercel environment variables, never in the repo).

## One-time setup: Vercel

1. Push this whole folder to a GitHub repo.
2. Import the repo in Vercel. It auto-detects Next.js — no configuration needed.
3. Add these environment variables (Project → Settings → Environment Variables), then redeploy:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` *(or the Gemini/Cohere/HF keys below — see "Provider / free setup")*
   - `VOYAGE_API_KEY` *(or the alternative embedding keys below — same section)*
4. Deploy.

## Using it

- `/` — the landing page, explains the pipeline and the attorney-only positioning.
- `/investigate` — start a new case (paste a narrative, same as before).
- `/investigate/AM-2026-xxxxx` — the case itself: pipeline view + case package review, now a real URL you can refresh or share, because the case actually lives in the database.

## What changed structurally from the static HTML version

- **Persistence:** a case now survives a page refresh — it's a real row in Supabase, not browser-tab state.
- **Server reads its own state:** Research, Court-Routing, Citation Verification, and Fact-Consistency now fetch the case from Supabase server-side rather than trusting whatever the browser last sent — more correct, and closes a class of bug where client and server could disagree about case facts.
- **Real edit re-verification:** clicking the Tier 1 fact on the review screen now calls a real endpoint that updates the case, and genuinely re-runs Fact-Consistency and Citation Verification against the edited data — not a simulated delay.
- **Landing page:** explains the 8-agent pipeline and the "attorney-assist, not autonomous filing" positioning to anyone who lands on the site before reaching the tool itself.

## Real Legal Corpus (RAG) — new

Research and Citation Verification now check a real, ingested corpus first, and only fall back to the old stub corpus for jurisdictions/laws you haven't ingested yet.

**How to add a law:** go to `/admin/ingest-law` (authenticated but no dedicated admin role yet), paste the law's text, name it, and submit. Behind the scenes: the LLM splits the raw text into individual articles and strips out anything that isn't statutory text (chapter summaries, website bylines, watermarks), each article gets embedded, and stored in a `legal_corpus` table in Supabase.

**Every ingested article starts at `extracted-unverified` tier — never `corpus-verified`.** That promotion is a deliberate decision this system does not make automatically; a human needs to check an entry against an authoritative source (ideally the Official Gazette, not a secondary republication) before it should be trusted at citation-grade. The schema supports the tier field for exactly this, but nothing currently sets it to `corpus-verified` — that's intentionally a manual, future step.

**Research now works like this:** embed the claim → vector-search `legal_corpus` for that jurisdiction (via a `match_legal_corpus` Postgres function using pgvector cosine similarity) → if a strong match exists (similarity > 0.5), use it and tag the result `corpusSource: "legal_corpus"` → otherwise fall back to the old stub corpus, tagged `corpusSource: "stub"`. Citation Verification reads that tag and checks against whichever corpus was actually used — real corpus text for real findings, the stub set otherwise. This means verification is always checking against the same source Research actually drew from.

**For your 13 laws:** paste each one in through `/admin/ingest-law`. For long laws (the sample you shared has 110 articles), paste in chapter-sized chunks under the same law name rather than the whole thing in one call — there's a real execution-time and output-size ceiling on a single ingestion request (see `maxDuration` in the route, same Vercel Pro caveat as the PDF report).

**Required setup:** set the **LLM** and **embedding** providers (see below) and run the updated `supabase/schema.sql` (it includes the `vector` extension, the `legal_corpus` table, and the `match_legal_corpus` function) — the `create table if not exists` / `create or replace function` statements are safe to re-run.

## Cheap / free provider setup

Every agent step and the corpus RAG call a provider, so you can run the whole app on free tiers:

- **LLM** (`LLM_PROVIDER`): `anthropic` (default, needs `ANTHROPIC_API_KEY`) or `gemini` (free tier, needs `GEMINI_API_KEY` from aistudio.google.com; optional `GEMINI_MODEL`, default `gemini-2.5-flash`). Gemini uses Gemini's forced function-calling so structured output behaves the same as Claude's.
- **Embeddings** (`EMBED_PROVIDER`): `voyage` (default, needs `VOYAGE_API_KEY`), `cohere` (free tier, `COHERE_API_KEY` from dashboard.cohere.com), or `huggingface` (free, `HUGGINGFACE_API_KEY` from huggingface.co/settings/tokens, model `BAAI/bge-m3`). **All three return 1024-dim vectors**, identical to the `embedding vector(1024)` column, so switching providers requires no schema change.

Example free setup in Vercel: `LLM_PROVIDER=gemini`, `EMBED_PROVIDER=huggingface`, and the matching keys.

**Not handled yet:** PDF upload/parsing on the ingestion page — you'll need to paste text, not upload files, for now. For your scanned-image PDFs specifically, that text doesn't exist yet; those would need a vision-extraction pass before they're pasteable text at all. Also not handled: any actual promotion workflow from `extracted-unverified` to `corpus-verified` — right now that would mean manually updating the `tier` column in Supabase after checking an entry.

## PDF Case Report

`GET /api/case/[id]/report-pdf?lang=en|ar` generates a bilingual, RTL-aware PDF via Puppeteer + `@sparticuz/chromium` — a real headless-browser render, not a JS PDF library, which is what makes correct Arabic letter-shaping possible. The "Download PDF Report" button on the Case Package screen links straight to this endpoint using whichever language the UI is currently in.

Sections, in the order requested: header (case ID, generated date, language, "Attorney Review Package — Not Filed"), Parties, Jurisdiction, Claim, Relief Sought, Timeline of Dates (each with its verbatim source anchor), Key Facts, Citations (with verification status pulled from the real Citation Verification result), Consistency/Advisory Flags, and — only if the case has been approved — a short attorney-reviewed note. Every page carries a fixed footer stating CaseCraft did not file or submit anything to any court. Filename: `CaseCraft-Report-{caseId}-{date}.pdf`.

**Important — Vercel plan requirement:** Puppeteer's Chromium cold start plus rendering routinely exceeds Vercel Hobby's hard 10-second function limit. This route sets `maxDuration = 30`, which only takes effect on **Vercel Pro** (Hobby ignores it and stays capped at 10s). Hobby is also restricted to non-commercial use, which matters for a product you intend to charge for. Recommend moving to Pro before relying on this feature.

**No real ownership check yet.** The route fetches a case by id with no auth — same gap noted below. Anyone with a case URL can currently download its report. This is the first thing that should change once auth exists.

**Fonts load from Google Fonts at render time** inside the headless browser (network egress from the Vercel function). This is simple but adds a little latency and a small external dependency; embedding the fonts as base64 is a reasonable future optimization if this becomes a bottleneck.

## Login / Auth (Supabase Auth + Google Workspace)

Every page under `/investigate` and `/admin`, and every `/api/case/*` and `/api/corpus/*` endpoint, requires a logged-in attorney. The landing page (`/`) stays public — that's just the explainer page, no case data there.

**How it works, in plain terms:** attorneys sign in with **Google** (their Workspace account) via Supabase Auth — no shared password, each person has their own identity. Logging in once at `/login` redirects to Google, comes back through `/auth/callback`, and the session cookie is set. The session is validated server-side (middleware) on every protected route and endpoint.

**Per-case ownership.** Every case records the `owner_id` of the attorney who created it. Only that attorney can view, edit, approve, or download the report for a case; the audit trail records which attorney took each action. This is enforced in the API routes (403 otherwise), and mirrored by row-level security so even an anon-key client could only touch its own rows. `audit_log` now carries `actor_id` / `actor_email`.

**Required setup:**
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe for the browser) for the OAuth client.
- Google OAuth enabled in Supabase Auth (Client ID + Secret from Google Cloud Console) and `/auth/callback` allowlisted under site redirect URLs.
- Re-run the updated `supabase/schema.sql` so `cases.owner_id` and the `audit_log` actor columns exist.

**Note:** editing is currently open to all logged-in attorneys once a case is created; if you need to restrict who may *edit* (vs. own) a shared case, that's a small addition of a `contributors` column + policy later.

## Known limitations (unchanged or new)

- Individual attorney accounts via Supabase Auth + Google Workspace; per-case ownership enforced (only the creating attorney reads/edits/approves/downloads their cases). Corpus ingestion is gated behind login but not a separate admin role yet.
- No real PDF/document upload — Intake still reads typed/pasted text, and so does the corpus ingestion page.
- Drafting and Assembler remain mocked.
- Fact-Consistency still checks Intake's raw output, not a real draft's claims, since Drafting isn't built.
- The two placeholder pipeline stages (Drafting, Assembler) use a fixed timer rather than reflecting real work.
- Redaction of sensitive case elements is not implemented — open design question, see chat discussion.
- No tier-promotion workflow (`extracted-unverified` → `corpus-verified`) — currently a manual Supabase edit.
- Coverage in the real corpus depends entirely on what's been ingested — most jurisdictions/laws will still fall back to the stub corpus until you've pasted them in.

## Next step

With login now on individual Google accounts, the next reasonable steps are: finish ingesting the 13 laws through `/admin/ingest-law`, decide whether corpus ingestion needs a dedicated admin role, and decide whether shared cases should support multiple *editing* attorneys (a small `contributors` addition).
