import { renderGradient } from '@outpacelabs/avatars';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdAvatar } from './household-avatar';

vi.mock('@outpacelabs/avatars', () => ({ renderGradient: vi.fn() }));

const household = { id: '01a1216a-b2bb-76cc-aa3b-00e98252d13f', name: 'Otthon' };

describe('HouseholdAvatar', () => {
  it('draws the same image at every size, only the CSS size changes', () => {
    render(
      <>
        <HouseholdAvatar household={household} size={20} />
        <HouseholdAvatar household={household} size={48} />
      </>,
    );

    const calls = vi.mocked(renderGradient).mock.calls;
    expect(calls).toHaveLength(2);
    const [small, large] = calls.map(([canvas, seed, options]) => ({
      resolution: [canvas.width, canvas.height],
      seed,
      options,
    }));
    expect(small).toEqual(large);

    const [smallEl, largeEl] = screen.getAllByRole('img', { name: 'Otthon' });
    expect(smallEl).toHaveStyle({ width: '20px', height: '20px' });
    expect(largeEl).toHaveStyle({ width: '48px', height: '48px' });
  });

  it('can be hidden from assistive tech', () => {
    const { container } = render(<HouseholdAvatar household={household} decorative />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
  });
});
