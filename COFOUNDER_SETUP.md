# Your own copy of the SOVE7GN GTM system (setup guide for Claude Code)

This guide is for the co-founder's Claude Code session. It turns a copy of this repo into a **completely separate system** for the co-founder's own LinkedIn and X accounts. The copy gets its own GitHub repo, CRM site, Supabase project (database and server bots), Chrome extension and bot key. When it is done, nothing is shared with Reyansh's system and nothing can interfere with it.

The day-to-day guide (how to use the CRM, posting, the sales pipelines, the DM templates, the speed limits and the rules) is the handoff doc Reyansh sends. This file covers only the build.

## How to start

Open Claude Code in an empty folder and say:

> Read COFOUNDER_SETUP.md in https://github.com/sove7gn/sove7gn-gtm and build my own separate copy of this system, step by step. Ask me for the values you need.

## Rules for the session doing this

1. **Never touch Reyansh's system.** Never push to `sove7gn/sove7gn-gtm`. Never use his Supabase project (ref `rmadxyyvdiqdujuwecdt`), his `.env.local`, his bot key or his extension folder. If a value or file looks like it came from his setup, stop and ask.
2. **Never print or commit secrets.** Keys live only in `.env.local`, which is gitignored. Print variable names, never values.
3. **Test each step before moving on.** The checks are listed under each step.
4. **Change only what this guide lists.** The pipelines, templates, pacing and rules are the ones the co-founder is meant to run. Don't redesign them.

## What to ask the co-founder for first

| What | Used for |
| --- | --- |
| First and full name, as they should appear in messages | Replaces "Reyansh" in prompts, templates and the CRM |
| X handle | X bot identity, X lead finder (`SELF`), the CRM's accounts |
| LinkedIn profile URL | `crm/config.json` → `automation.linkedin_profile` |
| Call booking link (cal.com or similar) | `CAL` in `li-bot`, the link in messages |
| A few true facts about him (role at SOVE7GN, age if he wants it, background) | `POST_RULES` and `OUR_FACTS` in `x-grow` (what X posts may say about him) |
| GitHub account or org for the new repo, and the repo name | The CRM's public site, `https://<owner>.github.io/<repo>/` |
| A login email for the CRM (any address he controls, e.g. `crm-<name>@sove7gn.org`) | `teamLogin` in `crm/config.json`; the passcode signs in to it |

He also creates these accounts himself. Never use Reyansh's.

- **A new Supabase project** (supabase.com, free plan works to start). Copy into `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL` (session pooler, port 5432)
  - `SUPABASE_ACCESS_TOKEN` (Account → Access Tokens)
- **Composio** (composio.dev): `COMPOSIO_API_KEY`. Connect **Exa** in Composio, since lead finding and research run through it. Its LLM writes drafts, about $5 a day. Connect **Gmail** too if he wants calls in the daily brief.
- **Exa** (dashboard.exa.ai): `EXA_API_KEY`.
- **Apify** (apify.com): `APIFY_TOKEN`. The deploy script for post tracking requires it.
- **Optional:**
  - `TWITTERAPI_KEY` (twitterapi.io) for extra X reading. The extension does the main X reading without it.
  - cal.com webhook. `deploy-li-bot.mjs` prints the secret to paste, so booked calls land on the lead.

## Step 1. Make the new repo (a fresh copy, not a fork)

```bash
git clone https://github.com/sove7gn/sove7gn-gtm.git <repo>
cd <repo>
rm -rf .git
git init -b main
```

Then create his repo and connect it:

```bash
gh repo create <owner>/<repo> --public --source . --remote origin
```

GitHub Pages on a private repo needs a paid GitHub plan; public is fine. No secrets are ever committed, and the Supabase anon key in the built page is public by design.

Delete files that belong only to Reyansh's history: none of `_research/`, `_kit/`, `vsl/` or `.env.local` are in the repo (they're gitignored). If any appear, don't copy them.

