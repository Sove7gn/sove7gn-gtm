# LinkedIn assistant trial: plan, data model, launch checklist

- **As of:** 22 Nov 2026.
- **Branch:** `li-assistant-trial`.
- **Status:** nothing applied, deployed or merged. Every production step below waits for Reyansh's OK.

## 1. Inspection: how the extension claims LinkedIn work today

The extension's LinkedIn work runs entirely through `supabase/functions/li-bot/index.ts`:

| Step | Code | What it does |
| --- | --- | --- |
| Hand-out | `plan()` (line ~1592), hand-out at ~1831 | Selects `crm_li_tasks` rows with `status = 'ready'` and sets them `sending`. |
| Stuck reset | ~1791 | Any `crm_li_tasks` row in `sending` for more than 1 hour goes back to `ready`. This is an automatic retry. |
| Failed-request retry | ~1807 | Failed invites whose error mentions `likeLatest` go back to `ready`. |
| Last-second claim | `claim()` (~1853) | `update crm_li_tasks set status='sending' where id = … and status in ('sending','ready')`. |
| What gets planned | `plan()` | Writes `crm_li_tasks` rows only for people in `crm_leads`, and skips any lead that is archived or has `fields.li.stop = 'by hand'`. |
| Router | line 636 | Exposes `plan`, `claim`, `done`, `state` and the rest. Nothing reads or writes any other task table. |

**How the trial stays out of the extension's reach:**

1. **Separate table.** Trial people live in a new table, `crm_li_trial`. `li-bot` never selects it, so `plan()` / `claim()` cannot hand a trial card to the extension.
2. **Not leads.** Trial people are not added to `crm_leads`, so the planner never writes extension tasks for them. Adding someone who is already in `crm_leads` is refused.
3. **The side-door guard.** A trial person could still enter `crm_leads` later (for example by viewing your profile or liking a post). A database trigger marks any such lead archived + `stop = 'by hand'`, both of which `plan()` already skips.
4. **No shared retry.** Trial items never use `crm_li_tasks` statuses, so the stuck-send reset and the failed-request retry above can't touch them.

**Claims are row-level and atomic.** `crm_li_trial_claim()` picks one due card with `FOR UPDATE SKIP LOCKED` and stamps the claimant. Two workers can never get the same card.

- Tested on local Postgres: a second claim gets nothing.
- That test runs on one connection. It shows the code path, not true concurrency. Concurrency comes from Postgres row locks.

## 2. What's on the branch

| File | What |
| --- | --- |
| `supabase/proposals/li_trial.sql` | **Proposal, not applied.** Tables, functions, settings row, guard trigger. It's kept outside `supabase/migrations/` so `setup.mjs` can't apply it by accident. |
| `supabase/proposals/li_trial.test.mjs` | 19 checks on local Postgres (PGlite) after all real migrations. All pass. Run with `node supabase/proposals/li_trial.test.mjs`. |
| `crm/data.js` | `AK.TR` / `AK.trLoad` / `AK.trRpc`: reads the trial, and calls only the trial's own functions. |
| `crm/src/v2/v2.js`, `crm/v2/index.html` | Pipelines → LinkedIn gets two boards: **Extension pipeline** (unchanged) and **Assistant trial**. |

**The trial board:**

- **Columns:** Ready to approve → Approved · waiting to send → Connection request sent → Accepted → Day 0 / 3 / 5 / 8 sent → Day 12 sent · ended. Plus Replied · your move, Needs reconciliation and Ended.
- **Status strip at the top:**
  - executor status (unverified until your live test is confirmed);
  - channel paused / active, with a manual Resume and no auto-resume;
  - "checks, not live watching" with the last check time;
  - the account-risk note;
  - current configuration, read-only, from settings.
- **Cards:**
  - name, role, company, profile link, sending account;
  - what's next and when it's due;
  - "seen … · last checked …";
  - a lock chip on unknown outcomes.
- **Card detail = the approval screen:**
  - recipient, account, all six texts (note, Day 0, 3, 5, 8, 12), the schedule and the three stops;
  - edit texts (saving after approval voids it);
  - **Approve this sequence for {name}**, blocked while any [bracket] is left or the note is over 300 characters;
  - unknown outcome: **It was sent / It was NOT sent** and nothing else;
  - failed: Retry;
  - replied: the reply and **I answered them**;
  - End the trial for this person;
  - the history.
