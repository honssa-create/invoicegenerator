import { describe, expect, it, vi } from 'vitest';
import { openNativeDatePicker } from './open-date-picker';

function fakeDateInput(
  overrides: Partial<{ disabled: boolean; readOnly: boolean; showPicker: () => void }> = {}
) {
  return {
    disabled: false,
    readOnly: false,
    showPicker: vi.fn(),
    ...overrides,
  } as unknown as HTMLInputElement;
}

describe('openNativeDatePicker', () => {
  it('calls showPicker on an enabled date input', () => {
    const input = fakeDateInput();
    openNativeDatePicker(input);
    expect(input.showPicker).toHaveBeenCalledTimes(1);
  });

  it('skips disabled and read-only inputs', () => {
    const disabled = fakeDateInput({ disabled: true });
    openNativeDatePicker(disabled);
    expect(disabled.showPicker).not.toHaveBeenCalled();

    const readOnly = fakeDateInput({ readOnly: true });
    openNativeDatePicker(readOnly);
    expect(readOnly.showPicker).not.toHaveBeenCalled();
  });

  it('swallows showPicker errors', () => {
    const input = fakeDateInput({
      showPicker: vi.fn(() => {
        throw new Error('InvalidStateError');
      }),
    });
    expect(() => openNativeDatePicker(input)).not.toThrow();
  });
});
