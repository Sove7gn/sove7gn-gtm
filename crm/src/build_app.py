"""Build aktoria-crm-site/index.html from the Claude Design file (export lives in Desktop/Aktoria/design/).

The design markup, styles and runtime stay as designed. This script only:
- adds the document head bits (title, robots), data.js and the page logic (logic.js, inlined);
- replaces the design's sample-data script with a one-line hand-off to that logic;
- swaps the few hard-coded sample texts in the template for bindings, and adds the few slots the real data needs
  (connection notice, DM pause note and Pause/Resume button, "show more" buttons, empty states, save-on-blur for notes and call date).
Every replacement must match exactly once, so a changed design fails loudly instead of silently.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.join(os.path.dirname(HERE), "design", "CRM.dc.html")
OUT = os.path.join(os.path.dirname(HERE), "index.html")  # the site root, served by GitHub Pages

src = open(DESIGN, encoding="utf-8").read()

# ---------- settings: crm/config.json (accounts, brand, pilot) + the Supabase URL and public key from .env.local ----------
import json, re
ROOT = os.path.dirname(os.path.dirname(HERE))
CFG = json.load(open(os.path.join(os.path.dirname(HERE), "config.json"), encoding="utf-8"))
ENV = {}
if os.path.exists(os.path.join(ROOT, ".env.local")):
    for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
        if m:
            ENV[m.group(1)] = m.group(2).strip("'\"")
CFG["supabaseUrl"] = os.environ.get("SUPABASE_URL") or ENV.get("NEXT_PUBLIC_SUPABASE_URL", "")
CFG["supabaseAnonKey"] = os.environ.get("SUPABASE_ANON_KEY") or ENV.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
BRAND = CFG.get("brand", "CRM")
ACCOUNTS = [a["name"] for a in CFG.get("accounts", [])]
CONFIG_JS = "window.CRM_CONFIG=" + json.dumps(CFG, ensure_ascii=False).replace("</", "<\\/") + ";"
SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
logic = open(os.path.join(HERE, "logic.js"), encoding="utf-8").read()
assert "</script" not in logic
# GTM intelligence (8 Nov): the pure rules (window.GTM), inlined before data.js so data.js and the page logic both use them.
gtm_js = open(os.path.join(HERE, "gtm.js"), encoding="utf-8").read()
assert "</script" not in gtm_js

# Cache-buster (7 Nov): the page logic is inlined, so it must never run against a cached older data.js.
import hashlib
DATA_V = hashlib.sha1(open(os.path.join(os.path.dirname(HERE), "data.js"), "rb").read()).hexdigest()[:10]

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.exit("expected %d match(es), found %d for:\n%s" % (count, n, old[:200]))
    src = src.replace(old, new)

# ---------- head, runtime hand-off ----------
rep('<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<script src="./support.js"></script>\n</head>',
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    '<meta name="robots" content="noindex">\n<title>' + BRAND + ' CRM</title>\n'
    '<style>.ak-board::-webkit-scrollbar{height:10px}.ak-board::-webkit-scrollbar-thumb{background:rgba(19,20,24,.22);border-radius:6px}'
    '.ak-board::-webkit-scrollbar-track{background:rgba(19,20,24,.05);border-radius:6px}.ak-board{scrollbar-color:rgba(19,20,24,.25) rgba(19,20,24,.05)}</style>\n'
    '<script src="' + SUPABASE_JS + '"></script>\n<script>' + CONFIG_JS + '</script>\n'
    '<script>\n' + gtm_js + '\n</script>\n<script src="./data.js?v=' + DATA_V + '"></script>\n<script>\n' + logic + '\n</script>\n<script src="./support.js"></script>\n'
    '<script>\n'
    '// If this host blocks the runtime\'s compile step (no eval), hand it the logic class directly.\n'
    '(function(){var n=0,t=setInterval(function(){n++;if(n>200){clearInterval(t);return;}\n'
    '  if(!window.__dcRegistry||!window.__dcRootName||!window.DCLogic||!window.AK_LOGIC)return;\n'
    '  var e=window.__dcRegistry[window.__dcRootName()];if(!e)return;\n'
    '  if(e.Logic){clearInterval(t);return;}\n'
    '  if(e.logicError){clearInterval(t);e.Logic=window.AK_LOGIC(window.DCLogic,window.React);e.logicError=null;window.__dcSetProps(window.__dcRootName(),null);}\n'
    '},50);})();\n</script>\n</head>')
s0 = src.index('<script type="text/x-dc" data-dc-script')
s1 = src.index('>', s0) + 1
s2 = src.index('</script>', s1)
src = src[:s1] + "\nconst Component=window.AK_LOGIC(DCLogic,React);\n" + src[s2:]

# ---------- chrome ----------
# sidebar (9 Nov): an (i) next to every page; hovering it says what the page shows
rep('<span style="flex:1;">{{ pg.label }}</span>',
    '<span style="flex:1;">{{ pg.label }}</span>'
    '<sc-if value="{{ pg.hasInfo }}"><span onMouseEnter="{{ pg.tipShow }}" onMouseLeave="{{ pg.tipHide }}" onClick="{{ pg.tipShow }}" aria-label="{{ pg.info }}" '
    'style="position:relative; flex:0 0 16px; display:inline-grid; place-items:center; width:16px; height:16px; border-radius:50%; font-family:var(--font-mono); font-size:9.5px; font-weight:600; color:var(--ink-4); box-shadow:inset 0 0 0 1px var(--hairline-strong); cursor:help;">i'
    '<sc-if value="{{ pg.tipOn }}"><span role="tooltip" style="position:absolute; right:-4px; top:22px; z-index:60; width:196px; padding:10px 12px; border-radius:10px; background:var(--ink); color:#fff; '
    'font-family:var(--font-sans, inherit); font-size:12px; font-weight:400; line-height:1.45; text-align:left; white-space:normal; box-shadow:0 10px 30px -10px rgba(0,0,0,.45); pointer-events:none;">{{ pg.info }}</span></sc-if></span></sc-if>')

rep('<span>10:42</span>', '<span>{{ phoneTime }}</span>')

# connection notice (no data yet, connector needs approval, sheet not published...) and stale-range note
rep('<sc-if value="{{ loading }}">\n<div style="display:flex; flex-direction:column; gap:var(--s-6);">',
    '<sc-if value="{{ gate.on }}">\n'
    '<div style="display:flex; flex-direction:column; align-items:center; gap:10px; padding:var(--s-9) var(--s-5); text-align:center; border-radius:var(--r-lg); background:var(--glass); border:1px solid var(--glass-edge); box-shadow:var(--shadow-md), var(--hi);">\n'
    '<span style="width:52px; height:52px; border-radius:50%; border:1.5px dashed var(--hairline-strong);"></span>\n'
    '<span style="font-size:var(--fs-lg); font-weight:600;">{{ gate.title }}</span>\n'
    '<span style="font-size:var(--fs-sm); color:var(--ink-3); max-width:420px;">{{ gate.body }}</span>\n'
    '<div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">\n'
    '<button onClick="{{ gate.go }}" style="margin-top:6px; height:var(--btn-h); padding:0 16px; border:0; border-radius:var(--r-btn); background:var(--ink); color:#fff; font-size:var(--fs-sm); font-weight:500; cursor:pointer;">{{ gate.cta }}</button>\n'
    '<sc-if value="{{ gate.hasSheet }}"><button onClick="{{ gate.sheet }}" style="margin-top:6px; height:var(--btn-h); padding:0 16px; border:0; border-radius:var(--r-btn); background:var(--glass-strong); box-shadow:var(--shadow-sm), var(--hi); font-size:var(--fs-sm); font-weight:500; cursor:pointer;">Open the database ↗</button></sc-if>\n'
    '</div>\n</div>\n</sc-if>\n'
    '<sc-if value="{{ hasStale }}"><span style="font-size:var(--fs-xs); color:var(--warn-ink); padding:8px 12px; border-radius:var(--r-md); background:var(--warn-soft); box-shadow:inset 0 0 0 1px var(--warn-line);">{{ stale }}</span></sc-if>\n\n'
    '<sc-if value="{{ loading }}">\n<div style="display:flex; flex-direction:column; gap:var(--s-6);">')

# ---------- home ----------
rep('<sc-if value="{{ home.allDone }}">\n<div style="padding:var(--s-8) var(--s-4);',
    '<sc-if value="{{ home.hasMoreTodo }}"><button onClick="{{ home.moreTodo }}" style="width:100%; height:44px; border:0; border-top:1px solid var(--hairline); background:transparent; font-size:var(--fs-sm); font-weight:500; color:var(--ink-2); cursor:pointer; transition:background var(--dur), color var(--dur);" style-hover="background:rgba(255,255,255,.7); color:var(--ink);">Show {{ home.moreTodoN }} more</button></sc-if>\n'
    '<sc-if value="{{ home.allDone }}">\n<div style="padding:var(--s-8) var(--s-4);')
rep('<section style="display:flex; flex-direction:column; gap:var(--s-3);">\n<div style="display:flex; align-items:center; gap:10px;">\n<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Competitors posted something new</h2>',
    '<sc-if value="{{ home.hasAlerts }}">\n<section style="display:flex; flex-direction:column; gap:var(--s-3);">\n<div style="display:flex; align-items:center; gap:10px;">\n<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Competitors posted something new</h2>')
rep('</sc-for>\n</div>\n</section>\n\n<section style="display:flex; flex-direction:column; gap:var(--s-3);">\n<div style="display:flex; align-items:center; gap:8px;">\n<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Questions for the founders</h2>',
    '</sc-for>\n</div>\n</section>\n</sc-if>\n\n<sc-if value="{{ home.hasFq }}">\n<section style="display:flex; flex-direction:column; gap:var(--s-3);">\n<div style="display:flex; align-items:center; gap:8px;">\n<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Questions for the founders</h2>')
rep('</sc-for>\n</div>\n</section>\n\n<section style="display:flex; flex-direction:column; gap:var(--s-3);">\n<div style="display:flex; align-items:center; gap:8px;">\n<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Pilot goals</h2>',
    '</sc-for>\n</div>\n</section>\n</sc-if>\n\n<section style="display:flex; flex-direction:column; gap:var(--s-3);">\n<div style="display:flex; align-items:center; gap:8px;">\n<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Pilot goals</h2>')
rep('{{ g.v }} <span style="color:var(--ink-4);">/ 1,000</span>', '{{ g.v }} <span style="color:var(--ink-4);">/ {{ g.tgt }}</span>')
rep('<span style="font-size:var(--fs-xs); color:var(--ink-3);">4 this week. Goal is 5.</span>', '<span style="font-size:var(--fs-xs); color:var(--ink-3);">{{ home.inqText }}</span>')

# ---------- our posts: post type filter under the status tabs ----------
rep('</sc-for>\n</div>\n</div>\n\n<div style="display:flex; flex-direction:column; gap:var(--s-5);">\n<sc-for list="{{ posts.list }}" as="p">',
    '</sc-for>\n</div>\n</div>\n'
    '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:calc(-1 * var(--s-2));">\n'
    '<sc-for list="{{ posts.plats }}" as="pl"><button onClick="{{ pl.go }}" style="display:inline-flex; align-items:center; height:30px; padding:0 12px; border-radius:var(--r-pill); border:1px solid {{ pl.bd }}; background:{{ pl.bg }}; color:{{ pl.fg }}; font-size:var(--fs-sm); font-weight:600; cursor:pointer; white-space:nowrap;">{{ pl.label }}</button></sc-for>'
    '<span style="width:1px; height:22px; margin:4px 4px; background:var(--hairline-strong);"></span>'
    '<sc-for list="{{ posts.types }}" as="c">'
    '<button onClick="{{ c.go }}" style="display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 12px; border-radius:var(--r-pill); border:1px solid {{ c.bd }}; background:{{ c.bg }}; color:{{ c.fg }}; font-size:var(--fs-sm); font-weight:500; cursor:pointer; white-space:nowrap;">{{ c.label }}'
    '<span style="font-family:var(--font-mono); font-size:var(--fs-3xs); padding:1px 6px; border-radius:var(--r-pill); background:{{ c.cbg }};">{{ c.count }}</span></button>'
    '</sc-for>\n'
    '<sc-if value="{{ posts.canAdd }}"><button onClick="{{ posts.toggleAdd }}" style="margin-left:auto; display:inline-flex; align-items:center; height:30px; padding:0 14px; border-radius:var(--r-pill); border:1px solid var(--ink); background:#fff; color:var(--ink); font-size:var(--fs-sm); font-weight:500; cursor:pointer;">{{ posts.addLabel }}</button></sc-if>\n'
    '</div>\n'
    '<sc-if value="{{ posts.addOpen }}">\n'
    '<div style="display:flex; flex-direction:column; gap:10px; padding:var(--s-4); border-radius:var(--r-lg); background:#fff; box-shadow:var(--shadow-sm), inset 0 0 0 1px var(--hairline);">\n'
    '<span style="font-size:var(--fs-md); font-weight:600;">Add a post we wrote ourselves</span>\n'
    '<span style="font-size:var(--fs-xs); color:var(--ink-3);">Paste its link if it is already live and it gets tracked like the rest. Posts written straight on X are also added by the tracker on its own.</span>\n'
    '<div style="display:flex; flex-wrap:wrap; gap:8px;">\n'
    '<select value="{{ posts.f.account }}" onChange="{{ posts.on.account }}" aria-label="Account" style="height:36px; padding:0 12px; border:0; border-radius:var(--r-btn); background:#fff; box-shadow:inset 0 0 0 1px var(--hairline-strong); font-size:var(--fs-sm); outline:none;">' + "".join('<option value="%s">%s</option>' % (a, a) for a in ACCOUNTS) + '</select>\n'
    '<select value="{{ posts.f.type }}" onChange="{{ posts.on.type }}" aria-label="Post type" style="height:36px; padding:0 12px; border:0; border-radius:var(--r-btn); background:#fff; box-shadow:inset 0 0 0 1px var(--hairline-strong); font-size:var(--fs-sm); outline:none;"><option value="Own post">Type: other</option><option value="Lead magnet">Lead magnet</option><option value="Founder story">Founder story</option><option value="Data post">Data post</option><option value="Tagging post">Tagging post</option></select>\n'
    '<select value="{{ posts.f.status }}" onChange="{{ posts.on.status }}" aria-label="Status" style="height:36px; padding:0 12px; border:0; border-radius:var(--r-btn); background:#fff; box-shadow:inset 0 0 0 1px var(--hairline-strong); font-size:var(--fs-sm); outline:none;"><option value="To post">To post</option><option value="Scheduled">Scheduled</option><option value="Posted">Already posted</option></select>\n'
    '<input type="date" value="{{ posts.f.date }}" onChange="{{ posts.on.date }}" aria-label="Date" style="height:36px; padding:0 12px; border:0; border-radius:var(--r-btn); background:#fff; box-shadow:inset 0 0 0 1px var(--hairline-strong); font-size:var(--fs-sm); outline:none;">\n'
    '<input value="{{ posts.f.time }}" onChange="{{ posts.on.time }}" placeholder="Time, e.g. 8:30 PM" aria-label="Time" style="height:36px; padding:0 12px; border:0; border-radius:var(--r-btn); background:#fff; box-shadow:inset 0 0 0 1px var(--hairline-strong); font-size:var(--fs-sm); outline:none; width:150px;">\n'
    '</div>\n'
    '<input value="{{ posts.f.link }}" onChange="{{ posts.on.link }}" placeholder="Link on X, if it is live (x.com/.../status/...)" aria-label="Link" style="height:36px; padding:0 12px; border:0; border-radius:var(--r-btn); background:#fff; box-shadow:inset 0 0 0 1px var(--hairline-strong); font-size:var(--fs-sm); outline:none;">\n'
    '<textarea value="{{ posts.f.text }}" onChange="{{ posts.on.text }}" placeholder="The post text" rows="4" style="padding:10px 12px; border:0; border-radius:var(--r-btn); background:#fff; box-shadow:inset 0 0 0 1px var(--hairline-strong); font-size:var(--fs-sm); font-family:inherit; resize:vertical; outline:none;"></textarea>\n'
    '<div style="display:flex; gap:8px;"><button onClick="{{ posts.saveAdd }}" style="height:36px; padding:0 16px; border:0; border-radius:var(--r-btn); background:var(--ink); color:#fff; font-size:var(--fs-sm); font-weight:500; cursor:pointer;">{{ posts.saveLabel }}</button>'
    '<button onClick="{{ posts.toggleAdd }}" style="height:36px; padding:0 12px; border:0; border-radius:var(--r-btn); background:transparent; color:var(--ink-2); font-size:var(--fs-sm); cursor:pointer;">Cancel</button></div>\n'
    '</div>\n</sc-if>\n'
    '\n<div style="display:flex; flex-direction:column; gap:var(--s-5);">\n<sc-for list="{{ posts.list }}" as="p">')

rep('<div style="flex:2 1 300px; display:flex; flex-direction:column; gap:4px;"><span style="font-size:var(--fs-2xs); color:var(--ink-3);">What we changed</span><span style="font-size:var(--fs-md); line-height:1.5;">{{ cmp.changed }}</span></div>\n', '')

# ---------- sidebar: a visible Refresh button above Open sheet ----------
rep('<a href="#" onClick="{{ openSheet }}"',
    '<button onClick="{{ refresh }}" title="Reload the sheet now and pull new numbers and replies from X" style="display:flex; align-items:center; justify-content:center; gap:6px; height:32px; padding:0 12px; border:0; border-radius:var(--r-btn); background:var(--ink); color:#fff; font-size:var(--fs-xs); font-weight:500; cursor:pointer;">Refresh now</button>\n'
    '<a href="#" onClick="{{ openSheet }}"')

# ---------- calendar (31 Oct): the design's week grid is swapped for src/calendar.html ----------
# One board per account (a column per day, cards you write in, attach to and link to the live post), a type filter and IST/PST.
c0 = src.index('<sc-if value="{{ is.calendar }}">')
c1 = src.index('<sc-if value="{{ is.posts }}">')
assert c0 < c1 and src.count('<sc-if value="{{ is.calendar }}">') == 1
src = src[:c0] + open(os.path.join(HERE, "calendar.html"), encoding="utf-8").read().strip() + "\n\n" + src[c1:]

# ---------- our posts: the suggested photo or clip from Drive, next to "Drive folder" ----------
rep('<sc-if value="{{ p.needsMedia }}"><a href="#" onClick="{{ p.openDrive }}"',
    '<sc-if value="{{ p.hasSug }}"><a href="#" onClick="{{ p.openSug }}" title="{{ p.sugWhy }}" style="display:inline-flex; align-items:center; height:26px; padding:0 11px; border-radius:var(--r-pill); background:var(--in-soft); color:var(--in-ink); font-size:var(--fs-2xs); font-weight:600; text-decoration:none; white-space:nowrap;" style-hover="filter:brightness(.97);"><img src="{{ p.sugThumb }}" alt="" style="width:20px; height:20px; margin:0 7px 0 -6px; border-radius:50%; object-fit:cover; background:#fff;">★&nbsp;Use:&nbsp;{{ p.sugName }}&nbsp;↗</a></sc-if>\n'
    '<sc-if value="{{ p.needsMedia }}"><a href="#" onClick="{{ p.openDrive }}"')

# ---------- post tracker: the target is 3 posts a day per account (founder call), not the design's 5 ----------
rep('Green: 5 posts and engagement went up.', 'Green: 3 posts and engagement went up.')

# ---------- people to DM: only Aktoria's ICP now (verdict "DM + reply"), so the sort note says so ----------
rep('color:var(--ink-3);">Robotics people first', 'color:var(--ink-3);">Only people who fit our ICP')

# ---------- people to DM: x clears a person off the list (Status "Dismissed") ----------
rep('">Mark messaged</button></sc-if>',
    '">Mark messaged</button></sc-if>'
    '<sc-if value="{{ c.canX }}"><button onClick="{{ c.x }}" title="Clear from this list" style="height:var(--btn-h-sm); width:var(--btn-h-sm); margin-left:6px; border:0; border-radius:var(--r-btn); background:transparent; color:var(--ink-3); font-size:16px; line-height:1; cursor:pointer;" style-hover="background:var(--n-soft); color:var(--ink);">×</button></sc-if>')

# ---------- send today ----------
rep('<span style="font-size:var(--fs-lg); font-weight:600;">Everything for today is sent</span>',
    '<span style="font-size:var(--fs-lg); font-weight:600;">{{ send.clearTitle }}</span>')
rep('<sc-if value="{{ is.send }}">\n<sc-if value="{{ send.hasRes }}">',
    '<sc-if value="{{ is.send }}">\n'
    '<div style="display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:var(--r-lg); background:var(--glass-faint); border:1px dashed var(--hairline-strong); font-size:var(--fs-sm); color:var(--ink-2); opacity:{{ E.op }}; transition:opacity 500ms var(--ease);">'
    '<span style="width:8px; height:8px; flex:0 0 8px; border-radius:50%; background:{{ send.holdDot }};"></span><span style="flex:1 1 auto;">{{ send.hold }}</span>'
    '<button onClick="{{ send.togglePause }}" style="flex:0 0 auto; padding:6px 12px; border-radius:var(--r-md); border:1px solid var(--hairline-strong); background:#fff; color:var(--ink); font-size:var(--fs-sm); font-weight:500; cursor:pointer;">{{ send.pauseLabel }}</button></div>\n'
    '<sc-if value="{{ send.hasRes }}">')
rep('<span style="font-size:var(--fs-xs); color:var(--ink-3);">Yesterday · Wed 28 Oct</span>', '<span style="font-size:var(--fs-xs); color:var(--ink-3);">{{ send.res.day }}</span>')
rep('line-height:1; font-variant-numeric:tabular-nums;">52</span><span style="font-size:var(--fs-sm); color:var(--ink-2);">sent</span>',
    'line-height:1; font-variant-numeric:tabular-nums;">{{ send.res.sent }}</span><span style="font-size:var(--fs-sm); color:var(--ink-2);">sent on X</span>')
rep('<div style="display:flex; flex-direction:column; gap:8px; flex:1 1 240px; min-width:0;">\n<span style="display:flex; align-items:center; gap:6px; font-size:var(--fs-xs); color:var(--ink-3);">Couldn’t send',
    '<sc-if value="{{ send.res.hasCant }}">\n<div style="display:flex; flex-direction:column; gap:8px; flex:1 1 240px; min-width:0;">\n<span style="display:flex; align-items:center; gap:6px; font-size:var(--fs-xs); color:var(--ink-3);">Couldn’t send')
rep('color:var(--bad-ink); font-variant-numeric:tabular-nums;">6</span>\n<div style="display:flex; flex-direction:column; gap:4px; font-size:var(--fs-xs); color:var(--ink-2);">\n<span><b style="font-family:var(--font-mono); font-weight:500;">4</b> · their DMs need a passcode</span>\n<span><b style="font-family:var(--font-mono); font-weight:500;">2</b> · they only take DMs from people they follow</span>\n</div>\n</div>\n</div>',
    'color:var(--bad-ink); font-variant-numeric:tabular-nums;">{{ send.res.cant }}</span>\n<div style="display:flex; flex-direction:column; gap:4px; font-size:var(--fs-xs); color:var(--ink-2);">\n<sc-for list="{{ send.res.why }}" as="w"><span><b style="font-family:var(--font-mono); font-weight:500;">{{ w.n }}</b> · {{ w.label }}</span></sc-for>\n</div>\n</div>\n</div>\n</sc-if>')
rep('<span style="font-size:var(--fs-xs); color:var(--ink-3);">Each account, yesterday</span>', '<span style="font-size:var(--fs-xs); color:var(--ink-3);">Each account, {{ send.res.dayLow }}</span>')
rep('<span style="font-size:var(--fs-sm); font-weight:500; color:var(--ink-2);">Skipped for now: {{ send.skipN }} seed-stage people</span>',
    '<span style="font-size:var(--fs-sm); font-weight:500; color:var(--ink-2);">{{ send.skipLabel }}</span>')
rep('Seed and pre-seed companies rarely have budget for remote operators yet. They stay out of the list unless you choose Send anyway.',
    'Seed and pre-seed companies rarely have budget for remote operators yet, and unclear funding is checked first. They stay out of the list unless you choose Send anyway.')
rep('<span style="font-size:var(--fs-sm); color:var(--ink-3); max-width:340px;">Tomorrow’s list appears after the sheet updates at 7:00.</span>',
    '<span style="font-size:var(--fs-sm); color:var(--ink-3); max-width:340px;">{{ send.clearText }}</span>')

# ---------- pipeline ----------
rep('<option value="Any channel">Any channel</option><option value="X">X</option><option value="LinkedIn">LinkedIn</option>',
    '<option value="Any channel">Any channel</option><option value="X">X</option><option value="LinkedIn">LinkedIn</option><option value="Email">Email</option>')
rep('<sc-if value="{{ col.empty }}">',
    '<sc-if value="{{ col.hasMore }}"><button onClick="{{ col.more }}" style="height:32px; border:0; border-radius:var(--r-btn); background:rgba(255,255,255,.7); box-shadow:var(--shadow-xs), inset 0 0 0 1px var(--hairline); font-size:var(--fs-xs); font-weight:500; color:var(--ink-2); cursor:pointer;" style-hover="background:#fff; color:var(--ink);">Show {{ col.moreN }} more</button></sc-if>\n<sc-if value="{{ col.empty }}">')
rep('</button>\n</sc-for>\n</div>\n<span style="display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 9px; border-radius:var(--r-pill); font-size:var(--fs-2xs); font-weight:500; white-space:nowrap; background:{{ c.stage.bg }}; color:{{ c.stage.fg }}; box-shadow:{{ c.stage.bd }};" title="Furthest stage reached by anyone at this company"><span style="width:6px; height:6px; border-radius:50%; background:{{ c.stageDot }};"></span>{{ c.stage.label }}</span>\n</div>\n</sc-for>\n</div>',
    '</button>\n</sc-for>\n</div>\n<span style="display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 9px; border-radius:var(--r-pill); font-size:var(--fs-2xs); font-weight:500; white-space:nowrap; background:{{ c.stage.bg }}; color:{{ c.stage.fg }}; box-shadow:{{ c.stage.bd }};" title="Furthest stage reached by anyone at this company"><span style="width:6px; height:6px; border-radius:50%; background:{{ c.stageDot }};"></span>{{ c.stage.label }}</span>\n</div>\n</sc-for>\n'
    '<sc-if value="{{ pipe.cosHasMore }}"><button onClick="{{ pipe.cosMore }}" style="width:100%; height:44px; border:0; border-top:1px solid var(--hairline); background:transparent; font-size:var(--fs-sm); font-weight:500; color:var(--ink-2); cursor:pointer;" style-hover="background:rgba(255,255,255,.7); color:var(--ink);">Show {{ pipe.cosMoreN }} more</button></sc-if>\n</div>')
rep('<span style="font-size:var(--fs-sm); color:var(--ink-3);">{{ t.about }} {{ t.n }} tested side by side.</span>', '<span style="font-size:var(--fs-sm); color:var(--ink-3);">{{ t.about }}</span>')

# ---------- our posts ----------
rep('Where this post ranks among everything {{ p.rankOf }} has posted, by views. #1 is their biggest post ever.',
    '{{ p.tipText }}')
# "What we changed" moves into that "i" (team ask 29 Oct: no text on the card that isn't useful)
rep('<div style="display:flex; gap:10px; padding:12px var(--s-5); border-top:1px solid var(--hairline); font-size:var(--fs-sm); line-height:1.5;">\n'
    '<span style="flex:0 0 auto; font-weight:600;">What we changed</span>\n'
    '<span style="color:var(--ink-2); text-wrap:pretty;">{{ p.changed }}</span>\n</div>\n', '')
rep('<span style="margin-top:auto; font-family:var(--font-mono); font-size:var(--fs-2xs); color:var(--ink-3);">{{ p.cViews }} views · {{ p.cLikes }} likes</span>',
    '<span style="margin-top:auto; font-family:var(--font-mono); font-size:var(--fs-2xs); color:var(--ink-3);">{{ p.cNums }}</span>')
rep('placeholder="Paste the link to the post on X"', 'placeholder="{{ p.linkPh }}"')
rep('<span style="font-size:var(--fs-sm); color:var(--ink-3); max-width:340px;">Pick one of the posts below to copy next and it lands here.</span>',
    '<span style="font-size:var(--fs-sm); color:var(--ink-3); max-width:340px;">{{ posts.emptyText }}</span>')
rep('<section style="display:flex; flex-direction:column; gap:var(--s-3); opacity:{{ E.op }}; transition:opacity 500ms var(--ease) 200ms;">\n<div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;">\n<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">10 best posts to copy next</h2>',
    '<sc-if value="{{ posts.hasBest }}">\n<section style="display:flex; flex-direction:column; gap:var(--s-3); opacity:{{ E.op }}; transition:opacity 500ms var(--ease) 200ms;">\n<div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;">\n<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">10 best posts to copy next</h2>')
rep('cursor:pointer; transition:all var(--dur);" style-hover="transform:translateY(-1px); background:#fff;">Plan a copy</button></sc-if>\n</div>\n</sc-for>\n</div>\n</section>\n</sc-if>',
    'cursor:pointer; transition:all var(--dur);" style-hover="transform:translateY(-1px); background:#fff;">{{ b.planLabel }}</button></sc-if>\n</div>\n</sc-for>\n</div>\n</section>\n</sc-if>\n</sc-if>')
rep('<span style="margin-top:auto; font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--ink-3);">{{ cmp.cViews }} views · {{ cmp.cLikes }} likes</span>',
    '<span style="margin-top:auto; font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--ink-3);">{{ cmp.cNums }}</span>')

# ---------- post tracker ----------
rep('<span style="margin-left:auto; font-size:var(--fs-xl); font-weight:500; letter-spacing:-0.03em;">1.28M</span>\n<span style="font-size:var(--fs-2xs); color:var(--ok-ink);">+18% on last week</span>\n</div>\n<svg viewBox="-8 -8 616 186"',
    '<span style="margin-left:auto; font-size:var(--fs-xl); font-weight:500; letter-spacing:-0.03em;">{{ trk.total }}</span>\n<span style="font-size:var(--fs-2xs); color:var(--ok-ink);">{{ trk.totalD }}</span>\n</div>\n'
    '<sc-if value="{{ trk.noChart }}"><span style="padding:var(--s-6) 0; text-align:center; font-size:var(--fs-sm); color:var(--ink-3);">The chart fills in after the tracker’s second check. It runs every 3 hours.</span></sc-if>\n'
    '<sc-if value="{{ trk.hasChart }}">\n<svg viewBox="-8 -8 616 186"')
rep('<div style="display:flex; justify-content:space-between; font-family:var(--font-mono); font-size:var(--fs-3xs); color:var(--ink-3);"><span>{{ trk.chart.l0 }}</span><span>{{ trk.chart.l1 }}</span><span>{{ trk.chart.l2 }}</span></div>',
    '<div style="display:flex; justify-content:space-between; font-family:var(--font-mono); font-size:var(--fs-3xs); color:var(--ink-3);"><span>{{ trk.chart.l0 }}</span><span>{{ trk.chart.l1 }}</span><span>{{ trk.chart.l2 }}</span></div>\n</sc-if>')
rep('<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">What did well and why</h2>',
    '<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">What did well and why</h2>\n<sc-if value="{{ trk.noTop }}"><span style="font-size:var(--fs-sm); color:var(--ink-3);">Shows up once a post has 30 or more views.</span></sc-if>')
rep('<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Patterns so far</h2>',
    '<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Patterns so far</h2>\n<sc-if value="{{ trk.noPat }}"><span style="font-size:var(--fs-sm); color:var(--ink-3);">Patterns show up once a few more posts have 30 or more views.</span></sc-if>')
rep('<span style="font-family:var(--font-mono); font-size:var(--fs-3xs); color:var(--ok-ink);">{{ r.delta }} since last check</span>',
    '<span style="font-family:var(--font-mono); font-size:var(--fs-3xs); color:var(--ok-ink);">{{ r.deltaLabel }}</span>')

# ---------- people to DM ----------
rep('<span style="font-size:var(--fs-lg); font-weight:600;">Everyone here has a message</span>', '<span style="font-size:var(--fs-lg); font-weight:600;">{{ pdm.emptyTitle }}</span>')
rep('</article>\n</sc-for>\n</div>\n<sc-if value="{{ pdm.empty }}">',
    '</article>\n</sc-for>\n</div>\n<sc-if value="{{ pdm.hasMore }}"><button onClick="{{ pdm.more }}" style="height:40px; border:0; border-radius:var(--r-btn); background:var(--glass-strong); box-shadow:var(--shadow-sm), var(--hi); font-size:var(--fs-sm); font-weight:500; color:var(--ink-2); cursor:pointer;" style-hover="background:#fff; color:var(--ink);">Show {{ pdm.moreN }} more</button></sc-if>\n<sc-if value="{{ pdm.empty }}">')

# ---------- competitors ----------
rep('<span style="font-size:var(--fs-xs); color:var(--ink-3);">Showing 12 of 35 accounts. The rest are in the sheet under Competitors.</span>',
    '<span style="font-size:var(--fs-xs); color:var(--ink-3);">{{ comp.shownNote }}</span>')
rep('<div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;"><span style="font-size:var(--fs-sm); font-weight:600;">Views per post, last 30 days</span><span style="font-size:var(--fs-xs); color:var(--ink-3);">Spikes are the posts worth copying</span></div>\n<div style="display:flex; gap:10px;">',
    '<div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;"><span style="font-size:var(--fs-sm); font-weight:600;">{{ comp.d.chart.label }}</span><span style="font-size:var(--fs-xs); color:var(--ink-3);">Spikes are the posts worth copying</span></div>\n'
    '<sc-if value="{{ comp.d.noChart }}"><span style="padding:var(--s-5) 0; font-size:var(--fs-sm); color:var(--ink-3);">Fewer than 2 of their saved posts are from the last 30 days, so there’s no chart yet.</span></sc-if>\n'
    '<sc-if value="{{ comp.d.hasChart }}">\n<div style="display:flex; gap:10px;">')
rep('<span>30 days ago</span><span>Biggest: {{ comp.d.chart.peakL }}</span><span>Today</span></div>\n</div>\n</div>\n</div>',
    '<span>30 days ago</span><span>Biggest: {{ comp.d.chart.peakL }}</span><span>Today</span></div>\n</div>\n</div>\n</sc-if>\n</div>')
rep('<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Their 6 biggest posts, and our copies</h2>',
    '<h2 style="margin:0; font-size:var(--fs-lg); font-weight:600; letter-spacing:-0.015em;">Their 6 biggest posts, and our copies</h2>\n<sc-if value="{{ comp.d.noTop }}"><span style="font-size:var(--fs-sm); color:var(--ink-3);">No posts saved yet. They arrive with the next refresh.</span></sc-if>')
rep('<span style="margin-left:auto; font-family:var(--font-mono); font-size:var(--fs-3xs); color:var(--ink-3);">{{ t.views }} views</span>',
    '<span style="margin-left:auto; font-family:var(--font-mono); font-size:var(--fs-3xs); color:var(--ink-3);">{{ t.viewsL }}</span>')
rep('<span style="margin-top:auto; font-family:var(--font-mono); font-size:var(--fs-3xs); color:var(--ink-4);">{{ t.likes }} likes</span>',
    '<span style="margin-top:auto; font-family:var(--font-mono); font-size:var(--fs-3xs); color:var(--ink-4);">{{ t.likesL }}</span>')
rep('<div style="display:flex; flex-direction:column; gap:8px; padding:12px; border-radius:var(--r-md); background:var(--in-soft); box-shadow:inset 0 0 0 1px var(--in-line);">',
    '<div onClick="{{ t.openCopy }}" style="display:flex; flex-direction:column; gap:8px; padding:12px; border-radius:var(--r-md); background:var(--in-soft); box-shadow:inset 0 0 0 1px var(--in-line); cursor:pointer;">')
rep('font-size:var(--fs-2xs); font-weight:500; cursor:pointer; transition:all var(--dur);" style-hover="transform:translateY(-1px); background:#fff;">Plan a copy</button>',
    'font-size:var(--fs-2xs); font-weight:500; cursor:pointer; transition:all var(--dur);" style-hover="transform:translateY(-1px); background:#fff;">{{ t.planLabel }}</button>')
rep('<span style="display:flex; gap:14px; font-family:var(--font-mono); font-size:var(--fs-2xs); color:var(--ink-2); white-space:nowrap;"><span>{{ r.views }} views</span><span>{{ r.likes }} likes</span>',
    '<span style="display:flex; gap:14px; font-family:var(--font-mono); font-size:var(--fs-2xs); color:var(--ink-2); white-space:nowrap;"><span>{{ r.views }}</span><span>{{ r.likes }}</span>')

# ---------- contact panel ----------
rep('background:var(--n-soft); color:var(--ink-2);">Owner: {{ cp.owner }}</span>', 'background:var(--n-soft); color:var(--ink-2);">{{ cp.ownerLabel }}</span>')
rep('<sc-for list="{{ cp.actions }}" as="a">\n<button onClick="{{ a.fn }}" style="height:var(--btn-h-sm); padding:0 12px; border:0; border-radius:var(--r-btn); font-size:var(--fs-xs); font-weight:500; cursor:pointer; white-space:nowrap; background:{{ a.bg }}; color:{{ a.fg }}; box-shadow:{{ a.sh }}; transition:transform var(--dur-fast) var(--ease), filter var(--dur), background var(--dur);" style-hover="transform:translateY(-1px); filter:brightness(1.06);" style-active="transform:scale(.97);">{{ a.label }}</button>\n</sc-for>\n</div>\n</sc-if>\n</div>',
    '<sc-for list="{{ cp.actions }}" as="a">\n<button onClick="{{ a.fn }}" style="height:var(--btn-h-sm); padding:0 12px; border:0; border-radius:var(--r-btn); font-size:var(--fs-xs); font-weight:500; cursor:pointer; white-space:nowrap; background:{{ a.bg }}; color:{{ a.fg }}; box-shadow:{{ a.sh }}; transition:transform var(--dur-fast) var(--ease), filter var(--dur), background var(--dur);" style-hover="transform:translateY(-1px); filter:brightness(1.06);" style-active="transform:scale(.97);">{{ a.label }}</button>\n</sc-for>\n</div>\n</sc-if>\n'
    '<sc-if value="{{ cp.saveHint }}"><span style="font-size:var(--fs-2xs); color:var(--ink-3);">{{ cp.saveHint }}</span></sc-if>\n</div>')
rep('<div style="display:flex; flex-direction:column; gap:8px;">\n<span style="font-size:var(--fs-2xs); font-weight:600; letter-spacing:var(--tr-caps); text-transform:uppercase; color:var(--ink-3);">How to reach them</span>',
    '<sc-if value="{{ cp.hasReach }}">\n<div style="display:flex; flex-direction:column; gap:8px;">\n<span style="font-size:var(--fs-2xs); font-weight:600; letter-spacing:var(--tr-caps); text-transform:uppercase; color:var(--ink-3);">How to reach them</span>')
rep('<span style="color:var(--ink-3);">↗</span>\n</a>\n</sc-for>\n</div>\n</div>',
    '<span style="color:var(--ink-3);">↗</span>\n</a>\n</sc-for>\n</div>\n</div>\n</sc-if>')
rep('<input type="datetime-local" value="{{ cp.callAt }}" onChange="{{ cp.setCall }}"',
    '<input type="datetime-local" sc-camel-value="{{ cp.callAt }}" onChange="{{ cp.setCall }}" onBlur="{{ cp.saveCall }}" disabled="{{ cp.ro }}"')
rep('<textarea value="{{ cp.note }}" onChange="{{ cp.setNote }}" rows="3"',
    '<textarea value="{{ cp.note }}" onChange="{{ cp.setNote }}" onBlur="{{ cp.saveNote }}" disabled="{{ cp.ro }}" rows="3"')

# ---------- toast (errors get a red mark and may wrap) ----------
rep('display:grid; place-items:center; background:var(--ok); font-size:10px;">✓</span>\n<span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ toast.msg }}</span>',
    'display:grid; place-items:center; background:{{ toast.icBg }}; font-size:10px;">{{ toast.ic }}</span>\n<span style="white-space:{{ toast.ws }}; overflow:hidden; text-overflow:ellipsis;">{{ toast.msg }}</span>')

# ---------- bound SVG geometry ----------
# The browser parses the raw template before the runtime replaces it, and logs an error for every SVG attribute
# that holds "{{ ... }}". The runtime reads "sc-camel-<name>" as "<name>", so the rendered SVG is identical.
import re
t0, t1 = src.index("<x-dc>"), src.index("</x-dc>")
tpl, n = re.subn(r' (d|points|cx|cy|r)="\{\{', r' sc-camel-\1="{{', src[t0:t1])
assert n >= 10, n
src = src[:t0] + tpl + src[t1:]

# ---------- white label: the design's own copy named the first client; brand, owners and copy now come from config.json ----------
rep('<link rel="stylesheet" href="aktoria-tokens.css">', '<link rel="stylesheet" href="tokens.css">')
rep('letter-spacing:var(--tr-tight);">Aktoria</span>', 'letter-spacing:var(--tr-tight);">' + BRAND + '</span>')
rep('0 6px 14px -6px rgba(19,20,24,.6);">A</div>', '0 6px 14px -6px rgba(19,20,24,.6);">' + BRAND[:1] + '</div>')
rep('font-size:var(--fs-sm); font-weight:600;">A</div>', 'font-size:var(--fs-sm); font-weight:600;">' + BRAND[:1] + '</div>')
rep('<option value="Karan">Karan</option>\n<option value="Shreenabh">Shreenabh</option>\n<option value="Aktoria page">Aktoria page</option>\n',
    "".join('<option value="%s">%s</option>\n' % (a, a) for a in ACCOUNTS))
rep('Things only Karan or Shreenabh can answer', 'Things only the founders can answer')
rep('The two goals agreed for the pilot: 1,000 followers on each account, and a steady stream of people asking about Aktoria without us messaging first.',
    'Every day: 3 posts on X, 30 DMs, and an answer for everyone who engages. The bars are DM replies plus people worth answering on our posts, week by week.')
rep('DMs go out from Karan’s and Shreenabh’s accounts. Pick one of them, or show everyone.', 'DMs go out from your X accounts. Pick one, or show everyone.')
rep('DM replies go to Karan and Shreenabh.', 'DM replies go to the account that sent the DM.')
rep('Pick Karan or Shreenabh, or show everyone.', 'Pick an account, or show everyone.')
rep('Grouped by how close they are to what Aktoria does', 'Grouped by how close they are to what we do')
rep('Copy one and send it on WhatsApp.', 'Copy one and get it answered first.')
rep('font-weight:600; letter-spacing:-0.015em;">Pilot goals</h2>', 'font-weight:600; letter-spacing:-0.015em;">Today</h2>')
rep('<span style="font-size:var(--fs-sm); font-weight:500;">Inbound inquiries a week</span>', '<span style="font-size:var(--fs-sm); font-weight:500;">Replies a week</span>')
rep('>Open sheet<', '>Database<')
rep('New replies show up here as soon as the sheet updates.', 'New replies show up here as soon as they come in.')
rep('rarely have budget for remote operators yet,', 'rarely have budget for us yet,')
rep('Robotics leaders come first, then robotics, investors and everyone else.', 'Good fits come first, then related people, investors and everyone else.')
rep('>Drive folder ↗<', '>Media folder ↗<')
rep('title="Fetch the latest from the Google Sheet"', 'title="Fetch the latest data"')
rep('title="Reload the sheet now and pull new numbers and replies from X"', 'title="Reload now and pull new numbers and replies from X"')
rep('<option value="Data buyers">Data buyers</option><option value="Robot builders">Robot builders</option><option value="Robot deployers">Robot deployers</option><option value="Everyone in robotics">Everyone in robotics</option>',
    "".join('<option value="%s">%s</option>' % (a, a) for a in CFG.get("aimed") or ["Everyone"]))
# ---------- X / LinkedIn switch (3 Nov): a second switch beside the account one, built from its markup so it looks the same ----------
i0 = src.index('<div role="tablist" aria-label="Whose work to show"')
i1 = src.index('</sc-for>\n</div>', i0) + len('</sc-for>\n</div>')
own = src[i0:i1]
assert own.count('list="{{ owners }}" as="o" hint-placeholder-count="4"') == 1
src = src[:i1] + "\n" + own.replace('aria-label="Whose work to show"', 'aria-label="Which platform"').replace(
    'list="{{ owners }}" as="o" hint-placeholder-count="4"', 'list="{{ plats }}" as="o" hint-placeholder-count="2"') + src[i1:]
j0 = src.index('<div style="position:relative;">\n<select value="{{ owner }}"')
j1 = src.index('</div>', src.index('</select>', j0)) + len('</div>')
sel = src[j0:j1]
opts = sel[sel.index('<option'):sel.index('</select>')]
src = src[:j0] + sel.replace('value="{{ owner }}" onChange="{{ onOwnerSel }}" aria-label="Whose work to show"',
    'value="{{ plat }}" onChange="{{ onPlatSel }}" aria-label="Which platform"').replace(opts,
    '<option value="X">X</option>\n<option value="LinkedIn">LinkedIn</option>\n<option value="Leads">Leads</option>\n').replace('max-width:132px;', 'max-width:110px;') + "\n" + src[j0:]

# ---------- Leads (6 Nov): its pages go in front of the calendar, its panel right after the contact panel ----------
k0 = src.index('<sc-if value="{{ is.calendar }}">')
src = src[:k0] + open(os.path.join(HERE, "leads.html"), encoding="utf-8").read().strip() + "\n\n" + open(os.path.join(HERE, "social.html"), encoding="utf-8").read().strip() + "\n\n" + open(os.path.join(HERE, "li.html"), encoding="utf-8").read().strip() + "\n\n" + open(os.path.join(HERE, "gtm.html"), encoding="utf-8").read().strip() + "\n\n" + open(os.path.join(HERE, "scripts.html"), encoding="utf-8").read().strip() + "\n\n" + open(os.path.join(HERE, "engaged.html"), encoding="utf-8").read().strip() + "\n\n" + src[k0:]

# ---------- inspiration (9 Nov): drafts keep their line breaks, and threads show each tweet on its own ----------
rep('<p style="margin:0; font-size:var(--fs-md); line-height:1.55; color:var(--ink-2); text-wrap:pretty;">{{ p.cText }}</p>',
    '<p style="margin:0; font-size:var(--fs-md); line-height:1.55; color:var(--ink-2); text-wrap:pretty; white-space:pre-wrap; max-height:420px; overflow:auto;">{{ p.cText }}</p>')
rep('<p style="margin:0; font-size:var(--fs-md); line-height:1.55; color:var(--ink); text-wrap:pretty;">{{ p.text }}</p>',
    '<p style="margin:0; font-size:var(--fs-md); line-height:1.55; color:var(--ink); text-wrap:pretty; white-space:pre-wrap;">{{ p.text }}</p>')

# ---------- inspiration (9 Nov): one switch on top for our drafts and the competitors' best posts ----------
p0 = src.index('<sc-if value="{{ is.posts }}">')
src = (src[:p0] + '<sc-if value="{{ insp.on }}"><div style="display:flex; flex-wrap:wrap; gap:6px;">'
    '<sc-for list="{{ insp.tabs }}" as="t"><button onClick="{{ t.go }}" style="display:inline-flex; align-items:center; gap:8px; height:34px; padding:0 16px; border-radius:var(--r-pill); border:1px solid {{ t.bd }}; background:{{ t.bg }}; color:{{ t.fg }}; font-size:var(--fs-sm); font-weight:600; cursor:pointer;">{{ t.label }} <span style="font-weight:700; opacity:.75;">{{ t.count }}</span></button></sc-for>'
    '</div></sc-if>\n' + src[p0:])

# ---------- send today (9 Nov): each row shows the message it will send, filled in for that person ----------
g0 = src.index('<sc-for list="{{ send.groups }}" as="g">')
g1 = src.index('</sc-for>\n</div>\n</div>\n</sc-for>', g0)
src = (src[:g1] + '</sc-for>\n</div>\n<sc-if value="{{ r.hasSaid }}">\n'
    '<div style="flex:1 1 100%; display:flex; flex-direction:column; gap:4px; padding:10px 12px; border-radius:var(--r-md); background:var(--out-soft); box-shadow:inset 0 0 0 1px var(--out-line);">\n'
    '<span style="font-size:var(--fs-sm); line-height:1.5; color:var(--ink); white-space:pre-wrap; text-wrap:pretty;">{{ r.said }}</span>\n'
    '<span style="font-size:var(--fs-3xs); color:var(--out-ink);">{{ r.saidWhen }}</span>\n'
    '</div>\n</sc-if>\n</div>\n</sc-for>' + src[g1 + len('</sc-for>\n</div>\n</div>\n</sc-for>'):])

# ---------- send today (9 Nov): the lead finder's status and a "Find more now" button above the list ----------
rep('<sc-if value="{{ is.send }}">\n<div style="display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:var(--r-lg); background:var(--glass-faint);',
    '<sc-if value="{{ is.send }}">\n'
    '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:12px 14px; border-radius:var(--r-md); background:var(--glass); border:1px solid var(--glass-edge); box-shadow:var(--shadow-sm), var(--hi);">\n'
    '<span style="width:8px; height:8px; border-radius:50%; background:var(--out);"></span>\n'
    '<span style="flex:1; min-width:200px; font-size:var(--fs-sm); color:var(--ink-2);">{{ send.finder.text }}</span>\n'
    '<sc-if value="{{ send.finder.idle }}"><button onClick="{{ send.finder.run }}" style="height:var(--btn-h-sm); padding:0 14px; border:0; border-radius:var(--r-btn); background:var(--ink); color:#fff; font-size:var(--fs-xs); font-weight:600; cursor:pointer;">Find more now</button></sc-if>\n'
    '</div>\n'
    '<div style="display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:var(--r-lg); background:var(--glass-faint);')
a0 = src.index('<aside aria-label="Contact"')
a1 = src.index('</aside>', a0) + len('</aside>')
src = src[:a1] + "\n\n" + open(os.path.join(HERE, "leads_panel.html"), encoding="utf-8").read().strip() + src[a1:]

# ---------- post tracker: labels come from the page logic, so the LinkedIn version can talk about reactions ----------
rep('font-weight:600;">Total views over time</span>', 'font-weight:600;">{{ trk.L.chart }}</span>')
rep('>The chart fills in after the tracker’s second check. It runs every 3 hours.<', '>{{ trk.L.noChart }}<')
rep('{{ t.views }} views</span>', '{{ t.views }}</span>')
rep('>Shows up once a post has 30 or more views.<', '>{{ trk.L.noTop }}<')
rep('>Patterns show up once a few more posts have 30 or more views.<', '>{{ trk.L.noPat }}<')
rep('background:rgba(255,255,255,.5);">Views</th>', 'background:rgba(255,255,255,.5);">{{ trk.L.c1 }}</th>')
rep('background:rgba(255,255,255,.5);">Engagement</th>', 'background:rgba(255,255,255,.5);">{{ trk.L.c2 }}</th>')
rep('background:rgba(255,255,255,.5);">Per 1K views</th>', 'background:rgba(255,255,255,.5);">{{ trk.L.c3 }}</th>')
rep('>Green: 3 posts and engagement went up. Yellow: fewer posts, or engagement stayed flat. Red: nothing posted, or engagement fell by more than half.<',
    '>{{ trk.L.weekTip }}<')
f1 = src.index('Followers per account <span')
f0 = src.rindex('<div style="flex:1 1 280px;', 0, f1)
f2 = src.index('</sc-for>\n</div>', f1) + len('</sc-for>\n</div>')
src = src[:f0] + '<sc-if value="{{ trk.hasFol }}">' + src[f0:f2] + '</sc-if>' + src[f2:]

for word in ("Google Sheet", "WhatsApp", "Robot", "robotics", "robot "):
    assert word not in src.replace(CONFIG_JS, ""), "client copy left in the page: " + word
for name in ("Aktoria", "Karan", "Shreenabh"):
    left = [m.start() for m in re.finditer(name, src) if "CRM_CONFIG" not in src[max(0, m.start() - 4000):m.start()][-200:]]
    assert name not in src.replace(CONFIG_JS, ""), "client name left in the page: " + name

open(OUT, "w", encoding="utf-8", newline="\n").write(src)
print("wrote", OUT, len(src), "bytes")
