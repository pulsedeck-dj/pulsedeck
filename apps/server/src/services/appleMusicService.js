import axios from 'axios';

const APPLE_CATALOG_BASE = 'https://api.music.apple.com/v1/catalog';
const ITUNES_SEARCH_BASE = 'https://itunes.apple.com/search';
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

function upscaleItunesArtwork(url, size = 240) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  // iTunes commonly returns `.../100x100bb.jpg`. Swap to a larger size when possible.
  if (raw.includes('x') && raw.includes('bb')) {
    return raw.replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`);
  }

  return raw;
}

async function searchItunesSongs(term, storefront, limit) {
  const response = await axios.get(ITUNES_SEARCH_BASE, {
    params: {
      term,
      media: 'music',
      entity: 'song',
      limit,
      country: storefront
    },
    timeout: 10000
  });

  const data = Array.isArray(response.data?.results) ? response.data.results : [];

  return {
    results: data.map((entry) => ({
      id: String(entry?.trackId || ''),
      title: String(entry?.trackName || ''),
      artist: String(entry?.artistName || ''),
      album: String(entry?.collectionName || ''),
      url: String(entry?.trackViewUrl || ''),
      artworkUrl: upscaleItunesArtwork(entry?.artworkUrl100)
    }))
  };
}

export async function searchAppleMusicSongs(termInput, storefrontInput, limitInput) {
  const developerToken = getDeveloperToken();
  const term = normalizeSearchTerm(termInput);
  if (term.length < 2) return { error: 'search_term_too_short' };

  const storefront = normalizeStorefront(storefrontInput);
  const limit = normalizeLimit(limitInput);

  if (!developerToken) {
    try {
      return await searchItunesSongs(term, storefront, limit);
    } catch {
      return { error: 'apple_music_search_failed' };
    }
  }

  try {
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
  } catch {
    try {
      return await searchItunesSongs(term, storefront, limit);
    } catch {
      return { error: 'apple_music_search_failed' };
    }
  }
}