**Check:** `git remote -v` shows only his repo, and no `sove7gn/sove7gn-gtm`.

## Step 2. `.env.local`

Copy `.env.example` to `.env.local` and fill it with his values from the first section. Leave `LINKEDIN_SHEET_ID` and `CRM_TEAM_EMAILS` empty except for his login email. The deploy scripts add `CRON_SECRET`, `LI_BOT_TOKEN`, `CAL_WEBHOOK_SECRET` and `VISITOR_KEY` themselves.

**Check:** `pnpm install`, then `pnpm env:check`.

## Step 3. Point every hard-coded spot at his system

These places name Reyansh's backend, site or identity. Change each one, then run the grep checks at the end of this step.

**His backend and site.** Use his Supabase project URL and his Pages URL.

| File | What | Change to |
| --- | --- | --- |
| `extension/background.js` (line ~12) | `const FN = "https://rmadxyyvdiqdujuwecdt.supabase.co/functions/v1/li-bot"` | his project's `/functions/v1/li-bot` |
| `extension/popup.js` | "Open CRM" link `https://sove7gn.github.io/sove7gn-gtm/` | his Pages URL |
| `extension/manifest.json` | `name` "SOVE7GN Outreach Bot" | e.g. "SOVE7GN Outreach Bot (<First>)", so Chrome never confuses the two |
| `crm/leads/index.html` | `var API = ".../functions/v1/lead-drop"` | his project's lead-drop URL |
| `crm/src/logic.js` (line ~34) | banner image URL on `rmadxyyvdiqdujuwecdt` storage | his storage URL (or remove the line) |
| `supabase/functions/lead-drop/index.ts` | `PAGE = "https://sove7gn.github.io/sove7gn-gtm/leads/?k="` | `https://<owner>.github.io/<repo>/leads/?k=` |
| `supabase/functions/li-bot/index.ts` | `DROP_PAGE` (same URL) | the same as above |
| `scripts/login.mjs` | `SITE` | his Pages URL |

**His identity.**

| File | What | Change to |
| --- | --- | --- |
| `crm/config.json` | `teamLogin`, `accounts` (name, `x`, `liName`), `automation.linkedin_profile` | his values (keep `brand` "SOVE7GN", the ICP and goals) |
| `supabase/functions/x-grow/index.ts` | `ACCOUNT`, `HANDLE` | his first name, his X handle |
| `supabase/functions/x-engage/index.ts` | `ACCOUNT`, `HANDLE` | the same |
| `supabase/functions/x-leads/index.ts` | `SELF` (lowercase handle), `OWNER` | the same |
| `supabase/functions/x-grow/index.ts` | `POST_RULES`, `OUR_FACTS` | true facts about him. Never copy Reyansh's personal facts (age, story) |
| `supabase/functions/x-grow/index.ts` | the `META` regex contains `reyansh` | his first name, lowercase |
| `supabase/functions/li-bot/index.ts` | `CAL` | his booking link |

**Every remaining mention of Reyansh.** Run `grep -rn -i -E "reyansh|r3yansh|juneja" supabase/functions crm/src crm/config.json extension scripts`. Each hit is either:

- a prompt ("write as Reyansh…", "from Reyansh") → his name;
- UI copy in `crm/src` → his name, or the name from `config.json`;
- a dated comment (`// (16 Nov, Reyansh) …`) → leave it, it's history.

**Keep these as they are.** They are SOVE7GN's, not Reyansh's:

