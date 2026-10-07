const LABELS = ['IDENTITY','PROPERTY','ASSETS','CONSENT','CLAIMS','PROVENANCE','RIGHTS','AUTHORITY'] as const;

export function SovereignMirrorVisual() {
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-[760px]" aria-hidden="true">
      <svg viewBox="0 0 760 610" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="human-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#26183b" />
            <stop offset=".46" stopColor="#5b2d7a" />
            <stop offset="1" stopColor="#160f24" />
          </linearGradient>
          <linearGradient id="digital-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#efe5ff" stopOpacity=".8" />
            <stop offset=".38" stopColor="#c084fc" stopOpacity=".62" />
            <stop offset=".75" stopColor="#7c3aed" stopOpacity=".42" />
            <stop offset="1" stopColor="#312e81" stopOpacity=".16" />
          </linearGradient>
          <linearGradient id="boundary-line" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c4b5fd" stopOpacity="0" />
            <stop offset=".25" stopColor="#f5f3ff" stopOpacity=".9" />
            <stop offset=".7" stopColor="#a78bfa" stopOpacity=".92" />
            <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="amethyst-glow">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity=".4" />
            <stop offset=".58" stopColor="#7c3aed" stopOpacity=".12" />
            <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
          <clipPath id="digital-clip">
            <path d="M185 500C176 450 178 410 194 368C207 334 226 306 251 285C259 275 264 263 264 250C263 228 254 209 239 193C228 182 224 169 227 154C233 126 251 105 279 92C295 85 311 83 327 87C345 91 358 102 366 120C373 138 373 157 366 176C361 189 353 201 342 210C332 218 327 228 326 241C325 258 331 273 344 286C365 307 380 334 388 367C398 406 399 450 393 500Z" />
          </clipPath>
        </defs>

        <ellipse cx="380" cy="306" rx="270" ry="245" fill="url(#amethyst-glow)" opacity=".55" />

        <g stroke="#c4b5fd" strokeOpacity=".09" fill="none">
          <ellipse cx="380" cy="305" rx="325" ry="250" />
          <ellipse cx="380" cy="305" rx="275" ry="212" />
          <ellipse cx="380" cy="305" rx="220" ry="170" />
          <path d="M55 305H705M380 44V568" />
          <path d="M112 120 648 490M110 490 649 121" strokeDasharray="2 8" />
        </g>

        <g opacity=".36" stroke="#e9d5ff" strokeWidth=".8">
          <path d="M52 92H184M576 92H709M52 520H202M560 520H709" />
          <path d="M78 82V102M683 82V102M78 510V530M683 510V530" />
        </g>

        <g transform="translate(8 0)">
          <path
            d="M185 500C176 450 178 410 194 368C207 334 226 306 251 285C259 275 264 263 264 250C263 228 254 209 239 193C228 182 224 169 227 154C233 126 251 105 279 92C295 85 311 83 327 87C345 91 358 102 366 120C373 138 373 157 366 176C361 189 353 201 342 210C332 218 327 228 326 241C325 258 331 273 344 286C365 307 380 334 388 367C398 406 399 450 393 500Z"
            fill="url(#human-fill)"
            stroke="#c4b5fd"
            strokeOpacity=".22"
          />
          <path d="M331 196C346 203 358 216 364 232M346 210C353 214 358 221 360 228" fill="none" stroke="#f5d0fe" strokeOpacity=".46" />
          <path d="M311 132C330 137 343 150 350 170" fill="none" stroke="#f5d0fe" strokeOpacity=".3" />
        </g>

        <g transform="translate(752 0) scale(-1 1)">
          <path
            d="M185 500C176 450 178 410 194 368C207 334 226 306 251 285C259 275 264 263 264 250C263 228 254 209 239 193C228 182 224 169 227 154C233 126 251 105 279 92C295 85 311 83 327 87C345 91 358 102 366 120C373 138 373 157 366 176C361 189 353 201 342 210C332 218 327 228 326 241C325 258 331 273 344 286C365 307 380 334 388 367C398 406 399 450 393 500Z"
            fill="url(#digital-fill)"
            stroke="#d8b4fe"
            strokeOpacity=".65"
          />
          <g clipPath="url(#digital-clip)" stroke="#e9d5ff" strokeOpacity=".38" fill="none">
            <path d="M190 486 370 112M193 405 381 188M194 340 382 278M198 282 382 365M204 228 378 449" />
            <path d="M206 104 392 462M221 92 397 377M248 84 399 286M285 80 396 206M326 84 388 151" />
            <path d="M195 202 367 141 381 242 208 301 392 387 222 455" />
          </g>
          <g clipPath="url(#digital-clip)" fill="#f5f3ff">
            <circle cx="344" cy="166" r="3" />
            <circle cx="316" cy="124" r="2.2" />
            <circle cx="275" cy="112" r="2.5" />
            <circle cx="302" cy="243" r="2" />
            <circle cx="246" cy="292" r="2.5" />
            <circle cx="325" cy="342" r="2.2" />
            <circle cx="280" cy="395" r="2.5" />
            <circle cx="238" cy="454" r="2.2" />
          </g>
        </g>

        <rect x="376.5" y="42" width="7" height="520" rx="3.5" fill="url(#boundary-line)" opacity=".85" />
        <rect x="379" y="42" width="2" height="520" fill="#ffffff" opacity=".55" />
        <ellipse cx="380" cy="304" rx="34" ry="250" fill="url(#amethyst-glow)" opacity=".5" />

        <path d="M351 274C361 270 370 274 380 286C390 274 399 270 409 274" fill="none" stroke="#f5f3ff" strokeOpacity=".65" strokeWidth="1.3" />
        <circle cx="380" cy="286" r="3.5" fill="#f5f3ff" />

        {LABELS.map((label, index) => {
          const y = 110 + index * 52;
          const right = index % 2 === 0;
          return (
            <g key={label}>
              <line x1={right ? 526 : 234} x2={right ? 613 : 147} y1={y} y2={y} stroke="#c4b5fd" strokeOpacity=".32" />
              <circle cx={right ? 526 : 234} cy={y} r="2.8" fill="#c4b5fd" fillOpacity=".68" />
              <text x={right ? 622 : 138} y={y + 3} textAnchor={right ? 'start' : 'end'} fill="#e9d5ff" fillOpacity=".74" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9" letterSpacing="1.5">
                {label}
              </text>
            </g>
          );
        })}

        <g fill="#ddd6fe" fillOpacity=".52" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="8.5" letterSpacing="1.4">
          <text x="398" y="66">THE DIGITAL BOUNDARY</text>
          <text x="398" y="83">SUBJECT / CONTINUITY / MEANING</text>
          <text x="90" y="558">HUMAN SUBJECT</text>
          <text x="576" y="558">DIGITAL REPRESENTATION</text>
        </g>
      </svg>

      <div className="absolute inset-x-[19%] bottom-[2%] flex items-center justify-center gap-3 font-mono text-[9px] tracking-[0.18em] text-violet-100/45 uppercase">
        <span>Same subject</span><span className="h-px w-10 bg-violet-300/20" /><span>different medium</span>
      </div>
    </div>
  );
}
