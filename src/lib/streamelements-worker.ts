import { supabase } from './supabase';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let reconnectTimeout: number | null = null;
let pollInterval: number | null = null;
let isRunning = false;
const processedActivityIds = new Set<string>();

interface StreamElementsConfig {
  jwt_token: string;
  account_id: string;
  channel_name: string;
}

function normalizeEventType(rawType: string | null | undefined) {
  const baseType = (rawType || '').toLowerCase().replace(/-latest$/, '').replace(/_/g, '-');

  if (baseType.includes('follow')) return 'follower';
  if (baseType.includes('sub')) return 'subscriber';
  if (baseType.includes('raid')) return 'raid';
  if (baseType.includes('cheer') || baseType.includes('bit')) return 'cheer';
  if (baseType.includes('tip') || baseType.includes('donat')) return 'tip';
  if (baseType.includes('host')) return 'host';

  switch (baseType) {
    case 'follower':
    case 'subscriber':
    case 'raid':
    case 'cheer':
    case 'tip':
    case 'host':
      return baseType;
    default:
      return 'unknown';
  }
}

function resolveEventType(eventName: string, eventData: any, rawData: any) {
  const candidates = [
    eventName,
    eventData?.listener,
    eventData?.type,
    eventData?.event?.listener,
    eventData?.event?.type,
    rawData?.listener,
    rawData?.type,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeEventType(candidate);
    if (normalized !== 'unknown') return normalized;
  }

  if (rawData?.providerId && (rawData?.avatar || rawData?.username || rawData?.displayName)) {
    return 'follower';
  }

  return 'unknown';
}

function isStreamElementsEvent(eventName: string) {
  return (
    eventName === 'event' ||
    eventName.startsWith('event:') ||
    eventName.startsWith('event.')
  );
}

function rememberProcessedActivity(activityId: string | null | undefined) {
  if (!activityId) return false;
  if (processedActivityIds.has(activityId)) return true;

  processedActivityIds.add(activityId);
  if (processedActivityIds.size > 500) {
    const [firstKey] = processedActivityIds;
    if (firstKey) processedActivityIds.delete(firstKey);
  }

  return false;
}

function extractActivityList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.docs)) return payload.docs;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.activities)) return payload.activities;
  return [];
}

function toNormalizedStreamElementsEvent(activity: any) {
  const eventPayload = activity?.data || activity?.event || activity;
  const activityId = activity?._id || activity?.id || eventPayload?._id || eventPayload?.id || eventPayload?.eventId || null;
  const inferredType = resolveEventType(
    activity?.type || activity?.listener || '',
    activity,
    eventPayload,
  );

  return {
    activityId,
    type: inferredType,
    data: {
      ...eventPayload,
      _id: eventPayload?._id || activityId,
      username: eventPayload?.username || eventPayload?.name || eventPayload?.displayName || activity?.username,
      displayName: eventPayload?.displayName || eventPayload?.username || eventPayload?.name || activity?.displayName,
      amount: eventPayload?.amount || activity?.amount || 0,
      months: eventPayload?.months || activity?.months || 0,
      message: eventPayload?.message || activity?.message || null,
      tier: eventPayload?.tier || activity?.tier || null,
      gifted: eventPayload?.gifted || activity?.gifted || false,
      createdAt: eventPayload?.createdAt || activity?.createdAt || activity?.updatedAt || null,
    }
  };
}

async function fetchActivitiesWithAuth(accountId: string, token: string) {
  const url = `https://api.streamelements.com/kappa/v2/activities/${accountId}?limit=20`;
  const authHeaders = [
    { Authorization: `Bearer ${token}` },
    { Authorization: `JWT ${token}` },
    { Authorization: token },
  ];

  for (const headers of authHeaders) {
    const response = await fetch(url, { headers });
    if (response.ok) {
      return response.json();
    }

    if (response.status !== 401 && response.status !== 403) {
      throw new Error(`Activities request failed with status ${response.status}`);
    }
  }

  throw new Error('Activities request unauthorized');
}

