import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Tournament {
  id: string;
  name: string;
  tournament_number: number;
  created_at: string;
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

interface Group {
  id: string;
  tournament_id: string;
  group_name: string;
}

export default function FeverGroupsOverlay() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('fever-groups-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fever_tournaments' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fever_groups' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fever_participants' },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    try {
      const { data: tournaments } = await supabase
        .from('fever_tournaments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (tournaments && tournaments.length > 0) {
        setTournament(tournaments[0]);

        const { data: groupsData } = await supabase
          .from('fever_groups')
          .select('*')
          .eq('tournament_id', tournaments[0].id)
          .order('group_name');

        if (groupsData) {
          setGroups(groupsData);

          const { data: participantsData } = await supabase
            .from('fever_participants')
            .select('*')
            .eq('tournament_id', tournaments[0].id)
            .order('position');

          setParticipants(participantsData || []);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const getGroupParticipants = (groupId: string) => {
    return participants
      .filter(p => p.group_id === groupId)
      .sort((a, b) => a.position - b.position);
  };

  const renderTeamSlot = (participant: Participant | null) => {
    if (!participant || !participant.slot_image) {
      return (
        <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800" style={{ borderTopRightRadius: '6px', borderBottomRightRadius: '6px' }}></div>
      );
    }

    return (
      <div style={{
        width: '80px',
        height: '96px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderTopRightRadius: '6px',
        borderBottomRightRadius: '6px',
        overflow: 'hidden'
      }}>
        <img
          src={participant.slot_image}
          alt={participant.slot_name}
          style={{
            width: '80px',
            height: '96px',
            objectFit: 'fill',
            display: 'block'
          }}
        />
      </div>
    );
  };

  if (!tournament || groups.length === 0) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  const firstRow = groups.slice(0, 4);
  const secondRow = groups.slice(4, 8);

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

      <div className="relative w-full h-full flex" style={{zIndex: 10}}>
        <div className="w-24 flex flex-col items-center justify-center px-2 py-8"
          style={{
            background: 'linear-gradient(180deg, #001d3d 0%, #003566 50%, #001d3d 100%)',
            borderRight: '2px solid rgba(255,255,255,0.15)',
          }}>
          <div className="transform -rotate-90 whitespace-nowrap">
            <div className="text-center flex items-center gap-3">
              <img
                src="/logo champions.png"
                alt="Champions League"
                className="w-12 h-12"
                style={{
                  transform: 'rotate(90deg)',
                  filter: 'brightness(0) invert(1)'
                }}
              />
              <div>
                <p
                  className="text-xs font-bold uppercase mb-1"
                  style={{
                    color: 'rgba(255,255,255,0.5)',
                    letterSpacing: '0.15em',
                  }}
                >
                  FEVER CHAMPIONS LEAGUE
                </p>
                <h2
                  className="text-xl font-black uppercase tracking-widest"
                  style={{
                    color: '#ffffff',
                    textShadow: '1px 1px 3px rgba(0,0,0,0.8)',
                    fontFamily: 'Impact, Arial Black, sans-serif',
                    letterSpacing: '0.2em',
                  }}
                >
                  FASE DE GRUPOS
                </h2>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 gap-6">
          <div className="grid grid-cols-4 gap-4">
            {firstRow.map((group) => {
              const participants = getGroupParticipants(group.id);

              return (
                <div
                  key={group.id}
                  className="rounded-lg overflow-hidden shadow-xl"
                  style={{
                    background: 'rgba(10, 25, 47, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <div
                    className="py-2.5 text-center relative overflow-hidden"
                    style={{
                      background: 'rgba(15, 30, 60, 0.7)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <h3
                      className="text-3xl font-black"
                      style={{
                        color: 'white',
                        textShadow: '1px 1px 3px rgba(0,0,0,0.8)',
                        fontFamily: 'Impact, Arial Black, sans-serif',
                      }}
                    >
                      {group.group_name}
                    </h3>
                  </div>

                  <div className="p-3 space-y-2">
                    {[1, 2, 3, 4].map((position) => {
                      const groupParts = getGroupParticipants(group.id);
                      const participant = groupParts.find(p => p.position === position);

                      return (
                        <div
                          key={position}
                          className="flex items-center gap-3 rounded-md overflow-hidden relative"
                          style={{
                            background: 'rgba(15, 30, 60, 0.7)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            paddingTop: 0,
                            paddingBottom: 0,
                            paddingLeft: 0,
                            paddingRight: '12px',
                            height: '96px',
                          }}
                        >
                          <div className="flex-shrink-0 h-full flex items-center justify-center" style={{ width: '80px', marginTop: '-1px', marginBottom: '-1px' }}>
                            {renderTeamSlot(participant || null)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-bold uppercase truncate"
                              style={{
                                fontSize: '13px',
                                color: participant ? 'white' : '#64748b',
                                textShadow: participant ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none',
                              }}
                            >
                              {participant ? `${participant.slot_name} - ${participant.viewer_name}` : 'TBD'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-4 gap-4">
            {secondRow.map((group) => {
              const participants = getGroupParticipants(group.id);

              return (
                <div
                  key={group.id}
                  className="rounded-lg overflow-hidden shadow-xl"
                  style={{
                    background: 'rgba(10, 25, 47, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <div
                    className="py-2.5 text-center relative overflow-hidden"
                    style={{
                      background: 'rgba(15, 30, 60, 0.7)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <h3
                      className="text-3xl font-black"
                      style={{
                        color: 'white',
                        textShadow: '1px 1px 3px rgba(0,0,0,0.8)',
                        fontFamily: 'Impact, Arial Black, sans-serif',
                      }}
                    >
                      {group.group_name}
                    </h3>
                  </div>

                  <div className="p-3 space-y-2">
                    {[1, 2, 3, 4].map((position) => {
                      const groupParts = getGroupParticipants(group.id);
                      const participant = groupParts.find(p => p.position === position);

                      return (
                        <div
                          key={position}
                          className="flex items-center gap-3 rounded-md overflow-hidden relative"
                          style={{
                            background: 'rgba(15, 30, 60, 0.7)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            paddingTop: 0,
                            paddingBottom: 0,
                            paddingLeft: 0,
                            paddingRight: '12px',
                            height: '96px',
                          }}
                        >
                          <div className="flex-shrink-0 h-full flex items-center justify-center" style={{ width: '80px', marginTop: '-1px', marginBottom: '-1px' }}>
                            {renderTeamSlot(participant || null)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-bold uppercase truncate"
                              style={{
                                fontSize: '13px',
                                color: participant ? 'white' : '#64748b',
                                textShadow: participant ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none',
                              }}
                            >
                              {participant ? `${participant.slot_name} - ${participant.viewer_name}` : 'TBD'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
