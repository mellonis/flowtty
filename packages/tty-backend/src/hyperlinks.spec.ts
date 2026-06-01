import { describe, test, expect } from 'vitest';
import { detectHyperlinkSupport } from './hyperlinks.js';

describe('detectHyperlinkSupport', () => {
  test('FORCE_HYPERLINKS override wins (truthy / falsy values)', () => {
    expect(detectHyperlinkSupport({ FORCE_HYPERLINKS: '1', TERM_PROGRAM: 'Apple_Terminal' })).toBe(true);
    expect(detectHyperlinkSupport({ FORCE_HYPERLINKS: '0', TERM_PROGRAM: 'iTerm.app' })).toBe(false);
    expect(detectHyperlinkSupport({ FORCE_HYPERLINKS: 'false' })).toBe(false);
    expect(detectHyperlinkSupport({ FORCE_HYPERLINK: 'yes' })).toBe(true);
  });

  test('Apple Terminal.app is NOT treated as supporting OSC 8', () => {
    expect(detectHyperlinkSupport({ TERM_PROGRAM: 'Apple_Terminal' })).toBe(false);
  });

  test('known-good terminals are allowlisted', () => {
    for (const tp of ['iTerm.app', 'WezTerm', 'ghostty', 'Hyper', 'vscode', 'rio']) {
      expect(detectHyperlinkSupport({ TERM_PROGRAM: tp })).toBe(true);
    }
  });

  test('VTE >= 5000, Windows Terminal and DomTerm count as supported', () => {
    expect(detectHyperlinkSupport({ VTE_VERSION: '5200' })).toBe(true);
    expect(detectHyperlinkSupport({ VTE_VERSION: '4999' })).toBe(false);
    expect(detectHyperlinkSupport({ WT_SESSION: 'abc' })).toBe(true);
    expect(detectHyperlinkSupport({ DOMTERM: '1' })).toBe(true);
  });

  test('empty / unknown environment is treated as unsupported', () => {
    expect(detectHyperlinkSupport({})).toBe(false);
    expect(detectHyperlinkSupport({ TERM_PROGRAM: 'SomethingNew' })).toBe(false);
  });
});
