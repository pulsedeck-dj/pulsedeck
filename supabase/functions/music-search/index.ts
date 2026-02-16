// Supabase Edge Function: music-search
// Provides typeahead search for Apple Music + Spotify + SoundCloud.
//
// Secrets required in Supabase:
// - SPOTIFY_CLIENT_ID
// - SPOTIFY_CLIENT_SECRET
// - SOUNDCLOUD_CLIENT_ID

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type SearchRequest = {
  service?: string;
  term?: string;
  limit?: number;
};

type SearchResult = {
  title: string;
  artist: string;
  album?: string;
  url: string;
  artworkUrl?: string;
};

let spotifyToken: { value: string; expiresAt: number } | null = null;

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

async function getSpotifyToken(): Promise<string> {
  const now = Date.now();
  if (spotifyToken && spotifyToken.expiresAt - now > 30_000) return spotifyToken.value;

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET') || '';
  if (!clientId || !clientSecret) {
    throw new Error('Spotify search is not configured');
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || 'Spotify auth failed');
  }

  const token = String(data?.access_token || '').trim();
  const expiresIn = toInt(data?.expires_in, 3600);
  if (!token) throw new Error('Spotify auth failed');

  spotifyToken = { value: token, expiresAt: now + expiresIn * 1000 };
  return token;
}

async function spotifySearch(term: string, limit: number): Promise<SearchResult[]> {
  const token = await getSpotifyToken();

  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('q', term);
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Spotify search failed');
  }

  const items = Array.isArray(data?.tracks?.items) ? data.tracks.items : [];
  return items
    .map((track: any) => {
      const title = String(track?.name || '').trim();
      const artist = String(track?.artists?.[0]?.name || '').trim();
      const album = String(track?.album?.name || '').trim();
      const url = String(track?.external_urls?.spotify || '').trim();
      const artworkUrl = String(track?.album?.images?.[0]?.url || '').trim();
      if (!title || !artist || !url) return null;
      return { title, artist, album, url, artworkUrl };
    })
    .filter(Boolean);
}

async function soundCloudSearch(term: string, limit: number): Promise<SearchResult[]> {
  const clientId = Deno.env.get('SOUNDCLOUD_CLIENT_ID') || '';
  if (!clientId) {
    throw new Error('SoundCloud search is not configured');
  }

  const url = new URL('https://api-v2.soundcloud.com/search/tracks');
  url.searchParams.set('q', term);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString(), { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.errors?.[0]?.error_message || 'SoundCloud search failed');
  }

  const items = Array.isArray(data?.collection) ? data.collection : [];
  return items
    .map((track: any) => {
      const title = String(track?.title || '').trim();
      const artist = String(track?.user?.username || '').trim();
      const url = String(track?.permalink_url || '').trim();
      const artworkUrl = String(track?.artwork_url || '').trim();
      if (!title || !artist || !url) return null;
      return { title, artist, url, artworkUrl };
    })
    .filter(Boolean);
}

async function appleSearch(term: string, limit: number): Promise<SearchResult[]> {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', term);
  url.searchParams.set('media', 'music');
  url.searchParams.set('entity', 'song');
  url.searchParams.set('country', 'US');
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString(), { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || 'Apple Music search failed');
  }

  const items = Array.isArray(data?.results) ? data.results : [];
  return items
    .map((row: any) => {
      const title = String(row?.trackName || '').trim();
      const artist = String(row?.artistName || '').trim();
      const album = String(row?.collectionName || '').trim();
      const trackUrl = String(row?.trackViewUrl || '').trim();
      const artworkUrl = String(row?.artworkUrl100 || '').trim();
      if (!title || !artist || !trackUrl) return null;
      return { title, artist, album, url: trackUrl, artworkUrl };
    })
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let payload: SearchRequest = {};
  try {
    payload = (await req.json()) as SearchRequest;
  } catch {
    payload = {};
  }

  const service = String(payload?.service || '').trim();
  const term = String(payload?.term || '').trim();
  const limit = Math.max(1, Math.min(12, toInt(payload?.limit, 10)));

  if (!service) return badRequest('Missing service');
  if (term.length < 2) return badRequest('Missing search term');

  try {
    let results: SearchResult[] = [];

    if (service === 'Apple Music') {
      results = await appleSearch(term, limit);
    } else if (service === 'Spotify') {
      results = await spotifySearch(term, limit);
    } else if (service === 'SoundCloud') {
      results = await soundCloudSearch(term, limit);
    } else {
      return badRequest('Unsupported service');
    }

    return json({ results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Search failed' }, { status: 500 });
  }
});
