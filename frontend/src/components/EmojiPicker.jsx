// Lightweight emoji picker — floating panel anchored to a cursor position.
//
// Used for the "Change emoji" item on tag context menus. Renders a small
// grid of ~200 common emojis grouped by category, with search by name
// keywords ("heart", "happy", "fire"…). Free-text input also accepts any
// pasted emoji that isn't in the grid. Includes a "Reset to default" action
// that removes any override and falls back to hardcoded / LLM cache.

import { useEffect, useRef, useState } from 'react';

// Per-emoji keywords. Search matches if any keyword starts with or contains
// the query. The literal emoji glyph is always included in the search index
// so pasting one and seeing it highlighted "works".
const EMOJI_KEYWORDS = {
  // Feelings / hearts
  '❤️': ['heart','love','red'],
  '💛': ['heart','yellow','love'],
  '💚': ['heart','green','love'],
  '💙': ['heart','blue','love'],
  '💜': ['heart','purple','love'],
  '🖤': ['heart','black','dark'],
  '🤍': ['heart','white'],
  '💔': ['heartbreak','broken','sad'],
  '💖': ['heart','sparkle','love'],
  '💕': ['hearts','love'],
  '💞': ['hearts','revolving','love'],
  '💘': ['heart','arrow','cupid','love'],
  '💝': ['heart','ribbon','gift'],
  '💯': ['hundred','perfect','score'],
  '✨': ['sparkles','magic','shine'],
  '🔥': ['fire','flame','hot','lit'],
  '💥': ['boom','explosion','impact'],
  '💢': ['anger','angry','steam'],
  '💫': ['dizzy','star','swirl'],
  '💦': ['sweat','drops','water'],
  '💧': ['drop','water','tear'],
  '💭': ['thought','bubble','thinking'],
  '💤': ['sleep','zzz','tired'],
  '🌟': ['star','glow','shine'],
  '⭐': ['star','favorite'],
  '💀': ['skull','death','dead'],
  '🕊️': ['dove','peace','bird','grief','spirit'],
  '🎭': ['theatre','mask','drama'],

  // Faces
  '😀': ['smile','happy','grin'],
  '😂': ['laugh','joy','tears'],
  '😅': ['sweat','smile','nervous'],
  '🥲': ['smile','tear','bittersweet'],
  '😊': ['blush','smile','warm'],
  '😇': ['halo','angel','innocent'],
  '🙂': ['slight','smile','okay'],
  '😉': ['wink','playful'],
  '😍': ['heart','eyes','love'],
  '🥰': ['hearts','adore','love'],
  '😘': ['kiss','blow'],
  '🤔': ['think','thinking','hmm'],
  '🤨': ['raised','brow','suspicious'],
  '😐': ['neutral','meh'],
  '😶': ['mute','speechless'],
  '🙄': ['eye','roll','annoyed'],
  '😏': ['smirk','sly'],
  '😴': ['sleep','tired'],
  '😪': ['sleepy','exhausted'],
  '😵‍💫': ['dizzy','confused','spiral'],
  '🤯': ['mind','blown','explode'],
  '🤐': ['zipper','quiet'],
  '🤓': ['nerd','glasses','smart'],
  '😎': ['cool','sunglasses'],
  '🤩': ['star','struck','wow'],
  '🥳': ['party','celebrate'],
  '😢': ['cry','sad','tear'],
  '😭': ['sob','crying','weep'],
  '😤': ['huff','frustrated','steam'],
  '😠': ['angry','mad'],
  '😡': ['rage','red','furious'],
  '🤬': ['curse','swear'],
  '🥺': ['pleading','begging','sad'],
  '😱': ['scream','shock','fear'],
  '😨': ['fear','scared','anxious'],
  '😰': ['anxious','sweat','worried'],
  '😓': ['downcast','sweat','tired'],
  '🤗': ['hug','warm','embrace'],
  '🥱': ['yawn','tired','bored'],
  '😬': ['grimace','awkward'],
  '🥶': ['cold','freezing','frozen'],
  '🥵': ['hot','heat','overwhelm'],
  '🤤': ['drool','craving'],
  '🤒': ['sick','ill','thermometer'],
  '🤕': ['hurt','injury','head'],
  '🤧': ['sneeze','cold'],
  '🤮': ['vomit','sick'],
  '💩': ['poop','shit'],
  '👻': ['ghost','spooky','spirit'],
  '👽': ['alien','space'],
  '🤖': ['robot','ai','machine'],

  // Body
  '🧠': ['brain','mind','think'],
  '🫀': ['heart','organ','anatomical'],
  '🫁': ['lungs','breath','breathe'],
  '🦷': ['tooth','dental'],
  '👁️': ['eye','see','vision'],
  '👀': ['eyes','look','see'],
  '👂': ['ear','hear','listen'],
  '👃': ['nose','smell'],
  '👄': ['mouth','lips','kiss'],
  '🦴': ['bone','skeleton'],
  '💪': ['muscle','strong','flex'],
  '🤲': ['palms','offer','receive'],
  '👐': ['open','hands','welcome'],
  '🙌': ['celebrate','raised','praise','yes'],
  '👏': ['clap','applause'],
  '🙏': ['pray','thanks','gratitude'],
  '🤝': ['handshake','deal','agreement'],
  '👍': ['thumbs','up','yes','approve'],
  '👎': ['thumbs','down','no','disapprove'],
  '👌': ['ok','okay','perfect'],

  // Nature
  '🌱': ['seedling','growth','sprout','new'],
  '🌿': ['herb','leaf','green'],
  '🍀': ['clover','luck','four'],
  '🌳': ['tree','forest','oak'],
  '🌴': ['palm','tree','tropical'],
  '🌵': ['cactus','desert'],
  '🌲': ['pine','evergreen','tree'],
  '🍃': ['leaves','wind','blowing'],
  '🍂': ['fall','autumn','leaves'],
  '🍁': ['maple','leaf','autumn'],
  '🌷': ['tulip','spring','flower'],
  '🌹': ['rose','romance','red'],
  '🌺': ['hibiscus','tropical'],
  '🌸': ['cherry','blossom','spring'],
  '🌼': ['daisy','flower'],
  '🌻': ['sunflower','growth','yellow'],
  '💐': ['bouquet','flowers'],
  '🍄': ['mushroom','fungi','psychedelic'],
  '🌎': ['earth','globe','americas'],
  '🌍': ['earth','globe','africa','europe'],
  '🌏': ['earth','globe','asia'],
  '🌑': ['moon','new','dark'],
  '🌒': ['moon','waxing','crescent'],
  '🌓': ['moon','first','quarter'],
  '🌔': ['moon','waxing','gibbous'],
  '🌕': ['moon','full','round'],
  '🌖': ['moon','waning','gibbous'],
  '🌗': ['moon','last','quarter'],
  '🌘': ['moon','waning','crescent'],
  '🌙': ['moon','crescent','dream'],
  '☀️': ['sun','sunny','bright'],
  '⛅': ['sun','cloud','partly'],
  '☁️': ['cloud','overcast'],
  '🌧️': ['rain','cloud'],
  '⛈️': ['storm','thunder','rain'],
  '❄️': ['snow','snowflake','cold'],
  '🌊': ['wave','ocean','sea','flow'],
  '🌈': ['rainbow','pride','hope'],
  '🌋': ['volcano','eruption'],
  '🪐': ['planet','saturn','ringed'],
  '🌌': ['milky','way','galaxy','loneliness'],
  '☄️': ['comet','meteor'],

  // Activity
  '🧘': ['meditate','yoga','calm','peace'],
  '🤸': ['cartwheel','flexible'],
  '🏃': ['run','jog','running'],
  '🚶': ['walk','walking'],
  '🏋️': ['lift','weights','gym','strength'],
  '🚴': ['bike','cycle','biking'],
  '🏊': ['swim','swimming'],
  '🏄': ['surf','wave'],
  '🎯': ['target','goal','bullseye','aim'],
  '🎲': ['dice','luck','game'],
  '🎮': ['game','controller','play'],
  '🎨': ['art','paint','palette'],
  '🎤': ['mic','sing','karaoke'],
  '🎧': ['headphones','music','listen'],
  '🎵': ['music','note'],
  '🎶': ['music','notes','song'],
  '🎸': ['guitar','rock'],
  '🎹': ['piano','keys'],
  '🥁': ['drum','beat'],
  '📚': ['books','study','library'],
  '📖': ['book','read','open'],
  '✏️': ['pencil','write','edit'],
  '🖊️': ['pen','write'],
  '📝': ['memo','note','write','journal'],
  '📓': ['notebook','journal'],
  '💻': ['laptop','computer','code'],
  '📱': ['phone','mobile'],
  '📷': ['camera','photo'],
  '🎥': ['video','movie','camera'],
  '💡': ['idea','lightbulb','insight'],
  '🔍': ['search','magnify','find'],

  // Symbols
  '☯️': ['yin','yang','balance','taoism'],
  '☸️': ['dharma','wheel','buddhism'],
  '⚛️': ['atom','science','physics'],
  '✝️': ['cross','christian'],
  '☦️': ['orthodox','christian'],
  '☪️': ['star','crescent','islam'],
  '☮️': ['peace','symbol'],
  '✡️': ['star','david','judaism'],
  '🔯': ['hexagram','six','pointed','star'],
  '🕉️': ['om','aum','hinduism','sacred'],
  '🛐': ['worship','sacred','place'],
  '♻️': ['recycle','reuse'],
  '♾️': ['infinity','infinite','forever'],
  '✔️': ['check','done','yes'],
  '✅': ['check','done','approved'],
  '❌': ['cross','wrong','no'],
  '❓': ['question','ask','wonder'],
  '❗': ['exclamation','important','attention'],
  '⚠️': ['warning','caution'],
  '🛑': ['stop','halt'],
  '⛔': ['no','entry','forbidden'],
  '💠': ['diamond','sparkle'],
  '🌀': ['cyclone','spiral','swirl'],

  // Objects
  '💼': ['briefcase','work','business'],
  '🛏️': ['bed','sleep','rest'],
  '🛋️': ['couch','rest','relax'],
  '🗝️': ['key','old','antique'],
  '🔑': ['key','unlock','access'],
  '🔒': ['lock','closed','locked'],
  '🔓': ['unlock','open'],
  '🎁': ['gift','present'],
  '🎈': ['balloon','celebrate'],
  '🎉': ['party','popper','celebrate'],
  '💰': ['money','bag','riches'],
  '💵': ['cash','dollar','money'],
  '💸': ['fly','away','money','spend'],
  '💳': ['credit','card','payment'],
  '📊': ['chart','bar','stats'],
  '📈': ['chart','up','growth','trend'],
  '📉': ['chart','down','decline'],
  '📌': ['pin','pushpin'],
  '✂️': ['scissors','cut'],
  '🔨': ['hammer','build'],
  '🛠️': ['tools','build','fix'],
  '🔧': ['wrench','fix'],
  '⚙️': ['gear','settings','work','mechanism'],
  '🔬': ['microscope','science','small'],
  '🔭': ['telescope','astronomy','far'],
  '📡': ['satellite','antenna'],
  '💊': ['pill','medicine'],
  '🩹': ['bandage','heal','recovery'],
  '🩺': ['stethoscope','medical','therapy'],
  '🪞': ['mirror','reflect'],
  '🪟': ['window','outside'],
  '🧴': ['lotion','bottle'],
  '🧹': ['broom','clean'],
  '☕': ['coffee','morning','daily'],
  '🍵': ['tea','cup'],
  '🍷': ['wine','glass'],
  '🥂': ['cheers','toast','celebrate'],
  '🍺': ['beer','drink'],
  '🥤': ['cup','soda','drink'],
};

