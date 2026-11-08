// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAppUrl } from './url';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('app entry URL', () => {
  it.each(['/gojuon-game', '/gojuon-game/'])(
    'normalizes %s without reloading or adding a history entry',
    (base) => {
      window.history.replaceState({ saved: true }, '', '/gojuon-game/?lang=en#records');
      const length = window.history.length;
      normalizeAppUrl(base);
      expect(window.location.pathname).toBe('/gojuon-game');
      expect(window.location.search).toBe('?lang=en');
      expect(window.location.hash).toBe('#records');
      expect(window.history.state).toEqual({ saved: true });
      expect(window.history.length).toBe(length);
    },
  );

  it.each(['/gojuon-game', '/gojuon-game/assets/', '/gojuon-game/index.html', '/another/'])(
    'leaves %s unchanged',
    (path) => {
      window.history.replaceState(null, '', path);
      const replace = vi.spyOn(window.history, 'replaceState');
      normalizeAppUrl('/gojuon-game/');
      expect(window.location.pathname).toBe(path);
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it('preserves the root URL when deployed at the origin root', () => {
    window.history.replaceState(null, '', '/');
    const replace = vi.spyOn(window.history, 'replaceState');
    normalizeAppUrl('/');
    expect(replace).not.toHaveBeenCalled();
  });
});
