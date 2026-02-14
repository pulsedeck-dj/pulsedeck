import axios from 'axios';

const ITUNES_LOOKUP_BASE = 'https://itunes.apple.com/lookup';
const SPOTIFY_OEMBED_BASE = 'https://open.spotify.com/oembed';
const YOUTUBE_OEMBED_BASE = 'https://www.youtube.com/oembed';
const DEFAULT_STOREFRONT = String(process.env.APPLE_MUSIC_STOREFRONT || 'us').toLowerCase();

const ALLOWED_SERVICES = new Set(['Apple Music', 'Spotify', 'YouTube']);

function sanitizeText(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeService(value) {
  const service = sanitizeText(value, 30);
  return ALLOWED_SERVICES.has(service) ? service : '';
}

function normalizeStorefront(value) {
  const cleaned = String(value || DEFAULT_STOREFRONT)
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 2);

  return cleaned || DEFAULT_STOREFRONT;
}

function hostnameMatches(hostnameInput, allowedHostInput) {
  const hostname = String(hostnameInput || '').toLowerCase();
  const allowedHost = String(allowedHostInput || '').toLowerCase();
  if (!hostname || !allowedHost) return false;
  if (hostname === allowedHost) return true;
  return hostname.endsWith(`.${allowedHost}`);
}

function validateSongUrl(value, service) {
  const urlText = sanitizeText(value, 500);
  if (!urlText) return '';

  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;

  const hostname = parsed.hostname;

  if (service === 'Apple Music') {
    if (!hostnameMatches(hostname, 'music.apple.com')) return null;
  } else if (service === 'Spotify') {
    if (!hostnameMatches(hostname, 'spotify.com') && !hostnameMatches(hostname, 'spotify.link')) return null;
  } else if (service === 'YouTube') {
    if (!hostnameMatches(hostname, 'youtube.com') && !hostnameMatches(hostname, 'youtu.be')) return null;
  } else {
    return null;
  }

  return parsed.toString().slice(0, 500);
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

function parseAppleMusicTrackId(urlText) {
  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    return '';
  }

  const fromQuery = String(parsed.searchParams.get('i') || '').trim();
  if (/^\d{5,}$/.test(fromQuery)) return fromQuery;

  const segments = parsed.pathname.split('/').filter(Boolean);
  let lastId = '';

  for (const seg of segments) {
    const direct = seg.match(/^\d{5,}$/);
    if (direct) lastId = direct[0];
    const prefixed = seg.match(/^id(\d{5,})$/i);
    if (prefixed) lastId = prefixed[1];
  }

  return lastId;
}

async function lookupItunesTrack(trackId, storefront) {
  const response = await axios.get(ITUNES_LOOKUP_BASE, {
    params: {
      id: trackId,
      country: storefront,
      entity: 'song'
    },
    timeout: 10000
  });

  const results = Array.isArray(response.data?.results) ? response.data.results : [];
  const track =
    results.find((entry) => String(entry?.wrapperType || '').toLowerCase() === 'track') ||
    results.find((entry) => String(entry?.kind || '').toLowerCase() === 'song') ||
    results[0];

  if (!track) return null;

  return {
    title: sanitizeText(track?.trackName, 120),
    artist: sanitizeText(track?.artistName, 120),
    url: sanitizeText(track?.trackViewUrl, 500),
    artworkUrl: upscaleItunesArtwork(track?.artworkUrl100)
  };
}

function parseSpotifyTitle(titleText) {
  const raw = sanitizeText(titleText, 240);
  if (!raw) return { title: '', artist: '' };

  // Spotify oEmbed titles are commonly: `Track Name - Artist Name`
  const parts = raw.split(' - ').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      title: sanitizeText(parts.slice(0, -1).join(' - '), 120),
      artist: sanitizeText(parts[parts.length - 1], 120)
    };
  }

  return { title: sanitizeText(raw, 120), artist: '' };
}

async function fetchSpotifyOembed(url) {
  const response = await axios.get(SPOTIFY_OEMBED_BASE, {
    params: { url },
    timeout: 10000
  });

  const data = response.data || {};
  const parsed = parseSpotifyTitle(data.title);

  return {
    title: parsed.title,
    artist: parsed.artist || 'Spotify',
    url: sanitizeText(data.url || url, 500),
    artworkUrl: sanitizeText(data.thumbnail_url, 500)
  };
}

async function fetchYoutubeOembed(url) {
  const response = await axios.get(YOUTUBE_OEMBED_BASE, {
    params: { url, format: 'json' },
    timeout: 10000
  });

  const data = response.data || {};
  const title = sanitizeText(data.title, 120);
  const author = sanitizeText(data.author_name, 120);

  return {
    title,
    artist: author || 'YouTube',
    url,
    artworkUrl: sanitizeText(data.thumbnail_url, 500)
  };
}

export async function resolveSongMetadata(serviceInput, urlInput, storefrontInput) {
  const service = normalizeService(serviceInput);
  if (!service) return { error: 'invalid_service' };

  const url = validateSongUrl(urlInput, service);
  if (url === null) return { error: 'invalid_song_url' };
  if (!url) return { error: 'missing_url' };

  const storefront = normalizeStorefront(storefrontInput);

  try {
    if (service === 'Apple Music') {
      const trackId = parseAppleMusicTrackId(url);
      if (!trackId) return { error: 'metadata_not_found' };

      const info = await lookupItunesTrack(trackId, storefront);
      if (!info?.title) return { error: 'metadata_not_found' };

      return {
        service,
        title: info.title,
        artist: info.artist,
        url: info.url || url,
        artworkUrl: info.artworkUrl || '',
        source: 'itunes'
      };
    }

    if (service === 'Spotify') {
      const info = await fetchSpotifyOembed(url);
      if (!info?.title) return { error: 'metadata_not_found' };

      return {
        service,
        title: info.title,
        artist: info.artist,
        url: info.url || url,
        artworkUrl: info.artworkUrl || '',
        source: 'spotify_oembed'
      };
    }

    if (service === 'YouTube') {
      const info = await fetchYoutubeOembed(url);
      if (!info?.title) return { error: 'metadata_not_found' };

      return {
        service,
        title: info.title,
        artist: info.artist,
        url: info.url || url,
        artworkUrl: info.artworkUrl || '',
        source: 'youtube_oembed'
      };
    }

    return { error: 'invalid_service' };
  } catch {
    return { error: 'metadata_lookup_failed' };
  }
}

