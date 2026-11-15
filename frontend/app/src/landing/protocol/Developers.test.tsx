import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Developers } from './Developers';
import { AVAILABILITY, BUILDER_AUDIENCES, INTEGRATION_POINTS } from './content';

afterEach(cleanup);

describe('Developers section', () => {
  it('renders every audience exactly once in source order', () => {
    render(<Developers />);

    const items = within(screen.getByRole('list', { name: 'Developer and builder audiences' })).getAllByRole('listitem');

    expect(items).toHaveLength(BUILDER_AUDIENCES.length);
    expect(items.map((item) => item.textContent)).toEqual(BUILDER_AUDIENCES.map(({ name, summary }) => `${name} ${summary}`));
  });

  it('explains modular adoption, the optional SDK, off-chain use and independence from Frontera', () => {
    render(<Developers />);

    const items = within(screen.getByRole('list', { name: 'How integration works' })).getAllByRole('listitem');

    expect(items).toHaveLength(INTEGRATION_POINTS.length);
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Adopt one capability at a time',
      'The SDK is optional',
      'No chain required',
      'No Frontera dependency',
    ]);
  });

  it('shows an honest availability ledger with no install command', () => {
    const { container } = render(<Developers />);

    for (const row of AVAILABILITY) expect(screen.getByText(row.item)).toBeInTheDocument();
    expect(screen.getByText('npm packages').closest('div')).toHaveTextContent('Prepared, not published');
    expect(screen.getByText('Optional SDK').closest('div')).toHaveTextContent('Internal candidate');
    expect(container).not.toHaveTextContent(/npm (i|install) /);
    expect(container).not.toHaveTextContent(/is production-ready/i);
  });

  it('preserves the established calls to action', () => {
    render(<Developers />);

    expect(screen.getByRole('link', { name: 'View protocol source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/Republika-Network/Soberania_Protocol/tree/main/packages/protocol',
    );
    expect(screen.getByRole('link', { name: 'Read the docs' })).toHaveAttribute('href', '/docs');
  });
});
