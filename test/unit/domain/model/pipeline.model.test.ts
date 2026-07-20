import { describe, it, expect } from 'vitest';
import {
  ComparisonType,
  AlgorithmKind,
  NativeAlgorithm,
  WILDCARD_MIME,
} from '../../../../src/domain/model/pipeline.model.js';

describe('constants', () => {
  it('exposes the expected comparison types', () => {
    expect(Object.values(ComparisonType)).toEqual(['exact', 'hamming', 'cosine']);
  });

  it('exposes the expected algorithm kinds', () => {
    expect(Object.values(AlgorithmKind)).toEqual(['native', 'subservice']);
  });

  it('exposes sha256 as the only currently-supported native algorithm', () => {
    expect(Object.values(NativeAlgorithm)).toEqual(['sha256']);
  });

  it('exposes "*" as the wildcard mime key', () => {
    expect(WILDCARD_MIME).toBe('*');
  });
});
