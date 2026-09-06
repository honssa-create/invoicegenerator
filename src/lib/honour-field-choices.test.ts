import { describe, expect, it } from 'vitest';
import {
  HONOUR_CRAFT_OPTIONS,
  HONOUR_MULTI_VALUE_SEP,
  joinHonourMultiValue,
  normalizeHonourInternalPack,
  parseHonourMultiValue,
} from './honour-field-choices';
import { serializeHonourSuppliers, emptyHonourSupplier } from './orders';

describe('honour-field-choices', () => {
  it('parseHonourMultiValue handles empty and legacy single values', () => {
    expect(parseHonourMultiValue('')).toEqual([]);
    expect(parseHonourMultiValue('亞加力-單面')).toEqual(['亞加力-單面']);
    expect(parseHonourMultiValue('  滴膠  ')).toEqual(['滴膠']);
  });

  it('parseHonourMultiValue splits on middle-dot separator', () => {
    expect(parseHonourMultiValue(`亞加力-單面${HONOUR_MULTI_VALUE_SEP}布章-滿繡`)).toEqual([
      '亞加力-單面',
      '布章-滿繡',
    ]);
  });

  it('joinHonourMultiValue sorts by catalog order', () => {
    const joined = joinHonourMultiValue(['布章-滿繡', '亞加力-單面'], HONOUR_CRAFT_OPTIONS);
    expect(joined).toBe(`亞加力-單面${HONOUR_MULTI_VALUE_SEP}布章-滿繡`);
  });

  it('joinHonourMultiValue dedupes and appends orphans after catalog entries', () => {
    const joined = joinHonourMultiValue(['legacy', '亞加力-單面', '亞加力-單面'], HONOUR_CRAFT_OPTIONS);
    expect(joined).toBe(`亞加力-單面${HONOUR_MULTI_VALUE_SEP}legacy`);
  });

  it('normalizeHonourInternalPack maps legacy free text', () => {
    expect(normalizeHonourInternalPack('')).toBe('');
    expect(normalizeHonourInternalPack('需要')).toBe('需要');
    expect(normalizeHonourInternalPack('不需要')).toBe('不需要');
    expect(normalizeHonourInternalPack('不用內部包裝')).toBe('不需要');
    expect(normalizeHonourInternalPack('需要加內袋')).toBe('需要');
  });

  it('serializeHonourSuppliers preserves multi-value craft strings', () => {
    const craft = joinHonourMultiValue(['亞加力-單面', '布章-滿繡'], HONOUR_CRAFT_OPTIONS);
    const json = serializeHonourSuppliers([{ ...emptyHonourSupplier(), craft }]);
    expect(json).toContain(craft);
  });
});
