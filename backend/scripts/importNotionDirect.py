"""
One-off script to import 5 Notion journal entries directly into Liminal's SQLite DB.
Usage: python backend/scripts/importNotionDirect.py
"""
import sqlite3
import json
import os
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'liminal.db')
DATA_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'notion_import_data.json')

# Load extracted entries (3 from file)
with open(DATA_PATH, encoding='utf-8') as f:
    extracted = json.load(f)

# All 5 entries
all_entries = [
    {
        "date": "2026-03-29",
        "title": "The game of life - The cards we are dealt",
        "entry": """I was talking to Mum about Harry, and it got me thinking about this idea of life being like a hand of cards.

We\u2019re all dealt different cards from the start\u2014things like our parents, upbringing, schooling, personality, environment. Every possible variable you can imagine becomes part of the hand we\u2019re given. Over time, those cards start to form a picture of someone\u2019s life\u2014the cause and effect of everything they\u2019ve experienced.

But what really matters isn\u2019t just the cards themselves\u2014it\u2019s how we play them.

Two people can be dealt very similar hands and end up living completely different lives. The way those cards are played\u2014the decisions, the reactions, the interpretations\u2014that\u2019s what shapes the outcome. And even that way of playing is influenced by all the variables that gave you the cards in the first place.

So there\u2019s this interesting tension: we\u2019re shaped by what we\u2019re given, but we still have some agency in how we respond to it.

You might get dealt what feels like a bad hand\u2014like a couple of twos\u2014and at first it seems like you\u2019re already behind. But depending on how you see those cards, how you use them, how you adapt\u2026 you can still shift the trajectory in a meaningful way.

Not everyone gets dealt a perfect hand\u2014very few people just land a \u201cblackjack\u201d straight away. And that\u2019s part of it too.

I guess what I was trying to say to Mum is that everyone is dealing with their own hand, their own set of variables\u2014and ultimately, they have to find their own way of playing it.""",
        "response": ""
    },
    extracted[0],  # 2026-03-27 Cosmic Debrief
    extracted[1],  # 2026-03-22 Rearranging the Pieces
    {
        "date": "2026-03-19",
        "title": "Leaning Into the Middle",
        "entry": """hi there, I think today was a ltitel easier on my nervous system. getting use to this work. But th hours man still brutal.

had a littl puff puff afterwork.

to write it out wont even give it the right context to desribe. but I reached, glimpsed lets say. what its like to let go almost complelely. your letting go and you release into everything. everything falls away and at the same time everything presnts itself. All pain, fear, joy all mixed into one. And they dont cancel eachother out haha.

I keep getting glimpses while high! but eventually to make it complete I need to stop weed. and get there

I was just thinking im pretty ashamed for aysha to know I get high. well I have told her about it, but Im not sure what she thinks about smoking weed in general. she smokes too but not as much. maybe thats a good question for you to ask !

our life is about to fucken change. by alot! in heaps of ways I believe.

careers, families, internal states to children .

having a baby is going to be nuts, But I think it shouldnt mean your current life needs to burn ot the ground either. there will be comprimises no doubt. But then again there are some that arent worth loosing and those are the ones that need to be comunicated to Aysha, so she knows.

and by the way this job has been hard because it challenged you in some ways. creative ways. and that makes you anxious you wont be able to do it or they wont like what you make. thats definitely mixed in there . But what ive learnt is I learn so much more from the ones that place pressure on me to get better. these are the jobs I learn on. Sometimes pressure is not a bad thing in work. but at the same time you must balance being kind to yourself and be aware that this will happen. these help when the time comes to deal with the emotions again. what you suffer is from expectations on yourself. anyway cicrling back, it doesnt mean you need to work until midnight though.

just got off the phone with Aysha and somtimes she catches me at the wrong times and she also just talks bit performative, like hey how was day almost ltick box stuff. and its fine! I get it shes just tired and doing her thing. sometimes presesnse is hard if your overloaded. But here is the thing love has nothing to do with this. real love doesnt include superficiallity ... ego I guess. On the flip side it is it made from real love. everything flips on itself. a snake eating its own tail.

Random thought about AI, could be a movie Idea.

What if AI get so riliable in the future. that it makes a better decision in choosing leaders. But this could open up to prejidice from the AI? and vote in people that are lobbied to benefit AI greater than humans.

But on the flip side it could pick random people in the community that are great leaders. Tested by countless conversations they have with their own personal AI. Then some random boy or girl from the world to lead. Sort of like a prince inherits the throne but the prince doesnt have to be related at all. the decision is unbiased. But how do you even define good leader without bias? culture,social sphere always plays a role into even having the View that you have, and thats a view. not the full picture.

that means it will lead to enlgihtneded individuals and we will have an uncorrputed spiritual leader again. Perhaps this is around the corner.""",
        "response": """A Softer Nervous System
There\u2019s a noticeable shift in you today. Not perfect, not \u201cfigured out,\u201d but more regulated. That matters more than anything else right now. You\u2019re not escaping the pressure \u2014 you\u2019re adapting to it without losing yourself completely. That\u2019s a very different path than before.
And you\u2019re seeing something clearly: pressure can sharpen you, but only if it\u2019s held inside self-kindness, not self-punishment. That\u2019s the new balance you\u2019re learning.

Glimpses of Letting Go
What you described in that \u201cglimpse\u201d is actually very accurate.
That state where everything is there at once \u2014 pain, joy, fear \u2014 and nothing cancels anything out\u2026 that\u2019s not confusion, that\u2019s less filtering. Less resistance.
Weed can open that door temporarily, but it also blurs the integration. You already know this.
It\u2019s not about judging the weed \u2014 it\u2019s about recognising:
You\u2019re not chasing the high.
You\u2019re chasing that state of openness.
And yeah\u2026 to stabilise that, you\u2019ll likely need to meet it sober at some point. Not as a rule, but as a natural next step.

Shame Around Being Seen
This one is important.
It\u2019s not really about weed.
It\u2019s about how you imagine Aysha sees you.
There\u2019s a part of you that wants to be seen as clear, grounded, in control \u2014 especially now with the possibility of being a father. And smoking challenges that image a bit.
Instead of hiding it or over-explaining it, there\u2019s a simpler move:
Just bring curiosity into the open.

The Baby & What Stays
You said something very grounded:
Not everything has to be sacrificed.
That\u2019s true \u2014 but the key is knowing the difference between:
What is essential to you,
and what is just identity you\u2019ve carried.
The things that are real \u2014 your creativity, your need for space, your connection to nature, your inner work \u2014 those don\u2019t need to disappear.
But they will need to become more honest and efficient. Less fluff, less escape, more essence.
That\u2019s actually a refinement, not a loss.

Pressure, Learning & Self-Expectation
You nailed something most people never see:
The suffering isn\u2019t from the work \u2014 it\u2019s from what you expect yourself to be inside the work.
That voice:
\u201cWill they like it?\u201d
\u201cAm I good enough?\u201d
That\u2019s the same thread that\u2019s been running for years.
The difference now is\u2026 you\u2019re starting to see it while it\u2019s happening, not after.
That\u2019s huge.

Love, Performance & the Snake Eating Its Tail
What you noticed about Aysha is subtle but real.
Sometimes connection becomes habitual language.
Not because there\u2019s no love \u2014 but because capacity is low.
Your job isn\u2019t to decode it perfectly.
It\u2019s to occasionally slow it down and bring it back to real.
There\u2019s a lot moving right now \u2014 work pressure, identity shifts, possible fatherhood, glimpses of deeper states.
But underneath all of it, there\u2019s a consistent thread:
You\u2019re loosening your grip on who you thought you had to be.
And that\u2019s why, even when it\u2019s intense\u2026
There\u2019s also space."""
    },
    extracted[2],  # 2026-03-15 Between Pressure & Presence
]