async function pollRecentActivities(config: StreamElementsConfig) {
  if (!config.account_id || !config.jwt_token) return;

  try {
    const payload = await fetchActivitiesWithAuth(config.account_id, config.jwt_token);
    const activities = extractActivityList(payload);

    for (const activity of activities.reverse()) {
      const normalized = toNormalizedStreamElementsEvent(activity);
      if (normalized.type === 'unknown') {
        continue;
      }

      if (rememberProcessedActivity(normalized.activityId)) {
        continue;
      }

      await handleEvent(normalized);
    }
  } catch (error) {
    console.error('[SE Worker] ❌ Polling recent activities failed:', error);
  }
}

function startPolling(config: StreamElementsConfig) {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  pollRecentActivities(config);
  pollInterval = window.setInterval(() => {
    pollRecentActivities(config);
  }, 15000);
}

async function handleEvent(data: any) {
  console.log('[SE Worker] 📩 handleEvent called with:', data);
  console.log('[SE Worker] Event type:', data.type);
  console.log('[SE Worker] Event data:', JSON.stringify(data.data || data, null, 2));

  const eventType = normalizeEventType(data.type);
  const evtData = data.data || data;

  if (eventType === 'message') {
    console.log('[SE Worker] 💬 Chat message detected');

    const { error } = await supabase.from('twitch_chat_messages').insert({
      username: evtData.username || evtData.nick || 'unknown',
      display_name: evtData.displayName || evtData.username || 'Unknown',
      message: evtData.text || evtData.message || '',
      color: evtData.color || '#FFFFFF',
      is_subscriber: evtData.badges?.includes('subscriber') || false,
      is_moderator: evtData.badges?.includes('moderator') || evtData.role === 'moderator' || false,
    });

    if (error) {
      console.error('[SE Worker] ❌ Error saving message:', error);
    } else {
      console.log('[SE Worker] ✅ Chat message saved');
    }
    return;
  }

  if (['follower', 'subscriber', 'tip', 'cheer', 'raid', 'host'].includes(eventType)) {
    console.log('[SE Worker] 🎉 Processing alert type:', eventType);

    const username = evtData.username || evtData.displayName || evtData.name || 'unknown';
    const sourceEventId = evtData._id || evtData.eventId || evtData.id || evtData.messageId || evtData.uuid || evtData.providerId || null;
    const eventId = sourceEventId
      ? `${eventType}_${sourceEventId}`
      : `${eventType}_${username}_${evtData.amount || 0}_${evtData.createdAt || evtData.timestamp || ''}`;

    const baseEventPayload = {
      event_id: eventId,
      event_type: eventType,
      username: username,
      display_name: evtData.displayName || evtData.username || evtData.name || 'Unknown',
      message: evtData.message || null,
      amount: evtData.amount || 0,
      tier: evtData.tier || null,
      months: evtData.months || evtData.amount || 0,
      gifted: evtData.gifted || false,
      raw_data: data,
    };

    const { error: evtError } = await supabase.from('streamelements_events').insert(baseEventPayload);

    if (evtError) {
      if (evtError.code === '23505') {
        const replayEventId = `${eventId}_${Date.now()}`;
        const { error: replayInsertError } = await supabase.from('streamelements_events').insert({
          ...baseEventPayload,
          event_id: replayEventId,
        });

        if (replayInsertError) {
          console.log('[SE Worker] ℹ️ Duplicate event ignored:', eventId);
        } else {
          console.log('[SE Worker] ✅ Replay event saved with unique id:', replayEventId);
        }
      } else {
        console.error('[SE Worker] ❌ Error saving event:', evtError);
      }
    } else {
      console.log('[SE Worker] ✅ Event saved to streamelements_events');
    }
  } else {
    console.log('[SE Worker] ⚠️ Unhandled event type:', eventType);
  }
}

