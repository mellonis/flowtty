import { describe, expect, test } from 'vitest';
import { clusterWidth, fitClusters, graphemes, nextGrapheme, prevGrapheme, stringWidth } from './graphemes.js';

describe('graphemes', () => {
  test('plain text splits per character (fast path)', () => {
    expect(graphemes('héllo')).toEqual(['h', 'é', 'l', 'l', 'o']);
    expect(graphemes('')).toEqual([]);
  });
  test('a combining mark joins its base', () => {
    expect(graphemes('café')).toEqual(['c', 'a', 'f', 'é']);
  });
  test('a flag, a skin tone and a ZWJ family are one cluster each', () => {
    expect(graphemes('🇯🇵')).toEqual(['🇯🇵']);
    expect(graphemes('👍🏽')).toEqual(['👍🏽']);
    expect(graphemes('👩‍👧')).toEqual(['👩‍👧']);
  });
  test('CJK splits per ideograph', () => {
    expect(graphemes('日本語')).toEqual(['日', '本', '語']);
  });
});

describe('clusterWidth', () => {
  test('narrow, wide, zero', () => {
    expect(clusterWidth('a')).toBe(1);
    expect(clusterWidth('日')).toBe(2);
    expect(clusterWidth('😀')).toBe(2);
    expect(clusterWidth('́')).toBe(0); // a lone combining mark
    expect(clusterWidth('')).toBe(0);
  });
  test('a combining mark adds nothing to its base', () => {
    expect(clusterWidth('é')).toBe(1);
  });
  test('a flag, a skin tone and a ZWJ family are 2', () => {
    expect(clusterWidth('🇯🇵')).toBe(2);
    expect(clusterWidth('👍🏽')).toBe(2);
    expect(clusterWidth('👩‍👧')).toBe(2);
  });
  test('VS16 makes a narrow base emoji-wide; a lone VS16 stays 0', () => {
    expect(clusterWidth('☑')).toBe(1);
    expect(clusterWidth('☑️')).toBe(2);
    expect(clusterWidth('1️⃣')).toBe(2); // keycap
    expect(clusterWidth('️')).toBe(0);
  });
  test('a control character measures 1: paint substitutes a space for it', () => {
    expect(clusterWidth('\t')).toBe(1);
    expect(clusterWidth('\x1b')).toBe(1);
    expect(clusterWidth('\x7f')).toBe(1);
    expect(clusterWidth('\x9b')).toBe(1);
  });
});

describe('stringWidth', () => {
  test('ASCII is one column per character', () => {
    expect(stringWidth('hello')).toBe(5);
    expect(stringWidth('')).toBe(0);
  });
  test('CJK counts double', () => {
    expect(stringWidth('日本語')).toBe(6);
    expect(stringWidth('aあb')).toBe(4);
  });
  test('decomposed accents do not add width', () => {
    expect(stringWidth('é')).toBe(1);
    expect(stringWidth('café')).toBe(4);
  });
  test('astral code points count once at their true width', () => {
    expect(stringWidth('😀')).toBe(2);
    expect(stringWidth('a😀b')).toBe(4);
  });
  test('clusters that terminals draw as one glyph count 2, not per part', () => {
    expect(stringWidth('🇯🇵')).toBe(2);
    expect(stringWidth('👍🏽')).toBe(2);
    expect(stringWidth('👩‍👧')).toBe(2);
  });
  test('a control character counts the column paint gives it', () => {
    expect(stringWidth('a\tb')).toBe(3);
    expect(stringWidth('\x1b[0m')).toBe(4);
  });
});

describe('fitClusters', () => {
  test('counts the leading clusters that fit the columns', () => {
    expect(fitClusters(['a', 'b', 'c'], 2)).toBe(2);
    expect(fitClusters(['a', 'b', 'c'], 5)).toBe(3);
    expect(fitClusters(['a', 'b', 'c'], 0)).toBe(0);
  });
  test('a wide cluster over the edge does not fit', () => {
    expect(fitClusters(['a', '日', 'b'], 2)).toBe(1);
    expect(fitClusters(['a', '日', 'b'], 3)).toBe(2);
    expect(fitClusters(['日'], 1)).toBe(0);
  });
  test('counts from an offset', () => {
    expect(fitClusters(['a', 'b', '日', 'c'], 3, 1)).toBe(2);
  });
});

describe('prevGrapheme / nextGrapheme', () => {
  test('ASCII steps one unit', () => {
    expect(nextGrapheme('abc', 1)).toBe(2);
    expect(prevGrapheme('abc', 1)).toBe(0);
    expect(nextGrapheme('abc', 3)).toBe(3);
    expect(prevGrapheme('abc', 0)).toBe(0);
  });
  test('an emoji is two units, one step', () => {
    expect(nextGrapheme('a😀b', 1)).toBe(3);
    expect(prevGrapheme('a😀b', 3)).toBe(1);
  });
  test('a flag (four units) and a decomposed accent are one step', () => {
    expect(nextGrapheme('🇯🇵x', 0)).toBe(4);
    expect(prevGrapheme('🇯🇵x', 4)).toBe(0);
    expect(nextGrapheme('éx', 0)).toBe(2);
    expect(prevGrapheme('éx', 2)).toBe(0);
  });
  test('an index inside a cluster resolves to that cluster', () => {
    expect(nextGrapheme('🇯🇵x', 2)).toBe(4);
    expect(prevGrapheme('🇯🇵x', 2)).toBe(0);
    expect(prevGrapheme('a😀b', 2)).toBe(1);
  });
});

