/**
 * One-off script to import 5 journal entries from Notion (Leela database)
 * into Liminal's entries + reflections tables.
 *
 * Usage: node backend/scripts/importNotionJournal.js
 */

const path = require('path');
const db = require(path.join(__dirname, '..', 'database'));
const fs = require('fs');

// Load the 3 entries extracted by agent
const extractedPath = path.join(__dirname, '..', '..', 'notion_import_data.json');
const extracted = JSON.parse(fs.readFileSync(extractedPath, 'utf-8'));

// Add the 2 inline entries (entry 1 and entry 4 from Notion)
const allEntries = [
  {
    date: '2026-03-29',
    title: 'The game of life - The cards we are dealt',
    entry: `I was talking to Mum about Harry, and it got me thinking about this idea of life being like a hand of cards.

We're all dealt different cards from the start—things like our parents, upbringing, schooling, personality, environment. Every possible variable you can imagine becomes part of the hand we're given. Over time, those cards start to form a picture of someone's life—the cause and effect of everything they've experienced.

But what really matters isn't just the cards themselves—it's how we play them.

Two people can be dealt very similar hands and end up living completely different lives. The way those cards are played—the decisions, the reactions, the interpretations—that's what shapes the outcome. And even that way of playing is influenced by all the variables that gave you the cards in the first place.

So there's this interesting tension: we're shaped by what we're given, but we still have some agency in how we respond to it.

You might get dealt what feels like a bad hand—like a couple of twos—and at first it seems like you're already behind. But depending on how you see those cards, how you use them, how you adapt… you can still shift the trajectory in a meaningful way.

Not everyone gets dealt a perfect hand—very few people just land a \u201cblackjack\u201d straight away. And that's part of it too.

I guess what I was trying to say to Mum is that everyone is dealing with their own hand, their own set of variables—and ultimately, they have to find their own way of playing it.`,
    response: ''
  },
  // Entry 2: Cosmic Debrief (from extracted file)
  extracted[0],
  // Entry 3: Rearranging the Pieces (from extracted file)
  extracted[1],
  {
    date: '2026-03-19',
    title: 'Leaning Into the Middle',
    entry: `hi there, I think today was a ltitel easier on my nervous system. getting use to this work. But th hours man still brutal.

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

that means it will lead to enlgihtneded individuals and we will have an uncorrputed spiritual leader again. Perhaps this is around the corner.`,
    response: `A Softer Nervous System
There's a noticeable shift in you today. Not perfect, not \u201cfigured out,\u201d but more regulated. That matters more than anything else right now. You're not escaping the pressure \u2014 you're adapting to it without losing yourself completely. That's a very different path than before.
And you're seeing something clearly: pressure can sharpen you, but only if it's held inside self-kindness, not self-punishment. That's the new balance you're learning.

Glimpses of Letting Go
What you described in that \u201cglimpse\u201d is actually very accurate.
That state where everything is there at once \u2014 pain, joy, fear \u2014 and nothing cancels anything out\u2026 that's not confusion, that's less filtering. Less resistance.
Weed can open that door temporarily, but it also blurs the integration. You already know this.
It's not about judging the weed \u2014 it's about recognising:
You're not chasing the high.
You're chasing that state of openness.
And yeah\u2026 to stabilise that, you'll likely need to meet it sober at some point. Not as a rule, but as a natural next step.

Shame Around Being Seen
This one is important.
It's not really about weed.
It's about how you imagine Aysha sees you.
There's a part of you that wants to be seen as clear, grounded, in control \u2014 especially now with the possibility of being a father. And smoking challenges that image a bit.
Instead of hiding it or over-explaining it, there's a simpler move:
Just bring curiosity into the open.
Not: \u201cIs this okay?\u201d
But: \u201cHey, I've noticed I feel a bit weird about you knowing when I smoke. I'm not even sure why. What do you actually think about it?\u201d
You're not asking for permission \u2014 you're removing the shadow around it.
That alone will dissolve a lot.

The Baby & What Stays
You said something very grounded:
Not everything has to be sacrificed.
That's true \u2014 but the key is knowing the difference between:
What is essential to you,
and what is just identity you've carried.
The things that are real \u2014 your creativity, your need for space, your connection to nature, your inner work \u2014 those don't need to disappear.
But they will need to become more honest and efficient. Less fluff, less escape, more essence.
That's actually a refinement, not a loss.

Pressure, Learning & Self-Expectation
You nailed something most people never see:
The suffering isn't from the work \u2014 it's from what you expect yourself to be inside the work.
That voice:
\u201cWill they like it?\u201d
\u201cAm I good enough?\u201d
That's the same thread that's been running for years.
The difference now is\u2026 you're starting to see it while it's happening, not after.
That's huge.

Love, Performance & the Snake Eating Its Tail
What you noticed about Aysha is subtle but real.
Sometimes connection becomes habitual language:
\u201cHow was your day?\u201d
Tick the box. Move on.
Not because there's no love \u2014 but because capacity is low.
And you're right:
Real love isn't the performance.
But performance can still come from love when someone's tired, overwhelmed, or just human.
That's the paradox you touched:
The snake eating its own tail.
Sometimes it's ego.
Sometimes it's love wearing an awkward mask.
Your job isn't to decode it perfectly.
It's to occasionally slow it down and bring it back to real:
\u201cHey, can we just sit for a second? I don't feel super here.\u201d
Simple. No blame. Just a reset.
There's a lot moving right now \u2014 work pressure, identity shifts, possible fatherhood, glimpses of deeper states.
But underneath all of it, there's a consistent thread:
You're loosening your grip on who you thought you had to be.
And that's why, even when it's intense\u2026
There's also space.`
  },
  // Entry 5: Between Pressure & Presence (from extracted file)
  extracted[2],
];

