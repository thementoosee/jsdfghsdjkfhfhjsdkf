import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Plus, X, Users, PlayCircle, CheckCircle, CreditCard as Edit2, Trash2, TrendingUp, Monitor } from 'lucide-react';

interface Tournament {
  id: string;
  name: string;
  tournament_number?: number;
  status: 'setup' | 'active' | 'completed';
  current_phase: 'group_stage' | 'knockout';
  created_at: string;
  updated_at: string;
  show_on_main_overlay?: boolean;
}

interface Group {
  id: string;
  tournament_id: string;
  group_name: string;
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
  created_at: string;
  updated_at: string;
}

interface Spin {
  id: string;
  participant_id: string;
  tournament_id: string;
  multiplier: number;
  points_earned: number;
  created_at: string;
}

interface Slot {
  id: string;
  name: string;
  provider: string;
  image_url: string;
}

interface Match {
  id: string;
  tournament_id: string;
  group_id: string;
  round_number: number;
  participant1_id: string;
  participant2_id: string;
  participant1_points: number;
  participant2_points: number;
  participant1_bonus_id?: string;
  participant1_bonus_result?: number;
  participant1_bonus2_id?: string;
  participant1_bonus2_result?: number;
  participant2_bonus_id?: string;
  participant2_bonus_result?: number;
  participant2_bonus2_id?: string;
  participant2_bonus2_result?: number;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}