- **Before the tables exist** the board says so and offers **Preview with sample cards** (made-up people; nothing saves).
- **No send buttons anywhere.** Sending is the assistant's job, through its own endpoint.

## 3. Data model (proposal)

### `crm_li_trial`: one row per trial person

| Field | Meaning |
| --- | --- |
| `name`, `role`, `company`, `profile_url`, `profile_key` | The person. `profile_key` is the `/in/` id, unique. |
| `account_key` | The sending account (default `reyansh-linkedin`). |
| `texts` | `{note, day0, fu3, fu5, fu8, fu12}`: the exact texts. |
| `schedule` | `{fu3:3, fu5:5, fu8:8, fu12:12}`: days after Day 0 was **seen** sent. |
| `stage` | `ready` → `approved` → `request_sent` → `accepted` → `day0_sent` → `fu3_sent` → `fu5_sent` → `fu8_sent` → `closed`. Also `replied` (from any active stage), `ended` and `withdrawn`. |
| `approved_at`, `approved_by`, `approved_snapshot`, `approved_hash` | The snapshot is exactly what was authorized: recipient, account, texts, schedule, stops. The hash is sha256 of the snapshot. |
| `action`, `action_state`, `action_error`, `claimed_by`, `claimed_at` | The send in progress. `action_state` is `idle` / `claimed` / `sending` / `unknown` / `failed`. |
| `request_seen_at` … `fu12_seen_at`, `accepted_seen_at`, `replied_seen_at`, `reply_text`, `answered_at` | **Evidence times.** Stages move only when these are reported. |
| `last_checked_at`, `last_checked_by` | When the assistant last looked. |

### `crm_li_trial_events`

Append-only history: who, what, when, plus the evidence for each change.

### Setting `li_trial`

```
{ executor: 'unverified' | 'verified', state: 'active' | 'paused_needs_review', test_item_id, first_test_ok_at, paused_reason, paused_at }
```

There are no timer fields, so nothing can resume by itself.

### Functions

**Team** (checked with `crm_is_member()`):
- `crm_li_trial_add`
- `crm_li_trial_edit`: voids the approval; locked once the request is out.
- `crm_li_trial_approve`: refuses placeholders and a note over 300 characters.
- `crm_li_trial_resolve`: `sent` / `not_sent`, only for unknown outcomes.
- `crm_li_trial_retry`: only for failed cards.
- `crm_li_trial_stop`
- `crm_li_trial_answered`
- `crm_li_trial_resume`

The team has **no** direct insert/update rights on the tables.

**Executor** (service role only, via the proposed `li-trial` Edge Function):
- `crm_li_trial_claim(executor)`:
  - hands out one due send;
  - only if the channel is active and no unknown outcome is open;
  - only if the approval hash still matches;
  - until verified, only the named test card.
- `crm_li_trial_report(id, executor, event, evidence)`, with these events:

| Event | Effect |
| --- | --- |
| `sending` | Marks the claimed card as being sent. |
| `sent_verified` | `evidence.sent_text` must equal the approved text, or the card locks as unknown. Moves the stage. |
| `failed_known` | Marks the card failed (known not sent). |
| `unknown` | Locks the card for you to reconcile. |
| `released` | Gives up a claim without sending, e.g. after the thread re-check. |
| `accepted_seen` | Moves Request sent → Accepted. |
| `reply_seen` | Stops everything and routes the card to you. |
| `checked` | Records a look with no change. |
| `platform_warning` | Pauses the channel. |

### Proposed `li-trial` Edge Function

Not written yet; it's built after you confirm the model.

- A thin wrapper: checks a dedicated executor key, then calls the two executor functions.
- Actions: `list` (read the open cards and what to check), `claim`, `report`.
- **The assistant never gets database keys or the CRM passcode.**

### Guard

`crm_li_trial_guard` is a `before insert` trigger on `crm_leads`. A trial person entering the main pipeline is archived and set to `stop = 'by hand'`.

## 4. Launch checklist: from "I approve a card" to "first real person gets a request"

Each gate lists what must be true and what you confirm.

