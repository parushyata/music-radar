import { afterEach, expect, test, vi } from 'vitest';
import { newsFor } from './news.ts';
import type { FollowedArtist } from '../../shared/types.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const artist = (name: string): FollowedArtist => ({
  id: 'a1',
  mbid: null,
  name,
  disambiguation: '',
  country: '',
  type: '',
  deezerId: null,
  itunesId: null,
  image: null,
  links: [],
  addedAt: '2026-01-01T00:00:00.000Z',
});

test('news gives up on Google News after 3 s instead of waiting the default 15 s', async () => {
  // Node's AbortSignal.timeout runs on its own timer that Vitest's fake timers can't advance, so rebuild it
  // on the (faked) setTimeout; otherwise this test would really wait 3 s. Google News is stubbed to hang
  // until its signal aborts.
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
    return controller.signal;
  });
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init!.signal!;
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
  );

  let settled: unknown = 'pending';
  void newsFor(artist('Muse')).then(
    () => (settled = 'resolved'),
    (err: unknown) => (settled = err),
  );

  await vi.advanceTimersByTimeAsync(2_999);
  expect(settled).toBe('pending');

  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toBeInstanceOf(DOMException);
  expect((settled as DOMException).name).toBe('TimeoutError');
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test('news keeps music headlines that name the artist, newest first, without the source suffix', async () => {
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>Muse announce new album &amp; world tour - NME</title><link>https://example.com/1</link>
      <pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate><source url="https://nme.com">NME</source></item>
    <item><title>Muse share live video from Wembley - Kerrang!</title><link>https://example.com/2</link>
      <pubDate>Fri, 16 Oct 2026 10:00:00 GMT</pubDate><source url="https://kerrang.com">Kerrang!</source></item>
    <item><title>Muse frontman spotted at football match - Daily Gossip</title><link>https://example.com/3</link>
      <pubDate>Sat, 17 Oct 2026 10:00:00 GMT</pubDate><source url="https://gossip.com">Daily Gossip</source></item>
    <item><title>A museum tour opens in Paris - Le Monde</title><link>https://example.com/4</link>
      <pubDate>Sun, 18 Oct 2026 10:00:00 GMT</pubDate><source url="https://lemonde.fr">Le Monde</source></item>
  </channel></rss>`;
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(rss, { status: 200 }));

  const items = await newsFor(artist('Muse'));

  expect(String(fetchSpy.mock.calls[0][0])).toContain('news.google.com/rss/search');
  expect(items).toEqual([
    {
      title: 'Muse share live video from Wembley',
      url: 'https://example.com/2',
      date: '2026-10-16T10:00:00.000Z',
      source: 'Kerrang!',
    },
    {
      title: 'Muse announce new album & world tour',
      url: 'https://example.com/1',
      date: '2026-10-12T10:00:00.000Z',
      source: 'NME',
    },
  ]);
});
