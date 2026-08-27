-- Seed ledger: 1 Enoch / Second Temple apocrypha
-- (implementation_plans/22-channel-fact-ledger.md)
--
-- MANUAL RUN REQUIRED, and run db/add-channel-facts.sql FIRST.
--
-- ## Read this before running it
--
-- Already pointed at the "Enoch" workspace (a5fd8195-204d-424a-9c14-99e80e45ea49), so
-- this can be pasted into the Supabase SQL editor and run as-is.
--
-- To seed a DIFFERENT channel instead, change the one uuid in the `from (select ...)`
-- line below. `select id, name from public.workspaces;` lists them. Running this twice
-- against the same workspace inserts the whole list a second time — the table has no
-- uniqueness constraint on label, because two channels can legitimately share a source.
--
-- ## Where these came from, and which ones are ticked
--
-- Everything marked `verified = true` was checked against published catalogue records,
-- journal reviews or publisher pages in August 2026 — Cambridge Core, Brill, Fortress
-- Press, Oxford, the SOAS Bulletin, Princeton and HathiTrust library catalogues. Those are
-- bibliographic facts about books that exist, not claims about what the books argue.
--
-- Everything marked `verified = false` is a well-known item that was NOT independently
-- checked, and it will not reach a script until you tick it in Settings → Facts. Each one
-- carries a note saying what to confirm. That split is deliberate: this list is generated
-- by the same kind of system the ledger exists to constrain, so it holds itself to the same
-- rule it imposes on the Script Writer.
--
-- Note two corrections to figures circulating in this niche, both checked:
--   * Ephraim Isaac's 1983 translation is in Charlesworth's OTP from DOUBLEDAY, not Oxford.
--   * Matthew Black's critical edition is BRILL 1985, not St Andrews 1976.
-- Citing either the wrong way is the kind of small error a commenter finds first.

-- ================================================================================
-- Target workspace: "Enoch". Change the uuid below to seed a different channel.
-- ================================================================================
insert into public.channel_facts
  (workspace_id, kind, label, detail, always_use, verified, source_note)
