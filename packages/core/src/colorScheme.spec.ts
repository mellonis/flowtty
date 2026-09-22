import { expect, test } from 'vitest';
import { colorSchemeOf, rgbToHex } from './colorScheme.js';

test('a light ground is light, a dark one dark, and the usual themes fall on the right side', () => {
  expect(colorSchemeOf({ r: 255, g: 255, b: 255 })).toBe('light');
  expect(colorSchemeOf({ r: 0, g: 0, b: 0 })).toBe('dark');
  expect(colorSchemeOf({ r: 0xfd, g: 0xf6, b: 0xe3 })).toBe('light'); // Solarized light
  expect(colorSchemeOf({ r: 0x00, g: 0x2b, b: 0x36 })).toBe('dark'); // Solarized dark
  expect(colorSchemeOf({ r: 0x28, g: 0x2c, b: 0x34 })).toBe('dark'); // One Dark
});

test('the line is at half brightness: a dim gray is dark, a pale gray is light', () => {
  expect(colorSchemeOf({ r: 0x60, g: 0x60, b: 0x60 })).toBe('dark');
  expect(colorSchemeOf({ r: 0xc0, g: 0xc0, b: 0xc0 })).toBe('light');
});

test('rgbToHex writes two lowercase digits per channel, clamped', () => {
  expect(rgbToHex({ r: 253, g: 246, b: 227 })).toBe('#fdf6e3');
  expect(rgbToHex({ r: 0, g: 300, b: -1 })).toBe('#00ff00');
});
