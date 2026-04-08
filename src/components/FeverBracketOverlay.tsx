import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Star } from 'lucide-react';

interface Tournament {
  id: string;
  name: string;
  tournament_number?: number;
  status: 'setup' | 'active' | 'completed';
  current_phase: 'group_stage' | 'knockout';
  created_at: string;
}

interface Participant {
  id: string;
  viewer_name: string;
  slot_name: string;
  slot_image: string;
}

interface PlayoffMatch {
  id: string;
  tournament_id: string;
  stage: 'quarter_finals' | 'semi_finals' | 'final';
  match_number: number;
  participant1_id: string | null;
  participant2_id: string | null;
  participant1_bonus_result: number;
  participant1_bonus2_result: number;
  participant2_bonus_result: number;
  participant2_bonus2_result: number;
  winner_id: string | null;
}

export function FeverBracketOverlay() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playoffMatches, setPlayoffMatches] = useState<PlayoffMatch[]>([]);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActiveTournament();

    const tournamentChannel = supabase
      .channel('fever_tournaments_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fever_tournaments' }, () => {
        loadActiveTournament();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tournamentChannel);
    };
  }, []);

  useEffect(() => {
    if (tournament) {
      loadPlayoffData(tournament.id);

      const playoffChannel = supabase
        .channel('fever_playoff_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fever_playoff_matches' }, () => {
          loadPlayoffData(tournament.id);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fever_participants' }, () => {
          loadPlayoffData(tournament.id);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(playoffChannel);
      };
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
      console.error('Error loading tournament:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayoffData = async (tournamentId: string) => {
    try {
      const { data: playoffData, error: playoffError } = await supabase
        .from('fever_playoff_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('stage', { ascending: true })
        .order('match_number', { ascending: true });

      if (playoffError) throw playoffError;
      setPlayoffMatches(playoffData || []);

      const { data: participantsData, error: participantsError } = await supabase
        .from('fever_participants')
        .select('*')
        .eq('tournament_id', tournamentId);

      if (participantsError) throw participantsError;

      const participantsMap: Record<string, Participant> = {};
      (participantsData || []).forEach(p => {
        participantsMap[p.id] = p;
      });
      setParticipants(participantsMap);
    } catch (error) {
      console.error('Error loading playoff data:', error);
    }
  };

  const calculatePoints = (result1?: number, result2?: number): number => {
    const r1 = result1 || 0;
    const r2 = result2 || 0;
    const avg = (r1 + r2) / 2;

    if (avg >= 100) return 3;
    if (avg >= 50) return 2;
    if (avg >= 26) return 1;
    return 0;
  };

  const formatTournamentName = (tournament: Tournament) => {
    const date = new Date(tournament.created_at);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  const renderTeamSlot = (participant: Participant | null, won: boolean = false, lost: boolean = false) => {
    if (!participant || !participant.slot_image) {
      return (
        <div className={`w-20 h-24 rounded-lg border-3 ${won ? 'border-yellow-400' : 'border-white/30'} bg-gray-800/90 backdrop-blur-sm flex items-center justify-center`}>
          <span className="text-white/50 text-xs font-bold">TBD</span>
        </div>
      );
    }

    return (
      <div className={`w-20 h-24 rounded-lg border-3 ${won ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' : lost ? 'border-gray-600/50' : 'border-white/50'} bg-white/10 backdrop-blur-sm overflow-hidden`}>
        <img
          src={participant.slot_image}
          alt={participant.slot_name}
          style={{
            width: '80px',
            height: '96px',
            objectFit: 'fill',
            display: 'block',
            ...(lost ? { filter: 'grayscale(100%) opacity(0.5)' } : {})
          }}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#001d3d] via-[#003566] to-[#001d3d] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-cyan-400"></div>
      </div>
    );
  }

  if (!tournament || playoffMatches.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#001d3d] via-[#003566] to-[#001d3d] flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-20 h-20 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-xl uppercase font-bold">Playoffs ainda não iniciados</p>
        </div>
      </div>
    );
  }

  const quarterFinals = playoffMatches.filter(m => m.stage === 'quarter_finals');
  const semiFinals = playoffMatches.filter(m => m.stage === 'semi_finals');
  const final = playoffMatches.find(m => m.stage === 'final');

  return (
    <div className="w-[1920px] h-[1080px] bg-gradient-to-br from-[#001d3d] via-[#003566] to-[#001d3d] p-6 relative overflow-hidden">
      <svg className="absolute inset-0 w-full h-full opacity-20" style={{zIndex: 0}}>
        <defs>
          <linearGradient id="starGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{stopColor: '#00d4ff', stopOpacity: 0.8}} />
            <stop offset="100%" style={{stopColor: '#0096c7', stopOpacity: 0.3}} />
          </linearGradient>
          <linearGradient id="starGradient2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{stopColor: '#48cae4', stopOpacity: 0.6}} />
            <stop offset="100%" style={{stopColor: '#023e8a', stopOpacity: 0.2}} />
          </linearGradient>
        </defs>

        <path d="M 100 200 Q 300 100 500 250 T 900 200 L 1000 300 Q 800 400 600 350 T 200 400 Z"
              fill="url(#starGradient1)" opacity="0.15" />
        <path d="M 1200 150 Q 1400 250 1600 200 T 1800 300 L 1700 500 Q 1500 450 1300 500 T 1100 400 Z"
              fill="url(#starGradient2)" opacity="0.15" />
        <path d="M 200 600 Q 400 550 600 650 T 1000 600 L 900 800 Q 700 850 500 800 T 300 750 Z"
              fill="url(#starGradient1)" opacity="0.1" />
        <path d="M 1100 700 Q 1300 650 1500 750 T 1800 700 L 1700 900 Q 1500 950 1300 900 T 1200 850 Z"
              fill="url(#starGradient2)" opacity="0.1" />

        <circle cx="15%" cy="15%" r="150" fill="url(#starGradient1)" opacity="0.08" />
        <circle cx="85%" cy="20%" r="180" fill="url(#starGradient2)" opacity="0.08" />
        <circle cx="20%" cy="80%" r="160" fill="url(#starGradient1)" opacity="0.08" />
        <circle cx="80%" cy="85%" r="140" fill="url(#starGradient2)" opacity="0.08" />

        <line x1="10%" y1="10%" x2="30%" y2="25%" stroke="#00d4ff" strokeWidth="2" opacity="0.15" />
        <line x1="30%" y1="25%" x2="25%" y2="40%" stroke="#00d4ff" strokeWidth="2" opacity="0.15" />
        <line x1="70%" y1="15%" x2="85%" y2="20%" stroke="#48cae4" strokeWidth="2" opacity="0.15" />
        <line x1="85%" y1="20%" x2="90%" y2="35%" stroke="#48cae4" strokeWidth="2" opacity="0.15" />
        <line x1="15%" y1="75%" x2="25%" y2="85%" stroke="#0096c7" strokeWidth="2" opacity="0.15" />
        <line x1="25%" y1="85%" x2="35%" y2="90%" stroke="#0096c7" strokeWidth="2" opacity="0.15" />
      </svg>

      <div className="absolute top-32 left-20 w-64 h-64 rounded-full bg-gradient-radial from-cyan-400/20 to-transparent blur-3xl"></div>
      <div className="absolute top-40 right-32 w-80 h-80 rounded-full bg-gradient-radial from-blue-400/15 to-transparent blur-3xl"></div>
      <div className="absolute bottom-32 left-40 w-72 h-72 rounded-full bg-gradient-radial from-sky-400/15 to-transparent blur-3xl"></div>
      <div className="absolute bottom-40 right-20 w-64 h-64 rounded-full bg-gradient-radial from-cyan-300/20 to-transparent blur-3xl"></div>

      <div className="relative w-full h-full" style={{zIndex: 10}}>
        <div className="mb-8 text-center relative px-4">
          <div
            className="relative py-5 overflow-visible mx-auto"
          >

            <div className="relative z-10">
              <div className="flex items-center justify-center px-8 gap-4">
                <div className="flex items-center gap-1.5">
                  {[...Array(20)].map((_, i) => (
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

                <img
                  src="/logo champions.png"
                  alt="Champions League"
                  className="w-14 h-14 flex-shrink-0"
                  style={{ filter: 'brightness(0) invert(1) drop-shadow(0 0 3px rgba(232,244,248,0.4))' }}
                />

                <h1
                  className="text-5xl font-black uppercase whitespace-nowrap flex-shrink-0"
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

                <img
                  src="/logo champions.png"
                  alt="Champions League"
                  className="w-14 h-14 flex-shrink-0"
                  style={{ filter: 'brightness(0) invert(1) drop-shadow(0 0 3px rgba(232,244,248,0.4))' }}
                />

                <div className="flex items-center gap-1.5">
                  {[...Array(20)].map((_, i) => (
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

              <p className="text-white/85 text-xs uppercase font-bold mt-2 text-center">
                {formatTournamentName(tournament)} - PLAYOFFS
              </p>
            </div>
          </div>
        </div>

        <div className="relative px-8">
          <div className="grid grid-cols-5 gap-6 items-center">
            <div className="col-span-1 space-y-12">
              <div className="text-center mb-4">
                <p className="text-white/70 text-xs uppercase font-bold tracking-wider">Quarterfinals</p>
              </div>
              {quarterFinals.slice(0, 2).map((match) => {
                const p1 = match.participant1_id ? participants[match.participant1_id] : null;
                const p2 = match.participant2_id ? participants[match.participant2_id] : null;

                const p1Avg = ((match.participant1_bonus_result || 0) + (match.participant1_bonus2_result || 0)) / 2;
                const p2Avg = ((match.participant2_bonus_result || 0) + (match.participant2_bonus2_result || 0)) / 2;

                const hasResults = (match.participant1_bonus_result > 0 && match.participant2_bonus_result > 0);

                let p1Won = false;
                let p2Won = false;
                let p1Lost = false;
                let p2Lost = false;

                if (hasResults && p1Avg !== p2Avg) {
                  if (p1Avg > p2Avg) {
                    p1Won = true;
                    p2Lost = true;
                  } else {
                    p2Won = true;
                    p1Lost = true;
                  }
                }

                return (
                  <div key={match.id} className="space-y-4">
                    <div className="flex flex-col items-center gap-1">
                      {renderTeamSlot(p1, p1Won, p1Lost)}
                      <p className={`text-[10px] font-bold text-center max-w-[80px] truncate ${p1Lost ? 'text-gray-500' : 'text-white'}`}>{p1?.viewer_name || 'TBD'}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {renderTeamSlot(p2, p2Won, p2Lost)}
                      <p className={`text-[10px] font-bold text-center max-w-[80px] truncate ${p2Lost ? 'text-gray-500' : 'text-white'}`}>{p2?.viewer_name || 'TBD'}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="col-span-1 space-y-24">
              <div className="text-center mb-4">
                <p className="text-white/70 text-xs uppercase font-bold tracking-wider">Semifinals</p>
              </div>
              {semiFinals.slice(0, 1).map((match) => {
                const p1 = match.participant1_id ? participants[match.participant1_id] : null;
                const p2 = match.participant2_id ? participants[match.participant2_id] : null;

                const p1Avg = ((match.participant1_bonus_result || 0) + (match.participant1_bonus2_result || 0)) / 2;
                const p2Avg = ((match.participant2_bonus_result || 0) + (match.participant2_bonus2_result || 0)) / 2;

                const hasResults = (match.participant1_bonus_result > 0 && match.participant2_bonus_result > 0);

                let p1Won = false;
                let p2Won = false;
                let p1Lost = false;
                let p2Lost = false;

                if (hasResults && p1Avg !== p2Avg) {
                  if (p1Avg > p2Avg) {
                    p1Won = true;
                    p2Lost = true;
                  } else {
                    p2Won = true;
                    p1Lost = true;
                  }
                }

                return (
                  <div key={match.id} className="space-y-20">
                    <div className="flex flex-col items-center gap-1">
                      {renderTeamSlot(p1, p1Won, p1Lost)}
                      <p className={`text-[10px] font-bold text-center max-w-[80px] truncate ${p1Lost ? 'text-gray-500' : 'text-white'}`}>{p1?.viewer_name || 'TBD'}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {renderTeamSlot(p2, p2Won, p2Lost)}
                      <p className={`text-[10px] font-bold text-center max-w-[80px] truncate ${p2Lost ? 'text-gray-500' : 'text-white'}`}>{p2?.viewer_name || 'TBD'}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="col-span-1 flex items-center justify-center">
              <div className="relative mt-20">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10">
                  <div className="bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 px-6 py-1 rounded-full border-3 border-white/30 shadow-2xl">
                    <p className="text-blue-950 text-[10px] font-black uppercase tracking-wider">FINAL</p>
                  </div>
                </div>

                {final && (() => {
                  const p1 = final.participant1_id ? participants[final.participant1_id] : null;
                  const p2 = final.participant2_id ? participants[final.participant2_id] : null;

                  const p1Avg = ((final.participant1_bonus_result || 0) + (final.participant1_bonus2_result || 0)) / 2;
                  const p2Avg = ((final.participant2_bonus_result || 0) + (final.participant2_bonus2_result || 0)) / 2;

                  const hasResults = (final.participant1_bonus_result > 0 && final.participant2_bonus_result > 0);

                  let p1Won = false;
                  let p2Won = false;
                  let p1Lost = false;
                  let p2Lost = false;

                  if (hasResults && p1Avg !== p2Avg) {
                    if (p1Avg > p2Avg) {
                      p1Won = true;
                      p2Lost = true;
                    } else {
                      p2Won = true;
                      p1Lost = true;
                    }
                  }

                  const hasWinner = p1Won || p2Won;

                  return (
                    <div
                      className="backdrop-blur-md rounded-2xl p-6 border-3 relative overflow-hidden"
                      style={{
                        background: hasWinner ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.3) 0%, rgba(218, 165, 32, 0.3) 50%, rgba(184, 134, 11, 0.3) 100%)' : 'rgba(255, 255, 255, 0.1)',
                        borderColor: hasWinner ? 'rgba(255, 215, 0, 0.8)' : 'rgba(255, 255, 255, 0.2)'
                      }}
                    >
                      <div className="flex flex-col items-center gap-6 relative z-10">
                        <div className="flex flex-col items-center gap-1">
                          {renderTeamSlot(p1, p1Won, p1Lost)}
                          <p className={`text-[10px] font-bold text-center max-w-[64px] truncate ${p1Lost ? 'text-gray-500' : p1Won ? 'text-yellow-300' : 'text-white'}`}>{p1?.viewer_name || 'TBD'}</p>
                        </div>

                        <div className="relative">
                          <Trophy
                            className="w-16 h-16"
                            style={{
                              color: hasWinner ? '#FFD700' : '#FBBF24',
                              filter: hasWinner ? 'drop-shadow(0 0 30px rgba(255, 215, 0, 1)) drop-shadow(0 0 15px rgba(255, 215, 0, 0.8))' : 'drop-shadow(0 0 20px rgba(251, 191, 36, 0.8))'
                            }}
                          />
                        </div>

                        <div className="flex flex-col items-center gap-1">
                          {renderTeamSlot(p2, p2Won, p2Lost)}
                          <p className={`text-[10px] font-bold text-center max-w-[64px] truncate ${p2Lost ? 'text-gray-500' : p2Won ? 'text-yellow-300' : 'text-white'}`}>{p2?.viewer_name || 'TBD'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="col-span-1 space-y-24">
              <div className="text-center mb-4">
                <p className="text-white/70 text-xs uppercase font-bold tracking-wider">Semifinals</p>
              </div>
              {semiFinals.slice(1, 2).map((match) => {
                const p1 = match.participant1_id ? participants[match.participant1_id] : null;
                const p2 = match.participant2_id ? participants[match.participant2_id] : null;

                const p1Avg = ((match.participant1_bonus_result || 0) + (match.participant1_bonus2_result || 0)) / 2;
                const p2Avg = ((match.participant2_bonus_result || 0) + (match.participant2_bonus2_result || 0)) / 2;

                const hasResults = (match.participant1_bonus_result > 0 && match.participant2_bonus_result > 0);

                let p1Won = false;
                let p2Won = false;
                let p1Lost = false;
                let p2Lost = false;

                if (hasResults && p1Avg !== p2Avg) {
                  if (p1Avg > p2Avg) {
                    p1Won = true;
                    p2Lost = true;
                  } else {
                    p2Won = true;
                    p1Lost = true;
                  }
                }

                return (
                  <div key={match.id} className="space-y-20">
                    <div className="flex flex-col items-center gap-1">
                      {renderTeamSlot(p1, p1Won, p1Lost)}
                      <p className={`text-[10px] font-bold text-center max-w-[80px] truncate ${p1Lost ? 'text-gray-500' : 'text-white'}`}>{p1?.viewer_name || 'TBD'}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {renderTeamSlot(p2, p2Won, p2Lost)}
                      <p className={`text-[10px] font-bold text-center max-w-[80px] truncate ${p2Lost ? 'text-gray-500' : 'text-white'}`}>{p2?.viewer_name || 'TBD'}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="col-span-1 space-y-12">
              <div className="text-center mb-4">
                <p className="text-white/70 text-xs uppercase font-bold tracking-wider">Quarterfinals</p>
              </div>
              {quarterFinals.slice(2, 4).map((match) => {
                const p1 = match.participant1_id ? participants[match.participant1_id] : null;
                const p2 = match.participant2_id ? participants[match.participant2_id] : null;

                const p1Avg = ((match.participant1_bonus_result || 0) + (match.participant1_bonus2_result || 0)) / 2;
                const p2Avg = ((match.participant2_bonus_result || 0) + (match.participant2_bonus2_result || 0)) / 2;

                const hasResults = (match.participant1_bonus_result > 0 && match.participant2_bonus_result > 0);

                let p1Won = false;
                let p2Won = false;
                let p1Lost = false;
                let p2Lost = false;

                if (hasResults && p1Avg !== p2Avg) {
                  if (p1Avg > p2Avg) {
                    p1Won = true;
                    p2Lost = true;
                  } else {
                    p2Won = true;
                    p1Lost = true;
                  }
                }

                return (
                  <div key={match.id} className="space-y-4">
                    <div className="flex flex-col items-center gap-1">
                      {renderTeamSlot(p1, p1Won, p1Lost)}
                      <p className={`text-[10px] font-bold text-center max-w-[80px] truncate ${p1Lost ? 'text-gray-500' : 'text-white'}`}>{p1?.viewer_name || 'TBD'}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {renderTeamSlot(p2, p2Won, p2Lost)}
                      <p className={`text-[10px] font-bold text-center max-w-[80px] truncate ${p2Lost ? 'text-gray-500' : 'text-white'}`}>{p2?.viewer_name || 'TBD'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
