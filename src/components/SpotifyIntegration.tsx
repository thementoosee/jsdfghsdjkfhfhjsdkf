import { useEffect, useState } from 'react';
import { Music2, Loader, Check, AlertCircle, Unplug } from 'lucide-react';
import {
  SPOTIFY_CLIENT_ID,
  buildSpotifyAuthorizeUrl,
  createSpotifyPkce,
  disconnectSpotify,
  exchangeSpotifyCode,
  getSpotifyStatus,
} from '../lib/spotify';

const PKCE_VERIFIER_KEY = 'spotify_pkce_verifier';
const PKCE_STATE_KEY = 'spotify_pkce_state';

export function SpotifyIntegration() {
  const [connected, setConnected] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const oauthError = params.get('error');

      if (oauthError) {
        setError(`Spotify OAuth: ${oauthError}`);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (code && state) {
        await finishOAuth(code, state);
      }

      const status = await getSpotifyStatus();
      setConnected(status.connected);
      setDisplayName(status.display_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar Spotify');
    } finally {
      setBusy(false);
    }
  }

  async function finishOAuth(code: string, state: string) {
    const savedState = sessionStorage.getItem(PKCE_STATE_KEY);
    const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(PKCE_STATE_KEY);
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    window.history.replaceState({}, document.title, window.location.pathname);

    if (!verifier || !savedState || savedState !== state) {
      throw new Error('Sessao OAuth invalida. Tenta ligar outra vez.');
    }

    const redirectUri = `${window.location.origin}/`;
    const result = await exchangeSpotifyCode({
      code,
      redirectUri,
      codeVerifier: verifier,
    });

    setConnected(true);
    setDisplayName((result.display_name as string) || null);
    setMessage('Spotify ligado com sucesso.');
  }

  async function connect() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { verifier, challenge } = await createSpotifyPkce();
      const state = crypto.randomUUID();
      sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
      sessionStorage.setItem(PKCE_STATE_KEY, state);
      const redirectUri = `${window.location.origin}/`;
      window.location.href = buildSpotifyAuthorizeUrl({
        redirectUri,
        challenge,
        state,
      });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Falha ao iniciar OAuth');
    }
  }

  async function disconnect() {
    if (!confirm('Desligar Spotify?')) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectSpotify();
      setConnected(false);
      setDisplayName(null);
      setMessage('Spotify desligado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desligar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-[#1DB954]/20 border border-[#1DB954]/40 flex items-center justify-center">
          <Music2 className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white uppercase tracking-wide">Spotify Now Playing</h2>
          <p className="text-sm text-slate-400">Mostra a musica a tocar na top bar (no lugar das cryptos).</p>
        </div>
      </div>

      <div className="text-xs text-slate-500 font-mono break-all">
        Client ID: {SPOTIFY_CLIENT_ID}
      </div>

      {busy && (
        <div className="flex items-center gap-2 text-slate-300 text-sm">
          <Loader className="w-4 h-4 animate-spin" /> A processar...
        </div>
      )}

      {message && (
        <div className="flex items-center gap-2 text-emerald-300 text-sm bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
          <Check className="w-4 h-4" /> {message}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {connected ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
            Ligado{displayName ? ` · ${displayName}` : ''}
          </div>
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm font-semibold uppercase hover:bg-slate-700 disabled:opacity-50"
          >
            <Unplug className="w-4 h-4" /> Desligar
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-1">
            <li>Confirma o Redirect URI na app Spotify: <span className="text-white">{typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://ollo-pasidaojk.vercel.app/'}</span></li>
            <li>Clica em Ligar Spotify e autoriza a conta que usa na stream</li>
            <li>Garante que ha musica a tocar no Spotify</li>
          </ol>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1DB954] text-black text-sm font-black uppercase hover:bg-[#1ed760] disabled:opacity-50"
          >
            <Music2 className="w-4 h-4" /> Ligar Spotify
          </button>
        </div>
      )}
    </div>
  );
}
