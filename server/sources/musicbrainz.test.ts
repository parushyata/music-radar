import { afterEach, expect, test, vi } from 'vitest';
import { searchArtists } from './musicbrainz.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('a MusicBrainz 503 is retried and logged as a warning', async () => {
  // Fake timers so the 1.5 s back-off and the 1.1 s slot spacing don't slow the suite.
  vi.useFakeTimers();
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response('busy', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ artists: [{ id: 'mbid-1', name: 'Muse' }] }));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});

  const result = searchArtists('Muse');
  await vi.runAllTimersAsync();

  expect((await result).map((a) => a.name)).toEqual(['Muse']);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith('MusicBrainz artist: 503, retry 1 of 3 in 1500ms');
});
