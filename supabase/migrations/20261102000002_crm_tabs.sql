-- Every tab the CRM reads, empty, with the exact header rows the page depends on (handoff §4).
-- Row 1 = title, row 2 = one-line note, row 3 = headers; data starts at row 4. Safe to run again (existing rows are kept).
insert into public.crm_sheet (tab, row, cells) values
  ('DM Pipeline', 1, array['DM Pipeline']),
  ('DM Pipeline', 2, array['Outbound: one row per person. Priority, Next action, FU due dates, Hours to first touch, Ready, Queue # and Sort key are worked out by the CRM.']),
  ('DM Pipeline', 3, array['Priority','Next action','Name','Company','Role','Owner','Channel','Warm/Cold','Segment','Fit (1-10)','X handle','LinkedIn','Email',
    'Signal (why now)','Signal link','Signal time','Template','Opener (30-40 words)','Status','Sent on','FU1 due','FU1 sent','FU2 due','FU2 sent','Replied on',
    'Call on','Hours to first touch','Notes','Ready','Queue #','Sort key','Contact # at company','Likely to buy','DM result','Funding stage','Funding source']),

  ('DM Templates', 1, array['DM Templates']),
  ('DM Templates', 2, array['How each account writes its DMs, how many to send today, and which templates are working. Counts and reply rates come from DM Pipeline. A person sends every DM.']),
  ('DM Templates', 3, array['Account','Daily target','Sent today','Left today','Ready to send','Follow-ups due','Replies waiting','Sent (all time)','Reply rate','Calls booked','DMs paused']),
  ('DM Templates', 9, array['Templates, one voice per account. Read each one out loud before sending: if it sounds like a sales email, rewrite it.']),
  ('DM Templates', 10, array['ID','Account','Intent','Use it for','Opener','Follow-up 1 (day 3)','Follow-up 2 (day 7)','Words','Sent','Replies','Reply rate','Calls','Verdict']),

  ('Target Accounts', 1, array['Target Accounts']),
  ('Target Accounts', 2, array['Companies that could buy from us, ranked by fit.']),
  ('Target Accounts', 3, array['Company','Tier','Segment','Stage and funding','Public data or ops need','Why we fit','Priority','Titles to reach','Known public contacts','X handle','Status','Last touch','Next step','Notes']),

  ('Our Accounts', 1, array['Our Accounts · goals']),
  ('Our Accounts', 2, array['Our X accounts, their follower goals, and the inquiries and calls typed in each week.']),
  ('Our Accounts', 3, array['Account','Handle','Followers at start','Followers now','Follower target','Posts in last 30 days','Checked on','Notes']),
  ('Our Accounts', 8, array['Week','Qualified inbound inquiries','Calls booked from inbound','Inquiry target per week','Notes']),

  ('Post Tracking', 1, array['Post Tracking']),
  ('Post Tracking', 2, array['Filled by the post tracker. One row per post per check, so the CRM can chart traction over time. Don''t edit by hand.']),
  ('Post Tracking', 3, array['Checked at (IST)','Account','Post link','Views','Likes','Replies','Reposts','Quotes','Bookmarks','Followers']),

  ('Post Engagers', 1, array['Post Engagers']),
  ('Post Engagers', 2, array['People who replied to or quoted our posts, found by the post tracker, with a verdict, a public reply and a DM ready.']),
  ('Post Engagers', 3, array['Found on','Account','Our post link','Our post','How','Handle','Name','Bio','Followers','DMs open','What they said','Their link','Fit',
    'Send from','DM ready','Status','Messaged on','Our reply','Verdict','Why']),

  ('Our Posts', 1, array['Our Posts · our versions of the best posts']),
  ('Our Posts', 2, array['One row per planned post. Their post is copied word for word; our version keeps the same shape and swaps only the specifics. Every fact comes from the Company or Founder Profiles tabs.']),
  ('Our Posts', 3, array['Week','Date','Time (IST)','Account','Platform','Post type','Competitor','Their link','Their post','Our version','What we changed','Media needed',
    'Drive folder','Media file','Status','Founder question','Posted link','Views','Likes','Replies','Reposts','Quotes','Bookmarks','Result','Aimed at','Calendar',
    'Suggested media','Daily slot']),

  ('Their Posts', 1, array['Their Posts · posts worth copying']),
  ('Their Posts', 2, array['Filled by the post scrape. One row per kept post: original, not a repost, with a structure we can rebuild.']),
  ('Their Posts', 3, array['Competitor','Account','Account role','Platform','Link','Date','Full text','Hook','Skeleton','Why it worked','Post type','Second type','Tags',
    'Media','What the media is','How sure','Views','Likes','Replies','Reposts','Quotes','Bookmarks','Engagement','Per 1K views','Reactions','Comments',
    'Per 1K followers','Scraped on']),

  ('Competitors', 1, array['Competitors · who sells what we sell, plus big accounts we copy']),
  ('Competitors', 2, array['How close: Same thing as us, Overlaps on data, Overlaps on software, or Big account. Followers and posting numbers fill in after the first scrape.']),
  ('Competitors', 3, array['Name','Website','What they sell','How close','Sells','Proof link','X account','LinkedIn page','X followers','LinkedIn followers','Loudest on',
    'Posts per month','Best post type this month','Notes','Checked on']),

  ('Competitor People', 1, array['Competitor People']),
  ('Competitor People', 2, array['Founders and leaders whose posts we study. Blank X or LinkedIn means none was found yet.']),
  ('Competitor People', 3, array['Competitor','Name','Role','X','LinkedIn','X followers','LinkedIn followers','Notes']),

  ('Company', 1, array['Company']),
  ('Company', 2, array['Facts about us. Every number in a post comes from here. "Founder to fill" means unknown.']),
  ('Company', 3, array['Section','Field','Value','Confidence','Source','Notes']),

  ('Founder Profiles', 1, array['Founder Profiles']),
  ('Founder Profiles', 2, array['Facts about the founders. "Founder to fill" means unknown.']),
  ('Founder Profiles', 3, array['Section','Field','Value','Confidence','Source','Notes'])
on conflict (tab, row) do nothing;
