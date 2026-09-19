import { supabase } from './supabase';

export const SPOTIFY_CLIENT_ID = '5b6233d112574af2b8fafa8321bd3753';
export const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
].join(' ');

export type SpotifyNowPlaying = {
  connected: boolean;
  is_playing: boolean;
  track: string | null;
  artist: string | null;
  album_art: string | null;
  display_name?: string | null;
  error?: string | null;
};

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

export async function createSpotifyPkce() {
  const verifier = randomVerifier(64);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(digest);
  return { verifier, challenge };
}

export function buildSpotifyAuthorizeUrl(opts: {
  redirectUri: string;
  challenge: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: opts.redirectUri,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: opts.challenge,
    state: opts.state,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('spotify-now-playing', { body });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export async function getSpotifyStatus() {
  try {
    const data = await invoke({ action: 'status' });
    return {
      connected: Boolean(data.connected),
      display_name: (data.display_name as string) || null,
    };
  } catch {
    return { connected: false, display_name: null };
  }
}

export async function exchangeSpotifyCode(payload: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const data = await invoke({
    action: 'exchange',
    code: payload.code,
    redirect_uri: payload.redirectUri,
    code_verifier: payload.codeVerifier,
  });
  if (data.error) throw new Error(String(data.error));
  return data;
}

export async function disconnectSpotify() {
  await invoke({ action: 'disconnect' });
}

export async function fetchSpotifyNowPlaying(): Promise<SpotifyNowPlaying> {
  try {
    const data = await invoke({ action: 'currently_playing' });
    return {
      connected: Boolean(data.connected),
      is_playing: Boolean(data.is_playing),
      track: (data.track as string) || null,
      artist: (data.artist as string) || null,
      album_art: (data.album_art as string) || null,
      display_name: (data.display_name as string) || null,
      error: (data.error as string) || null,
    };
  } catch (err) {
    return {
      connected: false,
      is_playing: false,
      track: null,
      artist: null,
      album_art: null,
      error: err instanceof Error ? err.message : 'spotify_fetch_failed',
    };
  }
}