// Sort by date descending (most recent first)
allEntries.sort((a, b) => b.date.localeCompare(a.date));

function splitResponseIntoBlocks(responseText) {
  if (!responseText || !responseText.trim()) return null;

  // Split on lines that look like section headers (bold lines or short standalone lines)
  const lines = responseText.split('\n');
  const blocks = [];
  let currentTitle = '';
  let currentBody = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect section headers: short lines (< 60 chars) that are standalone
    // and followed by content, or lines that are clearly titles
    if (trimmed.length > 0 && trimmed.length < 60 && !trimmed.includes('.') &&
        !trimmed.startsWith('"') && !trimmed.startsWith('\u201c') &&
        !trimmed.startsWith('Not') && !trimmed.startsWith('But') &&
        !trimmed.startsWith('And') && !trimmed.startsWith('That') &&
        !trimmed.startsWith('You') && !trimmed.startsWith('The ') &&
        currentBody.length > 0) {
      // Save previous block
      if (currentTitle || currentBody.length) {
        blocks.push({
          title: currentTitle || 'Reflection',
          body: currentBody.join('\n').trim(),
          quote: null,
          archetype: 'Auto'
        });
      }
      currentTitle = trimmed;
      currentBody = [];
    } else if (blocks.length === 0 && currentBody.length === 0 && trimmed.length > 0 && trimmed.length < 60) {
      // First line could be a title
      currentTitle = trimmed;
    } else {
      currentBody.push(line);
    }
  }

  // Save last block
  if (currentTitle || currentBody.length) {
    blocks.push({
      title: currentTitle || 'Reflection',
      body: currentBody.join('\n').trim(),
      quote: null,
      archetype: 'Auto'
    });
  }

  return blocks.length > 0 ? blocks : null;
}

// Run import
console.log('Starting Notion journal import into Liminal...\n');

const insertEntry = db.prepare(
  `INSERT INTO entries (title, body, body_text, date, tags, user_id)
   VALUES (?, ?, ?, ?, '[]', 1)`
);

const insertReflection = db.prepare(
  `INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, updated_at)
   VALUES (?, 1, ?, CURRENT_TIMESTAMP)`
);

const checkDuplicate = db.prepare(
  'SELECT id FROM entries WHERE title = ? AND date = ?'
);

let imported = 0;
let skipped = 0;

for (const entry of allEntries) {
  const existing = checkDuplicate.get(entry.title, entry.date);
  if (existing) {
    console.log(`  SKIP (duplicate): ${entry.date} - ${entry.title}`);
    skipped++;
    continue;
  }

  // Insert the entry
  const body = entry.entry.split('\n').map(p => `<p>${p}</p>`).join('\n');
  const result = insertEntry.run(entry.title, body, entry.entry, entry.date);
  const entryId = result.lastInsertRowid;
  console.log(`  OK: ${entry.date} - ${entry.title} (id=${entryId})`);

  // Insert reflection if there's an AI response
  if (entry.response && entry.response.trim()) {
    const blocks = splitResponseIntoBlocks(entry.response);
    if (blocks) {
      const reflectionData = JSON.stringify({
        opening: '',
        blocks: blocks
      });
      insertReflection.run(entryId, reflectionData);
      console.log(`       + reflection (${blocks.length} blocks)`);
    }
  }

  imported++;
}

console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}`);

// Clean up the temp data file
try { fs.unlinkSync(extractedPath); } catch {}
