import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOperatorSecret,
  getOperatorSecret,
  hasOperatorSecret,
  setOperatorSecret,
} from './bt-operator-session';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
  });
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v);
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bt-operator-session', () => {
  it('stores secret only in sessionStorage and clears it', () => {
    expect(hasOperatorSecret()).toBe(false);
    setOperatorSecret('  super-secret-operator-key-32chars  ');
    expect(getOperatorSecret()).toBe('super-secret-operator-key-32chars');
    expect(hasOperatorSecret()).toBe(true);
    clearOperatorSecret();
    expect(getOperatorSecret()).toBeNull();
  });

  it('empty set clears secret', () => {
    setOperatorSecret('abc');
    setOperatorSecret('   ');
    expect(getOperatorSecret()).toBeNull();
  });
});
