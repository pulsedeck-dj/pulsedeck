import axios from 'axios';

const APPLE_CATALOG_BASE = 'https://api.music.apple.com/v1/catalog';
const DEFAULT_STOREFRONT = String(process.env.APPLE_MUSIC_STOREFRONT || 'us').toLowerCase();

function getDeveloperToken() {
  return String(process.env.APPLE_MUSIC_DEVELOPER_TOKEN || '').trim();
}

function normalizeSearchTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function normalizeStorefront(value) {
  const cleaned = String(value || DEFAULT_STOREFRONT)
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 2);

  return cleaned || DEFAULT_STOREFRONT;
}

function normalizeLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.min(Math.max(Math.floor(n), 1), 20);
}

function artworkUrlFromTemplate(template, size = 240) {
  if (!template) return '';
  return String(template)
    .replace('{w}', String(size))
    .replace('{h}', String(size));
}

export async function searchAppleMusicSongs(termInput, storefrontInput, limitInput) {
  const developerToken = getDeveloperToken();
  if (!developerToken) return { error: 'apple_music_not_configured' };

  const term = normalizeSearchTerm(termInput);
  if (term.length < 2) return { error: 'search_term_too_short' };

  const storefront = normalizeStorefront(storefrontInput);
  const limit = normalizeLimit(limitInput);

  const response = await axios.get(`${APPLE_CATALOG_BASE}/${storefront}/search`, {
    headers: {
      Authorization: `Bearer ${developerToken}`
    },
    params: {
      term,
      types: 'songs',
      limit
    },
    timeout: 10000
  });

  const songs = response.data?.results?.songs?.data;
  const data = Array.isArray(songs) ? songs : [];

  return {
    results: data.map((entry) => {
      const attr = entry?.attributes || {};
      return {
        id: String(entry?.id || ''),
        title: String(attr.name || ''),
        artist: String(attr.artistName || ''),
        album: String(attr.albumName || ''),
        url: String(attr.url || ''),
        artworkUrl: artworkUrlFromTemplate(attr.artwork?.url)
      };
    })
  };
}
