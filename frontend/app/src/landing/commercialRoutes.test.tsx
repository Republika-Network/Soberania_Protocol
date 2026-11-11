import { cleanup, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderAboutPage } from './AboutPage';
import { renderContactPage } from './ContactPage';
import { CtaSection } from './enterprise/CtaSection';
import { fronteraAssessmentHref, fronteraDemoHref, fronteraFitCallHref } from './fronteraCommercial';

// SOBE-MKT-00. The contract: no commercial action on this site points at the
// dead hello@aocprotocol.xyz inbox; business enquiries go to Frontera Systems
// and say so; the contact page no longer pretends a mailto draft is a form
// submission; the About page no longer presents the retired brand.

afterEach(cleanup);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|html)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('commercial routes', () => {
  it('no shipped source sends anyone to the dead aocprotocol.xyz inbox', () => {
    const offenders = sourceFiles('src').filter((file) =>
      /aocprotocol\.xyz/.test(stripComments(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('builds Frontera links with referral attribution and no personal data', () => {
    const url = new URL(fronteraAssessmentHref('enterprise-cta'));
    expect(url.origin).toBe('https://frontera-systems.com');
    expect(url.searchParams.get('view')).toBe('technical-assessment');
    expect(url.searchParams.get('utm_source')).toBe('soberaniaprotocol.org');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
    expect(url.searchParams.get('utm_content')).toBe('enterprise-cta');
    expect(new URL(fronteraDemoHref('x')).pathname).toBe('/demo/governed-payment');
  });

  it('sends "Book a fit call" straight to Frontera\'s fit-call page, keeping the referral UTMs', () => {
    const url = new URL(fronteraFitCallHref('contact-page'));
    expect(url.origin).toBe('https://frontera-systems.com');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('view')).toBe('fit-call');
    expect(url.searchParams.get('utm_source')).toBe('soberaniaprotocol.org');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
    expect(url.searchParams.get('utm_content')).toBe('contact-page');
    // One `?` only: the UTMs are appended to the existing query, not a second one.
    expect(fronteraFitCallHref('x').split('?')).toHaveLength(2);
  });

  it('the enterprise closing CTA names Frontera Systems and leaves for frontera-systems.com', () => {
    render(<CtaSection />);
    const primary = screen.getByRole('link', { name: /Request a Technical Assessment from Frontera Systems/ });
    expect(primary.getAttribute('href')).toMatch(/^https:\/\/frontera-systems\.com\/\?view=technical-assessment/);
    const book = screen.getByRole('link', { name: 'Book a fit call with Frontera Systems' });
    expect(book.getAttribute('href')).toBe(fronteraFitCallHref('enterprise-cta'));
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/^mailto:/);
    }
  });
});

describe('contact page', () => {
  it('has no form that only opens an email draft', () => {
    const { container } = render(renderContactPage());
    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByText(/Open email draft/)).toBeNull();
  });

  it('routes business enquiries to Frontera Systems', () => {
    render(renderContactPage());
    const book = screen.getByRole('link', { name: 'Book a fit call with Frontera Systems' });
    expect(book.getAttribute('href')).toBe(fronteraFitCallHref('contact-page'));
    expect(new URL(book.getAttribute('href') ?? '').searchParams.get('view')).toBe('fit-call');
  });

  it('presents the protocol email as email', () => {
    render(renderContactPage());
    expect(screen.getByRole('link', { name: 'Email Soberanía Protocol' }).getAttribute('href')).toMatch(/^mailto:/);
  });
});

describe('about page', () => {
  it('names Frontera Systems as the commercial provider, not the retired brand', () => {
    const { container } = render(renderAboutPage());
    expect(container.textContent).not.toMatch(/Soberanía Enterprise/);
    expect(container.textContent).toMatch(/Frontera Systems/);
    expect(screen.getByRole('link', { name: /Visit Frontera Systems/ }).getAttribute('href')).toMatch(
      /^https:\/\/frontera-systems\.com\//,
    );
  });
});
