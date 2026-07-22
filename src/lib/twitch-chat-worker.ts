import { supabase } from './supabase';
import tmi from 'tmi.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type TmiClient = {
  connect: () => Promise<[string, number]>;
  disconnect: () => Promise<[string, number]>;
  on: (event: string, callback: (...args: any[]) => void) => void;
};

type TmiModule = {
  Client: new (options?: Record<string, unknown>) => TmiClient;
};

const tmiLib = tmi as unknown as TmiModule;

let client: TmiClient | null = null;
let isRunning = false;
const DEFAULT_TWITCH_CHANNEL = 'oficialfever';

export async function startTwitchChatListener(channelName = DEFAULT_TWITCH_CHANNEL) {
  console.log('[Twitch Chat] 🚀 Starting chat listener...');

  if (isRunning) {
    console.log('[Twitch Chat] ⚠️ Already running');
    return;
  }

  console.log('[Twitch Chat] 📡 Conectando ao canal:', channelName);

  client = new tmiLib.Client({
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

  client.on('raided', (channel, username, viewers) => {
    // Alerts are owned by Twitch EventSub — do not write twitch_alerts from TMI.
    console.log('[Twitch Chat] Raid ignored for alerts (EventSub only):', { channel, username, viewers });
  });

  client.on('subscription', (channel, username) => {
    console.log('[Twitch Chat] Subscription ignored for alerts (EventSub only):', { channel, username });
  });

  client.on('resub', (channel, username, months) => {
    console.log('[Twitch Chat] Resub ignored for alerts (EventSub only):', { channel, username, months });
  });

  client.on('subgift', (channel, username, streakMonths, recipient) => {
    console.log('[Twitch Chat] Gift sub ignored for alerts (EventSub only):', { channel, username, recipient, streakMonths });
  });

  client.on('cheer', (channel, userstate) => {
    console.log('[Twitch Chat] Cheer ignored for alerts (EventSub only):', {
      channel,
      bits: userstate?.bits,
    });
  });

  client.on('hosted', (channel, username, viewers) => {
    console.log('[Twitch Chat] Host ignored for alerts (EventSub only):', { channel, username, viewers });
  });

  client.on('message', async (_channel, tags, message, self) => {
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
