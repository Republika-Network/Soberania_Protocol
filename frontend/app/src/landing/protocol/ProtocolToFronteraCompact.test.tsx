import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtocolToFronteraCompact } from './ProtocolToFronteraCompact';

afterEach(cleanup);

describe('Soberanía Assured proposal', () => {
  it('is labelled as proposed and not yet available', () => {
    render(<ProtocolToFronteraCompact />);

    const heading = screen.getByRole('heading', { name: 'Soberanía Assured, powered by Frontera' });
    const aside = heading.closest('aside');
    expect(aside).toHaveTextContent('Proposed · not yet available');
    expect(aside).toHaveTextContent('It is not operating today.');
    expect(aside).toHaveTextContent('No platform is enrolled, monitored or certified');
  });

  it('states its limits and the protocol’s independence from it', () => {
    render(<ProtocolToFronteraCompact />);

    const aside = screen.getByRole('heading', { name: 'Soberanía Assured, powered by Frontera' }).closest('aside');
    expect(aside).toHaveTextContent('cannot control documents inside applications that do not take part');
    expect(aside).toHaveTextContent('cannot recall information already disclosed in plaintext');
    expect(aside).toHaveTextContent('Soberanía Protocol itself never requires it.');
  });

  it('names no partner or integration and claims no running service', () => {
    const { container } = render(<ProtocolToFronteraCompact />);

    expect(container).not.toHaveTextContent(/\bpartner(s|ship)?\b|integrat(es|ed) with/i);
    expect(container).not.toHaveTextContent(/\b(is|are) (certified|monitored)\b/i);
    expect(container).not.toHaveTextContent(/now available|available now|sign up|enrol now/i);
  });
});
