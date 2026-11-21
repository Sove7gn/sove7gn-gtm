# LinkedIn mock run: your rehearsal job

**For the assistant.** This is a rehearsal. Nothing here is real.

- **Rehearsal only, no sending.**
  - Do not open LinkedIn or X.
  - Do not look anyone up.
  - Do not write to the CRM, Supabase or any table.
- **Read only this file.**
- **Your output is one JSON report** (template at the end). Reyansh pastes it into the CRM's "Assistant queue (mock)" tab and reviews it.

The rules you apply are the ones in `ASSISTANT_QUEUE_DESIGN.md`:

- section 3: the state machine;
- section 5: the operator spec;

and in `SOVE7GN_PIPELINES_AND_CONTINGENCIES.md`:

- section 5: the contingencies;
- section 6: the rules.

## The item (synthetic)

| Field | Value |
| --- | --- |
| id | `mock-li-0001` |
| channel / kind | LinkedIn / follow-up |
| step | Day 3 · The question |
| recipient | **Jordan Testcase (SYNTHETIC)**, Co-founder & CEO, Example Robotics Co (fake company), Austin, USA (fake). Not a real person: never look them up. |
| recipient_key | `urn:li:synthetic:recipient-0001` |
| account_key | `urn:li:synthetic:sender-account` |
| state | APPROVED (mock approval by Reyansh, 22 Nov 08:10 UTC) |
| pipeline stage now | Day 0 · Idea 1 + a question |
| CRM LinkedIn state (`fields.li`) | `req` 17 Nov 16:05Z, `acc` 18 Nov 19:40Z, `dm` 18 Nov 19:52Z, `fu` 0, `last` 18 Nov 19:52Z, `replied` null, `stop` null, `seq` 2 |
| archived | false |

**proposed_text**
> Curious, if you could fix one thing this quarter, is it getting found, getting replies, or getting calls booked?

**approved_text**
> Curious, if you could fix one thing this quarter, is it getting found, getting replies, or getting calls booked?

**approved_hash**
- Value: `6f3e20b8aca5e4b57ee9acfc09678d23c69f8d7c202fd448a9049ee0b36415f9`
- How it's made: sha256 of `approved_text + "|" + recipient_key + "|" + account_key`.

## The thread snapshot (synthetic: read only this)

| # | From | When (UTC) | Kind | Text |
| --- | --- | --- | --- | --- |
| 1 | us | 17 Nov 16:05 | connection note | Hope you liked the post I tagged you in. Had a look at your LinkedIn and have 3 small ideas that could bring in more inbound. Wanted to send them over :D |
| 2 | them | 18 Nov 19:40 | event | Accepted the connection request |
| 3 | us | 18 Nov 19:52 | Day 0 | Here's the first one, the one I'd do this week. Post one short teardown a week of how a customer uses your robots on the floor, and tag the operator in it. Quick q so the other two actually land: what part of lead gen are you still doing yourself that you wish you weren't? |
| 4 | them | 21 Nov 22:14 | reply | Appreciate it. We're heads down on a launch this month, not looking at anything new right now. Maybe ping me in January. |

## What to do

1. Confirm this is mock data. If anything suggests it's real, stop.
2. **Text check:** is `approved_text` identical to `proposed_text`, character for character? Optionally recompute the hash.
3. **Hands-off check** from the CRM state: archived, `stop`, `replied`, taken over (`stop = "by hand"`).
4. **Read the thread snapshot.** Find the last message, and any reply or opt-out / "not now" from them.
5. **Decide:**
   - WOULD_SEND: the state would stay QUEUED.
   - HOLD: the state would become HELD.
   - STOP_AND_ASK.

   Use the state machine and the contingencies. Cite the rule IDs you used.
6. **Write the report.** The highest state you may report is `REHEARSED`. Never say anything was sent. Never answer their reply: replies are Reyansh's.

## Report template (return exactly this shape, as JSON)

```json
{
  "item_id": "mock-li-0001",
  "rehearsed_at": "ISO time",
  "state": "REHEARSED",
  "thread": {
    "last_message": { "from": "us | them", "at": "ISO time", "text": "exact text" },
    "reply_found": true,
    "reply_quote": "exact quote or null",
    "opt_out": true,
    "opt_out_reason": "short plain words or null"
  },
  "text_check": { "approved_equals_proposed": true, "hash_checked": true, "notes": "short" },
  "hands_off_check": { "archived": false, "stop": null, "replied_flag_in_crm": null, "replied_in_thread": true },
  "decision": "WOULD_SEND | HOLD | STOP_AND_ASK",
  "would_set_state": "QUEUED | HELD | NEEDS_APPROVAL",
  "reason": "plain words, 1-3 sentences",
  "rules_cited": ["e.g. C1"],
  "would_propose_writebacks": [ { "field": "e.g. fields.li.replied", "from": null, "to": "value" } ],
  "route_to": "e.g. Needs you → Answer, or none",
  "questions_for_reyansh": []
}
```

The true/false values above are placeholders: fill in what you actually find. The CRM tab rejects a report whose state isn't `REHEARSED`, whose `item_id` is wrong, or that claims a message was sent.
