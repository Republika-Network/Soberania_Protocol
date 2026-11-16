import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocsPage } from './DocsPage';
import { ProtocolToEnterprise } from './protocol/ProtocolToEnterprise';

describe('public Protocol developer journey', () => {
  it('renders Protocol documentation without the former Enterprise control-plane framing', () => {
    const { container } = render(<DocsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Build with sovereign digital assets.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Breadcrumb')).toHaveTextContent(/Protocol.*Documentation/);
    expect(container).not.toHaveTextContent('consent-native control plane');
    expect(container).not.toHaveTextContent('Protocol / Enterprise / Developers');
    expect(screen.getByRole('heading', { name: 'Inspect it. Challenge it. Improve it.' })).toBeInTheDocument();
  });

  it('makes Protocol documentation the primary CTA before Frontera Systems', () => {
    const { container } = render(<ProtocolToEnterprise />);
    const links = within(container).getAllByRole('link');

    expect(links.at(-2)).toHaveTextContent('Review Protocol Documentation');
    expect(links.at(-2)).toHaveAttribute('href', '/docs#getting-started');
    expect(links.at(-1)).toHaveTextContent('Explore Frontera Systems');
    expect(links.at(-1)).toHaveAttribute('href', 'https://frontera-systems.com');
  });

  it('renders the three-layer capability architecture with semantic controls', () => {
    const { container } = render(<ProtocolToEnterprise />);
    expect(within(container).getByRole('heading', { name: 'Capabilities shape platforms.' })).toBeInTheDocument();
    expect(within(container).getByText('Centers of gravity')).toBeInTheDocument();
    expect(within(container).getByText('Frontera Systems')).toBeInTheDocument();
    expect(within(container).queryByText('Soberanía Enterprise')).not.toBeInTheDocument();
    expect(within(container).getByText('Soberanía Protocol')).toBeInTheDocument();
    expect(within(container).getByText('Identity')).toBeInTheDocument();
    expect(within(container).getByText('Governance')).toBeInTheDocument();
    expect(within(container).getByRole('button', { name: /Creator:/ })).toBeInTheDocument();
  });

  it('gives build-from-source steps that work and the current candidate version', () => {
    const { container } = render(<DocsPage />);

    expect(container).toHaveTextContent('cd Soberania_Protocol');
    expect(container).not.toHaveTextContent('cd Architects_of_Change_Protocol');
    expect(container).toHaveTextContent('0.2.0-rc.3');
    expect(container).not.toHaveTextContent('version 0.1.0');
  });

  it('announces the future npm names without an install command that would fail today', () => {
    const { container } = render(<DocsPage />);

    expect(container.querySelector('#identity-upcoming')).toHaveTextContent('Upcoming · not published');
    expect(container).toHaveTextContent('@soberania-protocol/protocol');
    expect(container).toHaveTextContent('@soberania-protocol/sdk');
    expect(container).not.toHaveTextContent(/npm (i|install) @soberania-protocol/);
    expect(container).not.toHaveTextContent(/npm (i|install) @aoc\//);
  });

  it('names Frontera Systems as optional and drops the retired Enterprise brand', () => {
    const { container } = render(<DocsPage />);

    expect(container).not.toHaveTextContent('Soberanía Enterprise');
    expect(container).toHaveTextContent('Frontera Systems · optional commercial layer');
    expect(container).toHaveTextContent('The protocol has no dependency on Frontera');
  });

  it('declares its own canonical URL instead of inheriting the homepage', () => {
    render(<DocsPage />);

    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://soberaniaprotocol.org/docs');
    expect(document.title).toBe('Documentation — Soberanía Protocol');
  });
});
