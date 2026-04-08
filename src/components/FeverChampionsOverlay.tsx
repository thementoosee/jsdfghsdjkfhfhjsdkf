import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Star } from 'lucide-react';

interface Tournament {
  id: string;
  name: string;
  status: 'setup' | 'active' | 'completed';
  current_phase: 'group_stage' | 'knockout';
}

interface Group {
  id: string;
  tournament_id: string;
  group_name: string;
}

interface Participant {
  id: string;
  tournament_id: string;
  group_id: string;
  viewer_name: string;
  slot_name: string;
  slot_image: string;
  points: number;
  spins_count: number;
  position: number;
}

interface FeverChampionsOverlayProps {
  embedded?: boolean;
}

export function FeverChampionsOverlay({ embedded = false }: FeverChampionsOverlayProps = {}) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const [participants, setParticipants] = useState<Record<string, Participant[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActiveTournament();

    const tournamentsChannel = supabase
      .channel('fever_tournaments_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fever_tournaments' },
        () => {
          loadActiveTournament();
        }
      )
      .subscribe();

    const participantsChannel = supabase
      .channel('fever_participants_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fever_participants' },
        () => {
          if (tournament) {
            loadTournamentData(tournament.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tournamentsChannel);
      supabase.removeChannel(participantsChannel);
    };
  }, []);

  useEffect(() => {
    if (tournament) {
      loadTournamentData(tournament.id);
    }
  }, [tournament]);

  const loadActiveTournament = async () => {
    try {
      const { data, error } = await supabase
        .from('fever_tournaments')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setTournament(data);
    } catch (error) {
      console.error('Error loading active tournament:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTournamentData = async (tournamentId: string) => {
    try {
      const { data: groupsData, error: groupsError } = await supabase
        .from('fever_groups')
        .select('*')
        .eq('tournament_id', tournamentId);

      if (groupsError) throw groupsError;

      const groupsMap: Record<string, Group> = {};
      (groupsData || []).forEach(group => {
        groupsMap[group.group_name] = group;
      });
      setGroups(groupsMap);

      const { data: participantsData, error: participantsError } = await supabase
        .from('fever_participants')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('position', { ascending: true });

      if (participantsError) throw participantsError;

      const participantsMap: Record<string, Participant[]> = {};
      (participantsData || []).forEach(participant => {
        const groupName = Object.keys(groupsMap).find(
          key => groupsMap[key].id === participant.group_id
        );
        if (groupName) {
          if (!participantsMap[groupName]) {
            participantsMap[groupName] = [];
          }
          participantsMap[groupName].push(participant);
        }
      });
      setParticipants(participantsMap);
    } catch (error) {
      console.error('Error loading tournament data:', error);
    }
  };

  const getPositionColor = (position: number) => {
    if (position === 1) return 'bg-gradient-to-r from-yellow-500 to-yellow-600';
    if (position === 2) return 'bg-gradient-to-r from-gray-400 to-gray-500';
    if (position === 3) return 'bg-gradient-to-r from-orange-600 to-orange-700';
    return 'bg-gray-800';
  };

  const getPositionBorder = (position: number) => {
    if (position === 1) return 'border-yellow-400';
    if (position === 2) return 'border-gray-400';
    if (position === 3) return 'border-orange-500';
    return 'border-gray-700';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-500 text-lg uppercase font-bold">Nenhum torneio ativo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-8" style={{ marginTop: '0px', marginRight: '5px', marginLeft: 'auto' }}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center relative px-4">
          <div
            className="relative py-5 overflow-visible"
            style={{
              background: 'linear-gradient(135deg, #002d5c 0%, #004d99 100%)',
              borderTop: '3px solid white',
              borderBottom: '3px solid white',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 18px, rgba(255,255,255,0.08) 18px, rgba(255,255,255,0.08) 20px)',
              }}
            />

            <div className="relative z-10 flex items-center justify-between px-8">
              <div className="flex items-center gap-1.5 flex-1">
                {[...Array(25)].map((_, i) => (
                  <Star
                    key={`left-${i}`}
                    size={14}
                    style={{
                      color: '#e8f4f8',
                      fill: '#e8f4f8',
                      filter: 'drop-shadow(0 0 2px rgba(232,244,248,0.3))'
                    }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-4 px-8">
                <Trophy className="w-12 h-12" style={{ color: '#e8f4f8', fill: '#e8f4f8', filter: 'drop-shadow(0 0 3px rgba(232,244,248,0.4))' }} />

                <h1
                  className="text-5xl font-black uppercase whitespace-nowrap"
                  style={{
                    color: '#e8f4f8',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.4)',
                    letterSpacing: '0.05em',
                    fontFamily: 'Impact, Arial Black, sans-serif',
                    fontWeight: 900,
                  }}
                >
                  FEVER CHAMPIONS LEAGUE
                </h1>

                <Trophy className="w-12 h-12" style={{ color: '#e8f4f8', fill: '#e8f4f8', filter: 'drop-shadow(0 0 3px rgba(232,244,248,0.4))' }} />
              </div>

              <div className="flex items-center gap-1.5 flex-1">
                {[...Array(25)].map((_, i) => (
                  <Star
                    key={`right-${i}`}
                    size={14}
                    style={{
                      color: '#e8f4f8',
                      fill: '#e8f4f8',
                      filter: 'drop-shadow(0 0 2px rgba(232,244,248,0.3))'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {['A', 'B', 'C', 'D'].map((groupName) => (
            <div key={groupName} className="bg-gray-900/95 backdrop-blur-sm border-2 border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
              <div className="bg-gradient-to-r from-yellow-500 to-orange-500 px-6 py-4">
                <h2 className="text-2xl font-black text-white uppercase text-center tracking-wider">
                  Grupo {groupName}
                </h2>
              </div>

              <div className="p-6 space-y-3">
                {(participants[groupName] || []).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 text-sm uppercase">Sem participantes</p>
                  </div>
                ) : (
                  (participants[groupName] || []).map((participant) => (
                    <div
                      key={participant.id}
                      className={`border-2 ${getPositionBorder(participant.position)} rounded-xl overflow-hidden`}
                    >
                      <div className={`${getPositionColor(participant.position)} px-4 py-2 flex items-center justify-between`}>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-black text-white">
                            #{participant.position}
                          </span>
                          <div>
                            <p className="text-white font-bold text-lg uppercase">
                              {participant.viewer_name}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white text-2xl font-black">
                            {participant.points}
                          </p>
                          <p className="text-white/80 text-xs uppercase font-bold">
                            pontos
                          </p>
                        </div>
                      </div>

                      {participant.slot_name && (
                        <div className="bg-gray-800/50 px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {participant.slot_image && (
                              <img
                                src={participant.slot_image}
                                alt={participant.slot_name}
                                className="w-12 h-12 rounded-lg object-contain border-2 border-gray-700"
                              />
                            )}
                            <div>
                              <p className="text-white font-bold text-sm">
                                {participant.slot_name}
                              </p>
                              <p className="text-gray-400 text-xs uppercase">
                                {participant.spins_count} spins
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-yellow-400 text-sm font-bold">
                              {participant.spins_count > 0
                                ? (participant.points / participant.spins_count).toFixed(2)
                                : '0.00'
                              }
                            </p>
                            <p className="text-gray-500 text-xs uppercase">
                              média
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-gray-900/95 backdrop-blur-sm border-2 border-gray-700 rounded-2xl p-6">
          <h3 className="text-xl font-black text-white uppercase text-center mb-4">
            Sistema de Pontuação
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-xl p-4 text-center border-2 border-gray-700">
              <p className="text-2xl font-black text-gray-400 mb-2">0 pts</p>
              <p className="text-xs text-gray-500 uppercase font-bold">0x - 25x</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center border-2 border-blue-500">
              <p className="text-2xl font-black text-blue-400 mb-2">1 pt</p>
              <p className="text-xs text-gray-500 uppercase font-bold">26x - 49x</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center border-2 border-green-500">
              <p className="text-2xl font-black text-green-400 mb-2">2 pts</p>
              <p className="text-xs text-gray-500 uppercase font-bold">50x - 99x</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center border-2 border-yellow-500">
              <p className="text-2xl font-black text-yellow-400 mb-2">3 pts</p>
              <p className="text-xs text-gray-500 uppercase font-bold">100x+</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
