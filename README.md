# Al Mizan — Legal Investigation Agent (Next.js + Supabase)

React (Next.js App Router) version of the tool, with a real database. Same visual design as the earlier static prototype — same colors, fonts, docket rail, seal motif — now backed by real persistence and a landing page.

## What's real vs. mocked

**Real:** Intake, Research, Court-Routing, Citation Verification, Fact-Consistency — all persisted to Supabase, Tier 1 edits genuinely re-trigger Fact-Consistency + Citation Verification.

**Still mocked:** Drafting, Assembler (their pipeline stages show a timed placeholder), and the drafted document text on the review screen (shows extracted facts, not an actual generated filing).

**Still placeholder, not real legal data:** the Jordan-only stub corpus and stub fee table — labeled as such everywhere they appear, per the earlier agreement to defer the real corpus.

## One-time setup: Supabase

1. Create a project at supabase.com (free tier is fine to start).
2. Open the SQL Editor in the Supabase dashboard (web UI, no terminal).
3. Paste in the contents of `supabase/schema.sql` and run it. This creates the `cases` and `audit_log` tables with row-level security locked to server-only access — this is an internal tool, so there's deliberately no public/anon access path at all.
4. From Project Settings → API, copy the **Project URL** and the **service_role key** (not the anon key — the service role key is what lets the server write to the DB; it must never be exposed to the browser, which is why it only appears in Vercel's environment variables, never in any file you push to GitHub).

## One-time setup: Vercel

1. Push this whole folder to a GitHub repo.
2. Import the repo in Vercel. It auto-detects Next.js — no configuration needed.
3. Add three environment variables (Project → Settings → Environment Variables):
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
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

**How to add a law:** go to `/admin/ingest-law` (no auth yet — treat this URL as sensitive, see limitations below), paste the law's text, name it, and submit. Behind the scenes: Claude splits the raw text into individual articles and strips out anything that isn't statutory text (chapter summaries, website bylines, watermarks — exactly the kind of inserted commentary found in the sample law you shared), each article gets embedded via Voyage AI (`voyage-multilingual-2`, chosen for real Arabic support), and stored in a new `legal_corpus` table in Supabase.

**Every ingested article starts at `extracted-unverified` tier — never `corpus-verified`.** That promotion is a deliberate decision this system does not make automatically; a human needs to check an entry against an authoritative source (ideally the Official Gazette, not a secondary republication) before it should be trusted at citation-grade. The schema supports the tier field for exactly this, but nothing currently sets it to `corpus-verified` — that's intentionally a manual, future step.

**Research now works like this:** embed the claim → vector-search `legal_corpus` for that jurisdiction (via a `match_legal_corpus` Postgres function using pgvector cosine similarity) → if a strong match exists (similarity > 0.5), use it and tag the result `corpusSource: "legal_corpus"` → otherwise fall back to the old stub corpus, tagged `corpusSource: "stub"`. Citation Verification reads that tag and checks against whichever corpus was actually used — real corpus text for real findings, the stub set otherwise. This means verification is always checking against the same source Research actually drew from.

**For your 13 laws:** paste each one in through `/admin/ingest-law`. For long laws (the sample you shared has 110 articles), paste in chapter-sized chunks under the same law name rather than the whole thing in one call — there's a real execution-time and output-size ceiling on a single ingestion request (see `maxDuration` in the route, same Vercel Pro caveat as the PDF report).

**Required setup:** add `VOYAGE_API_KEY` alongside your other environment variables, and run the updated `supabase/schema.sql` (it now includes the `vector` extension, the `legal_corpus` table, and the `match_legal_corpus` function) — if you already ran the original schema, just run the new block; the `create table if not exists` / `create or replace function` statements are safe to re-run.

**Not handled yet:** PDF upload/parsing on the ingestion page — you'll need to paste text, not upload files, for now. For your scanned-image PDFs specifically, that text doesn't exist yet; those would need a vision-extraction pass before they're pasteable text at all. Also not handled: any actual promotion workflow from `extracted-unverified` to `corpus-verified` — right now that would mean manually updating the `tier` column in Supabase after checking an entry.



`GET /api/case/[id]/report-pdf?lang=en|ar` generates a bilingual, RTL-aware PDF via Puppeteer + `@sparticuz/chromium` — a real headless-browser render, not a JS PDF library, which is what makes correct Arabic letter-shaping possible. The "Download PDF Report" button on the Case Package screen links straight to this endpoint using whichever language the UI is currently in.

Sections, in the order requested: header (case ID, generated date, language, "Attorney Review Package — Not Filed"), Parties, Jurisdiction, Claim, Relief Sought, Timeline of Dates (each with its verbatim source anchor), Key Facts, Citations (with verification status pulled from the real Citation Verification result), Consistency/Advisory Flags, and — only if the case has been approved — a short attorney-reviewed note. Every page carries a fixed footer stating CaseCraft did not file or submit anything to any court. Filename: `CaseCraft-Report-{caseId}-{date}.pdf`.

**Important — Vercel plan requirement:** Puppeteer's Chromium cold start plus rendering routinely exceeds Vercel Hobby's hard 10-second function limit. This route sets `maxDuration = 30`, which only takes effect on **Vercel Pro** (Hobby ignores it and stays capped at 10s). Hobby is also restricted to non-commercial use, which matters for a product you intend to charge for. Recommend moving to Pro before relying on this feature.

**No real ownership check yet.** The route fetches a case by id with no auth — same gap noted below. Anyone with a case URL can currently download its report. This is the first thing that should change once auth exists.

**Fonts load from Google Fonts at render time** inside the headless browser (network egress from the Vercel function). This is simple but adds a little latency and a small external dependency; embedding the fonts as base64 is a reasonable future optimization if this becomes a bottleneck.

## Known limitations (unchanged or new)

- No auth yet — anyone with the URL can create cases, use your API keys, download any case's PDF report, and now reach `/admin/ingest-law` to add corpus entries. This is the most urgent item to fix.
- No real PDF/document upload — Intake still reads typed/pasted text, and so does the corpus ingestion page.
- Drafting and Assembler remain mocked.
- Fact-Consistency still checks Intake's raw output, not a real draft's claims, since Drafting isn't built.
- The two placeholder pipeline stages (Drafting, Assembler) use a fixed timer rather than reflecting real work.
- Redaction of sensitive case elements is not implemented — open design question, see chat discussion.
- No tier-promotion workflow (`extracted-unverified` → `corpus-verified`) — currently a manual Supabase edit.
- Coverage in the real corpus depends entirely on what's been ingested — most jurisdictions/laws will still fall back to the stub corpus until you've pasted them in.

## Next step

Auth is overdue now that this has a real database, a public URL, a downloadable report endpoint, AND an admin page that writes to the corpus. That combination is the strongest argument yet for making auth the very next thing, before ingesting the remaining 13 laws through an open URL.