export async function startStreamElementsListener() {
  console.log('[SE Worker] 🚀 Starting listener...');

  if (isRunning) {
    console.log('[SE Worker] ⚠️ Listener already running');
    return;
  }

  const { data: config, error } = await supabase
    .from('streamelements_config')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[SE Worker] ❌ Error loading config:', error);
    return;
  }

  if (!config) {
    console.log('[SE Worker] ⚠️ No config found - skipping');
    return;
  }

  console.log('[SE Worker] ✅ Config loaded for:', config.channel_name);
  isRunning = true;
  startPolling(config);
  connectSocket(config);
}

export function stopStreamElementsListener() {
  isRunning = false;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function connectSocket(config: StreamElementsConfig) {
  if (!isRunning) return;

  console.log('[SE Worker] Connecting to StreamElements...');

  socket = io('https://realtime.streamelements.com', {
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log('[SE Worker] ✅ Connected! Authenticating...');
    socket!.emit('authenticate', { method: 'jwt', token: config.jwt_token });
  });

  socket.on('authenticated', (data) => {
    console.log('[SE Worker] ✅ Authenticated successfully!', data);
    console.log('[SE Worker] 📡 Subscribing to events and chat...');

    const channelId = data.channelId;

    socket!.emit('subscribe', { topic: 'channel.chat.message' });
    socket!.emit('subscribe', { topic: `event.update` });
    socket!.emit('subscribe', { topic: `event` });

    console.log('[SE Worker] Subscribed to topics for channel:', channelId);
  });

  socket.onAny(async (eventName, ...args) => {
    console.log('[SE Worker] 🔔 Raw event received:', eventName, args);

    if (eventName === 'channel.chat.message') {
      const data = args[0];
      console.log('[SE Worker] 💬 Chat message via topic:', data);

      const msgData = data.data;
      const { error } = await supabase.from('twitch_chat_messages').insert({
        username: msgData.chatter_user_name || msgData.username || 'unknown',
        display_name: msgData.chatter_user_name || msgData.displayName || 'Unknown',
        message: msgData.message?.text || msgData.text || msgData.message || '',
        color: msgData.color || '#FFFFFF',
        is_subscriber: msgData.badges?.includes('subscriber') || false,
        is_moderator: msgData.badges?.includes('moderator') || false,
      });

      if (error) {
        console.error('[SE Worker] ❌ Error saving chat message:', error);
      } else {
        console.log('[SE Worker] ✅ Chat message saved!');
      }
      return;
    }

    if (isStreamElementsEvent(eventName)) {
      const eventData = args[0];
      console.log('[SE Worker] 🎯 Processing event via onAny:', eventData);

      // StreamElements payloads vary by event name (event, event:update, event.update).
      const rawData = eventData?.event?.data || eventData?.event || eventData?.data || eventData;

      let eventType = eventName
        .replace('event:', '')
        .replace('event.', '')
        .replace(/^event$/, '');
      eventType = resolveEventType(eventType, eventData, rawData);

      if (eventType === 'unknown') {
        console.log('[SE Worker] ⚠️ Unknown event type after normalization:', {
          eventName,
          listener: eventData?.listener,
          type: eventData?.type,
          rawType: rawData?.type,
        });
      }

      const data = {
        type: eventType,
        data: rawData
      };

      console.log('[SE Worker] 🎯 Normalized data:', data);
      await handleEvent(data);
    }
  });

  socket.on('subscribed', (data) => {
    console.log('[SE Worker] ✅ Subscribed to topic:', data);
  });

  socket.on('unauthorized', (data) => {
    console.error('[SE Worker] ❌ UNAUTHORIZED:', data);
  });

  socket.on('disconnect', (reason) => {
    console.log('[SE Worker] ❌ Disconnected:', reason);

    if (isRunning && reason !== 'io client disconnect') {
      console.log('[SE Worker] Reconnecting in 5s...');
      reconnectTimeout = window.setTimeout(() => {
        connectSocket(config);
      }, 5000);
    }
  });

  socket.on('error', (error) => {
    console.error('[SE Worker] ❌ Socket error:', error);
  });
}