select ws.id, v.kind, v.label, v.detail, v.always_use, v.verified, v.source_note
from (select 'a5fd8195-204d-424a-9c14-99e80e45ea49'::uuid as id) ws
cross join (values

-- --------------------------------------------------------------------------------
-- The fixed frame — the handful cited in every episode.
-- --------------------------------------------------------------------------------
('council', 'the Council of Laodicea',
 'a regional synod of about thirty clerics from Asia Minor, c. 363-364 CE, in Phrygia; its Canon 60 lists the books to be read in church, and Enoch is not among them',
 true, true, 'Checked: Wikipedia/Council of Laodicea and bible-researcher.com canon text, Aug 2026.'),

('event', 'the Qumran discoveries',
 'Dead Sea Scroll material recovered from the caves at Qumran between 1947 and 1956, Cave 4 among them',
 true, true, 'Checked: Cambridge Core review of Milik 1976, Aug 2026.'),

('event', 'eleven Aramaic Enoch manuscripts from Qumran Cave 4',
 'seven of 1 Enoch (4Q201, 4Q202, 4Q204, 4Q205, 4Q206, 4Q207, 4Q212) and four of the Astronomical Book (4Q208-4Q211)',
 true, true, 'Checked: Oxford University Press listing for Drawnel, Qumran Cave 4, and the De Gruyter/JHS literature, Aug 2026. This is the real arithmetic behind the "eleven copies" figure.'),

-- --------------------------------------------------------------------------------
-- The scholarly roster — checked, and safe to name on screen.
-- --------------------------------------------------------------------------------
('person', 'George W. E. Nickelsburg', '', false, true,
 'Checked via the Fortress Press and Logos catalogue entries for the Hermeneia volumes.'),

('publication', 'Nickelsburg''s commentary on 1 Enoch',
 '1 Enoch 1, in the Hermeneia series, Fortress Press, 2001, covering chapters 1-36 and 81-108',
 false, true, 'Checked: fortresspress.com and logos.com catalogue entries, Aug 2026.'),

('publication', 'Nickelsburg and VanderKam''s second Hermeneia volume',
 '1 Enoch 2, Fortress Press, covering chapters 37-82',
 false, true, 'Checked: fortresspress.com product page 9780800698379, Aug 2026.'),

('publication', 'the Hermeneia translation of 1 Enoch',
 'Nickelsburg and VanderKam, 1 Enoch: The Hermeneia Translation, Fortress Press',
 false, true, 'Checked: fortresspress.com product page 9780800699109, Aug 2026.'),

('person', 'James C. VanderKam',
 'University of Notre Dame; co-author of the Hermeneia commentary and consultant on Matthew Black''s edition',
 false, true, 'Checked: Cambridge Core and Brill records naming him on both works, Aug 2026.'),

('person', 'Ephraim Isaac',
 'translator of 1 Enoch for Charlesworth''s Old Testament Pseudepigrapha',
 false, true, 'Checked: archive.org scan of OTP vol. 1, Aug 2026.'),

('publication', 'Ephraim Isaac''s translation of 1 Enoch',
 'in James H. Charlesworth, ed., The Old Testament Pseudepigrapha, volume 1, Doubleday, 1983, pages 5-89',
 false, true, 'Checked: archive.org and Goodreads records, Aug 2026. NOTE: Doubleday, not Oxford — the "1983 Oxford translation" attribution common in this niche is wrong.'),

('person', 'James H. Charlesworth',
 'editor of The Old Testament Pseudepigrapha, Doubleday, 1983',
 false, true, 'Checked: archive.org scan of the volume, Aug 2026.'),

('person', 'Michael A. Knibb', '', false, true,
 'Checked: SOAS Bulletin review and Princeton library catalogue, Aug 2026.'),

('publication', 'Knibb''s edition of the Ethiopic Enoch',
 'The Ethiopic Book of Enoch: A New Edition in the Light of the Aramaic Dead Sea Fragments, two volumes, Clarendon Press / Oxford University Press, 1978, in consultation with Edward Ullendorff',
 false, true, 'Checked: Cambridge Core (SOAS Bulletin) and Princeton catalogue, Aug 2026.'),

('person', 'Edward Ullendorff',
 'Ethiopicist; consultant on Knibb''s 1978 edition',
 false, true, 'Checked: Princeton library catalogue record for Knibb 1978, Aug 2026.'),

('person', 'Matthew Black', '', false, true,
 'Checked: Brill and Cambridge Core (Scottish Journal of Theology) records, Aug 2026.'),

('publication', 'Matthew Black''s critical edition of 1 Enoch',
 'The Book of Enoch or I Enoch: A New English Edition with Commentary and Textual Notes, Studia in Veteris Testamenti Pseudepigrapha 7, E. J. Brill, Leiden, 1985',
 false, true, 'Checked: brill.com and Cambridge Core review, Aug 2026. NOTE: Brill 1985 — not a 1976 St Andrews edition, as is sometimes claimed in this niche.'),

('person', 'Otto Neugebauer',
 'historian of ancient astronomy; wrote the appendix on the astronomical chapters (72-82) of Black''s 1985 edition',
 false, true, 'Checked: Cambridge Core record for Black 1985, Aug 2026.'),

('person', 'J. T. Milik',
 'Jozef Tadeusz Milik, 1922-2006; first editor of the Aramaic Enoch fragments from Qumran',
 false, true, 'Checked: Internet Archive and Cambridge Core catalogue records, Aug 2026.'),

('publication', 'Milik''s edition of the Aramaic Enoch fragments',
 'The Books of Enoch: Aramaic Fragments of Qumrân Cave 4, with the collaboration of Matthew Black, Clarendon Press, Oxford, 1976',
 false, true, 'Checked: Cambridge Core (SOAS Bulletin) review, Aug 2026.'),

('person', 'Loren T. Stuckenbruck',
 'Protestant Faculty of Theology, Ludwig-Maximilians-Universität München',
 false, true, 'Checked: LMU academia.edu profile and ResearchGate affiliation, Aug 2026.'),

('publication', 'Stuckenbruck''s commentary on the closing chapters',
 '1 Enoch 91-108, Commentaries on Early Jewish Literature, De Gruyter, Berlin, 2007',
 false, true, 'Checked: degruyterbrill.com and the Journal of Hebrew Scriptures review, Aug 2026.'),

('publication', 'Stuckenbruck''s study of the Book of Giants',
 'The Book of Giants from Qumran, Mohr Siebeck, 1997',
 false, true, 'Checked: Durham University research repository, Aug 2026.'),

('publication', 'Drawnel''s edition of the Aramaic Enoch manuscripts',
 'Henryk Drawnel, Qumran Cave 4: The Aramaic Books of Enoch, Oxford University Press',
 false, true, 'Checked: global.oup.com product page 9780198799917, Aug 2026.'),

-- --------------------------------------------------------------------------------
-- The manuscripts themselves.
-- --------------------------------------------------------------------------------
('manuscript', 'fragment 4Q201',
 'Aramaic, Qumran Cave 4; one of the seven manuscripts of 1 Enoch found there',
 false, true, 'Checked: Oxford University Press listing for Drawnel, Qumran Cave 4, Aug 2026.'),

('manuscript', 'fragment 4Q204',
 'Aramaic, Qumran Cave 4; overlaps the Book of the Watchers, the Book of Dreams and the Epistle of Enoch',
 false, true, 'Checked: Oxford University Press listing for Drawnel, Qumran Cave 4, Aug 2026.'),

('manuscript', 'fragment 4Q206',
 'Aramaic, Qumran Cave 4; one of the seven 1 Enoch manuscripts',
 false, true, 'Checked: Oxford University Press listing for Drawnel, Qumran Cave 4, Aug 2026.'),

('manuscript', 'fragments 4Q208 to 4Q211',
 'the Aramaic Astronomical Book manuscripts from Qumran Cave 4',
 false, true, 'Checked: Oxford University Press and De Gruyter literature, Aug 2026.'),

-- --------------------------------------------------------------------------------
-- Institutions and imprints.
-- --------------------------------------------------------------------------------
('institution', 'the Clarendon Press at Oxford',
 'publisher of both Milik 1976 and Knibb 1978',
 false, true, 'Checked: Cambridge Core catalogue records, Aug 2026.'),

('institution', 'Ludwig-Maximilians-Universität München',
 'LMU Munich; Stuckenbruck''s faculty',
 false, true, 'Checked: LMU academia.edu profile, Aug 2026.'),

('institution', 'the University of Notre Dame',
 'VanderKam''s institution',
 false, true, 'Checked: catalogue records naming his affiliation, Aug 2026.'),

-- ================================================================================
-- NOT VERIFIED — each of these is widely repeated and probably right, but was not
-- independently checked. They stay switched off until you confirm them yourself.
-- ================================================================================
('event', 'Jude''s quotation of Enoch',
 'Jude 14-15 quotes a prophecy attributed to Enoch, corresponding to 1 Enoch 1:9',
 false, false, 'Open Jude 14-15 and 1 Enoch 1:9 side by side and read them. This one you can confirm in two minutes, and it is the strongest genuinely checkable fact available to this channel.'),

('institution', 'the Church of Our Lady Mary of Zion, Axum',
 'in Axum, Ethiopia',
 false, false, 'Confirm the spelling (Axum / Aksum) and what is actually claimed to be held there before naming it on screen.'),

('institution', 'the Shrine of the Book, Israel Museum, Jerusalem',
 'houses Dead Sea Scroll material',
 false, false, 'Confirm which Enoch fragments, if any, are actually on display there rather than in storage.'),

('event', 'the Ethiopian Orthodox Tewahedo canon',
 'retains Enoch as scripture, unlike the Western canons',
 false, false, 'Very widely reported and almost certainly correct, but confirm the wording before asserting it.'),

('person', 'R. H. Charles',
 'produced an edition of the Ethiopic text and a widely used English translation in the early twentieth century',
 false, false, 'Two separate works are often conflated: an Ethiopic text edition and a later English translation. Confirm which year belongs to which before citing a date.'),

('person', 'Richard Laurence',
 'credited with the first English translation of Enoch, early nineteenth century',
 false, false, 'Confirm the year — 1821 is the figure usually given, but it was not checked.'),

('event', 'James Bruce''s Ethiopian manuscripts',
 'Bruce is said to have brought Ge''ez copies of Enoch back to Europe in 1773',
 false, false, 'Confirm the year and how many copies. Widely repeated, not checked.'),

('person', 'Tertullian', 'defended Enoch as scripture', false, false,
 'Confirm the work and passage before attributing a position to him.'),

('person', 'Augustine of Hippo',
 'discusses Enoch in the City of God',
 false, false, 'Confirm the book and chapter, and what he actually says, before characterising it.'),

('person', 'Jerome',
 'excluded Enoch when compiling the Latin Vulgate',
 false, false, 'Confirm where he says so. The specific quotations attributed to him in this niche are often paraphrases.')
) as v(kind, label, detail, always_use, verified, source_note);
