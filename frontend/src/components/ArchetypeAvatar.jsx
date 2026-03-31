/**
 * Small SVG avatar for archetypes — 28x28 by default.
 * Built-in archetypes get unique icons; custom ones get initials.
 */
export default function ArchetypeAvatar({ archetype, size = 28, color }) {
  const fill = color || '#888';
  const r = size / 2;

  // Custom archetype — show initials
  const icon = archetype?.icon;
  if (!icon) {
    const name = archetype?.value || archetype || '?';
    const initials = name.split(/\s+/).map(w => w[0]?.toUpperCase()).join('').slice(0, 2);
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={r} cy={r} r={r} fill={fill} opacity="0.12" />
        <text x={r} y={r + 1} textAnchor="middle" dominantBaseline="central"
          fontSize={size * 0.38} fontWeight="600" fill={fill} fontFamily="var(--font)">
          {initials}
        </text>
      </svg>
    );
  }

  // Built-in icons
  const s = size;
  const v = `0 0 ${s} ${s}`;
  const c = fill;
  const bg = (
    <circle cx={r} cy={r} r={r} fill={c} opacity="0.10" />
  );

  const icons = {
    auto: (
      <svg width={s} height={s} viewBox={v}>
        {bg}
        {/* Person outline */}
        <circle cx={r} cy={r * 0.65} r={r * 0.22} stroke={c} strokeWidth="1.2" fill="none" />
        <path d={`M ${r - r * 0.4} ${r * 1.55} a ${r * 0.4} ${r * 0.35} 0 0 1 ${r * 0.8} 0`} stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    ),
    zen: (
      <svg width={s} height={s} viewBox={v}>
        {bg}
        {/* Enso circle — centered at (r, r) */}
        <path d={`M ${r + r * 0.45} ${r - r * 0.25} A ${r * 0.5} ${r * 0.5} 0 1 1 ${r + r * 0.1} ${r - r * 0.45}`}
          stroke={c} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    ),
    jungian: (
      <svg width={s} height={s} viewBox={v}>
        {bg}
        {/* Mirror / mask — shadow work */}
        <circle cx={r} cy={r * 0.62} r={r * 0.24} stroke={c} strokeWidth="1.2" fill="none" />
        <circle cx={r} cy={r * 0.62} r={r * 0.24} fill={c} opacity="0.25" clipPath={`inset(0 50% 0 0)`} />
        <path d={`M ${r - r * 0.35} ${r * 1.5} a ${r * 0.35} ${r * 0.3} 0 0 1 ${r * 0.7} 0`} stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    ),
    stoic: (
      <svg width={s} height={s} viewBox={v}>
        {bg}
        {/* Pillar */}
        <rect x={r - 2} y={r * 0.5} width="4" height={r} rx="0.5" fill={c} opacity="0.7" />
        <rect x={r - 4} y={r * 0.45} width="8" height="1.5" rx="0.5" fill={c} />
        <rect x={r - 4} y={r * 1.45} width="8" height="1.5" rx="0.5" fill={c} />
      </svg>
    ),
    somatic: (
      <svg width={s} height={s} viewBox={v}>
        {bg}
        {/* Body silhouette — simple seated figure */}
        <circle cx={r} cy={r * 0.6} r="2.5" fill={c} opacity="0.7" />
        <path d={`M ${r - 3.5} ${r * 1.5} Q ${r} ${r * 0.85} ${r + 3.5} ${r * 1.5}`}
          stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    ),
    taoist: (
      <svg width={s} height={s} viewBox={v}>
        {bg}
        {/* Yin-yang */}
        <defs>
          <clipPath id={`tao-left-${s}`}><rect x="0" y="0" width={r} height={s} /></clipPath>
          <clipPath id={`tao-right-${s}`}><rect x={r} y="0" width={r} height={s} /></clipPath>
        </defs>
        <circle cx={r} cy={r} r={r * 0.45} stroke={c} strokeWidth="1.2" fill="none" />
        {/* Left half filled */}
        <circle cx={r} cy={r} r={r * 0.45} fill={c} opacity="0.7" clipPath={`url(#tao-left-${s})`} />
        {/* S-curve: top small arc dark, bottom small arc light */}
        <path d={`M ${r} ${r * 0.55} A ${r * 0.225} ${r * 0.225} 0 0 1 ${r} ${r} A ${r * 0.225} ${r * 0.225} 0 0 0 ${r} ${r * 1.45}`} fill={c} opacity="0.7" />
        <path d={`M ${r} ${r * 0.55} A ${r * 0.225} ${r * 0.225} 0 0 0 ${r} ${r} A ${r * 0.225} ${r * 0.225} 0 0 1 ${r} ${r * 1.45}`} fill="white" />
        {/* Dots */}
        <circle cx={r} cy={r * 0.775} r={r * 0.07} fill="white" />
        <circle cx={r} cy={r * 1.225} r={r * 0.07} fill={c} opacity="0.7" />
      </svg>
    ),
    friend: (
      <svg width={s} height={s} viewBox={v}>
        {bg}
        {/* Simple person */}
        <circle cx={r} cy={r * 0.65} r="2.5" fill={c} opacity="0.7" />
        <path d={`M ${r - 5} ${r * 1.55} a 5 4.5 0 0 1 10 0`} fill={c} opacity="0.5" />
      </svg>
    ),
    sufi: (
      <svg width={s} height={s} viewBox={v}>
        {bg}
        {/* Crescent moon via mask — circle with a cutout */}
        <defs>
          <mask id={`sufi-${s}`}>
            <rect width={s} height={s} fill="black" />
            <circle cx={r} cy={r} r={r * 0.45} fill="white" />
            <circle cx={r + r * 0.25} cy={r - r * 0.1} r={r * 0.38} fill="black" />
          </mask>
        </defs>
        <circle cx={r} cy={r} r={r * 0.45} fill={c} opacity="0.7" mask={`url(#sufi-${s})`} />
      </svg>
    ),
    watts: (
      <svg width={s} height={s} viewBox={v}>
        {bg}
        {/* Mountain + wave — East meets West */}
        <path d={`M ${r * 0.35} ${r * 1.35} L ${r} ${r * 0.55} L ${r * 1.65} ${r * 1.35}`}
          stroke={c} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d={`M ${r * 0.4} ${r * 1.45} Q ${r * 0.7} ${r * 1.25} ${r} ${r * 1.45} T ${r * 1.6} ${r * 1.45}`}
          stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
  };

  return icons[icon] || icons.auto;
}
