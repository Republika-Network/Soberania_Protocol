import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { MINERALS } from '../enterprise/minerals';
import { CapabilityMineral } from './capabilityDock/CapabilityMineral';
import { CAPABILITY_FAMILIES } from './content';
import type { CapabilityId } from './capabilityDock/dockTokens';
import { FRONTERA_SYSTEMS_NAME, FRONTERA_SYSTEMS_URL } from '../brand';
import './ProtocolToEnterprise.css';

type GravityId = 'creator' | 'user' | 'community' | 'organization' | 'platform';
type EnterpriseId = 'governance' | 'access' | 'decisions' | 'obligations' | 'grants' | 'revocation' | 'evidence' | 'assurance';
type LayerId = 'protocol' | 'enterprise' | 'gravity';
type Point = { x: number; y: number };
type Edge<T extends string> = { from: T; to: T; strength?: number };
type VerticalBridge<F extends string, T extends string> = { from: F; to: T; strength?: number };
type ArchitectureState = {
  id: GravityId | 'deliberate'; label: string;
  protocol: CapabilityId[]; enterprise: EnterpriseId[]; gravity: Record<GravityId, number>;
  protocolEdges: Edge<CapabilityId>[]; enterpriseEdges: Edge<EnterpriseId>[]; gravityEdges: Edge<GravityId>[];
  protocolShape: CapabilityId[]; enterpriseShape: EnterpriseId[]; gravityShape: GravityId[];
  protocolToEnterprise: VerticalBridge<CapabilityId, EnterpriseId>[];
  enterpriseToGravity: VerticalBridge<EnterpriseId, GravityId>[];
};
type ActiveTarget = { layer: LayerId; id: string } | null;

const protocolPositions: Record<CapabilityId, Point> = {
  identity: { x: 15, y: 34 }, integrity: { x: 35, y: 63 }, provenance: { x: 54, y: 30 }, portability: { x: 72, y: 60 },
  interoperability: { x: 88, y: 31 }, verifiability: { x: 22, y: 76 }, licensing: { x: 55, y: 76 }, 'governance-compatibility': { x: 79, y: 79 },
};
const enterpriseNodes: { id: EnterpriseId; label: string; x: number; y: number }[] = [
  { id: 'governance', label: 'Governance', x: 14, y: 35 }, { id: 'access', label: 'Access', x: 35, y: 62 },
  { id: 'decisions', label: 'Decisions', x: 52, y: 31 }, { id: 'obligations', label: 'Obligations', x: 70, y: 61 },
  { id: 'grants', label: 'Grants', x: 86, y: 34 }, { id: 'revocation', label: 'Revocation', x: 23, y: 77 },
  { id: 'evidence', label: 'Evidence', x: 55, y: 78 }, { id: 'assurance', label: 'Assurance', x: 82, y: 78 },
];
const gravityFields: { id: GravityId; label: string; x: number; y: number }[] = [
  { id: 'creator', label: 'Creator', x: 14, y: 39 }, { id: 'user', label: 'User', x: 34, y: 66 },
  { id: 'community', label: 'Community', x: 53, y: 34 }, { id: 'organization', label: 'Organization', x: 71, y: 67 },
  { id: 'platform', label: 'Platform', x: 87, y: 38 },
];
const enterprisePositions = Object.fromEntries(enterpriseNodes.map(({ id, x, y }) => [id, { x, y }])) as Record<EnterpriseId, Point>;
const gravityPositions = Object.fromEntries(gravityFields.map(({ id, x, y }) => [id, { x, y }])) as Record<GravityId, Point>;
const edge = <T extends string>(from: T, to: T, strength = 1): Edge<T> => ({ from, to, strength });
const bridge = <F extends string, T extends string>(from: F, to: T, strength = 1): VerticalBridge<F, T> => ({ from, to, strength });

