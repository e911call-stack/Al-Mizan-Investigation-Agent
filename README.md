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

## Known limitations (unchanged or new)

- No auth yet — anyone with the URL can create cases and use your API keys. Worth adding before sharing this beyond your own testing.
- No real PDF/document upload — Intake still reads typed/pasted text.
- Drafting and Assembler remain mocked.
- Citation Verification and Fact-Consistency still check Research/Intake's raw output, not a real draft's claims, since Drafting isn't built.
- The two placeholder pipeline stages (Drafting, Assembler) use a fixed timer rather than reflecting real work, since there's no real work happening there yet.

## Next step

Auth is the most pressing gap now that this has a real database and a public URL — worth doing before Drafting, so nothing gets built on top of an open door.
