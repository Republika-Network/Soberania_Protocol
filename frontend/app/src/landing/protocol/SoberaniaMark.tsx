export function SoberaniaMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sobe-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F0E7FF" />
          <stop offset=".36" stopColor="#C084FC" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
        <linearGradient id="sobe-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#DDD6FE" />
          <stop offset=".46" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#312E81" />
        </linearGradient>
        <linearGradient id="sobe-c" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#4C1D95" />
          <stop offset=".52" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#E9D5FF" />
        </linearGradient>
      </defs>
      <g stroke="#F5F3FF" strokeOpacity=".12" strokeWidth=".7">
        <path d="M10 28 32 15 32 43 10 56Z" fill="url(#sobe-a)" />
        <path d="M32 15 57 1 57 29 32 43Z" fill="url(#sobe-b)" />
        <path d="M61 38 86 52 86 80 61 66Z" fill="url(#sobe-a)" />
        <path d="M12 59 36 45 60 58 36 72Z" fill="url(#sobe-c)" />
        <path d="M12 80 36 66 60 79 36 93Z" fill="url(#sobe-b)" />
        <path d="M61 72 86 86 86 114 61 100Z" fill="url(#sobe-a)" />
      </g>
    </svg>
  );
}
