# Supabase Edge Functions

## music-search

Used by the guest website for Spotify + SoundCloud typeahead search.

### Deploy

1. Install Supabase CLI.
2. Link to your project.
3. Deploy the function:

```bash
supabase functions deploy music-search
```

### Set Secrets

In Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets, add:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SOUNDCLOUD_CLIENT_ID`

Without these, Spotify/SoundCloud typeahead will show a message telling guests to paste a link instead.

