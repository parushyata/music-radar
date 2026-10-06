import type { ShowEvent } from '../../shared/types.ts';

/** A release as reported by a single source, before merging. */
export interface RawRelease {
  title: string;
  date: string;
  type: string;
  cover: string | null;
  source: string;
  url: string;
}

/** A concert as reported by a single source, before merging. */
export interface RawEvent extends Omit<ShowEvent, 'sources'> {
  source: string;
  url: string;
}
