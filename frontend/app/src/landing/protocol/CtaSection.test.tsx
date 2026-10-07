import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtocolFooter } from '../components/ProtocolFooter';
import { CtaSection } from './CtaSection';

afterEach(cleanup);

describe('Protocol closing handoff', () => {
  it('offers public source first and public documentation second', () => {
    render(<CtaSection />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Ownership should survive the platform.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Identity, property, assets, capabilities and governance should retain their meaning beyond the system that happens to hold them today.',
      ),
    ).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'View protocol source on GitHub',
      'Read the Docs',
    ]);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://github.com/Republika-Network/Soberania_Protocol/tree/main/packages/protocol',
    );
    expect(links[1]).toHaveAttribute('href', '/?view=docs');
    expect(screen.queryByRole('link', { name: /enterprise/i })).not.toBeInTheDocument();
  });

  it('moves directly from the closing handoff to the global footer', () => {
    render(
      <>
        <CtaSection />
        <ProtocolFooter accent="amethyst" surface="protocol" />
      </>,
    );

    expect(screen.queryByText(/protocol handoff/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ship digital assets/i)).not.toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Frontera Systems' })).toHaveAttribute(
      'href',
      'https://frontera-systems.com',
    );
    expect(screen.queryByRole('link', { name: 'Enterprise' })).not.toBeInTheDocument();
  });
});
