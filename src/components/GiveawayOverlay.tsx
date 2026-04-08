import { useState, useEffect, CSSProperties } from 'react';
import { Gift, Trophy, Users, Clock, Shuffle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Giveaway {
  id: string;
  name: string;
  command: string;
  status: 'active' | 'drawing' | 'completed';
  winner_username: string | null;
  winner_profile_image_url: string | null;
  total_participants: number;
  is_visible: boolean;
  end_time: string | null;
}

interface Participant {
  id: string;
  username: string;
  user_id: string;
  profile_image_url: string;
}

export function GiveawayOverlay() {
  const [giveaway, setGiveaway] = useState<Giveaway | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('00:00');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const popupBaseStyle: CSSProperties = {
    left: 0,
    right: 0,
    top: 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
    transition: 'opacity 280ms ease, transform 280ms ease',
  };

  useEffect(() => {
    loadActiveGiveaway();

    const channel = supabase
      .channel('giveaway_overlay')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'giveaways' }, (payload) => {
        if (payload.new && (payload.new as any).status === 'drawing') {
          startRolling((payload.new as any).id);
        } else {
          loadActiveGiveaway();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  useEffect(() => {
    if (giveaway?.winner_username) {
      setShowWinner(true);
      const timer = setTimeout(() => {
        setShowWinner(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [giveaway?.winner_username]);

  useEffect(() => {
    if (!giveaway?.end_time) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const end = new Date(giveaway.end_time).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeRemaining('00:00');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [giveaway?.end_time]);

  const loadActiveGiveaway = async () => {
    const { data, error } = await supabase
      .from('giveaways')
      .select('*')
      .eq('is_visible', true)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      console.error('Error loading giveaway:', error);
      return;
    }

    if (!data) {
      const { data: completedData } = await supabase
        .from('giveaways')
        .select('*')
        .eq('is_visible', true)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (completedData) {
        setGiveaway(completedData);
        setTimeout(() => setIsVisible(true), 50);
      } else {
        setIsVisible(false);
        setTimeout(() => setGiveaway(null), 1000);
      }
    } else {
      setGiveaway(data);
      setTimeout(() => setIsVisible(true), 50);
    }
  };

  const startRolling = async (giveawayId: string) => {
    const { data: participantData } = await supabase
      .from('giveaway_participants')
      .select('*')
      .eq('giveaway_id', giveawayId);

    if (!participantData || participantData.length === 0) return;

    setParticipants(participantData);
    setIsRolling(true);

    let rollCount = 0;
    const maxRolls = 40;
    const rollInterval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * participantData.length);
      setCurrentParticipant(participantData[randomIndex]);
      rollCount++;

      if (rollCount >= maxRolls) {
        clearInterval(rollInterval);
      }
    }, 100);

    setTimeout(() => {
      setIsRolling(false);
    }, 5000);
  };

  if (!giveaway && !isRolling) return null;

  if (isRolling && currentParticipant) {
    const profileImage = currentParticipant.profile_image_url && currentParticipant.profile_image_url.trim() !== ''
      ? currentParticipant.profile_image_url
      : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="70" height="70" viewBox="0 0 70 70"%3E%3Crect fill="%239147ff" width="70" height="70"/%3E%3Cpath fill="%23fff" d="M35 35m-15 0a15 15 0 1 0 30 0a15 15 0 1 0 -30 0" opacity="0.3"/%3E%3C/svg%3E';

    return (
      <div
        className="absolute w-full z-[9999]"
        style={{ ...popupBaseStyle, opacity: 1 }}
      >
        <div
          className="rounded-t-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
            border: '2px solid rgba(96, 165, 250, 0.4)',
          }}
        >
          <div className="p-3" style={{ width: '100%' }}>
            <div className="flex items-center gap-2">
              <img
                src={profileImage}
                alt={currentParticipant.username}
                className="w-8 h-8 rounded-full border-2 border-yellow-400/50"
                onError={(e) => {
                  e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="70" height="70" viewBox="0 0 70 70"%3E%3Crect fill="%239147ff" width="70" height="70"/%3E%3Cpath fill="%23fff" d="M35 35m-15 0a15 15 0 1 0 30 0a15 15 0 1 0 -30 0" opacity="0.3"/%3E%3C/svg%3E';
                }}
              />
              <p className="text-sm font-black text-white drop-shadow-lg break-all flex-1">{currentParticipant.username}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!giveaway) return null;

  if (showWinner && giveaway?.winner_username) {
    return (
      <div
        className="absolute w-full z-[9999] transition-opacity duration-1000"
        style={{ ...popupBaseStyle, opacity: isVisible ? 1 : 0 }}
      >
        <div
          className="rounded-t-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
            border: '2px solid rgba(96, 165, 250, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}
        >
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-yellow-400 drop-shadow-lg" />
              <p className="text-yellow-400/90 text-xs font-bold uppercase tracking-wide">Vencedor</p>
            </div>

            <div className="flex items-center gap-2">
              <img
                src={giveaway.winner_profile_image_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="70" height="70" viewBox="0 0 70 70"%3E%3Crect fill="%239147ff" width="70" height="70"/%3E%3Cpath fill="%23fff" d="M35 35m-15 0a15 15 0 1 0 30 0a15 15 0 1 0 -30 0" opacity="0.3"/%3E%3C/svg%3E'}
                alt={giveaway.winner_username}
                className="w-7 h-7 rounded-full border-2 border-yellow-400/50"
                onError={(e) => {
                  e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="70" height="70" viewBox="0 0 70 70"%3E%3Crect fill="%239147ff" width="70" height="70"/%3E%3Cpath fill="%23fff" d="M35 35m-15 0a15 15 0 1 0 30 0a15 15 0 1 0 -30 0" opacity="0.3"/%3E%3C/svg%3E';
                }}
              />
              <p className="text-sm font-black text-white drop-shadow-lg break-all flex-1">{giveaway.winner_username}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute w-full z-[9999] transition-opacity duration-1000"
      style={{ ...popupBaseStyle, opacity: isVisible ? 1 : 0 }}
    >
      <div
        className="rounded-t-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
          border: '2px solid rgba(96, 165, 250, 0.3)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center gap-1.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <Gift className="w-4 h-4 text-white" />
              </div>
              <span className="text-white text-lg font-black">{giveaway.total_participants}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-yellow-400" />
              <span className="text-yellow-400 text-sm font-bold">{timeRemaining}</span>
            </div>
          </div>

          <div className="text-center">
            <p className="text-white/90 text-xs">
              Type <span
                className="font-black px-1.5 py-0.5 rounded text-xs"
                style={{
                  background: 'rgba(234, 179, 8, 0.3)',
                  color: '#fbbf24'
                }}
              >{giveaway.command}</span> in chat to join!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
