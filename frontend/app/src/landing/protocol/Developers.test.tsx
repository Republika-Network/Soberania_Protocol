import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Developers } from './Developers';
import { BUILDER_AUDIENCES } from './content';

afterEach(cleanup);

describe('Developers orbital composition', () => {
  it('renders every audience exactly once in source order', () => {
    render(<Developers />);

    const audienceList = screen.getByRole('list', { name: 'Developer and builder audiences' });
    const audienceItems = screen.getAllByRole('listitem');

    expect(audienceItems).toHaveLength(7);
    expect(audienceList).toContainElement(audienceItems[0]);
    expect(audienceItems.map((item) => item.textContent)).toEqual(
      BUILDER_AUDIENCES.map(({ name, summary }) => `${name}${summary}`),
    );
  });

  it('spaces all nodes by exactly one seventh of a revolution', () => {
    render(<Developers />);

    const angles = screen.getAllByRole('listitem').map((item) =>
      Number.parseFloat(item.style.getPropertyValue('--orbit-angle')),
    );

    angles.slice(1).forEach((angle, index) => {
      const clockwiseSeparation = (angle - angles[index] + 360) % 360;
      expect(clockwiseSeparation).toBeCloseTo(360 / 7, 8);
    });
  });

  it('preserves the established calls to action', () => {
    render(<Developers />);

    expect(screen.getByRole('link', { name: 'View protocol source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/Republika-Network/Soberania_Protocol/tree/main/packages/protocol',
    );
    expect(screen.getByRole('link', { name: 'Read the docs' })).toHaveAttribute('href', '/?view=docs');
  });
});
