import { describe, expect, it } from 'vitest';
import { qs } from './api';
import { duration, money, percent, relativeTime, shortDay } from './format';
import { parseSseBuffer } from './stream';

describe('format', () => {
  it('formats values, using a dash for missing data', () => {
    expect(percent(null)).toBe('—');
    expect(percent(0.666)).toBe('67%');
    expect(duration(null)).toBe('—');
    expect(duration(420)).toBe('420 ms');
    expect(duration(1500)).toBe('1.5 s');
  });

  it('formats money, surviving an unknown currency code', () => {
    expect(money(299, 'USD')).toBe('$299');
    expect(money(14.95, 'USD')).toBe('$14.95');
    expect(money(5, 'NOPE')).toContain('5');
  });

  it('describes relative time', () => {
    const now = Date.parse('2026-01-10T12:00:00Z');
    expect(relativeTime('2026-01-10T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-01-10T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-01-10T07:00:00Z', now)).toBe('5 hr ago');
    expect(relativeTime('2026-01-09T12:00:00Z', now)).toBe('1 day ago');
  });

  it('reads day buckets as UTC so charts do not shift by timezone', () => {
    expect(shortDay('2026-03-01')).toBe('Mar 1');
  });
});

describe('qs', () => {
  it('omits empty values and encodes the rest', () => {
    expect(qs({ a: 1, b: '', c: undefined, d: null, e: 'x y' })).toBe('?a=1&e=x+y');
    expect(qs({})).toBe('');
  });
});

describe('parseSseBuffer', () => {
  it('parses complete events and keeps a partial one for later', () => {
    const { events, rest } = parseSseBuffer('event: delta\ndata: {"text":"Hi"}\n\nevent: do');
    expect(events).toEqual([{ event: 'delta', data: { text: 'Hi' } }]);
    expect(rest).toBe('event: do');
  });

  it('handles several events in a single chunk', () => {
    const { events } = parseSseBuffer('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n');
    expect(events.map((e) => e.event)).toEqual(['a', 'b']);
  });
});
