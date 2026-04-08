import { supabase } from './supabase';
import tmi from 'tmi.js';

let client: tmi.Client | null = null;
let isRunning = false;
const DEFAULT_TWITCH_CHANNEL = 'oficialfever';

async function insertTwitchAlert(payload: {
  alert_type: 'follow' | 'subscription' | 'raid' | 'cheer' | 'gift_subscription';
  username: string;
  display_name: string;
  amount?: number;
  months?: number;
  tier?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { error } = await supabase.from('twitch_alerts').insert({
      alert_type: payload.alert_type,
      username: payload.username,
      display_name: payload.display_name,
      amount: payload.amount || 0,
      months: payload.months || 0,
      tier: payload.tier || null,
      message: payload.message || null,
      metadata: payload.metadata || {},
    });

    if (error) {
      console.error('[Twitch Chat] ❌ Erro ao guardar alerta:', error);
    }
  } catch (error) {
    console.error('[Twitch Chat] ❌ Erro inesperado ao guardar alerta:', error);
  }
}

export async function startTwitchChatListener(channelName = DEFAULT_TWITCH_CHANNEL) {
  console.log('[Twitch Chat] 🚀 Starting chat listener...');

  if (isRunning) {
    console.log('[Twitch Chat] ⚠️ Already running');
    return;
  }

  console.log('[Twitch Chat] 📡 Conectando ao canal:', channelName);

  client = new tmi.Client({
    connection: {
      secure: true,
      reconnect: true
    },
    channels: [channelName]
  });

  client.on('connected', () => {
    console.log('[Twitch Chat] ✅ Conectado ao chat da Twitch!');
    isRunning = true;
  });

  client.on('raided', async (channel, username, viewers) => {
    console.log('[Twitch Chat] 🚨 Raid detectada:', { channel, username, viewers });
    await insertTwitchAlert({
      alert_type: 'raid',
      username: username || 'unknown',
      display_name: username || 'Unknown',
      amount: viewers || 0,
      metadata: { source: 'tmi-raided', channel },
    });
  });

  client.on('subscription', async (channel, username, method, message, userstate) => {
    console.log('[Twitch Chat] ⭐ Subscription detectada:', { channel, username, method, message });
    await insertTwitchAlert({
      alert_type: 'subscription',
      username: username || userstate?.username || 'unknown',
      display_name: userstate?.['display-name'] || username || 'Unknown',
      tier: method?.plan || null,
      months: 1,
      message: message || undefined,
      metadata: { source: 'tmi-subscription', channel },
    });
  });

  client.on('resub', async (channel, username, months, message, userstate, methods) => {
    console.log('[Twitch Chat] ⭐ Resub detectada:', { channel, username, months, message });
    await insertTwitchAlert({
      alert_type: 'subscription',
      username: username || userstate?.username || 'unknown',
      display_name: userstate?.['display-name'] || username || 'Unknown',
      tier: methods?.plan || null,
      months: months || 1,
      message: message || undefined,
      metadata: { source: 'tmi-resub', channel },
    });
  });

  client.on('subgift', async (channel, username, streakMonths, recipient, methods, userstate) => {
    console.log('[Twitch Chat] 🎁 Gift sub detectada:', { channel, username, recipient, streakMonths });
    await insertTwitchAlert({
      alert_type: 'gift_subscription',
      username: username || userstate?.username || 'unknown',
      display_name: userstate?.['display-name'] || username || 'Unknown',
      tier: methods?.plan || null,
      months: streakMonths || 1,
      message: recipient ? `Gift para ${recipient}` : undefined,
      metadata: { source: 'tmi-subgift', channel, recipient },
    });
  });

  client.on('cheer', async (channel, userstate, message) => {
    const bits = Number(userstate?.bits || 0);
    console.log('[Twitch Chat] 💎 Cheer detectado:', { channel, bits, message });
    await insertTwitchAlert({
      alert_type: 'cheer',
      username: userstate?.username || 'anonymous',
      display_name: userstate?.['display-name'] || userstate?.username || 'Anonymous',
      amount: bits,
      message: message || undefined,
      metadata: { source: 'tmi-cheer', channel },
    });
  });

  client.on('hosted', async (channel, username, viewers, autohost) => {
    console.log('[Twitch Chat] 📣 Host detectado:', { channel, username, viewers, autohost });
    await insertTwitchAlert({
      alert_type: 'raid',
      username: username || 'unknown',
      display_name: username || 'Unknown',
      amount: viewers || 0,
      message: autohost ? 'Auto-host' : 'Host',
      metadata: { source: 'tmi-hosted', channel, autohost: Boolean(autohost) },
    });
  });

  client.on('message', async (channel, tags, message, self) => {
    if (self) return; // Ignora mensagens do próprio bot

    console.log('[Twitch Chat] 💬 Nova mensagem:', {
      username: tags.username,
      message,
      badges: tags.badges
    });

    // Check if it's a giveaway command
    const trimmedMessage = message.trim();
    if (trimmedMessage.startsWith('!')) {
      console.log('[Twitch Chat] 🎁 Comando detectado:', trimmedMessage);

      try {
        // Check for active giveaways with this command
        const { data: giveaways } = await supabase
          .from('giveaways')
          .select('*')
          .eq('command', trimmedMessage.split(' ')[0])
          .eq('status', 'active')
          .eq('is_visible', true);

        if (giveaways && giveaways.length > 0) {
          const giveaway = giveaways[0];
          console.log('[Twitch Chat] 🎁 Sorteio ativo encontrado:', giveaway.name);

          // Try to add participant (will be ignored if already exists due to unique constraint)
          const userId = tags['user-id'];
          let profileImageUrl = 'https://static-cdn.jtvnw.net/user-default-pictures-uv/13e5fa74-defa-11e9-809c-784f43822e80-profile_image-70x70.png';

          if (tags.username) {
            try {
              console.log('[Twitch Chat] 🔍 Buscando avatar para:', tags.username);
              const response = await fetch(`https://decapi.me/twitch/avatar/${tags.username}`);
              if (response.ok) {
                const avatarUrl = await response.text();
                if (avatarUrl && avatarUrl.trim() && !avatarUrl.includes('error')) {
                  profileImageUrl = avatarUrl.trim();
                  console.log('[Twitch Chat] ✅ Avatar obtido:', profileImageUrl);
                } else {
                  console.log('[Twitch Chat] ⚠️ Avatar não encontrado, usando default');
                }
              }
            } catch (err) {
              console.error('[Twitch Chat] ❌ Erro ao buscar avatar:', err);
            }
          }

          const { error: insertError } = await supabase
            .from('giveaway_participants')
            .insert({
              giveaway_id: giveaway.id,
              username: tags['display-name'] || tags.username || 'Unknown',
              user_id: userId || tags.username || 'unknown',
              profile_image_url: profileImageUrl
            });

          if (insertError) {
            if (insertError.code === '23505') {
              console.log('[Twitch Chat] ⚠️ User já participou:', tags.username);
            } else {
              console.error('[Twitch Chat] ❌ Erro ao adicionar participante:', insertError);
            }
          } else {
            console.log('[Twitch Chat] ✅ Participante adicionado:', tags.username);
          }
        }
      } catch (err) {
        console.error('[Twitch Chat] ❌ Erro ao processar comando de sorteio:', err);
      }
    }

    try {
      const { error } = await supabase.from('twitch_chat_messages').insert({
        username: tags.username || 'unknown',
        display_name: tags['display-name'] || tags.username || 'Unknown',
        message: message,
        color: tags.color || '#FFFFFF',
        is_subscriber: !!tags.badges?.subscriber,
        is_moderator: !!tags.badges?.moderator || !!tags.badges?.broadcaster,
        is_vip: !!tags.badges?.vip
      });

      if (error) {
        console.error('[Twitch Chat] ❌ Erro ao guardar mensagem:', error);
      } else {
        console.log('[Twitch Chat] ✅ Mensagem guardada!');
      }
    } catch (err) {
      console.error('[Twitch Chat] ❌ Erro:', err);
    }
  });

  client.on('disconnected', (reason) => {
    console.log('[Twitch Chat] ❌ Desconectado:', reason);
    isRunning = false;
  });

  client.on('error', (error) => {
    console.error('[Twitch Chat] ❌ Erro:', error);
  });

  try {
    await client.connect();
  } catch (error) {
    console.error('[Twitch Chat] ❌ Erro ao conectar:', error);
    isRunning = false;
  }
}

export function stopTwitchChatListener() {
  if (client) {
    console.log('[Twitch Chat] 🛑 Parando listener...');
    client.disconnect();
    client = null;
    isRunning = false;
  }
}

export function isTwitchChatRunning() {
  return isRunning;
}
