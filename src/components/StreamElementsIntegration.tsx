import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  clearStreamElementsConfig,
  getStreamElementsStatus,
  saveStreamElementsConfig,
  syncStreamElementsData,
  type StreamElementsStatus,
  type StreamElementsSyncResult,
} from '../lib/streamelements-service';
import { AlertCircle, Check, Loader, RefreshCw, Trash2, Wifi, Zap } from 'lucide-react';

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

interface SEEvent {
  id: string;
  event_id?: string | null;
  event_type: string;
  username: string;
  display_name: string;
  message?: string;
  amount: number;
  tier?: string;
  months: number;
  created_at: string;
}

const DEFAULT_CHANNEL_NAME = 'oficialfever';

export function StreamElementsIntegration() {
  const [config, setConfig] = useState<StreamElementsStatus | null>(null);

  const [jwtToken, setJwtToken] = useState('');
  const [accountId, setAccountId] = useState('');
  const [channelName, setChannelName] = useState(DEFAULT_CHANNEL_NAME);

  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [recentEvents, setRecentEvents] = useState<SEEvent[]>([]);

  const [showMessages, setShowMessages] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showEvents, setShowEvents] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<StreamElementsSyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [chatConnected, setChatConnected] = useState(false);

  const syncSummary = useMemo(() => {
    if (!syncInfo) return null;
    if (syncInfo.error) return `Erro no sync: ${syncInfo.error}`;
    return `Novos: ${syncInfo.processed} | Duplicados: ${syncInfo.duplicates} | Ignorados: ${syncInfo.skipped}`;
  }, [syncInfo]);

  useEffect(() => {
    void bootstrap();

    const messagesChannel = supabase
      .channel('se_messages_v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'twitch_chat_messages' }, () => {
        void loadRecentMessages();
      })
      .subscribe();

    const alertsChannel = supabase
      .channel('se_alerts_v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'twitch_alerts' }, () => {
        void loadRecentAlerts();
        void loadRecentEvents();
      })
      .subscribe();

    const eventsChannel = supabase
      .channel('se_events_v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'streamelements_events' }, () => {
        void loadRecentEvents();
        void loadRecentAlerts();
      })
      .subscribe();

    return () => {
      messagesChannel.unsubscribe();
      alertsChannel.unsubscribe();
      eventsChannel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!config?.configured) return;

    const interval = window.setInterval(() => {
      void runSync(false);
    }, 15000);

    return () => clearInterval(interval);
  }, [config?.configured]);

  // Browser-based Twitch IRC chat listener
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function connectChat() {
      if (cancelled) return;

      // Get twitch config for access_token + channel
      const { data: twitchConfig } = await supabase
        .from('twitch_config')
        .select('access_token, channel_name')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!twitchConfig?.access_token || cancelled) {
        console.log('[Chat IRC] No active Twitch config, skipping chat connection');
        return;
      }

      const channel = twitchConfig.channel_name || 'oficialfever';
      console.log('[Chat IRC] Connecting to', channel);

      ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

      ws.onopen = () => {
        if (!ws || cancelled) return;
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        ws.send(`PASS oauth:${twitchConfig.access_token}`);
        ws.send(`NICK ${channel}`);
        ws.send(`JOIN #${channel}`);
        setChatConnected(true);
        console.log('[Chat IRC] Connected');
      };

      ws.onmessage = async (event) => {
        const raw = event.data as string;

        if (raw.startsWith('PING')) {
          ws?.send('PONG :tmi.twitch.tv');
          return;
        }

        // Parse PRIVMSG
        if (!raw.includes('PRIVMSG')) return;

        const tagEnd = raw.indexOf(' ');
        const tagStr = raw.startsWith('@') ? raw.slice(1, tagEnd) : '';
        const tags: Record<string, string> = {};
        if (tagStr) {
          for (const part of tagStr.split(';')) {
            const eq = part.indexOf('=');
            if (eq > 0) tags[part.slice(0, eq)] = part.slice(eq + 1);
          }
        }

        const msgMatch = raw.match(/PRIVMSG\s+#\S+\s+:(.+)/);
        const message = msgMatch?.[1]?.trimEnd() || '';
        if (!message) return;

        const usernameMatch = raw.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv/);
        const username = usernameMatch?.[1] || 'unknown';

        try {
          await supabase.from('twitch_chat_messages').insert({
            twitch_message_id: tags['id'] || null,
            username,
            display_name: tags['display-name'] || username,
            message,
            color: tags['color'] || '#FFFFFF',
            is_subscriber: tags['subscriber'] === '1',
            is_moderator: tags['mod'] === '1',
            is_vip: tags['vip'] === '1',
          });
        } catch (e) {
          console.warn('[Chat IRC] Insert error:', e);
        }
      };

      ws.onclose = () => {
        setChatConnected(false);
        console.log('[Chat IRC] Disconnected');
        if (!cancelled) {
          reconnectTimer = setTimeout(connectChat, 5000);
        }
      };

      ws.onerror = (e) => {
        console.warn('[Chat IRC] Error:', e);
        ws?.close();
      };

      // Keep alive ping every 4 min
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send('PING :keepalive');
        }
      }, 240000);
    }

    void connectChat();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      setChatConnected(false);
    };
  }, []);

  async function bootstrap() {
    await loadConfig();
    await Promise.all([loadRecentMessages(), loadRecentAlerts(), loadRecentEvents()]);
  }

  async function loadConfig() {
    const status = await getStreamElementsStatus();
    if (status.configured) {
      setConfig(status);
      setChannelName(status.channel_name || DEFAULT_CHANNEL_NAME);
      return;
    }

    setConfig(null);
    setChannelName(DEFAULT_CHANNEL_NAME);
  }

  async function loadRecentMessages() {
    const { data, error } = await supabase
      .from('twitch_chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error loading messages:', error);
      return;
    }

    setRecentMessages(data || []);
  }

  async function loadRecentAlerts() {
    const { data, error } = await supabase
      .from('twitch_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error loading alerts:', error);
      return;
    }

    setRecentAlerts(data || []);
  }

  async function loadRecentEvents() {
    const { data: seData, error: seError } = await supabase
      .from('streamelements_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (seError) {
      console.error('Error loading events:', seError);
      return;
    }

    const { data: twitchData, error: twitchError } = await supabase
      .from('twitch_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (twitchError) {
      console.error('Error loading alerts for events feed:', twitchError);
      return;
    }

    const streamElementsEvents: SEEvent[] = (seData || []).map((event) => ({
      id: `se_${event.id}`,
      event_id: event.event_id || null,
      event_type: (event.event_type || '').toLowerCase(),
      username: event.username,
      display_name: event.display_name || event.username,
      message: event.message || undefined,
      amount: event.amount || 0,
      tier: event.tier || undefined,
      months: event.months || 0,
      created_at: event.created_at,
    }));

    const twitchEvents: SEEvent[] = (twitchData || []).map((event) => ({
      id: `tw_${event.id}`,
      event_id: event.event_id || null,
      event_type: (event.alert_type || '').toLowerCase(),
      username: event.username,
      display_name: event.display_name || event.username,
      message: event.message || undefined,
      amount: event.amount || 0,
      tier: event.tier || undefined,
      months: event.months || 0,
      created_at: event.created_at,
    }));

    const merged = [...streamElementsEvents, ...twitchEvents]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const deduped: SEEvent[] = [];
    const seen = new Set<string>();

    for (const event of merged) {
      const fallbackKey = `${event.event_type}|${event.username}|${event.amount}|${event.months}|${event.created_at}`;
      const uniqueKey = event.event_id || fallbackKey;

      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);
      deduped.push(event);

      if (deduped.length === 10) break;
    }

    setRecentEvents(deduped);
  }

  async function runSync(showBusyState = true) {
    if (showBusyState) setIsSyncing(true);

    const result = await syncStreamElementsData();
    setSyncInfo(result);
    setLastSyncAt(new Date().toISOString());
    await loadRecentEvents();

    if (showBusyState) setIsSyncing(false);
  }

  async function handleSaveConfig() {
    const jwt = jwtToken.trim();
    const account = accountId.trim();
    const channel = channelName.trim() || DEFAULT_CHANNEL_NAME;

    if (!jwt || !account) {
      setSaveError('JWT Token e Account ID sao obrigatorios');
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    try {
      await saveStreamElementsConfig({ jwtToken: jwt, accountId: account, channelName: channel });
      await loadConfig();
      await runSync(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Erro a guardar configuracao');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetConfig() {
    await clearStreamElementsConfig();
    setConfig(null);
    setJwtToken('');
    setAccountId('');
    setChannelName(DEFAULT_CHANNEL_NAME);
    setSaveError(null);
    setSyncInfo(null);
    setLastSyncAt(null);
  }

  async function clearMessages() {
    if (!confirm('Limpar todas as mensagens?')) return;
    const { error } = await supabase.from('twitch_chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (!error) setRecentMessages([]);
  }

  async function clearAlerts() {
    if (!confirm('Limpar todos os alertas?')) return;
    const { error } = await supabase.from('twitch_alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (!error) setRecentAlerts([]);
  }

  async function clearEvents() {
    if (!confirm('Limpar todos os eventos?')) return;
    const { error } = await supabase.from('streamelements_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (!error) setRecentEvents([]);
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white uppercase">StreamElements</h2>
              <p className="text-blue-50 text-sm uppercase">Painel reconstruido para eventos reais do canal</p>
            </div>
            {config?.configured && (
              <div className="flex items-center gap-2 bg-green-500/20 px-3 py-2 rounded-lg border border-green-500/30">
                <Wifi className="w-4 h-4 text-green-400 animate-pulse" />
                <span className="text-green-400 font-semibold text-sm uppercase">Ligado</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {!config?.configured ? (
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-300">
                    <p className="font-semibold uppercase mb-2">Setup</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Abrir StreamElements, copiar JWT token e Account ID</li>
                      <li>Canal predefinido: oficialfever (podes alterar)</li>
                      <li>Guardar e comecar sync automatico</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase">JWT Token</label>
                  <input
                    type="password"
                    value={jwtToken}
                    onChange={(e) => setJwtToken(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="eyJhbGci..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase">Account ID</label>
                  <input
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="5d12a722..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2 uppercase">Nome do canal</label>
                  <input
                    type="text"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder={DEFAULT_CHANNEL_NAME}
                  />
                </div>
              </div>

              {saveError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-400 text-sm font-semibold">{saveError}</p>
                </div>
              )}

              <button
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="w-full px-6 py-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold uppercase text-sm transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {isSaving ? 'A guardar...' : 'Guardar e iniciar'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 font-semibold uppercase">Configurado: {config.channel_name || DEFAULT_CHANNEL_NAME}</p>
                <p className="text-green-300/80 text-xs mt-1">Sync automatico ativo a cada 15 segundos</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => void runSync(true)}
                  disabled={isSyncing}
                  className="px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg font-semibold uppercase text-xs transition-colors flex items-center justify-center gap-2"
                >
                  {isSyncing ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {isSyncing ? 'A sincronizar...' : 'Sincronizar agora'}
                </button>

                <button
                  onClick={() => void handleResetConfig()}
                  className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-semibold uppercase text-xs transition-colors"
                >
                  Reconfigurar
                </button>
              </div>

              {syncSummary && (
                <div className={`rounded-lg p-3 border ${syncInfo?.error ? 'bg-red-500/10 border-red-500/30' : 'bg-cyan-500/10 border-cyan-500/30'}`}>
                  <p className={`text-sm font-semibold ${syncInfo?.error ? 'text-red-400' : 'text-cyan-300'}`}>{syncSummary}</p>
                  {lastSyncAt && <p className="text-xs text-gray-400 mt-1">Ultimo sync: {new Date(lastSyncAt).toLocaleString()}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <button
            onClick={() => setShowMessages(!showMessages)}
            className="w-full p-4 bg-gray-800 transition-colors flex items-center justify-between"
          >
            <h3 className="font-bold text-white uppercase flex items-center gap-2">
              Chat ({recentMessages.length})
              {chatConnected && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="IRC conectado" />}
            </h3>
            <RefreshCw className={`w-5 h-5 text-gray-400 transition-transform ${showMessages ? 'rotate-180' : ''}`} />
          </button>
          {showMessages && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {recentMessages.length > 0 ? (
                <>
                  {recentMessages.map((msg) => (
                    <div key={msg.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm" style={{ color: msg.color || '#ffffff' }}>{msg.display_name}</span>
                        {msg.is_subscriber && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs font-semibold rounded">SUB</span>}
                        {msg.is_moderator && <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs font-semibold rounded">MOD</span>}
                      </div>
                      <p className="text-sm text-gray-300">{msg.message}</p>
                    </div>
                  ))}
                  <button
                    onClick={() => void clearMessages()}
                    className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-semibold uppercase text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Limpar
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
            className="w-full p-4 bg-gray-800 transition-colors flex items-center justify-between"
          >
            <h3 className="font-bold text-white uppercase">Alertas ({recentAlerts.length})</h3>
            <RefreshCw className={`w-5 h-5 text-gray-400 transition-transform ${showAlerts ? 'rotate-180' : ''}`} />
          </button>
          {showAlerts && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {recentAlerts.length > 0 ? (
                <>
                  {recentAlerts.map((alert) => (
                    <div key={alert.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-1 text-xs font-bold rounded uppercase bg-yellow-500/20 text-yellow-400">{alert.alert_type}</span>
                        <span className="font-bold text-white text-sm">{alert.display_name}</span>
                      </div>
                      {alert.amount > 0 && <p className="text-sm text-gray-300">Amount: {alert.amount}</p>}
                    </div>
                  ))}
                  <button
                    onClick={() => void clearAlerts()}
                    className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-semibold uppercase text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Limpar
                  </button>
                </>
              ) : (
                <p className="text-center text-gray-400 text-sm py-8">Sem alertas</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <button
            onClick={() => setShowEvents(!showEvents)}
            className="w-full p-4 bg-gray-800 transition-colors flex items-center justify-between"
          >
            <h3 className="font-bold text-white uppercase">Eventos SE ({recentEvents.length})</h3>
            <RefreshCw className={`w-5 h-5 text-gray-400 transition-transform ${showEvents ? 'rotate-180' : ''}`} />
          </button>
          {showEvents && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {recentEvents.length > 0 ? (
                <>
                  {recentEvents.map((event) => (
                    <div key={event.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-1 text-xs font-bold rounded uppercase bg-cyan-500/20 text-cyan-400">{event.event_type}</span>
                        <span className="font-bold text-white text-sm">{event.display_name}</span>
                      </div>
                      {event.amount > 0 && <p className="text-sm text-gray-300">Amount: {event.amount}</p>}
                    </div>
                  ))}
                  <button
                    onClick={() => void clearEvents()}
                    className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-semibold uppercase text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Limpar
                  </button>
                </>
              ) : (
                <p className="text-center text-gray-400 text-sm py-8">Sem eventos</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
