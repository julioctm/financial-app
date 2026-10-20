// A pasted or typed value that could not be understood (a name that does not exist, a date
// that is not a date) is kept as '?:<text>' so the grid can show what was wrong instead of
// silently dropping it.
export const UNMATCHED_PREFIX = '?:';

export const isUnmatched = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith(UNMATCHED_PREFIX);

export const unmatchedText = (v: string) => v.slice(UNMATCHED_PREFIX.length);

export const asUnmatched = (text: string) =>
  `${UNMATCHED_PREFIX}${text.trim()}`;
