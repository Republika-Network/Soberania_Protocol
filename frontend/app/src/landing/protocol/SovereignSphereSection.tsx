const ELEMENTS = [
  { id: 'identity', title: 'Identity', copy: 'Persistent references to who or what the subject is.', x: 50, y: 11 },
  { id: 'property', title: 'Property', copy: 'Things that remain attributable to their legitimate owner or holder.', x: 78, y: 24 },
  { id: 'assets', title: 'Assets', copy: 'Digital things whose identity and meaning should survive the platform.', x: 88, y: 54 },
  { id: 'consent', title: 'Consent', copy: 'Explicit, scoped and revocable permission.', x: 72, y: 82 },
  { id: 'claims', title: 'Claims', copy: 'Structured assertions made about a subject or asset.', x: 28, y: 82 },
  { id: 'provenance', title: 'Provenance', copy: 'Where something came from and how it reached its present state.', x: 12, y: 54 },
  { id: 'rights', title: 'Rights', copy: 'Terms and relationships that shape legitimate use and control.', x: 22, y: 24 },
  { id: 'authority', title: 'Authority', copy: 'Who or what may legitimately decide within a defined scope.', x: 50, y: 91 },
] as const;

function SphereDiagram() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[610px]">
      <div className="absolute inset-[7%] rounded-full border border-violet-300/25" />
      <div className="absolute inset-[20%] rounded-full border border-violet-300/20" />
      <div className="absolute inset-[34%] rounded-full border border-violet-300/18" />
      <div className="absolute inset-[41%] flex items-center justify-center rounded-full border border-violet-300/35 bg-[#110d1e] shadow-[0_0_70px_rgba(124,58,237,.18)]">
        <div className="text-center">
          <span className="block font-mono text-[9px] tracking-[.18em] text-violet-200/55 uppercase">subject</span>
          <strong className="soberania-serif mt-1 block text-2xl font-normal text-white">You / Yours</strong>
          <span className="mt-2 block text-[11px] leading-4 text-white/40">the sovereign center</span>
        </div>
      </div>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <g stroke="#7c3aed" strokeOpacity=".22" fill="none">
          {ELEMENTS.map((item) => <line key={item.id} x1="50" y1="50" x2={item.x} y2={item.y} />)}
        </g>
        <g fill="#7c3aed">
          {ELEMENTS.map((item) => <circle key={item.id} cx={item.x} cy={item.y} r="1.25" fillOpacity=".72" />)}
        </g>
      </svg>
      {ELEMENTS.map((item) => (
        <div key={item.id} className="absolute w-32 -translate-x-1/2 -translate-y-1/2 text-center sm:w-36" style={{ left: `${item.x}%`, top: `${item.y}%` }}>
          <span className="font-mono text-[9px] font-bold tracking-[.13em] text-violet-900/75 uppercase">{item.title}</span>
        </div>
      ))}
    </div>
  );
}

export function SovereignSphereSection() {
  return (
    <section id="sovereign-sphere" className="relative overflow-hidden border-t border-violet-950/10 bg-[#f2eee5] text-slate-950">
      <div className="soberania-parchment-grid absolute inset-0 opacity-80" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-20 md:py-28 lg:grid-cols-[minmax(0,.75fr)_minmax(520px,1.25fr)] lg:items-center">
        <div className="max-w-xl">
          <p className="font-mono text-[10px] font-bold tracking-[.18em] text-violet-800 uppercase">01 / The sovereign sphere</p>
          <h2 className="soberania-serif mt-5 text-4xl leading-[1.02] tracking-[-.035em] text-slate-950 md:text-6xl">Your digital self is only the beginning.</h2>
          <p className="mt-6 text-[16px] leading-7 text-slate-700">
            Sovereignty also includes the property, assets, permissions, claims, provenance, rights and authority connected to you. Soberanía treats these as parts of a broader digital sphere that should retain meaning even when the system around them changes.
          </p>
          <p className="mt-5 border-l border-violet-700/35 pl-4 text-sm leading-6 text-slate-600">
            The person remains the moral center. The protocol defines portable structures for the things that represent, belong to, or derive authority from that subject.
          </p>
        </div>
        <SphereDiagram />
      </div>
      <div className="relative mx-auto grid max-w-7xl border-t border-slate-900/10 px-6 sm:grid-cols-2 lg:grid-cols-4">
        {ELEMENTS.map((item) => (
          <article key={item.id} className="border-b border-slate-900/10 py-6 sm:odd:border-r sm:px-5 lg:border-b-0 lg:border-r lg:last:border-r-0">
            <span className="font-mono text-[9px] tracking-[.15em] text-violet-800 uppercase">{item.title}</span>
            <p className="mt-2 text-[13px] leading-5 text-slate-600">{item.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
