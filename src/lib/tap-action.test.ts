import type { TouchEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { isStationaryTap, tapProps } from './tap-action';

function fakeTouch(clientX: number, clientY: number) {
  return {
    changedTouches: [{ clientX, clientY }],
    preventDefault: vi.fn(),
  } as unknown as TouchEvent<HTMLElement>;
}

describe('isStationaryTap', () => {
  it('treats small movement as a tap', () => {
    expect(isStationaryTap(0, 0)).toBe(true);
    expect(isStationaryTap(8, -6)).toBe(true);
  });

  it('treats a drag as a scroll', () => {
    expect(isStationaryTap(0, 20)).toBe(false);
    expect(isStationaryTap(40, 0)).toBe(false);
  });
});

describe('tapProps', () => {
  it('runs onTap from click when there was no recent touch', () => {
    const onTap = vi.fn();
    const props = tapProps(onTap);
    props.onClick();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('runs onTap from a stationary touchend and ignores the ghost click', () => {
    const onTap = vi.fn();
    const props = tapProps(onTap);
    props.onTouchStart(fakeTouch(10, 10));
    props.onTouchEnd(fakeTouch(12, 11));
    props.onClick();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('does not fire on a scroll gesture', () => {
    const onTap = vi.fn();
    const props = tapProps(onTap);
    props.onTouchStart(fakeTouch(10, 10));
    props.onTouchEnd(fakeTouch(10, 40));
    expect(onTap).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const onTap = vi.fn();
    const props = tapProps(onTap, true);
    props.onClick();
    props.onTouchEnd(fakeTouch(0, 0));
    expect(onTap).not.toHaveBeenCalled();
  });
});
