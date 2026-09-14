// Corner badges and the like-count threshold (owner, 2026-09-13).
//
// Both rules are about what a buyer sees at a glance on a grid of forty cards, so the tests are
// about the edges: exactly five likes, a tag spelled the way the owner typed it rather than the way
// the Tags tab spells it, and a rug carrying both badge tags at once.
import { describe, expect, it } from 'vitest';
import { BADGE_TAG_NAMES, badgesFor, MIN_VISIBLE_LIKES, visibleLikes } from '../../src/lib/view.ts';

describe('badgesFor', () => {
  it('badges Signed and Antique, and nothing else', () => {
    expect(badgesFor(['Signed'])).toEqual(['Signed']);
    expect(badgesFor(['Antique'])).toEqual(['Antique']);
    expect(badgesFor(['Kilim', 'Red', 'Geometric'])).toEqual([]);
  });

  it('badges both when a rug carries both, always in the same order', () => {
    // Whichever order the owner typed the tags in, the corner reads the same way round.
    expect(badgesFor(['Antique', 'Signed'])).toEqual(['Signed', 'Antique']);
    expect(badgesFor(['Signed', 'Antique'])).toEqual(['Signed', 'Antique']);
  });

  it('matches however the owner spelled it', () => {
    // The Tags tab holds the canonical spelling; a rug row carries whatever was typed into it.
    expect(badgesFor(['signed'])).toEqual(['Signed']);
    expect(badgesFor(['ANTIQUE'])).toEqual(['Antique']);
    expect(badgesFor([' Signed '])).toEqual(['Signed']);
  });

  it('renders the canonical name, not the typed one', () => {
    // "signed" in the sheet must still read "Signed" on the card.
    expect(badgesFor(['signed'])[0]).toBe('Signed');
  });

  it('is empty for a rug with no tags at all', () => {
    expect(badgesFor([])).toEqual([]);
  });

  it('does not badge a tag that merely contains a badge word', () => {
    // "Antique-style" is a different claim from "Antique" and must not borrow the badge.
    expect(badgesFor(['Antique-style', 'Signed by the weaver'])).toEqual([]);
  });

  it('exposes the badge names so a page cannot drift from this list', () => {
    expect([...BADGE_TAG_NAMES]).toEqual(['Signed', 'Antique']);
  });
});

describe('visibleLikes', () => {
  it('hides the count below five', () => {
    // "1 like" on a private preview tells a buyer who else has been looking.
    for (const n of [0, 1, 2, 3, 4]) expect(visibleLikes(n)).toBeUndefined();
  });

  it('shows it from exactly five — the boundary the owner named', () => {
    expect(MIN_VISIBLE_LIKES).toBe(5);
    expect(visibleLikes(5)).toBe(5);
    expect(visibleLikes(6)).toBe(6);
    expect(visibleLikes(240)).toBe(240);
  });

  it('hides it when the count is unknown rather than showing a zero', () => {
    expect(visibleLikes(undefined)).toBeUndefined();
  });
});
