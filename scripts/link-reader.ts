import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ArtistLink } from '../shared/types.ts';

const dbPath = path.join(import.meta.dirname, '..', 'data', 'music-radar-cloud.db');
if (!existsSync(dbPath)) {
    console.error(`No database at ${dbPath}`);
    process.exit(1);
}
const db = new DatabaseSync(dbPath, { readOnly: true });

function findArtist(name: string) {
    return db
        .prepare('SELECT id, name, links FROM artists WHERE name = ? COLLATE NOCASE UNION ALL SELECT id, name, links FROM manual_artists WHERE name = ? COLLATE NOCASE LIMIT 10')
        .get(name, name) as { id: string; name: string; links: string } | undefined;
}

const name = process.argv[2]?.trim();
if (!name) {
    console.error('Usage: npm run link-reader -- "Artist name"');
    process.exit(1);
}

const artist = findArtist(name);
if (!artist) {
    console.error(`No followed artist called "${name}"`);
    process.exit(1);
}

const SKIP_DOMAINS = [
    'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com',
    'spotify.com', 'apple.com', 'deezer.com', 'tidal.com',
    'discogs.com', 'wikidata.org', 'wikipedia.org', 'last.fm', 'allmusic.com',
];

function isReadable(link: ArtistLink): boolean {
    let host: string;
    try {
        const url = new URL(link.url);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false; // mailto:, tel:
        host = url.hostname;
    } catch {
        return false; // not a valid URL
    }
    return !SKIP_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function buildPrompt(name: string, links: ArtistLink[], today: string): string {
    const linkList = links.map((link) => `- ${link.label}: ${link.url}`).join('\n');
    return `You're checking whether the artist ${name} has upcoming releases or shows. Today is ${today}. 
    Start from these pages: 
    ${linkList} 

    Open the ones likely to have news, tour dates or releases (official website, Linktree, Bandcamp, and tour or news pages they link to). Follow links on those pages if they look relevant. Open at most 8 pages.
    Only report something if a page states it; never guess dates. Only report things dated after today.
    If a page can't be read, say so. It's fine to find nothing.`;
}


const links: ArtistLink[] = JSON.parse(artist.links);
const readable = links.filter(isReadable);
if (!readable.length) {
    console.log(`${artist.name}: no readable links (${links.map((l) => l.label).join(', ')})`);
    process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
console.log(buildPrompt(artist.name, readable, today));

const prompt = buildPrompt(artist.name, links, today);
console.log(prompt);