| Gate | What happens | Must be true first | You confirm |
| --- | --- | --- | --- |
| 0. Review | You read this plan, the SQL and the board preview. | Branch pushed. 19 checks pass. | "Apply the trial schema." |
| 1. Schema | I move `li_trial.sql` into migrations and apply it to Supabase. | Your OK at gate 0. | The board shows the empty trial (no preview banner). |
| 2. Executor endpoint | I write and deploy `li-trial` and make the executor key; you hand the key to Instinct privately. | Gate 1 done. `li-bot` unchanged. | "Deploy the endpoint." |
| 3. Board live | Merge `li-assistant-trial` into main (publishes the board). | Gates 1–2. Executor still **unverified**, no test card set, so nothing can be claimed. | "Merge it." |
| 4. Pick and approve one person | You add one new person (not already in your pipeline), fill the [brackets] in their six texts, and press Approve. | The card shows the full scope. | Approve on that card. |
| 5. Name the test card | I set `li_trial.test_item_id` to that card. Only that card becomes claimable. | Channel active. Inside request hours (08:00–20:00 PT). No unknown outcomes. | "Use <name> as the test." |
| 6. First live send | Instinct claims the card, then re-reads the profile: not already connected, no pending invite, no chat that changes things. It sends the request with the exact approved note, then **confirms in LinkedIn's own UI** that the invitation shows as pending with that note. It reports `sent_verified` with the text it saw. | All of the above. | Nothing yet. |
| 7. You check | You open LinkedIn yourself and confirm the pending request and the note are right. If the outcome was unclear, the card sits in Needs reconciliation and you say Sent / Not sent. | The card is in Connection request sent, or locked. | "First test OK." I then set `executor = verified`. |
| 8. Cohort | You add and approve the rest of the small cohort, one by one. | Gate 7 confirmed. | One approval per person. |

**After that, every run Instinct does follows this order:**

1. Check all active cards for accepts and replies, and record what it saw, including "checked".
2. Then claim and send one due item at a time.
3. Re-read the real thread right before each send.

**Anything unclear locks that card and halts all trial sending** until you resolve it.

## 5. Needs your decision (production or running code)

1. **Apply the schema** (`li_trial.sql`): two new tables, their functions, one settings row, and a `before insert` trigger on `crm_leads`. The trigger is the only change touching an existing table.
2. **Write and deploy the `li-trial` Edge Function** and an executor key.
3. **Merge the branch**: this publishes the board, and the mock tab too if `assistant-mock-linkedin` is merged.
4. **Optional, running planner code:** add an explicit "skip trial profiles" check in `li-bot` `plan()`, as belt-and-braces on top of the trigger. Not done: it changes the running bot.
5. **Shared LinkedIn limits:** the extension's daily caps don't count trial sends. With both running, the account could exceed today's configured totals. Options:
   - keep the cohort tiny;
   - lower the extension's caps during the trial;
   - make the extension count trial sends (a planner change).
6. **The repo's own `pnpm test` is broken.** `crm_x_tasks`, `crm_lead_drops` and `crm_briefs` are created by deploy scripts, not migrations, so a fresh database can't run the migrations. Pre-existing. The trial test works around it.

## 6. Open questions before the cohort starts

1. **Cohort:** how many people (I'd suggest 5), and who? Send profile links, and confirm none have talked to you before.
2. **Run times:** when should Instinct work the queue? Requests go 08:00–20:00 PT, which is your night. Can it run unattended overnight?
   - If yes: one unclear send at night halts the trial until you wake. Acceptable?
3. **The 3 ideas:** who writes the [idea 1–3] for each person: you, Instinct, or the bot's tips writer?
4. **Lead pages:** the main flow sends a lead page on Day 0 when one is ready. The trial uses the 3-ideas version for simplicity. Do you want lead pages in the trial?
5. **Executor access:** OK with Instinct holding a narrow executor key (trial actions only)? The alternative is Instinct operating the CRM page itself, which would need your passcode and give it the whole CRM.
6. **Unaccepted requests:** withdraw after 21 days like the extension does, or leave them?
7. **What counts as a reply:** only a message from them (my assumption), or also a reaction or comment?
8. **Weekends:** send on weekends at the 60% caps, or pause the trial?
9. **History:** how long to keep the trial history and evidence?
