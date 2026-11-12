import { describe, expect, it } from 'vitest';
import {
  activityOneLiner,
  commentInitials,
  commentParts,
  formatFeedClock,
  groupFeedByDay,
} from './activity-feed-display';

describe('wedding comments rail display', () => {
  it('groups today separately and formats the clock', () => {
    const groups = groupFeedByDay(
      [
        { id: 1, created_at: '2026-11-11 11:42:00' },
        { id: 2, created_at: '2026-11-11 11:44:00' },
        { id: 3, created_at: '2026-11-12 09:05:00' },
      ],
      '2026-11-12',
    );
    expect(groups.map((g) => g.label)).toEqual(['11 Nov', 'Today']);
    expect(groups[0].items).toHaveLength(2);
    expect(formatFeedClock('2026-11-11 11:42:00')).toBe('11:42 AM');
    expect(formatFeedClock('2026-11-11 13:05:00')).toBe('1:05 PM');
  });

  it('turns system events into a quiet sentence', () => {
    expect(activityOneLiner('Vanessa Yuen', 'created order ORD-0000001')).toBe(
      'Vanessa Yuen created order ORD-0000001',
    );
    expect(activityOneLiner('System', '[System] Kitchen prep PREP-0001 linked')).toBe(
      'Kitchen prep PREP-0001 linked',
    );
  });

  it('lifts a named link onto a card', () => {
    expect(commentParts('Client Challenge\nhttps://canva.com/design/abc')).toEqual([
      {
        kind: 'card',
        label: 'Client Challenge',
        href: 'https://canva.com/design/abc',
        display: 'canva.com/design/abc',
      },
    ]);
    expect(commentInitials('Vanessa Yuen')).toBe('VY');
    expect(commentInitials('Tracy')).toBe('T');
  });
});