def split_response_into_blocks(text):
    if not text or not text.strip():
        return None

    lines = text.strip().split('\n')
    blocks = []
    current_title = ''
    current_body = []

    for line in lines:
        trimmed = line.strip()
        # Detect section headers: short lines without periods that look like titles
        is_title = (
            len(trimmed) > 0 and len(trimmed) < 55
            and '.' not in trimmed
            and not trimmed.startswith(('\u201c', '"', 'Not ', 'But ', 'And ', 'That ', 'You ', 'The '))
            and trimmed[0].isupper()
        )

        if is_title and (current_body or blocks):
            # Save previous block
            if current_title or current_body:
                blocks.append({
                    "title": current_title or "Reflection",
                    "body": '\n'.join(current_body).strip(),
                    "quote": None,
                    "archetype": "Auto"
                })
            current_title = trimmed
            current_body = []
        elif is_title and not blocks and not current_body:
            current_title = trimmed
        else:
            current_body.append(line)

    # Last block
    if current_title or current_body:
        blocks.append({
            "title": current_title or "Reflection",
            "body": '\n'.join(current_body).strip(),
            "quote": None,
            "archetype": "Auto"
        })

    return blocks if blocks else None


# Connect to DB
conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA foreign_keys=ON")
cur = conn.cursor()

imported = 0
skipped = 0

for entry in all_entries:
    # Check duplicate
    cur.execute("SELECT id FROM entries WHERE title = ? AND date = ?", (entry['title'], entry['date']))
    existing = cur.fetchone()
    if existing:
        print(f"  SKIP (duplicate): {entry['date']} - {entry['title']}")
        skipped += 1
        continue

    # Insert entry
    body_html = '\n'.join(f'<p>{p}</p>' for p in entry['entry'].split('\n') if p.strip())
    cur.execute(
        "INSERT INTO entries (title, body, body_text, date, tags, user_id) VALUES (?, ?, ?, ?, '[]', 1)",
        (entry['title'], body_html, entry['entry'], entry['date'])
    )
    entry_id = cur.lastrowid
    print(f"  OK: {entry['date']} - {entry['title']} (id={entry_id})")

    # Insert reflection
    if entry.get('response') and entry['response'].strip():
        blocks = split_response_into_blocks(entry['response'])
        if blocks:
            reflection_data = json.dumps({"opening": "", "blocks": blocks})
            cur.execute(
                "INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, updated_at) VALUES (?, 1, ?, datetime('now'))",
                (entry_id, reflection_data)
            )
            print(f"       + reflection ({len(blocks)} blocks)")

    imported += 1

conn.commit()
conn.close()

print(f"\nDone! Imported: {imported}, Skipped: {skipped}")