// Curated edges and bridges are explanatory compositions, never normative Protocol mappings.
const architectureStates: ArchitectureState[] = [
  { id: 'creator', label: 'Creator-led', protocol: ['identity', 'provenance', 'licensing'], enterprise: ['access', 'grants', 'evidence'], gravity: { creator: 1, user: .52, community: .34, organization: .28, platform: .2 }, protocolEdges: [edge('identity','provenance'),edge('provenance','licensing'),edge('licensing','identity')], enterpriseEdges: [edge('access','grants'),edge('grants','evidence'),edge('evidence','access')], gravityEdges: [edge('creator','user'),edge('user','community'),edge('community','creator')], protocolShape: ['identity','provenance','licensing'], enterpriseShape: ['access','grants','evidence'], gravityShape: ['creator','community','user'], protocolToEnterprise: [bridge('identity','access'),bridge('identity','evidence',.7),bridge('provenance','evidence'),bridge('licensing','grants')], enterpriseToGravity: [bridge('access','creator'),bridge('access','user',.75),bridge('evidence','community'),bridge('grants','creator',.7)] },
  { id: 'user', label: 'User-led', protocol: ['identity','portability','interoperability'], enterprise: ['access','decisions','revocation'], gravity: { creator: .38, user: 1, community: .5, organization: .28, platform: .2 }, protocolEdges: [edge('identity','portability'),edge('portability','interoperability'),edge('interoperability','identity')], enterpriseEdges: [edge('access','decisions'),edge('decisions','revocation'),edge('revocation','access')], gravityEdges: [edge('creator','user',.7),edge('user','community'),edge('community','organization',.55)], protocolShape: ['identity','interoperability','portability'], enterpriseShape: ['access','decisions','revocation'], gravityShape: [], protocolToEnterprise: [bridge('identity','access'),bridge('portability','access',.7),bridge('portability','revocation'),bridge('interoperability','decisions')], enterpriseToGravity: [bridge('access','user'),bridge('access','creator',.55),bridge('decisions','community'),bridge('revocation','user',.8)] },
  { id: 'community', label: 'Community-led', protocol: ['provenance','interoperability','governance-compatibility'], enterprise: ['governance','decisions','obligations'], gravity: { creator: .48, user: .52, community: 1, organization: .42, platform: .2 }, protocolEdges: [edge('provenance','interoperability'),edge('interoperability','governance-compatibility'),edge('governance-compatibility','provenance')], enterpriseEdges: [edge('governance','decisions'),edge('decisions','obligations'),edge('obligations','governance')], gravityEdges: [edge('creator','community'),edge('community','user'),edge('community','organization')], protocolShape: ['provenance','interoperability','governance-compatibility'], enterpriseShape: ['governance','decisions','obligations'], gravityShape: [], protocolToEnterprise: [bridge('provenance','governance',.7),bridge('provenance','decisions'),bridge('interoperability','decisions'),bridge('governance-compatibility','obligations')], enterpriseToGravity: [bridge('governance','community'),bridge('decisions','community'),bridge('decisions','user',.65),bridge('obligations','organization',.65)] },
  { id: 'organization', label: 'Organization-led', protocol: ['integrity','verifiability','governance-compatibility'], enterprise: ['governance','obligations','assurance'], gravity: { creator: .24, user: .3, community: .38, organization: 1, platform: .44 }, protocolEdges: [edge('integrity','verifiability'),edge('verifiability','governance-compatibility'),edge('governance-compatibility','integrity')], enterpriseEdges: [edge('governance','obligations'),edge('obligations','assurance'),edge('assurance','governance')], gravityEdges: [edge('community','organization'),edge('organization','platform'),edge('organization','user',.55)], protocolShape: ['integrity','governance-compatibility','verifiability'], enterpriseShape: ['governance','obligations','assurance'], gravityShape: [], protocolToEnterprise: [bridge('integrity','assurance'),bridge('verifiability','assurance'),bridge('verifiability','governance',.7),bridge('governance-compatibility','obligations')], enterpriseToGravity: [bridge('governance','organization'),bridge('obligations','organization'),bridge('assurance','platform',.7),bridge('assurance','community',.5)] },
  { id: 'platform', label: 'Platform-led', protocol: ['integrity','portability','verifiability'], enterprise: ['access','decisions','assurance'], gravity: { creator: .22, user: .3, community: .22, organization: .52, platform: 1 }, protocolEdges: [edge('integrity','portability'),edge('portability','verifiability'),edge('verifiability','integrity')], enterpriseEdges: [edge('access','decisions'),edge('decisions','assurance'),edge('assurance','access')], gravityEdges: [edge('user','platform',.55),edge('platform','organization'),edge('organization','community',.45)], protocolShape: ['integrity','portability','verifiability'], enterpriseShape: ['access','decisions','assurance'], gravityShape: [], protocolToEnterprise: [bridge('integrity','assurance'),bridge('portability','access'),bridge('portability','decisions',.65),bridge('verifiability','assurance')], enterpriseToGravity: [bridge('access','platform'),bridge('decisions','platform'),bridge('decisions','organization',.65),bridge('assurance','organization') ] },
  { id: 'deliberate', label: 'Deliberately balanced', protocol: ['identity','integrity','provenance','interoperability','governance-compatibility'], enterprise: ['governance','access','decisions','evidence','assurance'], gravity: { creator: .76, user: .82, community: .68, organization: .72, platform: .58 }, protocolEdges: [edge('identity','integrity'),edge('integrity','governance-compatibility'),edge('governance-compatibility','interoperability'),edge('interoperability','provenance'),edge('provenance','identity'),edge('integrity','provenance',.6)], enterpriseEdges: [edge('governance','access'),edge('access','evidence'),edge('evidence','assurance'),edge('assurance','decisions'),edge('decisions','governance'),edge('decisions','evidence',.6)], gravityEdges: [edge('creator','user'),edge('user','organization'),edge('organization','platform'),edge('platform','community'),edge('community','creator')], protocolShape: ['identity','provenance','interoperability','governance-compatibility','integrity'], enterpriseShape: ['governance','decisions','assurance','evidence','access'], gravityShape: ['creator','community','platform','organization','user'], protocolToEnterprise: [bridge('identity','access'),bridge('identity','evidence',.6),bridge('integrity','assurance'),bridge('provenance','evidence'),bridge('interoperability','decisions'),bridge('governance-compatibility','governance')], enterpriseToGravity: [bridge('access','user'),bridge('access','creator',.7),bridge('governance','community'),bridge('decisions','organization'),bridge('evidence','creator',.65),bridge('assurance','platform') ] },
];

