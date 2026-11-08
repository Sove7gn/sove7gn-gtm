# SOVE7GN CRM

The growth CRM for organic lead gen on X: a copy of the Aktoria CRM, with Supabase in place of the Google Sheet and Apps Script.

- `crm/` is the site. `crm/index.html` is built from `crm/design/CRM.dc.html` + `crm/src/` by `pnpm build`. Edit `crm/config.json` for the brand, accounts and goals.
- `supabase/` holds the database: each sheet tab is stored row by row in `crm_sheet`, and `crm_call()` does what the Apps Script did. Only emails in `crm_team` can sign in.

## Set up

1. Fill `.env.local` (see `.env.example`). `pnpm env:check` shows what's still empty.
2. `pnpm db:setup` creates the tables and adds the team emails.
3. `pnpm build`, then `pnpm serve` to try it on http://localhost:8787.
4. In Supabase → Authentication → URL Configuration, add the live site URL as Site URL and redirect URL.

`pnpm test` runs the database checks locally on PGlite, then the GTM rules (`pnpm test:gtm` runs those alone).

## GTM intelligence (8 Nov)

Leads has four more pages: **Right now** (the Buying Window Radar), **LinkedIn views** (New connections, ICP qualified, Outbound, Midbound, Inbound, Meetings booked, Qualified opportunities, Proposal sent, Won, Lost, Nurture, Disqualified, plus Possible duplicates), **Dashboard**, and an **ICP** section on Setup. Each lead's panel has Intel and Outreach tabs, and the ✦ on a card is a compact intelligence card.

- The rules live in `crm/src/gtm.js` (`window.GTM`, pure functions): the ICP definition, the 100-point evidence-only score (UNKNOWN scores 0, with a confidence and an explanation), relationship (New / Outbound / Midbound / Inbound), acquisition source vs engagement status, buying signals and the radar, outreach drafts, dedupe and analytics.
- Everything a lead knows is stored in `crm_leads.fields.gtm`; the ICP is the `icp` row in `crm_lead_settings`. No new tables or migrations.
- Engagement status is read from the stage (New → New, Contacted / Follow up → Contacted, In talks → Engaged, Call booked → Meeting booked, Qualified → Qualified, Proposal sent → Proposal, Cold lead → Nurture), so the LinkedIn outreach job's stage names keep working. Setup offers to add a "Qualified" stage.
- Nothing sends messages. Drafts are copied and marked sent by hand.
- For scheduled jobs (in the page, like the other `AK.*` calls):
  - `AK.gtm.intelMany(id, {round:{v:'Seed',src:'https://…',at:'2026-11-08'}, …})` saves facts (field keys in `GTM.FIELD`);
  - `AK.gtm.signal(id, {type:'raise'|'hiring'|'founder_post'|'launch'|'expansion', text, at, src})` adds a buying signal;
  - `AK.gtm.touch(id, {dir:'in', type:'reply', ch:'LinkedIn', text})` logs a reply, which moves an outbound lead to Midbound and In talks;
  - `AK.gtm.set(id, 'rel.conn', 'connected')` marks an accepted invite;
  - `AK.gtm.find({linkedin, email, name, company})` checks for a duplicate before creating a lead;
  - `AK.gtm.classify(id)` returns the score, radar and relationship.
- `pnpm mock` (after `pnpm build`) writes `crm/_mock.html`, the page on an in-memory stand-in for Supabase with made-up leads, for trying changes without touching live data (`pnpm serve`, then open /_mock.html).
