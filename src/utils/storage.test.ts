import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEYS,
  MAX_HISTORY,
  loadValue,
  saveValue,
  loadComponents,
  saveComponents,
  addToHistory,
} from './storage';
import type { GeneratedComponent } from '../types';

beforeEach(() => {
  localStorage.clear();
});

describe('loadValue / saveValue', () => {
  it('저장한 값을 그대로 읽어온다', () => {
    saveValue('k', { a: 1 });
    expect(loadValue('k', null)).toEqual({ a: 1 });
  });

  it('저장된 값이 없으면 기본값을 반환한다', () => {
    expect(loadValue('none', '기본')).toBe('기본');
  });

  it('JSON이 깨져 있으면 기본값을 반환한다', () => {
    localStorage.setItem('k', '{깨짐');
    expect(loadValue('k', [])).toEqual([]);
  });

  it('validate를 통과하지 못하면 기본값을 반환한다', () => {
    saveValue('k', 123);
    expect(loadValue('k', 'x', (v): v is string => typeof v === 'string')).toBe('x');
  });

  it('저장소 쓰기가 실패해도 예외를 던지지 않는다', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      expect(() => saveValue('k', 1)).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('loadComponents / saveComponents', () => {
  const sample: GeneratedComponent = {
    id: '1',
    prompt: '카드',
    code: 'render(<div />)',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
  };

  it('createdAt을 Date 객체로 복원한다', () => {
    saveComponents([sample]);
    const [restored] = loadComponents();
    expect(restored.createdAt).toBeInstanceOf(Date);
    expect(restored.createdAt.getTime()).toBe(sample.createdAt.getTime());
    expect(restored.prompt).toBe('카드');
  });

  it('형식이 잘못된 항목은 걸러낸다', () => {
    localStorage.setItem(
      STORAGE_KEYS.components,
      JSON.stringify([{ id: 1 }, { ...sample, createdAt: sample.createdAt.toISOString() }]),
    );
    expect(loadComponents()).toHaveLength(1);
  });

  it('저장된 값이 배열이 아니면 빈 배열을 반환한다', () => {
    localStorage.setItem(STORAGE_KEYS.components, '{"a":1}');
    expect(loadComponents()).toEqual([]);
  });

  it('날짜가 유효하지 않은 항목은 걸러낸다', () => {
    localStorage.setItem(
      STORAGE_KEYS.components,
      JSON.stringify([{ ...sample, createdAt: 'not-a-date' }]),
    );
    expect(loadComponents()).toEqual([]);
  });
});

describe('addToHistory', () => {
  it('새 프롬프트를 맨 앞에 추가한다', () => {
    expect(addToHistory(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('중복 프롬프트는 기존 항목을 제거하고 맨 앞으로 올린다', () => {
    expect(addToHistory(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it(`최대 ${MAX_HISTORY}개까지만 유지한다`, () => {
    const full = Array.from({ length: MAX_HISTORY }, (_, i) => `p${i}`);
    const next = addToHistory(full, 'new');
    expect(next).toHaveLength(MAX_HISTORY);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`p${MAX_HISTORY - 1}`);
  });

  it('공백뿐인 프롬프트는 추가하지 않는다', () => {
    expect(addToHistory(['a'], '   ')).toEqual(['a']);
  });
});
