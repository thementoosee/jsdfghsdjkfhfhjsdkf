import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Twitch, Trash2, RefreshCw, AlertCircle, Loader, CheckCircle2 } from 'lucide-react';

interface ChatMessage {
  id: string;
  username: string;
  display_name: string;
  message: string;
  color?: string;
  is_subscriber: boolean;
  is_moderator: boolean;
  created_at: string;
}

interface Alert {
  id: string;
  alert_type: string;
  username: string;
  display_name: string;
  message?: string;
  amount: number;
  tier?: string;
  months: number;
  created_at: string;
}

interface EventSubStatus {
  configured: boolean;
  callback_url: string;
  token_valid?: boolean;
  refresh_available?: boolean;
  client_secret_configured?: boolean;
  channel_name?: string;
  channel_id?: string;
  token_expires_in?: number | null;
  scopes?: string[];
}

const DEFAULT_CHANNEL = 'oficialfever';

export function TwitchIntegration() {
  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [showMessages, setShowMessages] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);

  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [channelName, setChannelName] = useState(DEFAULT_CHANNEL);
  const [channelId, setChannelId] = useState('');

  const [status, setStatus] = useState<EventSubStatus | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Handle OAuth redirect from Twitch
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    console.log('[OAuth] Page loaded, checking for code/error:', { code: code ? code.slice(0, 10) + '...' : null, error });

    if (error) {
      console.error('[OAuth] Error from Twitch:', error);
      setStatusError(`OAuth error: ${error}`);
      return;
    }

    if (code) {
      console.log('[OAuth] Found authorization code, exchanging...');
      void handleOAuthCallback(code);
    }
  }, []);

  async function handleOAuthCallback(oauthCode: string) {
    setIsActivating(true);
    setStatusError(null);
    setStatusMessage(null);

    try {
      console.log('[OAuth] Exchanging code for tokens:', oauthCode.slice(0, 10) + '...');
      
      // Backend handles everything: exchange code, save config, setup EventSub
      const { data, error } = await supabase.functions.invoke('twitch-oauth-callback', {
        body: { code: oauthCode },
      });

      console.log('[OAuth] Response:', { data, error });

      if (error) throw new Error(`Invoke error: ${error.message}`);

      const result = data as { success?: boolean; error?: string; detail?: unknown; channel_name?: string; setup?: { created?: string[] } };
      console.log('[OAuth] Result:', JSON.stringify(result));
      
      if (!result?.success) throw new Error(result?.error || 'Unknown backend error');

      const created = result?.setup?.created?.length ? result.setup.created.join(', ') : 'none';
      setStatusMessage(`EventSub ativo! Canal: ${result.channel_name || DEFAULT_CHANNEL}. Subscriptions: ${created}`);

      // Clean URL and refresh status
      window.history.replaceState({}, document.title, window.location.pathname);
      await loadStoredConfig();
      await loadEventSubStatus();
      await loadRecentAlerts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OAuth error';
      console.error('[OAuth] Failed:', msg);
      setStatusError(`OAuth falhou: ${msg}`);
    } finally {
      setIsActivating(false);
    }
  }

  useEffect(() => {
    void bootstrap();

    const messagesChannel = supabase
      .channel('twitch_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'twitch_chat_messages' }, (payload) => {
        const newMessage = payload.new as ChatMessage;
        setRecentMessages((prev) => [newMessage, ...prev].slice(0, 20));
      })
      .subscribe();

    const alertsChannel = supabase
      .channel('twitch_alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'twitch_alerts' }, (payload) => {
        const newAlert = payload.new as Alert;
        setRecentAlerts((prev) => [newAlert, ...prev].slice(0, 10));
      })
      .subscribe();

    return () => {
      messagesChannel.unsubscribe();
      alertsChannel.unsubscribe();
    };
  }, []);

  async function bootstrap() {
    await Promise.all([loadRecentMessages(), loadRecentAlerts(), loadStoredConfig(), loadEventSubStatus()]);
  }

  async function loadStoredConfig() {
    try {
      const { data, error } = await supabase
        .from('twitch_config')
        .select('channel_name, channel_id, refresh_token')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Could not load stored config (RLS may be blocking):', error);
        return;
      }

      if (data) {
        setChannelName(data.channel_name || DEFAULT_CHANNEL);
        setChannelId(data.channel_id || '');
        setRefreshToken(data.refresh_token || '');
      }
    } catch (err) {
      console.warn('Error loading stored config:', err);
    }
  }

  async function loadEventSubStatus() {
    try {
      const { data, error } = await supabase.functions.invoke('twitch-eventsub', {
        body: { action: 'status' },
      });

      if (error) throw error;

      const result = data as EventSubStatus & { error?: string };
      if (result?.error) throw new Error(result.error);

      setStatus(result);
    } catch (error) {
      console.error('Error loading EventSub status:', error);
      setStatus(null);
    }
  }

  async function loadRecentMessages() {
    try {
      const { data, error } = await supabase
        .from('twitch_chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setRecentMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function loadRecentAlerts() {
    try {
      const { data, error } = await supabase
        .from('twitch_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentAlerts(data || []);
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  }

  async function activateWithTokens(token: string, refresh: string, channel: string, chanId: string) {
    try {
      await supabase.from('twitch_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      const { error: saveError } = await supabase.from('twitch_config').insert({
        access_token: token,
        refresh_token: refresh || null,
        channel_name: channel,
        channel_id: chanId,
        is_active: true,
      });

      if (saveError) throw saveError;

      const { data, error } = await supabase.functions.invoke('twitch-eventsub', {
        body: { action: 'setup' },
      });

      if (error) throw error;

      const result = data as { error?: string; created?: string[] };
      if (result?.error) throw new Error(result.error);

      const created = result?.created?.length ? result.created.join(', ') : 'none';
      setStatusMessage(`EventSub ativo! Subscriptions: ${created}`);

      setAccessToken('');
      await loadStoredConfig();
      await loadEventSubStatus();
      await loadRecentAlerts();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao ativar EventSub';
      setStatusError(msg);
      throw error;
    }
  }

  async function activateEventSub() {
    const token = accessToken.trim();
    const refresh = refreshToken.trim();
    const channel = channelName.trim() || DEFAULT_CHANNEL;
    const chanId = channelId.trim() || channel;

    if (!token) {
      setStatusError('Access token da Twitch e obrigatorio');
      return;
    }

    setIsActivating(true);
    setStatusError(null);
    setStatusMessage(null);

    try {
      await activateWithTokens(token, refresh, channel, chanId);
    } finally {
      setIsActivating(false);
    }
  }

  function loginWithTwitch() {
    try {
      console.log('[OAuth] Login button clicked');
      const clientId = 'fdlnbqa0h3otodrwzkpfh0pb3mzafq';
      const redirectUri = window.location.origin + '/';
      const scopes = 'moderator:read:followers channel:read:subscriptions bits:read';
      const oauthUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}`;
      
      console.log('[OAuth] Redirecting to:', oauthUrl);
      window.location.href = oauthUrl;
    } catch (error) {
      console.error('[OAuth] Click handler error:', error);
      setStatusError(`OAuth error: ${error}`);
    }
  }

  async function clearMessages() {
    if (!confirm('Limpar todas as mensagens?')) return;

    try {
      const { error } = await supabase
        .from('twitch_chat_messages')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      setRecentMessages([]);
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  }

  async function clearAlerts() {
    if (!confirm('Limpar todos os alertas?')) return;

    try {
      const { error } = await supabase
        .from('twitch_alerts')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      setRecentAlerts([]);
    } catch (error) {
      console.error('Error clearing alerts:', error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
              <Twitch className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white uppercase">Twitch 24/7 EventSub</h2>
              <p className="text-purple-50 text-sm uppercase">Configuracao backend permanente (sem browser aberto)</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-300">
                <p className="font-semibold uppercase mb-2">Ativacao unica</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Canal fixo: oficialfever</li>
                  <li>Cole Access Token e Refresh Token da Twitch</li>
                  <li>Clique Guardar + Ativar 24/7</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase">Canal</label>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder={DEFAULT_CHANNEL}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase">Channel ID (opcional)</label>
              <input
                type="text"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="123456789"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase">Access Token</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="oauth access token"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase">Refresh Token</label>
              <input
                type="password"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="refresh token"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={loginWithTwitch}
              disabled={isActivating}
              className="flex-1 px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg font-bold uppercase text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Twitch className="w-5 h-5" />
              Entrar com Twitch
            </button>

            <button
              onClick={() => void activateEventSub()}
              disabled={isActivating}
              className="flex-1 px-6 py-4 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white rounded-lg font-bold uppercase text-sm transition-colors flex items-center justify-center gap-2"
            >
              {isActivating ? <Loader className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {isActivating ? 'A ativar...' : 'Guardar + Ativar 24/7'}
            </button>

            <button
              onClick={() => void loadEventSubStatus()}
              className="px-6 py-4 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-bold uppercase text-sm transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Status
            </button>
          </div>

          {statusMessage && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <p className="text-green-400 text-sm font-semibold">{statusMessage}</p>
            </div>
          )}

          {statusError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 text-sm font-semibold">{statusError}</p>
            </div>
          )}

          {status && (
            <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 space-y-1">
              <p><strong>Configured:</strong> {String(status.configured)}</p>
              <p><strong>Token valid:</strong> {String(Boolean(status.token_valid))}</p>
              <p><strong>Refresh token:</strong> {String(Boolean(status.refresh_available))}</p>
              <p><strong>Twitch app secrets:</strong> {String(Boolean(status.client_secret_configured))}</p>
              <p><strong>Channel:</strong> {status.channel_name || '-'}</p>
              <p><strong>Channel ID:</strong> {status.channel_id || '-'}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <button
            onClick={() => setShowMessages(!showMessages)}
            className="w-full p-4 bg-gray-800 hover:bg-gray-750 transition-colors flex items-center justify-between"
          >
            <h3 className="font-bold text-white uppercase">Mensagens Recentes ({recentMessages.length})</h3>
            <RefreshCw className={`w-5 h-5 text-gray-400 transition-transform ${showMessages ? 'rotate-180' : ''}`} />
          </button>

          {showMessages && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {recentMessages.length > 0 ? (
                <>
                  {recentMessages.map((msg) => (
                    <div key={msg.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm" style={{ color: msg.color || '#ffffff' }}>
                          {msg.display_name}
                        </span>
                        {msg.is_subscriber && (
                          <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs font-semibold rounded">SUB</span>
                        )}
                        {msg.is_moderator && (
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs font-semibold rounded">MOD</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-300">{msg.message}</p>
                    </div>
                  ))}
                  <button
                    onClick={() => void clearMessages()}
                    className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-semibold uppercase text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Limpar Mensagens
                  </button>
                </>
              ) : (
                <p className="text-center text-gray-400 text-sm py-8">Sem mensagens</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className="w-full p-4 bg-gray-800 hover:bg-gray-750 transition-colors flex items-center justify-between"
          >
            <h3 className="font-bold text-white uppercase">Alertas Recentes ({recentAlerts.length})</h3>
            <RefreshCw className={`w-5 h-5 text-gray-400 transition-transform ${showAlerts ? 'rotate-180' : ''}`} />
          </button>

          {showAlerts && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {recentAlerts.length > 0 ? (
                <>
                  {recentAlerts.map((alert) => (
                    <div key={alert.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${
                          alert.alert_type === 'follow' ? 'bg-blue-500/20 text-blue-400' :
                          alert.alert_type === 'subscription' ? 'bg-purple-500/20 text-purple-400' :
                          alert.alert_type === 'raid' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {alert.alert_type}
                        </span>
                        <span className="font-bold text-white text-sm">{alert.display_name}</span>
                      </div>
                      {alert.amount > 0 && (
                        <p className="text-sm text-gray-300">Amount: {alert.amount}</p>
                      )}
                      {alert.message && (
                        <p className="text-sm text-gray-400 mt-1">{alert.message}</p>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => void clearAlerts()}
                    className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-semibold uppercase text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Limpar Alertas
                  </button>
                </>
              ) : (
                <p className="text-center text-gray-400 text-sm py-8">Sem alertas</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