const amethyst = MINERALS.amethyst;
const pointString = <T extends string>(ids: T[], positions: Record<T, Point>) => ids.map((id) => `${positions[id].x},${positions[id].y}`).join(' ');
const touches = (active: ActiveTarget, layer: LayerId, from: string, to: string) => !active || active.layer !== layer || active.id === from || active.id === to;

function LayerTopology<T extends string>({ stateId, layer, edges, shape, positions, activeTarget }: { stateId: string; layer: LayerId; edges: Edge<T>[]; shape: T[]; positions: Record<T, Point>; activeTarget: ActiveTarget }) {
  return <svg className={`layer-topology ${layer}-topology`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><AnimatePresence initial={false}><motion.g key={`${stateId}-${layer}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .6, ease: [0.22,1,0.36,1] }}>
    {shape.length > 2 ? <polygon className="topology-fill" points={pointString(shape, positions)} /> : null}
    {edges.map((item) => { const from = positions[item.from]; const to = positions[item.to]; return <g key={`${item.from}-${item.to}`} className={touches(activeTarget, layer, item.from, item.to) ? 'is-emphasized' : 'is-muted'}><line className="topology-glow" x1={from.x} y1={from.y} x2={to.x} y2={to.y}/><line className="topology-edge" x1={from.x} y1={from.y} x2={to.x} y2={to.y} style={{ '--edge-strength': item.strength ?? 1 } as CSSProperties}/></g>; })}
  </motion.g></AnimatePresence></svg>;
}

function MineralNode({ capability, active, related, onIntent }: { capability: (typeof CAPABILITY_FAMILIES)[number] & { id: CapabilityId }; active: boolean; related: boolean; onIntent: (value: boolean) => void }) {
  const influence = useMotionValue(active || related ? 1 : 0);
  useEffect(() => { influence.set(active || related ? 1 : 0); }, [active, related, influence]);
  const point = protocolPositions[capability.id];
  return <button type="button" className={`architecture-node protocol-node ${active ? 'is-active' : ''} ${related ? 'is-related' : ''}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} onMouseEnter={() => onIntent(true)} onMouseLeave={() => onIntent(false)} onFocus={() => onIntent(true)} onBlur={() => onIntent(false)} aria-pressed={active}><CapabilityMineral id={capability.id} influence={influence} className="mineral-glyph"/><span>{capability.name}</span></button>;
}

type LayerBounds = { left: number; top: number; width: number; height: number };

function bridgeCoordinates<F extends string, T extends string>(item: VerticalBridge<F,T>, from: Record<F,Point>, to: Record<T,Point>, lower: LayerBounds, upper: LayerBounds, sceneHeight: number) {
  return { x1: lower.left + from[item.from].x * lower.width / 100, y1: (lower.top + from[item.from].y * lower.height / 100) / sceneHeight * 100, x2: upper.left + to[item.to].x * upper.width / 100, y2: (upper.top + to[item.to].y * upper.height / 100) / sceneHeight * 100 };
}

function VerticalBridgeNetwork({ state, activeTarget, mobile = false }: { state: ArchitectureState; activeTarget: ActiveTarget; mobile?: boolean }) {
  const sceneHeight = mobile ? 1010 : 960;
  const bounds: Record<LayerId,LayerBounds> = mobile
    ? { gravity: { left:3,top:0,width:94,height:280 }, enterprise: { left:2,top:335,width:96,height:280 }, protocol: { left:1,top:670,width:98,height:280 } }
    : { gravity: { left:9,top:10,width:82,height:270 }, enterprise: { left:5.5,top:330,width:89,height:270 }, protocol: { left:1.5,top:650,width:97,height:270 } };
  const renderBridge = <F extends string,T extends string>(item: VerticalBridge<F,T>, from: Record<F,Point>, to: Record<T,Point>, fromLayer: LayerId, toLayer: LayerId, index: number) => {
    const p = bridgeCoordinates(item, from, to, bounds[fromLayer], bounds[toLayer], sceneHeight);
    const emphasized = !activeTarget || (activeTarget.layer === fromLayer && activeTarget.id === item.from) || (activeTarget.layer === toLayer && activeTarget.id === item.to);
    return <g key={`${fromLayer}-${item.from}-${item.to}-${index}`} className={`light-bridge ${emphasized ? 'is-emphasized' : 'is-muted'} ${index > 3 ? 'mobile-secondary' : ''}`} style={{ '--bridge-strength': item.strength ?? 1 } as CSSProperties}>
      <line className="bridge-atmosphere" x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}/><line className="bridge-volume" x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}/><line className="bridge-core" x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}/>
      <ellipse className="bridge-bloom" cx={p.x1} cy={p.y1} rx="3.6" ry="1.15"/><ellipse className="bridge-bloom" cx={p.x2} cy={p.y2} rx="3.6" ry="1.15"/>
      <ellipse className="bridge-refraction" cx={p.x1} cy={p.y1} rx="2.25" ry=".72"/><ellipse className="bridge-refraction" cx={p.x2} cy={p.y2} rx="2.25" ry=".72"/><circle className="bridge-spark" cx={p.x1} cy={p.y1} r=".32"/><circle className="bridge-spark" cx={p.x2} cy={p.y2} r=".38"/>
    </g>;
  };
  return <svg className={`vertical-bridge-network ${mobile ? 'mobile-network' : 'desktop-network'}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={`bridge-light-${mobile}`} x1="0" y1="1" x2="0" y2="0"><stop stopColor="#8b5cf6" stopOpacity=".55"/><stop offset=".5" stopColor="#818cf8" stopOpacity=".46"/><stop offset="1" stopColor="#99f6e4" stopOpacity=".52"/></linearGradient></defs><AnimatePresence initial={false}><motion.g key={`${state.id}-${mobile}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .7, ease: [0.22,1,0.36,1] }}>
    {state.protocolToEnterprise.map((item,index) => renderBridge(item, protocolPositions, enterprisePositions, 'protocol','enterprise',index))}
    {state.enterpriseToGravity.map((item,index) => renderBridge(item, enterprisePositions, gravityPositions, 'enterprise','gravity',index))}
  </motion.g></AnimatePresence></svg>;
}