- `VSL_LINK` / `VSL` (the company video);
- `CLOSE_DEFAULT` and the Aktoria proof (a company client);
- `FOLLOW_SRC_DEFAULT` (our clients' founders, whose followers count as warm);
- the sequences, templates, ICP, pacing (Pacific hours, caps) and every rule.

**Don't connect the website visitor hook.** `gtm.sove7gn.org` / RB2B visitors already go to Reyansh's CRM. Two CRMs would contact the same visitor twice.

**Checks:**

```bash
grep -rn "rmadxyyvdiqdujuwecdt" --include=*.js --include=*.ts --include=*.json --include=*.mjs --include=*.html --include=*.py . | grep -v node_modules
grep -rn -i "r3yansh" supabase crm/src crm/config.json extension scripts
grep -rn "sove7gn.github.io/sove7gn-gtm" supabase crm/src crm/leads extension scripts
```

- The first should print nothing outside `crm/index.html`, `crm/v2/index.html` and `crm/leads/index.html`.
- The built pages are rebuilt in step 6. After that the first grep must print nothing at all.
- The second and third must print nothing.

## Step 4. Database

```bash
pnpm db:setup
node scripts/set-passcode.mjs
```

- `pnpm db:setup` applies every migration in `supabase/migrations` and adds the login email.
- `node scripts/set-passcode.mjs` asks for his CRM passcode. He types it; it's never stored in a file.

Then, in the Supabase dashboard:

- **Storage:** create a public bucket named `crm-media` (images for posts).
- **Database → Extensions:** make sure `pg_cron` and `pg_net` are on. The deploy scripts schedule jobs with them.
- **Authentication → URL Configuration:** set Site URL and a redirect URL to his Pages URL.

**Check:** `pnpm test` passes.

**Check:** `node scripts/sql.mjs "select count(*) from crm_leads"` returns 0. His database starts empty.

## Step 5. Server bots

Run in this order. Each script prints names only, never secrets, and is safe to run again.

```bash
node scripts/deploy-automation.mjs
node scripts/deploy-li-bot.mjs
node scripts/deploy-x.mjs
node scripts/deploy-x-grow.mjs
node scripts/deploy-lead-drop.mjs
node scripts/deploy-brief.mjs
node scripts/deploy-signals.mjs
node scripts/deploy-instagram.mjs
```

What each one does:

- `deploy-automation.mjs`: makes `CRON_SECRET`, saves the Apify and Exa keys, and deploys `social-sync`.
- `deploy-li-bot.mjs`: deploys `li-bot`, the brain the extension talks to. It makes `LI_BOT_TOKEN`, his bot key, which is saved in `.env.local`.
- `deploy-x.mjs`: deploys `x-leads`, `x-engage` and `li-engage`.
- `deploy-x-grow.mjs`: deploys `x-grow` (reply targets, new followers, daily posts).
- `deploy-lead-drop.mjs`: deploys the lead pages.
- `deploy-brief.mjs`: deploys the daily brief.
- `deploy-signals.mjs`: schedules the funding search. **Don't** connect its visitor webhook anywhere (see step 3).
- `deploy-instagram.mjs`: only if he uses Instagram DMs through Composio.

The schedules in these scripts are in UTC and tuned for US hours. Keep them.

**Checks:**

- `node scripts/invoke.mjs li-bot '{"action":"state"}'` answers 200.
- In Supabase → Edge Functions, all functions are listed.
- In Database → Cron, the jobs are listed.

## Step 6. The CRM site

```bash
pnpm build
```

This rebuilds `crm/index.html`, `crm/v2/index.html` and the rest from his `config.json` and `.env.local`. Then:

```bash
pnpm serve
```

Open http://localhost:8787/v2/ and sign in with his passcode. It should load, empty, with his name.

Commit and push, staging exact paths and never `.env.local`:

```bash
git add -A
git status
```

Look at the list before committing: no `.env*`, no `_research`, no `crm/v2/_mock.html`.

```bash
git commit -m "My own SOVE7GN GTM system"
git push -u origin main
```

In GitHub → his repo → Settings → Pages, set Source to **GitHub Actions**. The "Publish CRM" workflow publishes on every push to main.

**Checks:**

- `https://<owner>.github.io/<repo>/` opens his CRM, and his passcode works.
- `grep -rn rmadxyyvdiqdujuwecdt crm` prints nothing.

## Step 7. His extension

The `extension/` folder in his repo is his extension, now pointed at his `li-bot` (step 3). Then:

1. Make a Chrome profile used only for this. In it, sign in to **his** linkedin.com and x.com.
2. Go to `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and choose `extension/` from **his** repo folder.
3. Click the extension icon, paste his `LI_BOT_TOKEN` (from `.env.local`) under "Step 1: paste the bot key", and press Save.
4. Press **Test**. It only reads, for about 40 seconds.

**Checks:**

- In his CRM, Bots and messages → Status and activity shows **Running** within a few minutes.
- `node scripts/invoke.mjs li-bot '{"action":"state"}'` shows a recent check-in.

If he ever had Reyansh's extension loaded in this profile, remove it first.

## Step 8. X replies, written by Claude

The CRM's AI budget is small, so Claude writes the X replies and the extension posts them (about 30 a day, 8:00 to 21:00 Pacific). In his Claude Desktop, create a scheduled task that runs at 20 past the hour while the US is awake. On IST that's `20 0-10,20-23 * * *`.

Use this prompt, with his repo folder and name filled in:

> You write X replies for <First> (co-founder of SOVE7GN, a small team that gets funded B2B startups qualified sales calls from LinkedIn and X without hiring SDRs). The Chrome extension bot posts approved replies on its own. Work in <his repo folder> and use the Bash tool.
>
> 1. List the fresh posts that need a reply, then print them: `node scripts/sql.mjs "select url, author, name, kind, posted_at::text p, post_text from crm_x_reply where status in ('new','approved') and coalesce(draft,'')='' and posted_at > now()-interval '18 hours' order by posted_at desc limit 25" 30000 > <scratchpad>/x_posts.json`. If the list is empty, stop.
> 2. Check who already got a reply today (one reply per person per day): `node scripts/sql.mjs "select author from crm_x_reply where status in ('done','approved') and coalesce(draft,'')<>'' and coalesce(done_at, created_at) > now()-interval '20 hours'" 4000`.
> 3. For each post, write a reply or "skip".
>    - Reply only to posts about building, selling, growing, hiring for or funding a startup, AI and dev tools, SaaS, GTM, marketing, sales or founder life, by founders and operators in or near our niche.
>    - Skip memes, one-liners with no context, crypto, politics, personal life, spam, posts you can't add to, and anyone already replied to today.
> 4. Reply rules:
>    - 1 or 2 short sentences, at most 160 characters, casual, like a founder typing.
>    - Add a sharp take, a specific question about their point or a useful angle.
>    - Never invent facts, stories, numbers or clients. Never claim anything about the person beyond what the post says.
>    - No pitch, no links, no hashtags, no emojis, no dashes, no "great post", "love this", "lol", "tbh".
> 5. Save a JSON object mapping each post's index to the reply or "skip", then run `node scripts/write-replies.mjs <posts json> <plan json>`.
> 6. Finish with one line: how many approved and how many skipped.

## Step 9. Final check (all must be true before handing over)

- [ ] `git remote -v` shows only his repo.
- [ ] `grep -rn rmadxyyvdiqdujuwecdt .` (outside `node_modules`) prints nothing.
- [ ] `grep -rn -i r3yansh supabase crm extension scripts` prints nothing.
- [ ] His CRM opens on his Pages URL with his passcode, shows his name, and starts empty.
- [ ] The extension, loaded from his folder with his key, shows Running in his CRM.
- [ ] `node scripts/invoke.mjs li-bot '{"action":"state"}'` answers from **his** project.
- [ ] Nothing in Reyansh's CRM changed. Ask Reyansh to glance at his Bots page.

After that, the co-founder follows the handoff doc:

- Approve his first leads in Leads found.
- Set his posting calendar.
- Let the bots run on US hours.
