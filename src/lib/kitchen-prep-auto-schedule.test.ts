import { afterEach, describe, expect, it } from 'vitest';
import { isKitchenPrepAutoScheduleEnabled } from './kitchen-prep-auto-schedule';

const ORIGINAL = process.env.KITCHEN_PREP_AUTO_SCHEDULE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.KITCHEN_PREP_AUTO_SCHEDULE;
  else process.env.KITCHEN_PREP_AUTO_SCHEDULE = ORIGINAL;
});

describe('isKitchenPrepAutoScheduleEnabled', () => {
  it.each(['false', '0', 'off', 'OFF', ' False '])('is disabled for %j', (value) => {
    process.env.KITCHEN_PREP_AUTO_SCHEDULE = value;
    expect(isKitchenPrepAutoScheduleEnabled()).toBe(false);
  });

  it.each(['', 'true', '1', 'yes'])('is enabled for %j', (value) => {
    process.env.KITCHEN_PREP_AUTO_SCHEDULE = value;
    expect(isKitchenPrepAutoScheduleEnabled()).toBe(true);
  });

  it('is enabled when unset', () => {
    delete process.env.KITCHEN_PREP_AUTO_SCHEDULE;
    expect(isKitchenPrepAutoScheduleEnabled()).toBe(true);
  });
});
