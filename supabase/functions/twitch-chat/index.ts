import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface IRCMessage {
  tags: Record<string, string>;
  username: string;
  command: string;
  channel: string;
  message: string;
}

function parseIRCMessage(data: string): IRCMessage | null {
  const message: IRCMessage = {
    tags: {},
    username: '',
    command: '',
    channel: '',
    message: ''
  };

  let idx = 0;
  let rawTagsComponent = '';
  let rawSourceComponent = '';
  let rawCommandComponent = '';
  let rawParametersComponent = '';

  if (data[idx] === '@') {
    const endIdx = data.indexOf(' ');
    rawTagsComponent = data.slice(1, endIdx);
    idx = endIdx + 1;
  }

  if (data[idx] === ':') {
    idx += 1;
    const endIdx = data.indexOf(' ', idx);
    rawSourceComponent = data.slice(idx, endIdx);
    idx = endIdx + 1;
  }

  const endIdx = data.indexOf(':', idx);
  if (endIdx === -1) {
    rawCommandComponent = data.slice(idx);
  } else {
    rawCommandComponent = data.slice(idx, endIdx - 1);
    rawParametersComponent = data.slice(endIdx + 1);
  }

  if (rawTagsComponent) {
    const tags = rawTagsComponent.split(';');
    tags.forEach(tag => {
      const [key, value] = tag.split('=');
      message.tags[key] = value || '';
    });
  }

  if (rawSourceComponent) {
    const parts = rawSourceComponent.split('!');
    message.username = parts[0];
  }

  const commandParts = rawCommandComponent.trim().split(' ');
  message.command = commandParts[0];
  if (commandParts.length > 1) {
    message.channel = commandParts[1];
  }

  message.message = rawParametersComponent;

  return message;
}

async function connectToTwitchIRC(channelName: string, accessToken: string, supabase: any) {
  console.log('Attempting to connect to Twitch IRC...');
  console.log('Channel:', channelName);
  console.log('Token length:', accessToken?.length || 0);

  if (!accessToken || accessToken.length < 20) {
    throw new Error('Invalid access token. Token appears too short.');
  }

  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.log('Connection timeout');
      ws.close();
      reject(new Error('Connection timeout after 30 seconds'));
    }, 30000);

    ws.onopen = () => {
      console.log('WebSocket connected to Twitch IRC');
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send(`PASS oauth:${accessToken}`);
      ws.send(`NICK ${channelName}`);
      ws.send(`JOIN #${channelName}`);
      console.log('Sent authentication and join commands');
    };

    ws.onmessage = async (event) => {
      const data = event.data;
      console.log('IRC:', data);

      if (data.startsWith('PING')) {
        ws.send('PONG :tmi.twitch.tv');
        return;
      }

      if (data.includes('Login authentication failed')) {
        console.error('Authentication failed - invalid token');
        clearTimeout(timeout);
        ws.close();
        reject(new Error('Twitch authentication failed. Check your access token.'));
        return;
      }

      const parsedMessage = parseIRCMessage(data);

      if (parsedMessage && parsedMessage.command === 'PRIVMSG' && parsedMessage.message) {
        try {
          const displayName = parsedMessage.tags['display-name'] || parsedMessage.username;
          const color = parsedMessage.tags['color'] || '#FFFFFF';
          const isSubscriber = parsedMessage.tags['subscriber'] === '1';
          const isModerator = parsedMessage.tags['mod'] === '1';
          const messageId = parsedMessage.tags['id'];

          await supabase.from('twitch_chat_messages').insert({
            twitch_message_id: messageId,
            username: parsedMessage.username,
            display_name: displayName,
            message: parsedMessage.message,
            color: color,
            is_subscriber: isSubscriber,
            is_moderator: isModerator,
          });

          console.log('Message saved:', displayName, parsedMessage.message);
        } catch (error) {
          console.error('Error saving message:', error);
        }
      }

      if (data.includes('001') || data.includes('Welcome')) {
        clearTimeout(timeout);
        console.log('Successfully authenticated and joined channel');
        setTimeout(() => {
          resolve(true);
        }, 2000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(timeout);
      reject(new Error('WebSocket connection error'));
    };

    ws.onclose = () => {
      console.log('Disconnected from Twitch IRC');
      clearTimeout(timeout);
    };

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('Connection established, waiting for messages...');
        resolve(true);
      }
    }, 25000);
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'connect') {
      console.log('Connect action requested');

      const { data: config, error: configError } = await supabase
        .from('twitch_config')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (configError) {
        console.error('Config error:', configError);
        throw new Error('Database error: ' + configError.message);
      }

      if (!config) {
        throw new Error('No active Twitch configuration found. Please configure your channel first.');
      }

      console.log('Config found:', config.channel_name);

      await connectToTwitchIRC(config.channel_name, config.access_token, supabase);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Connected to Twitch IRC successfully',
          channel: config.channel_name
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const body = await req.json();

    await supabase.from('twitch_chat_messages').insert({
      username: body.username,
      display_name: body.display_name,
      message: body.message,
      color: body.color || '#FFFFFF',
      is_subscriber: body.is_subscriber || false,
      is_moderator: body.is_moderator || false,
    });

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error occurred',
        details: error.toString()
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});