const CATEGORIES = [
  {
    name: 'Feelings',
    emojis: ['❤️','💛','💚','💙','💜','🖤','🤍','💔','💖','💕','💞','💘','💝','💯','✨','🔥','💥','💢','💫','💦','💧','💭','💤','🌟','⭐','💀','🕊️','🎭'],
  },
  {
    name: 'Faces',
    emojis: ['😀','😂','😅','🥲','😊','😇','🙂','😉','😍','🥰','😘','🤔','🤨','😐','😶','🙄','😏','😴','😪','😵‍💫','🤯','🤐','🤓','😎','🤩','🥳','😢','😭','😤','😠','😡','🤬','🥺','😱','😨','😰','😓','🤗','🥱','😬','🥶','🥵','🤤','🤒','🤕','🤧','🤮','💩','👻','👽','🤖'],
  },
  {
    name: 'Body',
    emojis: ['🧠','🫀','🫁','🦷','👁️','👀','👂','👃','👄','🦴','💪','🤲','👐','🙌','👏','🙏','🤝','👍','👎','👌'],
  },
  {
    name: 'Nature',
    emojis: ['🌱','🌿','🍀','🌳','🌴','🌵','🌲','🍃','🍂','🍁','🌷','🌹','🌺','🌸','🌼','🌻','💐','🍄','🌎','🌍','🌏','🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','🌙','☀️','⛅','☁️','🌧️','⛈️','❄️','🌊','🌈','🌋','🪐','🌌','☄️'],
  },
  {
    name: 'Activity',
    emojis: ['🧘','🤸','🏃','🚶','🏋️','🚴','🏊','🏄','🎯','🎲','🎮','🎨','🎤','🎧','🎵','🎶','🎸','🎹','🥁','📚','📖','✏️','🖊️','📝','📓','💻','📱','📷','🎥','💡','🔍'],
  },
  {
    name: 'Symbols',
    emojis: ['☯️','☸️','⚛️','✝️','☦️','☪️','☮️','✡️','🔯','🕉️','🛐','♻️','♾️','✔️','✅','❌','❓','❗','⚠️','🛑','⛔','💠','🌀'],
  },
  {
    name: 'Objects',
    emojis: ['💼','🛏️','🛋️','🗝️','🔑','🔒','🔓','🎁','🎈','🎉','💰','💵','💸','💳','📊','📈','📉','📌','✂️','🔨','🛠️','🔧','⚙️','🔬','🔭','📡','💊','🩹','🩺','🪞','🪟','🧴','🧹','☕','🍵','🍷','🥂','🍺','🥤'],
  },
];

