import { useRef } from 'react';
import { motion, type Variants } from 'framer-motion';
import { SectionHeader } from '../enterprise/primitives';
import { MINERALS } from '../enterprise/minerals';
import { TransformationCore } from './TransformationCore';
import { useTransformationPhase } from './useTransformationPhase';

const ASSET_TRAITS = ['Identity', 'Integrity', 'Provenance', 'Capabilities', 'References', 'Portability'];
const m = MINERALS.amethyst;

const traitListVariants: Variants = {
  hidden: { transition: { staggerChildren: 0.07 } },
  visible: { transition: { staggerChildren: 0.07 } },
};

const traitItemVariants: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
};

function RetroFilePortrait() {
  return (
    <figure className="w-52 rotate-[-1deg] border-2 border-slate-950 bg-white p-2.5 pb-4 shadow-[5px_6px_0_rgba(15,23,42,0.12)] md:w-56">
      <div className="flex aspect-[4/5] items-center justify-center border border-slate-950 bg-white">
        <svg
          aria-label="Minimal smiling stick figure with messy hair"
          className="h-[88%] w-[88%] text-slate-950"
          viewBox="0 0 180 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          >
            <path d="M53 62C54 36 72 20 94 21C119 22 132 40 128 65C124 88 110 99 88 97C65 95 52 83 53 62Z" />
            <path d="M70 54L70 66M108 53L107 66" />
            <path d="M68 74C75 87 99 91 112 74" />
            <path d="M70 25L61 10M78 22L75 4M87 21L89 2M97 21L105 5M105 24L120 11" />
            <path d="M90 98L90 158M89 112L49 151M91 112L129 151" />
            <path d="M49 151L36 151M49 151L43 164M49 151L55 162" />
            <path d="M129 151L142 151M129 151L123 164M129 151L136 162" />
            <path d="M90 158L68 202M90 158L113 202" />
            <path d="M68 202C61 207 53 207 48 204M113 202C120 207 129 206 134 202" />
          </g>
        </svg>
      </div>
      <figcaption className="pt-3 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-slate-700">
        photo.jpg
      </figcaption>
    </figure>
  );
}

export function FileToAsset() {
  const stageRef = useRef<HTMLDivElement>(null);
  const { phase, reduceMotion } = useTransformationPhase(stageRef);
  const traitsRevealed = reduceMotion || phase === 'emit' || phase === 'rest';

  return (
    <section id="digital-asset" className="relative scroll-mt-16 overflow-hidden border-t border-slate-200/70 bg-[#faf9f6]"><div className="soberania-light-grid absolute inset-0 opacity-35" aria-hidden="true" /><div className="relative max-w-7xl mx-auto px-6 py-20">
      <SectionHeader
        eyebrow="02 / Digital Assets"
        title="A file contains data. A digital asset carries meaning."
        description="A file becomes more than bytes when compatible systems can interpret its identity, integrity, provenance and capabilities independently of where that file happens to live."
        mineral="amethyst"
      />

      <div ref={stageRef} className="grid md:grid-cols-[18rem_auto_minmax(0,26rem)] xl:grid-cols-[18rem_auto_26rem] md:justify-center gap-6 md:gap-0 items-center">
        <motion.div
          className="flex justify-center"
          animate={reduceMotion ? undefined : { y: [0, -2, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <RetroFilePortrait />
        </motion.div>

        <TransformationCore phase={phase} reduceMotion={reduceMotion} />

        <div className={`flex flex-col rounded-2xl border ${m.border} ${m.soft} p-6 md:h-60 md:p-5`}>
          <p className={`text-xs uppercase tracking-[0.2em] font-mono ${m.text}`}>
            Soberanía-Compatible Digital Asset
          </p>
          <p className="mt-2 font-mono text-slate-700 text-base leading-5">photo.jpg + protocol context</p>
          {/*
            Capability matrix: 1 col on narrow screens, 2×3 on sm+.
            flex-1 + content-evenly uses the card's remaining vertical space
            without changing outer md:h-60 dimensions.
          */}
          <motion.ul
            className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 md:mt-5 md:flex-1 md:content-evenly md:gap-y-0"
            variants={traitListVariants}
            animate={traitsRevealed ? 'visible' : 'hidden'}
            initial={reduceMotion ? false : 'hidden'}
          >
            {ASSET_TRAITS.map((trait) => (
              <motion.li
                key={trait}
                className="flex items-center gap-2.5 text-[15px] leading-5 text-slate-900"
                variants={traitItemVariants}
              >
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                {trait}
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </div>

      <p className="mt-8 max-w-3xl text-sm text-slate-500 leading-relaxed">
        Not every raw file is automatically a Soberanía-compatible asset. An application or tool that
        speaks the protocol creates or registers that context — see{' '}
        <a href="#creation" className={`${m.text} ${m.textHover} underline underline-offset-2`}>
          how an asset is created
        </a>
        .
      </p>
      </div>
    </section>
  );
}
