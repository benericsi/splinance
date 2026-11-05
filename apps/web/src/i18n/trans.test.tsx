import { render } from '@testing-library/react';
import { Trans, useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';

/** People type household names and rule texts; inside <Trans> they must stay text. */
function Contains({ pattern }: { pattern: string }) {
  const { t } = useTranslation('rules');
  return (
    <p>
      <Trans
        t={t}
        i18nKey="contains"
        values={{ pattern }}
        components={{ strong: <span data-testid="pattern" /> }}
      />
    </p>
  );
}

describe('<Trans> with values people typed', () => {
  it('renders markup in a value as text, never as elements', () => {
    const typed = '<strong>bold</strong><img src=x onerror=alert(1)><a href="//evil">x</a>';
    const { container, getByTestId } = render(<Contains pattern={typed} />);

    expect(getByTestId('pattern')).toHaveTextContent(typed);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelectorAll('strong')).toHaveLength(0);
  });
});
