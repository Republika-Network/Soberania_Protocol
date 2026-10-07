import { ProtocolFooter } from './components/ProtocolFooter';
import { ProtocolNav } from './protocol/Nav';
import { Hero } from './protocol/Hero';
import { SovereignSphereSection } from './protocol/SovereignSphereSection';
import { FileToAsset } from './protocol/FileToAsset';
import { ProtocolToFronteraCompact } from './protocol/ProtocolToFronteraCompact';
import { Developers } from './protocol/Developers';
import { CtaSection } from './protocol/CtaSection';
import { usePageMeta } from './protocol/usePageMeta';

// Soberanía Protocol, rebuilt onto the unified AOC Design Language: the same
// light-primary layout, typography, spacing, nav/footer shell and component
// library (Card, SectionHeader, IconCircle, Chip, StatusPill, StepFlow,
// PipelineRail — all from ../enterprise/primitives) that Soberanía Enterprise,
// Governed Access and Assurance already share, with two dark #0B1220
// bookends (Hero, closing CTA) — the same rhythm every other AOC surface
// follows. The one thing that's still Protocol's own is its Capability
// Mineral: Amethyst, applied only to accents (badges, icons, chips,
// highlights, section identifiers), never to the layout itself. See
// docs/w008-unified-aoc-design-language-capability-minerals.md.
export const AocLandingPage = () => {
  usePageMeta();

  return (
    <main className="min-h-screen bg-[#f8f7f3] text-slate-900 font-sans">
      <ProtocolNav />

      <Hero />
      <SovereignSphereSection />
      <FileToAsset />
      <span id="sovereignty" aria-hidden="true" className="block h-0" />
      <ProtocolToFronteraCompact />
      <Developers />
      <CtaSection />

      <ProtocolFooter accent="amethyst" surface="protocol" />
    </main>
  );
};
