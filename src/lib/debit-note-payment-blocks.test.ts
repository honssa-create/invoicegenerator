import { describe, expect, it } from 'vitest';
import { buildDebitNotePaymentInstructionsText, splitDebitNotePaymentBlocks } from './rentals';

describe('splitDebitNotePaymentBlocks', () => {
  it('splits default template into intro, cheque, and bank blocks', () => {
    const text = buildDebitNotePaymentInstructionsText('label', 'DN-001', '15/07/2026');
    const blocks = splitDebitNotePaymentBlocks(text);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain('We accept both cheque payment');
    expect(blocks[1]).toContain('Crossed cheque made payable');
    expect(blocks[2]).toContain('Bank transfer detail');
    expect(blocks[2]).toContain('374-279610-001');
  });

  it('returns one block when no separators', () => {
    expect(splitDebitNotePaymentBlocks('Line one\nLine two')).toEqual(['Line one\nLine two']);
  });
});
