import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtocolNav } from './Nav';
import { FRONTERA_SYSTEMS_URL } from '../brand';

afterEach(cleanup);

// The commercial layer is Frontera Systems, on its own site — the retired
// "Soberanía Enterprise" brand and its in-app /?view=enterprise route must
// not surface anywhere in the public Protocol nav.
describe('Protocol navigation', () => {
  it('points the desktop nav at the Frontera Systems site', () => {
    render(<ProtocolNav />);

    const link = screen.getByRole('link', { name: 'Frontera' });
    expect(link).toHaveAttribute('href', FRONTERA_SYSTEMS_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: /Soberanía Enterprise/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Enterprise' })).not.toBeInTheDocument();
  });

  it('exposes the same Frontera Systems link in the mobile disclosure', async () => {
    render(<ProtocolNav />);
    await userEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));

    const mobileNav = document.getElementById('protocol-mobile-nav');
    expect(mobileNav).not.toBeNull();
    const link = screen.getAllByRole('link', { name: 'Frontera' }).find((el) => mobileNav!.contains(el));
    expect(link).toBeDefined();
    expect(link).toHaveAttribute('href', FRONTERA_SYSTEMS_URL);
  });

  it('renders the homepage navigation from the approved design', () => {
    render(<ProtocolNav />);

    expect(screen.getByRole('link', { name: /Soberanía Protocol/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sovereign Sphere' })).toHaveAttribute('href', '/#sovereign-sphere');
    expect(screen.getByRole('link', { name: 'Digital Assets' })).toHaveAttribute('href', '/#digital-asset');
    expect(screen.getByRole('link', { name: 'For Builders' })).toHaveAttribute('href', '/#developers');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/?view=docs');
    expect(screen.getByRole('link', { name: /Explore the protocol/ })).toHaveAttribute('href', '/#sovereign-sphere');
    expect(screen.queryByRole('link', { name: 'Launch App' })).not.toBeInTheDocument();
  });
});