const ALL_EMOJIS = CATEGORIES.flatMap((c) => c.emojis);

function matchesSearch(emoji, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (emoji.includes(q)) return true; // glyph substring (pasted emoji)
  const keywords = EMOJI_KEYWORDS[emoji] || [];
  for (const kw of keywords) {
    if (kw.startsWith(q) || kw.includes(q)) return true;
  }
  return false;
}

export default function EmojiPicker({ x, y, onPick, onClear, onClose, currentEmoji = null }) {
  const ref = useRef(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) onClose?.(); }
    window.addEventListener('keydown', onKey);
    setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [onClose]);

  // Clamp position to viewport
  const W = 340, H = 380;
  const vw = window.innerWidth, vh = window.innerHeight;
  const left = Math.max(8, Math.min(x, vw - W - 8));
  const top  = Math.max(8, Math.min(y, vh - H - 8));

  const filtered = query.trim()
    ? ALL_EMOJIS.filter((e) => matchesSearch(e, query))
    : null;

  function applyFree() {
    // If the search field is non-empty AND no grid items match, treat the
    // input as a pasted/literal emoji and try to apply it directly.
    const trimmed = query.trim();
    if (!trimmed) return;
    if (filtered && filtered.length > 0) {
      // If there's a match in the grid, the user is likely about to click
      // it — let them. Pressing Enter picks the first match for convenience.
      onPick?.(filtered[0]);
      onClose?.();
      return;
    }
    onPick?.(trimmed);
    onClose?.();
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left, top,
        width: `${W}px`,
        height: `${H}px`,
        background: 'var(--white)',
        border: 'var(--border-style)',
        borderRadius: '10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font)',
      }}
    >
      <div style={{ padding: '10px 12px 6px', borderBottom: 'var(--border-style)' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
          {currentEmoji ? `Current: ${currentEmoji}` : 'Pick an emoji'}
        </div>
        <input
          type="text"
          placeholder="Search (heart, fire, calm…) or paste an emoji"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyFree(); }}
          autoFocus
          style={{
            width: '100%',
            padding: '6px 8px',
            border: 'var(--border-style)',
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: 'var(--font)',
            background: 'var(--near-white)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {filtered ? (
          filtered.length > 0 ? (
            <div style={gridStyle}>
              {filtered.map((e, i) => (
                <EmojiCell key={`f-${i}-${e}`} emoji={e} onClick={() => { onPick?.(e); onClose?.(); }} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '14px 6px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center', lineHeight: 1.6 }}>
              No match for &ldquo;{query}&rdquo;. Press Enter to use what you typed as a literal emoji.
            </div>
          )
        ) : (
          CATEGORIES.map((cat) => (
            <div key={cat.name} style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 2px' }}>
                {cat.name}
              </div>
              <div style={gridStyle}>
                {cat.emojis.map((e, i) => (
                  <EmojiCell key={`${cat.name}-${i}-${e}`} emoji={e} onClick={() => { onPick?.(e); onClose?.(); }} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <div style={{ padding: '8px 12px', borderTop: 'var(--border-style)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
        <button
          onClick={() => { onClear?.(); onClose?.(); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: '11px',
            fontFamily: 'var(--font)',
          }}
        >
          Reset to default
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: '11px',
            fontFamily: 'var(--font)',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(8, 1fr)',
  gap: '2px',
};

function EmojiCell({ emoji, onClick }) {
  return (
    <button
      onClick={onClick}
      title={emoji}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '6px',
        borderRadius: '4px',
        fontSize: '18px',
        lineHeight: 1,
        transition: 'background 0.08s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--near-white)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      {emoji}
    </button>
  );
}
