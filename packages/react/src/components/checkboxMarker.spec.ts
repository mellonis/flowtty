import { expect, test } from 'vitest';
import { checkboxMarker } from './checkboxMarker.js';

test('the marker per state and frame', () => {
  expect(checkboxMarker(false, 'brackets')).toEqual({ text: '[ ]' });
  expect(checkboxMarker(true, 'brackets')).toEqual({ text: '[x]', color: 'green' });
  expect(checkboxMarker('mixed', 'brackets')).toEqual({ text: '[-]' });
  expect(checkboxMarker(false, 'none')).toEqual({ text: '☐' });
  expect(checkboxMarker(true, 'none')).toEqual({ text: '☑', color: 'green' });
  expect(checkboxMarker('mixed', 'none')).toEqual({ text: '⊟' });
});
