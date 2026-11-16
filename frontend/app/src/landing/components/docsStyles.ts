// Shared type and colour tokens for the documentation pages (see DocsShell.tsx).
// Kept out of the component module so Vite Fast Refresh keeps working
// (react-refresh/only-export-components). Every value is a complete, literal
// Tailwind class string so the content scanner picks it up.
export const docsStyles = {
  eyebrow: 'font-mono text-[11px] font-bold uppercase tracking-[.18em] text-violet-800',
  h2: 'soberania-serif mt-3 text-3xl leading-[1.05] tracking-[-.03em] text-slate-950 md:text-4xl',
  h3: 'soberania-serif text-xl leading-tight text-slate-950',
  body: 'text-[15px] leading-7 text-slate-600',
  strong: 'font-semibold text-slate-950',
  code: 'rounded-sm bg-violet-700/[0.07] px-1 py-0.5 font-mono text-[0.9em] text-violet-950',
  codeBlock:
    'overflow-x-auto border border-slate-900/10 bg-[#0c0d14] p-5 font-mono text-[13px] leading-6 text-slate-200 shadow-[0_24px_70px_rgba(15,23,42,.10)]',
  card: 'border border-slate-900/10 bg-white/60 p-6',
  chip: 'inline-block border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[.06em]',
  focus: 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700',
  primaryButton:
    'inline-flex items-center justify-center bg-violet-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700',
  secondaryButton:
    'inline-flex items-center justify-center border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700',
  textLink:
    'font-semibold text-violet-800 underline decoration-violet-800/30 underline-offset-4 transition hover:decoration-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700',
} as const;

export const DOCS_CONTENT_ID = 'docs-content';