export function FeverChampionsManager() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const [participants, setParticipants] = useState<Record<string, Participant[]>>({});
  const [matches, setMatches] = useState<Record<string, Match[]>>({});
  const [loading, setLoading] = useState(true);
  const [showNewTournament, setShowNewTournament] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState('');
  const [showAddParticipant, setShowAddParticipant] = useState<string | null>(null);
  const [newParticipant, setNewParticipant] = useState({ viewer_name: '', slot_id: '' });
  const [showEditParticipant, setShowEditParticipant] = useState<Participant | null>(null);
  const [editParticipantData, setEditParticipantData] = useState({ viewer_name: '', slot_id: '' });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotSearch, setSlotSearch] = useState('');
  const [showFixtures, setShowFixtures] = useState(false);
  const [showMatchManager, setShowMatchManager] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [playoffMatches, setPlayoffMatches] = useState<PlayoffMatch[]>([]);
  const [showPlayoffManager, setShowPlayoffManager] = useState(false);
  const [selectedPlayoffMatch, setSelectedPlayoffMatch] = useState<PlayoffMatch | null>(null);

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (showAddParticipant) {
        loadSlots(slotSearch);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [slotSearch, showAddParticipant]);

  useEffect(() => {
    if (selectedTournament) {
      loadTournamentData(selectedTournament.id);

      const channel = supabase
        .channel(`tournament-${selectedTournament.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fever_playoff_matches', filter: `tournament_id=eq.${selectedTournament.id}` }, () => {
          loadTournamentData(selectedTournament.id);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedTournament]);

  const loadTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('fever_tournaments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTournaments(data || []);

      if (data && data.length > 0 && !selectedTournament) {
        setSelectedTournament(data[0]);
      }
    } catch (error) {
      console.error('Error loading tournaments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSlots = async (searchTerm: string = '') => {
    setSlotsLoading(true);
    try {
      let query = supabase
        .from('slots')
        .select('id, name, provider, image_url')
        .order('name', { ascending: true });

      if (searchTerm.trim()) {
        query = query.or(`name.ilike.%${searchTerm}%,provider.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      setSlots(data || []);
    } catch (error) {
      console.error('Error loading slots:', error);
    } finally {
      setSlotsLoading(false);
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

      const { data: matchesData, error: matchesError } = await supabase
        .from('fever_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round_number', { ascending: true });

      if (matchesError) throw matchesError;

      const matchesMap: Record<string, Match[]> = {};
      (matchesData || []).forEach(match => {
        const groupName = Object.keys(groupsMap).find(
          key => groupsMap[key].id === match.group_id
        );
        if (groupName) {
          if (!matchesMap[groupName]) {
            matchesMap[groupName] = [];
          }
          matchesMap[groupName].push(match);
        }
      });
      setMatches(matchesMap);

      const { data: playoffData, error: playoffError } = await supabase
        .from('fever_playoff_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('stage', { ascending: true })
        .order('match_number', { ascending: true });

      if (playoffError) throw playoffError;
      console.log('Playoffs carregados:', playoffData?.length || 0, playoffData);
      setPlayoffMatches(playoffData || []);
    } catch (error) {
      console.error('Error loading tournament data:', error);
    }
  };

  const createTournament = async () => {
    if (!newTournamentName.trim()) return;

    try {
      const { data: tournament, error: tournamentError } = await supabase
        .from('fever_tournaments')
        .insert({ name: newTournamentName, status: 'setup' })
        .select()
        .single();

      if (tournamentError) throw tournamentError;

      const groupNames = ['A', 'B', 'C', 'D'];
      for (const groupName of groupNames) {
        const { error: groupError } = await supabase
          .from('fever_groups')
          .insert({ tournament_id: tournament.id, group_name: groupName });

        if (groupError) throw groupError;
      }

      setNewTournamentName('');
      setShowNewTournament(false);
      await loadTournaments();
      setSelectedTournament(tournament);
    } catch (error) {
      console.error('Error creating tournament:', error);
      alert('Erro ao criar torneio');
    }
  };

  const generateFixtures = (participantIds: string[]) => {
    const fixtures: Array<[string, string]> = [];
    const n = participantIds.length;

    if (n < 2) return [];

    // Double round-robin: each pair plays twice (home and away)
    // First, each player plays at home against all others
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          fixtures.push([participantIds[i], participantIds[j]]);
        }
      }
    }

    return fixtures;
  };

  const updateTournamentStatus = async (status: 'setup' | 'active' | 'completed') => {
    if (!selectedTournament) return;

    try {
      if (status === 'active' && selectedTournament.status === 'setup') {
        const groupNames = Object.keys(groups);
        console.log('Groups found:', groupNames);
        console.log('Participants:', participants);

        if (groupNames.length === 0) {
          alert('Nenhum grupo encontrado. Recarregue a página.');
          return;
        }

        // Check if matches already exist for this tournament
        const { data: existingMatches } = await supabase
          .from('fever_matches')
          .select('id')
          .eq('tournament_id', selectedTournament.id)
          .limit(1);

        if (existingMatches && existingMatches.length > 0) {
          alert('Os jogos já foram criados para este torneio.');
          return;
        }

        for (const groupName of groupNames) {
          const groupParticipants = participants[groupName] || [];
          console.log(`Group ${groupName} participants:`, groupParticipants);

          if (groupParticipants.length < 2) {
            alert(`Grupo ${groupName} precisa de pelo menos 2 participantes`);
            return;
          }

          const participantIds = groupParticipants.map(p => p.id);
          const fixtures = generateFixtures(participantIds);
          const group = groups[groupName];

          console.log(`Group ${groupName} info:`, group);
          console.log(`Fixtures for ${groupName}:`, fixtures);

          if (!group || !group.id) {
            alert(`Grupo ${groupName} não encontrado`);
            return;
          }

          // Organize matches into rounds using round-robin algorithm
          // Each participant plays once per round
          const n = participantIds.length;
          const totalRounds = n % 2 === 0 ? n - 1 : n;
          const matchesToCreate: Array<{ round: number; p1: string; p2: string }> = [];

          // Distribute fixtures into proper rounds
          let currentRound = 1;
          const scheduleQueue = [...fixtures];

          while (scheduleQueue.length > 0) {
            const roundMatches: Array<[string, string]> = [];
            const usedThisRound = new Set<string>();

            // Try to fill the current round
            for (let i = scheduleQueue.length - 1; i >= 0; i--) {
              const [p1, p2] = scheduleQueue[i];

              if (!usedThisRound.has(p1) && !usedThisRound.has(p2)) {
                roundMatches.push([p1, p2]);
                usedThisRound.add(p1);
                usedThisRound.add(p2);
                scheduleQueue.splice(i, 1);
              }
            }

            // Add matches for this round
            for (const [p1, p2] of roundMatches) {
              matchesToCreate.push({ round: currentRound, p1, p2 });
            }

            currentRound++;
          }

          // Insert all matches
          for (const match of matchesToCreate) {
            console.log(`Creating match: Round ${match.round}, ${match.p1} vs ${match.p2}`);

            const { error: matchError } = await supabase
              .from('fever_matches')
              .insert({
                tournament_id: selectedTournament.id,
                group_id: group.id,
                round_number: match.round,
                participant1_id: match.p1,
                participant2_id: match.p2,
                status: 'pending'
              });

            if (matchError) {
              console.error('Error creating match:', matchError);
              alert(`Erro ao criar jogo: ${matchError.message}`);
              throw matchError;
            }
          }
        }
      }

      console.log('Updating tournament status to:', status);
      const { error } = await supabase
        .from('fever_tournaments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', selectedTournament.id);

      if (error) {
        console.error('Error updating tournament:', error);
        alert(`Erro ao atualizar torneio: ${error.message}`);
        throw error;
      }

      setSelectedTournament({ ...selectedTournament, status });
      await loadTournaments();
      if (selectedTournament.id) {
        await loadTournamentData(selectedTournament.id);
      }
      alert('Torneio iniciado com sucesso!');
    } catch (error: any) {
      console.error('Error updating tournament status:', error);
      alert(`Erro ao atualizar status: ${error?.message || 'Erro desconhecido'}`);
    }
  };

  const addParticipant = async (groupName: string) => {
    if (!selectedTournament || !newParticipant.viewer_name.trim() || !newParticipant.slot_id) return;

    const group = groups[groupName];
    if (!group) return;

    const selectedSlot = slots.find(s => s.id === newParticipant.slot_id);
    if (!selectedSlot) return;

    try {
      const { error } = await supabase
        .from('fever_participants')
        .insert({
          tournament_id: selectedTournament.id,
          group_id: group.id,
          viewer_name: newParticipant.viewer_name,
          slot_name: selectedSlot.name,
          slot_image: selectedSlot.image_url
        });

      if (error) throw error;

      setNewParticipant({ viewer_name: '', slot_id: '' });
      setShowAddParticipant(null);
      setSlotSearch('');
      await loadTournamentData(selectedTournament.id);
    } catch (error) {
      console.error('Error adding participant:', error);
      alert('Erro ao adicionar participante');
    }
  };

  const deleteParticipant = async (participantId: string) => {
    if (!selectedTournament) return;
    if (!confirm('Tens a certeza que queres remover este participante?')) return;

    try {
      const { error } = await supabase
        .from('fever_participants')
        .delete()
        .eq('id', participantId);

      if (error) throw error;
      await loadTournamentData(selectedTournament.id);
    } catch (error) {
      console.error('Error deleting participant:', error);
      alert('Erro ao remover participante');
    }
  };

  const deleteTournament = async () => {
    if (!selectedTournament) return;
    if (!confirm('Tens a certeza que queres eliminar este torneio? Esta ação não pode ser revertida.')) return;

    try {
      const { error } = await supabase
        .from('fever_tournaments')
        .delete()
        .eq('id', selectedTournament.id);

      if (error) throw error;

      setSelectedTournament(null);
      await loadTournaments();
      alert('Torneio eliminado com sucesso!');
    } catch (error) {
      console.error('Error deleting tournament:', error);
      alert('Erro ao eliminar torneio');
    }
  };

  const updateParticipant = async () => {
    if (!showEditParticipant || !editParticipantData.viewer_name || !editParticipantData.slot_id) {
      alert('Preencha todos os campos');
      return;
    }

    try {
      const selectedSlot = slots.find(s => s.id === editParticipantData.slot_id);

      if (!selectedSlot) {
        alert('Slot não encontrado');
        return;
      }

      const { error } = await supabase
        .from('fever_participants')
        .update({
          viewer_name: editParticipantData.viewer_name,
          slot_name: selectedSlot.name,
          slot_image: selectedSlot.image_url || ''
        })
        .eq('id', showEditParticipant.id);

      if (error) throw error;

      setShowEditParticipant(null);
      setEditParticipantData({ viewer_name: '', slot_id: '' });
      if (selectedTournament) {
        await loadTournamentData(selectedTournament.id);
      }
    } catch (error) {
      console.error('Error updating participant:', error);
      alert('Erro ao atualizar participante');
    }
  };

  const openMatchManager = (match: Match) => {
    setSelectedMatch(match);
    setShowMatchManager(true);
  };

  const updateMatchBonusResult = async (
    resultField: 'participant1_bonus_result' | 'participant1_bonus2_result' | 'participant2_bonus_result' | 'participant2_bonus2_result',
    multiplier: number
  ) => {
    if (!selectedMatch) return;

    try {
      const { error } = await supabase
        .from('fever_matches')
        .update({ [resultField]: multiplier })
        .eq('id', selectedMatch.id);

      if (error) throw error;

      setSelectedMatch({ ...selectedMatch, [resultField]: multiplier });
      if (selectedTournament) {
        await loadTournamentData(selectedTournament.id);
      }
    } catch (error) {
      console.error('Error updating match bonus:', error);
      alert('Erro ao atualizar resultado do bónus');
    }
  };

  const updatePlayoffBonusResult = async (
    resultField: 'participant1_bonus_result' | 'participant1_bonus2_result' | 'participant2_bonus_result' | 'participant2_bonus2_result',
    multiplier: number
  ) => {
    if (!selectedPlayoffMatch) return;

    try {
      const { error } = await supabase
        .from('fever_playoff_matches')
        .update({ [resultField]: multiplier })
        .eq('id', selectedPlayoffMatch.id);

      if (error) throw error;

      setSelectedPlayoffMatch({ ...selectedPlayoffMatch, [resultField]: multiplier });
      if (selectedTournament) {
        await loadTournamentData(selectedTournament.id);
      }
    } catch (error) {
      console.error('Error updating playoff bonus:', error);
      alert('Erro ao atualizar resultado do bónus');
    }
  };

  const calculateAveragePoints = (result1?: number, result2?: number): number => {
    const r1 = result1 || 0;
    const r2 = result2 || 0;
    const avg = (r1 + r2) / 2;

    if (avg >= 10000) return 3;
    if (avg >= 5000) return 2;
    if (avg >= 2501) return 1;
    return 0;
  };

  const getPointsColor = (points: number) => {
    if (points >= 15) return 'text-yellow-400';
    if (points >= 10) return 'text-green-400';
    if (points >= 5) return 'text-blue-400';
    return 'text-gray-400';
  };

  const generatePlayoffs = async () => {
    if (!selectedTournament) return;

    try {
      console.log('Gerando playoffs para torneio:', selectedTournament.id);
      console.log('Playoffs atuais:', playoffMatches.length);

      const sortedByGroup: Record<string, Participant[]> = {};

      ['A', 'B', 'C', 'D'].forEach(groupName => {
        const groupParticipants = participants[groupName] || [];
        sortedByGroup[groupName] = [...groupParticipants].sort((a, b) => a.position - b.position);
      });

      const quarterFinalsMatchups = [
        { p1: sortedByGroup['A'][0], p2: sortedByGroup['D'][1], match: 1 },
        { p1: sortedByGroup['B'][0], p2: sortedByGroup['C'][1], match: 2 },
        { p1: sortedByGroup['C'][0], p2: sortedByGroup['B'][1], match: 3 },
        { p1: sortedByGroup['D'][0], p2: sortedByGroup['A'][1], match: 4 }
      ];

      console.log('Criando quartos de final...');
      for (const matchup of quarterFinalsMatchups) {
        if (matchup.p1 && matchup.p2) {
          const { error } = await supabase.from('fever_playoff_matches').insert({
            tournament_id: selectedTournament.id,
            stage: 'quarter_finals',
            match_number: matchup.match,
            participant1_id: matchup.p1.id,
            participant2_id: matchup.p2.id
          });
          if (error) throw error;
        }
      }

      console.log('Criando meias-finais...');
      for (let i = 1; i <= 2; i++) {
        const { error } = await supabase.from('fever_playoff_matches').insert({
          tournament_id: selectedTournament.id,
          stage: 'semi_finals',
          match_number: i,
          participant1_id: null,
          participant2_id: null
        });
        if (error) throw error;
      }

      console.log('Criando final...');
      const { error: finalError } = await supabase.from('fever_playoff_matches').insert({
        tournament_id: selectedTournament.id,
        stage: 'final',
        match_number: 1,
        participant1_id: null,
        participant2_id: null
      });
      if (finalError) throw finalError;

      console.log('Recarregando dados do torneio...');
      await loadTournamentData(selectedTournament.id);
      alert('Playoffs gerados com sucesso!');
    } catch (error) {
      console.error('Error generating playoffs:', error);
      alert('Erro ao gerar playoffs: ' + (error as Error).message);
    }
  };

  const formatTournamentDisplay = (tournament: Tournament) => {
    const date = new Date(tournament.created_at);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const tournamentNum = tournament.tournament_number || 0;
    return `${tournament.name} #${tournamentNum} ${day}/${month}/${year}`;
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-yellow-400" />
          <h2 className="text-xl font-bold text-white uppercase">Fever Champions League</h2>
        </div>
        <button
          onClick={() => setShowNewTournament(true)}
          className="px-4 py-2 bg-yellow-500 text-gray-900 rounded-lg hover:bg-yellow-400 transition-colors flex items-center gap-2 font-medium uppercase text-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Torneio
        </button>
      </div>

      {showNewTournament && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 uppercase">Criar Novo Torneio</h3>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Nome do torneio"
              value={newTournamentName}
              onChange={(e) => setNewTournamentName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
            <div className="flex gap-2">
              <button
                onClick={createTournament}
                className="flex-1 px-4 py-2 bg-yellow-500 text-gray-900 rounded-lg hover:bg-yellow-400 transition-colors font-medium uppercase text-sm"
              >
                Criar
              </button>
              <button
                onClick={() => {
                  setShowNewTournament(false);
                  setNewTournamentName('');
                }}
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium uppercase text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {tournaments.length > 0 && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {tournaments.map((tournament) => (
              <button
                key={tournament.id}
                onClick={() => setSelectedTournament(tournament)}
                className={`px-4 py-2 rounded-lg font-medium uppercase text-sm transition-colors ${
                  selectedTournament?.id === tournament.id
                    ? 'bg-yellow-500 text-gray-900'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {formatTournamentDisplay(tournament)}
              </button>
            ))}
          </div>

          {selectedTournament && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white uppercase">{formatTournamentDisplay(selectedTournament)}</h3>
                    <p className="text-xs text-gray-400 uppercase">Status: {selectedTournament.status}</p>
                  </div>
                  <div className="flex gap-2">
                    {selectedTournament.status !== 'setup' && (
                      <>
                        <button
                          onClick={() => setShowFixtures(true)}
                          className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-400 transition-colors flex items-center gap-2 text-xs font-medium uppercase"
                        >
                          <Users className="w-4 h-4" />
                          Ver Calendário
                        </button>
                        {playoffMatches.length === 0 && (
                          <button
                            onClick={() => {
                              console.log('Botão clicked. Playoffs count:', playoffMatches.length);
                              generatePlayoffs();
                            }}
                            className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-400 transition-colors flex items-center gap-2 text-xs font-medium uppercase"
                          >
                            <Trophy className="w-4 h-4" />
                            Gerar Playoffs
                          </button>
                        )}
                      </>
                    )}
                    {selectedTournament.status === 'setup' && (
                      <button
                        onClick={() => updateTournamentStatus('active')}
                        className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-400 transition-colors flex items-center gap-2 text-xs font-medium uppercase"
                      >
                        <PlayCircle className="w-4 h-4" />
                        Iniciar
                      </button>
                    )}
                    {selectedTournament.status === 'active' && (
                      <button
                        onClick={() => updateTournamentStatus('completed')}
                        className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors flex items-center gap-2 text-xs font-medium uppercase"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Concluir
                      </button>
                    )}
                    <button
                      onClick={deleteTournament}
                      className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-400 transition-colors flex items-center gap-2 text-xs font-medium uppercase"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar Torneio
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['A', 'B', 'C', 'D'].map((groupName) => (
                  <div key={groupName} className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-bold text-white uppercase">Grupo {groupName}</h4>
                      {selectedTournament.status !== 'completed' && (
                        <button
                          onClick={() => setShowAddParticipant(groupName)}
                          className="p-2 bg-gray-800 text-yellow-400 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {showAddParticipant === groupName && (
                      <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Nome do viewer"
                            value={newParticipant.viewer_name}
                            onChange={(e) => setNewParticipant({ ...newParticipant, viewer_name: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 text-sm"
                          />
                          <div>
                            <input
                              type="text"
                              placeholder="Pesquisar slot..."
                              value={slotSearch}
                              onChange={(e) => setSlotSearch(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 text-sm mb-2"
                            />
                            <div className="max-h-40 overflow-y-auto bg-gray-900 border border-gray-700 rounded">
                              {slotsLoading ? (
                                <div className="p-3 text-center text-gray-500 text-xs">Carregando slots...</div>
                              ) : slots.length === 0 ? (
                                <div className="p-3 text-center text-gray-500 text-xs">
                                  {slotSearch ? 'Nenhuma slot encontrada' : 'Digite para pesquisar'}
                                </div>
                              ) : (
                                slots.map((slot) => (
                                    <button
                                      key={slot.id}
                                      onClick={() => {
                                        setNewParticipant({ ...newParticipant, slot_id: slot.id });
                                        setSlotSearch(slot.name);
                                      }}
                                      className={`w-full px-3 py-2 text-left hover:bg-gray-800 transition-colors flex items-center gap-2 ${
                                        newParticipant.slot_id === slot.id ? 'bg-gray-800' : ''
                                      }`}
                                    >
                                      {slot.image_url && (
                                        <img
                                          src={slot.image_url}
                                          alt={slot.name}
                                          className="w-8 h-8 rounded object-contain"
                                          onError={(e) => {
                                            e.currentTarget.src = '/image.png';
                                          }}
                                        />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-white text-xs font-medium truncate">{slot.name}</p>
                                        <p className="text-gray-500 text-xs truncate">{slot.provider}</p>
                                      </div>
                                    </button>
                                  ))
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => addParticipant(groupName)}
                              disabled={!newParticipant.viewer_name || !newParticipant.slot_id}
                              className="flex-1 px-3 py-2 bg-yellow-500 text-gray-900 rounded hover:bg-yellow-400 transition-colors text-xs font-medium uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Adicionar
                            </button>
                            <button
                              onClick={() => {
                                setShowAddParticipant(null);
                                setNewParticipant({ viewer_name: '', slot_id: '' });
                                setSlotSearch('');
                              }}
                              className="flex-1 px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors text-xs font-medium uppercase"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      {(participants[groupName] || []).map((participant, index) => (
                        <div key={participant.id} className="relative border border-gray-700 rounded-lg overflow-hidden">
                          {participant.slot_image && (
                            <div
                              className="absolute inset-0 opacity-20"
                              style={{
                                backgroundImage: `url(${participant.slot_image})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                filter: 'blur(8px)',
                                transform: 'scale(1.1)'
                              }}
                            />
                          )}
                          <div className="flex relative z-10 bg-gray-800">
                            {participant.slot_image ? (
                              <img
                                src={participant.slot_image}
                                alt={participant.slot_name}
                                className="w-12 object-contain flex-shrink-0"
                                style={{ margin: 0, padding: 0, display: 'block' }}
                              />
                            ) : (
                              <div className="w-12 flex-shrink-0 bg-gray-700 flex items-center justify-center">
                                <span className="text-2xl font-bold text-gray-500">?</span>
                              </div>
                            )}
                            <div className="flex-1 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold text-yellow-400">#{index + 1}</span>
                                  <div>
                                    <p className="text-sm font-bold text-white">{participant.viewer_name}</p>
                                    <p className="text-xs text-gray-400">{participant.slot_name || 'Sem slot'}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                              {selectedTournament.status !== 'completed' && (
                                <button
                                  onClick={async () => {
                                    // Load slots first and try to match the current one
                                    const searchTerm = participant.slot_name || '';
                                    const { data: loadedSlots } = await supabase
                                      .from('slots')
                                      .select('id, name, provider, image_url')
                                      .ilike('name', `%${searchTerm}%`)
                                      .order('name')
                                      .limit(50);

                                    if (loadedSlots) {
                                      setSlots(loadedSlots);
                                      // Find exact match
                                      const matchingSlot = loadedSlots.find(s => s.name === participant.slot_name);

                                      setEditParticipantData({
                                        viewer_name: participant.viewer_name,
                                        slot_id: matchingSlot?.id || ''
                                      });
                                      setSlotSearch(searchTerm);
                                    }

                                    setShowEditParticipant(participant);
                                  }}
                                  className="p-1.5 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                                  title="Editar"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                                  {selectedTournament.status !== 'completed' && (
                                    <button
                                      onClick={() => deleteParticipant(participant.id)}
                                      className="p-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                                      title="Remover"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {participant.spins_count > 0 && (
                                <div className="flex items-center justify-between text-xs mt-2">
                                  <span className="text-gray-400">Spins: {participant.spins_count}</span>
                                  <span className={`font-bold ${getPointsColor(participant.points)}`}>
                                    {participant.points} pts
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showEditParticipant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-white mb-4 uppercase">Editar Participante</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2 uppercase">Nome do Participante</label>
                <input
                  type="text"
                  value={editParticipantData.viewer_name}
                  onChange={(e) => setEditParticipantData({ ...editParticipantData, viewer_name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                  placeholder="Nome do viewer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2 uppercase">Slot</label>
                <input
                  type="text"
                  value={slotSearch}
                  onChange={(e) => {
                    setSlotSearch(e.target.value);
                    loadSlots(e.target.value);
                  }}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-yellow-500 mb-2"
                  placeholder="Pesquisar slot..."
                />
                {slotsLoading ? (
                  <p className="text-sm text-gray-500">A carregar...</p>
                ) : (
                  <select
                    value={editParticipantData.slot_id}
                    onChange={(e) => setEditParticipantData({ ...editParticipantData, slot_id: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                  >
                    <option value="">Selecione um slot</option>
                    {slots.map(slot => (
                      <option key={slot.id} value={slot.id}>{slot.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={updateParticipant}
                  className="flex-1 px-4 py-2 bg-yellow-500 text-gray-900 rounded-lg hover:bg-yellow-400 transition-colors font-medium uppercase text-sm"
                >
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setShowEditParticipant(null);
                    setEditParticipantData({ viewer_name: '', slot_id: '' });
                    setSlotSearch('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium uppercase text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tournaments.length === 0 && (
        <div className="text-center py-12 bg-gray-900 border border-gray-700 rounded-xl">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400 text-sm uppercase">Nenhum torneio criado</p>
          <button
            onClick={() => setShowNewTournament(true)}
            className="mt-4 px-4 py-2 bg-yellow-500 text-gray-900 rounded-lg hover:bg-yellow-400 transition-colors font-medium uppercase text-sm"
          >
            Criar Primeiro Torneio
          </button>
        </div>
      )}

      {showFixtures && selectedTournament && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-7xl w-full my-8">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-gray-900 z-10 -mx-6 -mt-6 px-6 pt-6 pb-4 border-b border-gray-700">
              <h3 className="text-xl font-bold text-white uppercase">Calendário & Classificação - {formatTournamentDisplay(selectedTournament)}</h3>
              <button
                onClick={() => setShowFixtures(false)}
                className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {['A', 'B', 'C', 'D'].map((groupName) => {
                const groupMatches = matches[groupName] || [];
                const groupParticipants = participants[groupName] || [];
                const rounds = Array.from(new Set(groupMatches.map(m => m.round_number))).sort();

                return (
                  <div key={groupName} className="bg-gray-800 rounded-xl p-4">
                    <h4 className="text-lg font-bold text-yellow-400 mb-4 uppercase text-center">Grupo {groupName}</h4>

                    <div className="space-y-4">
                      <div className="bg-gray-900 rounded-lg p-3">
                        <h5 className="text-sm font-bold text-green-400 mb-3 uppercase text-center">Classificação</h5>
                        <div className="space-y-2">
                          {groupParticipants.length === 0 ? (
                            <p className="text-gray-500 text-xs text-center py-2">Sem participantes</p>
                          ) : (
                            groupParticipants.map((participant) => {
                              const positionColor =
                                participant.position === 1 ? 'text-yellow-400' :
                                participant.position === 2 ? 'text-gray-400' :
                                participant.position === 3 ? 'text-orange-400' :
                                'text-gray-500';

                              return (
                                <div key={participant.id} className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-black ${positionColor}`}>
                                      #{participant.position}
                                    </span>
                                    <span className="text-white text-sm font-medium">
                                      {participant.viewer_name}
                                    </span>
                                  </div>
                                  <span className="text-yellow-400 text-sm font-bold">
                                    {participant.points} pts
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {groupMatches.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">Nenhum jogo agendado</p>
                      ) : (
                        <div className="space-y-4">
                          <h5 className="text-sm font-bold text-blue-400 uppercase text-center">Calendário</h5>
                          {rounds.map(round => {
                            const roundMatches = groupMatches.filter(m => m.round_number === round);

                            return (
                              <div key={round} className="space-y-2">
                                <h6 className="text-xs font-bold text-gray-400 uppercase">Jornada {round}</h6>
                                {roundMatches.map(match => {
                                  const p1 = groupParticipants.find(p => p.id === match.participant1_id);
                                  const p2 = groupParticipants.find(p => p.id === match.participant2_id);

                                  const p1MatchPoints = calculateAveragePoints(match.participant1_bonus_result, match.participant1_bonus2_result);
                                  const p2MatchPoints = calculateAveragePoints(match.participant2_bonus_result, match.participant2_bonus2_result);

                                  return (
                                    <div key={match.id} className="bg-gray-900 rounded-lg p-3">
                                      <div className="flex items-center text-sm">
                                        <div className="flex-1">
                                          <p className="text-white font-medium">{p1?.viewer_name || 'Unknown'}</p>
                                          <p className="text-gray-500 text-xs">{p1?.slot_name || '-'}</p>
                                        </div>
                                        <div className="flex flex-col items-center gap-2 mx-4">
                                          <div className="flex items-center gap-2">
                                            <span className={`font-bold text-sm ${p1MatchPoints > p2MatchPoints ? 'text-green-400' : p1MatchPoints < p2MatchPoints ? 'text-red-400' : 'text-yellow-400'}`}>
                                              {p1MatchPoints}
                                            </span>
                                            <span className="text-gray-600">-</span>
                                            <span className={`font-bold text-sm ${p2MatchPoints > p1MatchPoints ? 'text-green-400' : p2MatchPoints < p1MatchPoints ? 'text-red-400' : 'text-yellow-400'}`}>
                                              {p2MatchPoints}
                                            </span>
                                          </div>
                                          <button
                                            onClick={() => openMatchManager(match)}
                                            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-400 transition-colors uppercase font-medium"
                                          >
                                            Gerir Bónus
                                          </button>
                                        </div>
                                        <div className="flex-1 text-right">
                                          <p className="text-white font-medium">{p2?.viewer_name || 'Unknown'}</p>
                                          <p className="text-gray-500 text-xs">{p2?.slot_name || '-'}</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {playoffMatches.length > 0 && (
              <div className="mt-8 border-t border-gray-700 pt-6">
                <h3 className="text-2xl font-bold text-yellow-400 mb-6 uppercase text-center">Playoffs</h3>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-lg font-bold text-orange-400 uppercase text-center">Quartos de Final</h4>
                    {playoffMatches.filter(m => m.stage === 'quarter_finals').map(match => {
                      const p1 = Object.values(participants).flat().find(p => p.id === match.participant1_id);
                      const p2 = Object.values(participants).flat().find(p => p.id === match.participant2_id);
                      const p1Avg = ((match.participant1_bonus_result || 0) + (match.participant1_bonus2_result || 0)) / 2;
                      const p2Avg = ((match.participant2_bonus_result || 0) + (match.participant2_bonus2_result || 0)) / 2;

                      const hasResults = match.participant1_bonus_result > 0 && match.participant2_bonus_result > 0;
                      const p1Score = hasResults ? (p1Avg > p2Avg ? 1 : 0) : 0;
                      const p2Score = hasResults ? (p2Avg > p1Avg ? 1 : 0) : 0;

                      return (
                        <div key={match.id} className="bg-gray-800 rounded-lg p-3">
                          <p className="text-xs text-gray-400 mb-2 text-center">Jogo {match.match_number}</p>
                          <div className="flex items-center text-sm">
                            <div className="flex-1">
                              <p className="text-white font-medium">{p1?.viewer_name || 'TBD'}</p>
                            </div>
                            <div className="flex flex-col items-center gap-2 mx-4">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-sm ${p1Score > p2Score ? 'text-green-400' : p1Score < p2Score ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {p1Score}
                                </span>
                                <span className="text-gray-600">-</span>
                                <span className={`font-bold text-sm ${p2Score > p1Score ? 'text-green-400' : p2Score < p1Score ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {p2Score}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedPlayoffMatch(match);
                                  setShowPlayoffManager(true);
                                }}
                                className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-400 transition-colors uppercase font-medium"
                              >
                                Gerir
                              </button>
                            </div>
                            <div className="flex-1 text-right">
                              <p className="text-white font-medium">{p2?.viewer_name || 'TBD'}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-lg font-bold text-orange-400 uppercase text-center">Meias-Finais</h4>
                    {playoffMatches.filter(m => m.stage === 'semi_finals').map(match => {
                      const p1 = Object.values(participants).flat().find(p => p.id === match.participant1_id);
                      const p2 = Object.values(participants).flat().find(p => p.id === match.participant2_id);
                      const p1Avg = ((match.participant1_bonus_result || 0) + (match.participant1_bonus2_result || 0)) / 2;
                      const p2Avg = ((match.participant2_bonus_result || 0) + (match.participant2_bonus2_result || 0)) / 2;

                      const hasResults = match.participant1_bonus_result > 0 && match.participant2_bonus_result > 0;
                      const p1Score = hasResults ? (p1Avg > p2Avg ? 1 : 0) : 0;
                      const p2Score = hasResults ? (p2Avg > p1Avg ? 1 : 0) : 0;

                      return (
                        <div key={match.id} className="bg-gray-800 rounded-lg p-3">
                          <p className="text-xs text-gray-400 mb-2 text-center">Meia {match.match_number}</p>
                          <div className="flex items-center text-sm">
                            <div className="flex-1">
                              <p className="text-white font-medium">{p1?.viewer_name || 'TBD'}</p>
                            </div>
                            <div className="flex flex-col items-center gap-2 mx-4">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-sm ${p1Score > p2Score ? 'text-green-400' : p1Score < p2Score ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {p1Score}
                                </span>
                                <span className="text-gray-600">-</span>
                                <span className={`font-bold text-sm ${p2Score > p1Score ? 'text-green-400' : p2Score < p1Score ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {p2Score}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedPlayoffMatch(match);
                                  setShowPlayoffManager(true);
                                }}
                                className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-400 transition-colors uppercase font-medium"
                              >
                                Gerir
                              </button>
                            </div>
                            <div className="flex-1 text-right">
                              <p className="text-white font-medium">{p2?.viewer_name || 'TBD'}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-lg font-bold text-yellow-400 uppercase text-center">Final</h4>
                    {playoffMatches.filter(m => m.stage === 'final').map(match => {
                      const p1 = Object.values(participants).flat().find(p => p.id === match.participant1_id);
                      const p2 = Object.values(participants).flat().find(p => p.id === match.participant2_id);
                      const p1Avg = ((match.participant1_bonus_result || 0) + (match.participant1_bonus2_result || 0)) / 2;
                      const p2Avg = ((match.participant2_bonus_result || 0) + (match.participant2_bonus2_result || 0)) / 2;

                      const hasResults = match.participant1_bonus_result > 0 && match.participant2_bonus_result > 0;
                      const p1Score = hasResults ? (p1Avg > p2Avg ? 1 : 0) : 0;
                      const p2Score = hasResults ? (p2Avg > p1Avg ? 1 : 0) : 0;

                      return (
                        <div key={match.id} className="bg-gray-800 rounded-lg p-3">
                          <p className="text-xs text-gray-400 mb-2 text-center">Grande Final</p>
                          <div className="flex items-center text-sm">
                            <div className="flex-1">
                              <p className="text-white font-medium">{p1?.viewer_name || 'TBD'}</p>
                            </div>
                            <div className="flex flex-col items-center gap-2 mx-4">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-sm ${p1Score > p2Score ? 'text-green-400' : p1Score < p2Score ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {p1Score}
                                </span>
                                <span className="text-gray-600">-</span>
                                <span className={`font-bold text-sm ${p2Score > p1Score ? 'text-green-400' : p2Score < p1Score ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {p2Score}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedPlayoffMatch(match);
                                  setShowPlayoffManager(true);
                                }}
                                className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-400 transition-colors uppercase font-medium"
                              >
                                Gerir
                              </button>
                            </div>
                            <div className="flex-1 text-right">
                              <p className="text-white font-medium">{p2?.viewer_name || 'TBD'}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showMatchManager && selectedMatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-4xl w-full my-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white uppercase">Gerir Bónus do Jogo</h3>
              <button
                onClick={() => setShowMatchManager(false)}
                className="p-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {[1, 2].map((playerNum) => {
                const participantId = playerNum === 1 ? selectedMatch.participant1_id : selectedMatch.participant2_id;
                const participant = Object.values(participants)
                  .flat()
                  .find((p) => p.id === participantId);
                const bonus1Id = playerNum === 1 ? selectedMatch.participant1_bonus_id : selectedMatch.participant2_bonus_id;
                const bonus2Id = playerNum === 1 ? selectedMatch.participant1_bonus2_id : selectedMatch.participant2_bonus2_id;
                const result1 = playerNum === 1 ? selectedMatch.participant1_bonus_result : selectedMatch.participant2_bonus_result;
                const result2 = playerNum === 1 ? selectedMatch.participant1_bonus2_result : selectedMatch.participant2_bonus2_result;

                return (
                  <div key={playerNum} className="bg-gray-800 rounded-xl p-4">
                    <h4 className="text-lg font-bold text-white mb-4 uppercase">
                      {participant?.viewer_name || 'Unknown'}
                    </h4>

                    <div className="space-y-4">
                      <div className="bg-gray-900 rounded-lg p-3">
                        <label className="block text-sm font-medium text-gray-400 mb-3 uppercase">Bónus 1</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1 uppercase">Custo (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                              onChange={(e) => {
                                const cost = parseFloat(e.target.value);
                                const payoutInput = e.target.parentElement?.parentElement?.querySelector('input[placeholder="Pagamento"]') as HTMLInputElement;
                                if (payoutInput && cost > 0) {
                                  const payout = parseFloat(payoutInput.value);
                                  if (payout > 0) {
                                    updateMatchBonusResult(
                                      playerNum === 1 ? 'participant1_bonus_result' : 'participant2_bonus_result',
                                      (payout / cost) * 100
                                    );
                                  }
                                }
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1 uppercase">Pagamento (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Pagamento"
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                              onChange={(e) => {
                                const payout = parseFloat(e.target.value);
                                const costInput = e.target.parentElement?.parentElement?.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
                                if (costInput && payout > 0) {
                                  const cost = parseFloat(costInput.value);
                                  if (cost > 0) {
                                    updateMatchBonusResult(
                                      playerNum === 1 ? 'participant1_bonus_result' : 'participant2_bonus_result',
                                      (payout / cost) * 100
                                    );
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>
                        {result1 !== null && result1 !== undefined && (
                          <p className="mt-2 text-sm text-green-400">Multiplicador: {result1.toFixed(2)}x</p>
                        )}
                      </div>

                      <div className="bg-gray-900 rounded-lg p-3">
                        <label className="block text-sm font-medium text-gray-400 mb-3 uppercase">Bónus 2</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1 uppercase">Custo (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                              onChange={(e) => {
                                const cost = parseFloat(e.target.value);
                                const payoutInput = e.target.parentElement?.parentElement?.querySelector('input[placeholder="Pagamento"]') as HTMLInputElement;
                                if (payoutInput && cost > 0) {
                                  const payout = parseFloat(payoutInput.value);
                                  if (payout > 0) {
                                    updateMatchBonusResult(
                                      playerNum === 1 ? 'participant1_bonus2_result' : 'participant2_bonus2_result',
                                      (payout / cost) * 100
                                    );
                                  }
                                }
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1 uppercase">Pagamento (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Pagamento"
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                              onChange={(e) => {
                                const payout = parseFloat(e.target.value);
                                const costInput = e.target.parentElement?.parentElement?.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
                                if (costInput && payout > 0) {
                                  const cost = parseFloat(costInput.value);
                                  if (cost > 0) {
                                    updateMatchBonusResult(
                                      playerNum === 1 ? 'participant1_bonus2_result' : 'participant2_bonus2_result',
                                      (payout / cost) * 100
                                    );
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>
                        {result2 !== null && result2 !== undefined && (
                          <p className="mt-2 text-sm text-green-400">Multiplicador: {result2.toFixed(2)}x</p>
                        )}
                      </div>

                      {result1 !== null && result1 !== undefined && result2 !== null && result2 !== undefined && (
                        <div className="bg-gray-900 rounded-lg p-3 mt-4">
                          <p className="text-xs text-gray-400 uppercase mb-1">Média</p>
                          <p className="text-2xl font-bold text-yellow-400">{((result1 + result2) / 2).toFixed(2)}x</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Pontos: {calculateAveragePoints(result1, result2)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 bg-gray-800 rounded-xl p-4">
              <h4 className="text-sm font-bold text-gray-400 uppercase mb-2">Como Funciona</h4>
              <p className="text-sm text-gray-500">
                Para cada bónus, introduz o custo de compra do bónus e o valor que pagou. O sistema calcula automaticamente o multiplicador: (Pagamento ÷ Custo Bónus) × 100.
                Os pontos são atribuídos com base na <strong className="text-white">média dos 2 bónus</strong>: 0-2500x = 0pts, 2501-4999x = 1pt, 5000-9999x = 2pts, 10000x+ = 3pts.
              </p>
            </div>
          </div>
        </div>
      )}

      {showPlayoffManager && selectedPlayoffMatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-4xl w-full my-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white uppercase">Gerir Bónus - Playoff</h3>
              <button
                onClick={() => setShowPlayoffManager(false)}
                className="p-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {[1, 2].map((playerNum) => {
                const participantId = playerNum === 1 ? selectedPlayoffMatch.participant1_id : selectedPlayoffMatch.participant2_id;
                const participant = Object.values(participants).flat().find(p => p.id === participantId);

                const result1 = playerNum === 1 ? selectedPlayoffMatch.participant1_bonus_result : selectedPlayoffMatch.participant2_bonus_result;
                const result2 = playerNum === 1 ? selectedPlayoffMatch.participant1_bonus2_result : selectedPlayoffMatch.participant2_bonus2_result;

                return (
                  <div key={playerNum} className="space-y-4">
                    <div className="bg-gray-800 rounded-lg p-4">
                      <h4 className="text-lg font-bold text-yellow-400 mb-2 uppercase">{participant?.viewer_name || 'TBD'}</h4>
                      <p className="text-sm text-gray-400">{participant?.slot_name || '-'}</p>
                    </div>

                    <div className="bg-gray-900 rounded-lg p-3">
                      <label className="block text-sm font-medium text-gray-400 mb-3 uppercase">Bónus 1</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1 uppercase">Custo (€)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                            onChange={(e) => {
                              const cost = parseFloat(e.target.value);
                              const payoutInput = e.target.parentElement?.parentElement?.querySelector('input[placeholder="Pagamento"]') as HTMLInputElement;
                              if (payoutInput && cost > 0) {
                                const payout = parseFloat(payoutInput.value);
                                if (payout > 0) {
                                  updatePlayoffBonusResult(
                                    playerNum === 1 ? 'participant1_bonus_result' : 'participant2_bonus_result',
                                    (payout / cost) * 100
                                  );
                                }
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1 uppercase">Pagamento (€)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Pagamento"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                            onChange={(e) => {
                              const payout = parseFloat(e.target.value);
                              const costInput = e.target.parentElement?.parentElement?.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
                              if (costInput && payout > 0) {
                                const cost = parseFloat(costInput.value);
                                if (cost > 0) {
                                  updatePlayoffBonusResult(
                                    playerNum === 1 ? 'participant1_bonus_result' : 'participant2_bonus_result',
                                    (payout / cost) * 100
                                  );
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                      {result1 !== null && result1 !== undefined && (
                        <p className="mt-2 text-sm text-green-400">Multiplicador: {result1.toFixed(2)}x</p>
                      )}
                    </div>

                    <div className="bg-gray-900 rounded-lg p-3">
                      <label className="block text-sm font-medium text-gray-400 mb-3 uppercase">Bónus 2</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1 uppercase">Custo (€)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                            onChange={(e) => {
                              const cost = parseFloat(e.target.value);
                              const payoutInput = e.target.parentElement?.parentElement?.querySelector('input[placeholder="Pagamento"]') as HTMLInputElement;
                              if (payoutInput && cost > 0) {
                                const payout = parseFloat(payoutInput.value);
                                if (payout > 0) {
                                  updatePlayoffBonusResult(
                                    playerNum === 1 ? 'participant1_bonus2_result' : 'participant2_bonus2_result',
                                    (payout / cost) * 100
                                  );
                                }
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1 uppercase">Pagamento (€)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Pagamento"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
                            onChange={(e) => {
                              const payout = parseFloat(e.target.value);
                              const costInput = e.target.parentElement?.parentElement?.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
                              if (costInput && payout > 0) {
                                const cost = parseFloat(costInput.value);
                                if (cost > 0) {
                                  updatePlayoffBonusResult(
                                    playerNum === 1 ? 'participant1_bonus2_result' : 'participant2_bonus2_result',
                                    (payout / cost) * 100
                                  );
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                      {result2 !== null && result2 !== undefined && (
                        <p className="mt-2 text-sm text-green-400">Multiplicador: {result2.toFixed(2)}x</p>
                      )}
                    </div>

                    {result1 !== null && result1 !== undefined && result2 !== null && result2 !== undefined && (
                      <div className="bg-gray-900 rounded-lg p-3">
                        <p className="text-xs text-gray-400 uppercase mb-1">Média</p>
                        <p className="text-2xl font-bold text-yellow-400">{((result1 + result2) / 2).toFixed(2)}x</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Pontos: {calculateAveragePoints(result1, result2)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 bg-gray-800 rounded-xl p-4">
              <h4 className="text-sm font-bold text-gray-400 uppercase mb-2">Como Funciona</h4>
              <p className="text-sm text-gray-500">
                Para cada bónus, introduz o custo de compra do bónus e o valor que pagou. O sistema calcula automaticamente o multiplicador: (Pagamento ÷ Custo Bónus) × 100.
                Os pontos são atribuídos com base na <strong className="text-white">média dos 2 bónus</strong>: 0-2500x = 0pts, 2501-4999x = 1pt, 5000-9999x = 2pts, 10000x+ = 3pts.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
