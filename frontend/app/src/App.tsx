import { useEffect, useState } from 'react';
import { AocLandingPage } from './landing/AocLandingPage';
import { renderAssurancePage } from './landing/enterprise/AssurancePage';
import { renderIntelligenceRiskPage } from './landing/IntelligenceRiskPage';
import { AssuranceProfilePage } from './landing/AssuranceProfilePage';
import { AboutPage, MethodologyPage, PrivacyPage, ResearchPage, TermsPage } from './landing/AssuranceSupportPages';
import { GovVsSovPage } from './landing/GovVsSovPage';
import { ResearchHubPage } from './landing/ResearchHubPage';
import { AssessmentPlaceholderPage } from './landing/AssessmentPlaceholderPage';
import { WhatIsAiSovereigntyPage } from './landing/WhatIsAiSovereigntyPage';
import { renderEnterprisePage } from './landing/EnterprisePage';
import { CapabilityDetailPage } from './landing/enterprise/CapabilityDetailPage';
import { GovernedAccessPage } from './landing/enterprise/GovernedAccessPage';
import { renderDocsPage } from './landing/DocsPage';
import { renderContactPage } from './landing/ContactPage';
import { renderAboutPage } from './landing/AboutPage';
import { ManifestoPage } from './landing/ManifestoPage';

function getView() {
  const params = new URLSearchParams(window.location.search);
  return params.get('view') || 'landing';
}

const ASSESSMENT_SLUGS = ['anthropic', 'writer', 'harvey', 'ollama', 'anythingllm'];

export default function App() {
  const [view, setView] = useState(getView());
  const pathname = window.location.pathname;
  const assuranceProfileMatch = pathname.match(
    /^\/assurance\/index\/([^/]+)\/?$/
  );
  const researchAssessmentMatch = pathname.match(
    /^\/research\/([^/]+)-assessment\/?$/
  );

  useEffect(() => {
    const sync = () => setView(getView());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  if (assuranceProfileMatch) {
    return <AssuranceProfilePage slug={decodeURIComponent(assuranceProfileMatch[1])} />;
  }
  if (researchAssessmentMatch) {
    const slug = decodeURIComponent(researchAssessmentMatch[1]);
    if (ASSESSMENT_SLUGS.includes(slug)) {
      return <AssessmentPlaceholderPage slug={slug} />;
    }
  }
  if (pathname === '/assurance/intelligence-risk') return renderIntelligenceRiskPage();
  if (pathname === '/assurance/privacy') return <PrivacyPage />;
  if (pathname === '/assurance/terms') return <TermsPage />;
  if (pathname === '/assurance/methodology') return <MethodologyPage />;
  if (pathname === '/assurance/research') return <ResearchPage />;
  if (pathname === '/assurance/about') return <AboutPage />;
  if (pathname === '/ai-governance-vs-ai-sovereignty') return <GovVsSovPage />;
  if (pathname === '/research') return <ResearchHubPage />;
  if (pathname === '/what-is-ai-sovereignty') return <WhatIsAiSovereigntyPage />;
  if (pathname === '/docs') return renderDocsPage();
  if (pathname === '/docs/manifesto') return <ManifestoPage />;
  if (view === 'assurance') return renderAssurancePage();
  if (view === 'docs') return renderDocsPage();
  if (view === 'enterprise') return renderEnterprisePage();
  if (view === 'governed-access') return <GovernedAccessPage />;
  if (view === 'capability') {
    const slug = new URLSearchParams(window.location.search).get('slug') ?? '';
    return <CapabilityDetailPage slug={slug} />;
  }
  if (view === 'contact') return renderContactPage();
  if (view === 'about') return renderAboutPage();

  return <AocLandingPage />;
}
