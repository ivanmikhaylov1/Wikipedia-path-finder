import { describe, expect, it } from 'vitest';
import { parseInput, validatePair } from '../src/lib/parseInput';

describe('общий язык поиска', () => {
  it('применяется к обоим обычным названиям статей', () => {
    const from = parseInput('Cat', 'en');
    const to = parseInput('Philosophy', 'en');
    expect(from.lang).toBe('en');
    expect(to.lang).toBe('en');
    expect(() => validatePair(from, to)).not.toThrow();
  });

  it('отклоняет ссылки из разных языковых разделов', () => {
    const from = parseInput('https://ru.wikipedia.org/wiki/Москва', 'ru');
    const to = parseInput('https://en.wikipedia.org/wiki/Philosophy', 'ru');
    expect(() => validatePair(from, to)).toThrow('Поиск пути работает в пределах одного языкового раздела');
  });
});
