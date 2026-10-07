const PHOTO =
  'https://images.unsplash.com/photo-1648153745190-19b97c3af2b5?auto=format&fit=crop&fm=jpg&q=80&w=1800';

const LABELS = ['IDENTITY','PROPERTY','ASSETS','CONSENT','CLAIMS','PROVENANCE','RIGHTS','AUTHORITY'] as const;

export function SovereignMirrorVisual() {
  return (
    <div className="relative h-full min-h-[560px] w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-[position:50%_42%] opacity-90"
        style={{ backgroundImage: `url("${PHOTO}")` }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,9,18,.86)_0%,rgba(7,9,18,.28)_34%,rgba(7,9,18,.05)_52%,rgba(7,9,18,.72)_100%)]" aria-hidden="true" />
      <div className="absolute inset-y-0 left-[52%] w-px bg-violet-100/70 shadow-[0_0_28px_rgba(196,181,253,.9)]" aria-hidden="true" />
      <div className="absolute inset-y-0 left-[52%] w-16 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(167,139,250,.14),transparent)] blur-xl" aria-hidden="true" />

      <svg viewBox="0 0 760 620" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="digitalBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F5F3FF" stopOpacity=".82" />
            <stop offset=".3" stopColor="#C084FC" stopOpacity=".72" />
            <stop offset=".72" stopColor="#7C3AED" stopOpacity=".5" />
            <stop offset="1" stopColor="#312E81" stopOpacity=".14" />
          </linearGradient>
          <radialGradient id="digitalGlow">
            <stop offset="0" stopColor="#A78BFA" stopOpacity=".48" />
            <stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="560" cy="300" rx="200" ry="255" fill="url(#digitalGlow)" />
        <path
          d="M520 520C507 462 508 412 525 367C540 330 565 304 591 283C603 270 609 255 608 237C606 211 593 190 573 173C560 162 554 147 558 129C565 101 586 80 615 70C636 63 657 65 674 75C692 86 702 104 703 126C704 148 696 168 680 185C668 197 662 211 663 227C664 248 674 265 692 281C713 301 727 330 734 365C743 411 741 461 731 520Z"
          fill="url(#digitalBody)"
          stroke="#E9D5FF"
          strokeOpacity=".6"
        />
        <g stroke="#F5F3FF" strokeOpacity=".3" fill="none">
          <path d="M522 506 690 88M520 432 711 190M521 360 724 290M533 286 723 394M555 215 705 493" />
          <path d="M548 92 736 483M574 74 740 386M611 66 738 298M650 70 728 211" />
          <path d="M542 191 700 132 731 228 550 299 737 377 567 460" />
        </g>
        <g fill="#F5F3FF">
          <circle cx="671" cy="151" r="3" /><circle cx="638" cy="101" r="2.4" /><circle cx="598" cy="91" r="2.3" />
          <circle cx="642" cy="236" r="2.4" /><circle cx="584" cy="296" r="2.7" /><circle cx="666" cy="345" r="2.4" />
          <circle cx="611" cy="405" r="2.8" /><circle cx="570" cy="468" r="2.5" />
        </g>

        {LABELS.map((label, index) => {
          const y = 108 + index * 58;
          return (
            <g key={label}>
              <line x1="650" y1={y} x2="732" y2={y} stroke="#C4B5FD" strokeOpacity=".3" />
              <circle cx="650" cy={y} r="2.5" fill="#C4B5FD" fillOpacity=".7" />
              <text x="738" y={y + 3} fill="#E9D5FF" fillOpacity=".76" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9" letterSpacing="1.3">
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="absolute left-[55%] top-8 font-mono text-[9px] tracking-[.18em] text-violet-100/55 uppercase">
        The digital boundary
      </div>
      <div className="absolute bottom-7 left-[55%] max-w-[18rem] border-l border-violet-200/25 pl-3 font-mono text-[9px] leading-4 tracking-[.12em] text-white/45 uppercase">
        The medium may change.<br />The owner, meaning and authority should not.
      </div>
    </div>
  );
}
