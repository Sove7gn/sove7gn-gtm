# SOVE7GN CRM

The growth CRM for organic lead gen on X: a copy of the Aktoria CRM, with Supabase in place of the Google Sheet and Apps Script.

- `crm/` is the site. `crm/index.html` is built from `crm/design/CRM.dc.html` + `crm/src/` by `pnpm build`. Edit `crm/config.json` for the brand, accounts and goals.
- `supabase/` holds the database: each sheet tab is stored row by row in `crm_sheet`, and `crm_call()` does what the Apps Script did. Only emails in `crm_team` can sign in.

## Set up

1. Fill `.env.local` (see `.env.example`). `pnpm env:check` shows what's still empty.
2. `pnpm db:setup` creates the tables and adds the team emails.
3. `pnpm build`, then `pnpm serve` to try it on http://localhost:8787.
4. In Supabase → Authentication → URL Configuration, add the live site URL as Site URL and redirect URL.

`pnpm test` runs the database checks locally on PGlite.