export function ProtocolToEnterprise() {
  const reducedMotion = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const [stateIndex, setStateIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [activeTarget, setActiveTarget] = useState<ActiveTarget>(null);
  const state = architectureStates[stateIndex];
  useEffect(() => { const element = sectionRef.current; if (!element || !('IntersectionObserver' in window)) return; const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { rootMargin: '120px' }); observer.observe(element); return () => observer.disconnect(); }, []);
  useEffect(() => { if (reducedMotion || !isVisible || activeTarget) return; const timer = window.setInterval(() => setStateIndex((value) => (value + 1) % architectureStates.length), 7500); return () => window.clearInterval(timer); }, [activeTarget,isVisible,reducedMotion]);
  const relatedProtocol = (id: CapabilityId) => activeTarget?.layer === 'enterprise' && state.protocolToEnterprise.some((item) => item.from === id && item.to === activeTarget.id);
  const relatedEnterprise = (id: EnterpriseId) => (activeTarget?.layer === 'protocol' && state.protocolToEnterprise.some((item) => item.from === activeTarget.id && item.to === id)) || (activeTarget?.layer === 'gravity' && state.enterpriseToGravity.some((item) => item.from === id && item.to === activeTarget.id));
  const relatedGravity = (id: GravityId) => activeTarget?.layer === 'enterprise' && state.enterpriseToGravity.some((item) => item.from === activeTarget.id && item.to === id);
  return <section ref={sectionRef} id="protocol-to-enterprise" className="architecture-section scroll-mt-16 border-t border-slate-200" aria-labelledby="architecture-title"><div className="max-w-7xl mx-auto px-6 py-20">
    <header className="max-w-3xl"><p className={`text-xs font-bold uppercase tracking-[0.14em] ${amethyst.text}`}>Designing centers of gravity</p><h2 id="architecture-title" className="mt-3.5 text-3xl md:text-[2.5rem] font-extrabold tracking-tight text-slate-900 leading-[1.15]">Capabilities shape platforms.</h2><p className="mt-3.5 text-lg md:text-xl font-medium text-slate-600">How you combine them determines where power lives.</p><p className="mt-3 max-w-2xl text-[15px] md:text-base leading-relaxed text-slate-500">Soberanía exposes composable technological capabilities so platforms can deliberately design how control, authority and responsibility are distributed.</p></header>
    <MotionConfig reducedMotion="user" transition={{ duration: .6, ease: [0.22,1,0.36,1] }}><div className="architecture-instrument mt-10" aria-describedby="architecture-description"><p id="architecture-description" className="sr-only">Each architecture example shows how Soberanía Protocol capabilities can be operationalized through Frontera Systems to produce different distributions of control, authority and responsibility. Soft vertical relationships illustrate possible explanatory connections between layers and are not normative Protocol mappings. Architectural examples are choices, not moral rankings.</p>
      <VerticalBridgeNetwork state={state} activeTarget={activeTarget}/><VerticalBridgeNetwork state={state} activeTarget={activeTarget} mobile/>
      <div className="glass-plane gravity-plane"><div className="slab-edge" aria-hidden/><div className="plane-heading"><span>03</span><strong>Centers of gravity</strong><em>Distribution of power</em></div><LayerTopology stateId={state.id} layer="gravity" edges={state.gravityEdges} shape={state.gravityShape} positions={gravityPositions} activeTarget={activeTarget}/>{gravityFields.map((field) => { const weight=state.gravity[field.id]; return <button key={field.id} type="button" className={`gravity-field ${(activeTarget?.layer === 'gravity' && activeTarget.id === field.id) || relatedGravity(field.id) ? 'is-related' : ''}`} style={{ left:`${field.x}%`,top:`${field.y}%`,'--gravity-weight':weight } as CSSProperties} onMouseEnter={() => setActiveTarget({layer:'gravity',id:field.id})} onMouseLeave={() => setActiveTarget(null)} onFocus={() => setActiveTarget({layer:'gravity',id:field.id})} onBlur={() => setActiveTarget(null)} aria-label={`${field.label}: ${Math.round(weight*100)} percent relative emphasis in ${state.label} example`}><i aria-hidden/><span>{field.label}</span></button>; })}</div>
      <div className="glass-plane enterprise-plane"><div className="slab-edge" aria-hidden/><div className="plane-heading"><span>02</span><strong>{FRONTERA_SYSTEMS_NAME}</strong><em>Operationalization</em></div><LayerTopology stateId={state.id} layer="enterprise" edges={state.enterpriseEdges} shape={state.enterpriseShape} positions={enterprisePositions} activeTarget={activeTarget}/>{enterpriseNodes.map((node) => <button key={node.id} type="button" className={`architecture-node enterprise-node ${state.enterprise.includes(node.id)?'is-active':''} ${relatedEnterprise(node.id)?'is-related':''}`} style={{left:`${node.x}%`,top:`${node.y}%`}} onMouseEnter={() => setActiveTarget({layer:'enterprise',id:node.id})} onMouseLeave={() => setActiveTarget(null)} onFocus={() => setActiveTarget({layer:'enterprise',id:node.id})} onBlur={() => setActiveTarget(null)} aria-pressed={state.enterprise.includes(node.id)}><i aria-hidden/><span>{node.label}</span></button>)}</div>
      <div className="glass-plane protocol-plane"><div className="slab-edge" aria-hidden/><div className="plane-heading"><span>01</span><strong>Soberanía Protocol</strong><em>Composable primitives</em></div><LayerTopology stateId={state.id} layer="protocol" edges={state.protocolEdges} shape={state.protocolShape} positions={protocolPositions} activeTarget={activeTarget}/>{(CAPABILITY_FAMILIES as ((typeof CAPABILITY_FAMILIES)[number]&{id:CapabilityId})[]).map((capability) => <MineralNode key={capability.id} capability={capability} active={state.protocol.includes(capability.id)} related={relatedProtocol(capability.id)} onIntent={(value) => setActiveTarget(value?{layer:'protocol',id:capability.id}:null)}/>)}</div>
      <div className="state-console"><div className="state-readout" aria-live="polite"><span>Architecture example</span><AnimatePresence initial={false}><motion.strong key={state.id} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}}>{state.label}</motion.strong></AnimatePresence></div><div className="state-selector" aria-label="Architecture examples">{architectureStates.map((item,index)=><button key={item.id} type="button" className={index===stateIndex?'is-active':''} onClick={()=>setStateIndex(index)} aria-label={`Show ${item.label} architecture`} aria-pressed={index===stateIndex}/>)}</div></div>
    </div></MotionConfig>
    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"><a href="/docs#getting-started" className={`inline-flex w-full sm:w-auto items-center justify-center rounded-2xl ${amethyst.solid} px-8 py-4 text-white font-semibold ${amethyst.solidHover} transition-all active:scale-[0.98]`}>Review Protocol Documentation</a><a href={FRONTERA_SYSTEMS_URL} target="_blank" rel="noreferrer" className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl border border-slate-200 hover:border-slate-300 text-slate-900 font-semibold px-8 py-4 transition-all active:scale-[0.98]">Explore {FRONTERA_SYSTEMS_NAME} &rarr;</a></div>
  </div></section>;
}
