import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search, Star, TrendingUp, DollarSign, Zap, Calendar, Award, Edit2, Trash2, Save, X } from 'lucide-react';

interface Slot {
  id: string;
  name: string;
  provider: string;
  image_url: string | null;
  max_win: number;
  volatility: string;
  rtp: number;
  min_bet: number;
  max_bet: number;
  theme: string | null;
  release_date: string | null;
  features: string[];
  created_at: string;
  updated_at: string;
}

interface SlotStats {
  id: string;
  slot_id: string;
  total_sessions: number;
  total_spins: number;
  total_wagered: number;
  total_won: number;
  profit_loss: number;
  best_win_amount: number;
  best_win_multi: number;
  total_bonus_buys: number;
  total_bonus_hits: number;
  avg_rtp_actual: number;
  last_played: string | null;
}

interface SlotWithStats extends Slot {
  stats?: SlotStats;
  is_favorite?: boolean;
}

export function SlotDatabase() {
  const [slots, setSlots] = useState<SlotWithStats[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterVolatility, setFilterVolatility] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<SlotWithStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [repairingImages, setRepairingImages] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 50;

  const [newSlot, setNewSlot] = useState({
    name: '',
    provider: '',
    image_url: '',
    max_win: 0,
    volatility: 'Medium',
    rtp: 96.0,
    release_date: '',
    features: [] as string[]
  });

  useEffect(() => {
    loadSlots();

    const channel = supabase
      .channel('slots_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => {
        loadSlots();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_stats' }, () => {
        loadSlots();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_favorites' }, () => {
        loadSlots();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentPage, searchTerm, filterProvider, filterVolatility]);

  const loadSlots = async () => {
    try {
      setLoading(true);
      let query = supabase.from('slots').select('*', { count: 'exact' });

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,provider.ilike.%${searchTerm}%`);
      }
      if (filterProvider !== 'all') {
        query = query.eq('provider', filterProvider);
      }
      if (filterVolatility !== 'all') {
        query = query.eq('volatility', filterVolatility);
      }

      const { data: slotsData, error: slotsError, count } = await query
        .order('name')
        .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);

      if (slotsError) throw slotsError;

      setTotalCount(count || 0);

      const slotIds = (slotsData || []).map(s => s.id);

      const { data: statsData } = await supabase
        .from('slot_stats')
        .select('*')
        .in('slot_id', slotIds);

      const { data: favoritesData } = await supabase
        .from('slot_favorites')
        .select('*')
        .in('slot_id', slotIds);

      const slotsWithData = (slotsData || []).map((slot) => {
        const stats = (statsData || []).find((s) => s.slot_id === slot.id);
        const favorite = (favoritesData || []).find((f) => f.slot_id === slot.id);
        return {
          ...slot,
          stats,
          is_favorite: favorite?.is_favorite || false
        };
      });

      setSlots(slotsWithData);
    } catch (error) {
      console.error('Error loading slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSlot = async () => {
    if (!newSlot.name || !newSlot.provider) {
      alert('Por favor preencha pelo menos o nome e provider da slot');
      return;
    }

    try {
      const slotData = {
        name: newSlot.name,
        provider: newSlot.provider,
        image_url: newSlot.image_url || null,
        max_win: newSlot.max_win,
        volatility: newSlot.volatility,
        rtp: newSlot.rtp,
        release_date: newSlot.release_date || null,
        features: newSlot.features
      };

      const { error } = await supabase
        .from('slots')
        .insert([slotData]);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      setShowAddModal(false);
      setNewSlot({
        name: '',
        provider: '',
        image_url: '',
        max_win: 0,
        volatility: 'Medium',
        rtp: 96.0,
        min_bet: 0.20,
        max_bet: 100.0,
        theme: '',
        release_date: '',
        features: []
      });
      await loadSlots();
    } catch (error) {
      console.error('Error adding slot:', error);
      alert(`Erro ao adicionar slot: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  const handleUpdateSlot = async () => {
    if (!editingSlot) return;

    try {
      const { error } = await supabase
        .from('slots')
        .update({
          name: editingSlot.name,
          provider: editingSlot.provider,
          image_url: editingSlot.image_url,
          max_win: editingSlot.max_win,
          volatility: editingSlot.volatility,
          rtp: editingSlot.rtp,
          min_bet: editingSlot.min_bet,
          max_bet: editingSlot.max_bet,
          theme: editingSlot.theme,
          release_date: editingSlot.release_date,
          features: editingSlot.features,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingSlot.id);

      if (error) throw error;

      setEditingSlot(null);
      await loadSlots();
    } catch (error) {
      console.error('Error updating slot:', error);
      alert('Erro ao atualizar slot');
    }
  };

  const handleDeleteSlot = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta slot?')) return;

    try {
      const { error } = await supabase
        .from('slots')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadSlots();
    } catch (error) {
      console.error('Error deleting slot:', error);
      alert('Erro ao excluir slot');
    }
  };

  const handleToggleFavorite = async (slotId: string, currentFavorite: boolean) => {
    try {
      const { error } = await supabase
        .from('slot_favorites')
        .upsert({
          slot_id: slotId,
          is_favorite: !currentFavorite,
          updated_at: new Date().toISOString()
        }, { onConflict: 'slot_id' });

      if (error) throw error;
      await loadSlots();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm('Isto irá importar slots do ficheiro CSV. Deseja continuar?')) {
      event.target.value = '';
      return;
    }

    setImporting(true);
    try {
      const csvText = await file.text();
      const lines = csvText.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim());

      const nameIdx = headers.indexOf('Name');
      const providerIdx = headers.indexOf('Provider');
      const maxWinIdx = headers.indexOf('Max Win');
      const volatilityIdx = headers.indexOf('Volatility');
      const rtpIdx = headers.indexOf('RTP');
      const minBetIdx = headers.indexOf('Min Bet');
      const maxBetIdx = headers.indexOf('Max Bet');
      const themeIdx = headers.indexOf('Theme');

      let imported = 0;
      let skipped = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values = line.split(',').map(v => v.trim());

        if (values.length < headers.length) {
          skipped++;
          continue;
        }

        const name = values[nameIdx];
        const provider = values[providerIdx];

        const { data: existing } = await supabase
          .from('slots')
          .select('id')
          .eq('name', name)
          .eq('provider', provider)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const slotData = {
          name,
          provider,
          max_win: parseInt(values[maxWinIdx]) || 0,
          volatility: values[volatilityIdx] || 'Medium',
          rtp: parseFloat(values[rtpIdx]) || 96.0,
          image_url: null,
          release_date: null,
          features: []
        };

        const { error } = await supabase
          .from('slots')
          .insert([slotData]);

        if (error) {
          console.error(`Error importing ${name}:`, error);
          skipped++;
        } else {
          imported++;
        }
      }

      alert(`Importação concluída!\n\nImportadas: ${imported}\nIgnoradas: ${skipped}`);
      await loadSlots();
      event.target.value = '';
    } catch (error) {
      console.error('Error importing CSV:', error);
      alert('Erro ao importar CSV. Verifique o console para detalhes.');
      event.target.value = '';
    } finally {
      setImporting(false);
    }
  };

  const normalizeSlotName = (name: string) => name.trim().toLowerCase();

  const fetchAllRows = async (table: string, selectColumns: string) => {
    const pageSize = 1000;
    let from = 0;
    let allRows: any[] = [];

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(selectColumns)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const rows = data || [];
      allRows = [...allRows, ...rows];

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return allRows;
  };

  const handleRepairMissingImages = async () => {
    if (!confirm('Isto vai verificar TODAS as slots e tentar reparar imagens em falta. Continuar?')) {
      return;
    }

    setRepairingImages(true);
    const defaultImage = '/wVqLzwT_default.png';

    try {
      const allSlots = await fetchAllRows('slots', 'id, name, image_url');
      const missingImageSlots = allSlots.filter((slot) => !slot.image_url || slot.image_url.trim() === '');

      if (missingImageSlots.length === 0) {
        alert('Nenhuma slot sem imagem encontrada.');
        return;
      }

      const slotsWithImages = allSlots.filter((slot) => slot.image_url && slot.image_url.trim() !== '');
      const slotImageMap = new Map<string, string>();

      slotsWithImages.forEach((slot) => {
        const key = normalizeSlotName(slot.name);
        if (!slotImageMap.has(key)) {
          slotImageMap.set(key, slot.image_url);
        }
      });

      const huntItems = await fetchAllRows('bonus_hunt_items', 'slot_name, slot_image_url');
      const openingItems = await fetchAllRows('bonus_opening_items', 'slot_name, slot_image');

      const huntImageMap = new Map<string, string>();
      huntItems.forEach((item) => {
        if (!item?.slot_name || !item?.slot_image_url || item.slot_image_url.trim() === '') return;
        const key = normalizeSlotName(item.slot_name);
        if (!huntImageMap.has(key)) {
          huntImageMap.set(key, item.slot_image_url);
        }
      });

      const openingImageMap = new Map<string, string>();
      openingItems.forEach((item) => {
        if (!item?.slot_name || !item?.slot_image || item.slot_image.trim() === '') return;
        const key = normalizeSlotName(item.slot_name);
        if (!openingImageMap.has(key)) {
          openingImageMap.set(key, item.slot_image);
        }
      });

      let recoveredCount = 0;
      let defaultedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < missingImageSlots.length; i += 50) {
        const chunk = missingImageSlots.slice(i, i + 50);

        const results = await Promise.all(chunk.map(async (slot) => {
          const key = normalizeSlotName(slot.name);
          const recoveredImage = slotImageMap.get(key) || huntImageMap.get(key) || openingImageMap.get(key) || defaultImage;

          const { error } = await supabase
            .from('slots')
            .update({ image_url: recoveredImage, updated_at: new Date().toISOString() })
            .eq('id', slot.id);

          if (error) {
            console.error(`Erro a atualizar imagem da slot ${slot.name}:`, error);
            return { success: false };
          }

          return { success: true, recovered: recoveredImage !== defaultImage };
        }));

        results.forEach((result) => {
          if (!result.success) {
            failedCount++;
          } else if (result.recovered) {
            recoveredCount++;
          } else {
            defaultedCount++;
          }
        });
      }

      await loadSlots();
      alert(
        `Reparação concluída!\n\n` +
        `Slots verificadas sem imagem: ${missingImageSlots.length}\n` +
        `Imagens recuperadas: ${recoveredCount}\n` +
        `Aplicadas com default (?): ${defaultedCount}\n` +
        `Falhas: ${failedCount}`
      );
    } catch (error) {
      console.error('Erro ao reparar imagens das slots:', error);
      alert('Erro ao reparar imagens das slots. Verifique o console.');
    } finally {
      setRepairingImages(false);
    }
  };

  const volatilities = ['Low', 'Medium', 'High', 'Extreme'];
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('slots')
        .select('provider')
        .order('provider');

      const uniqueProviders = Array.from(new Set((data || []).map(s => s.provider))).filter(Boolean);
      setProviders(uniqueProviders as string[]);
    };
    loadProviders();
  }, []);

  const [providers, setProviders] = useState<string[]>([]);

  return (
    <div className="p-8 min-h-screen" style={{ background: 'linear-gradient(to bottom, #1a1a1a 0%, #0f0f0f 100%)' }}>
      <div className="max-w-7xl mx-auto">
        <div className="rounded-2xl overflow-hidden mb-8" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', borderBottom: '1px solid #3d3d3d' }}>
            <div>
              <h1 className="text-2xl font-bold uppercase" style={{ color: '#d4d4d4' }}>Slot Database</h1>
              <p className="text-sm uppercase mt-1" style={{ color: '#8a8a8a' }}>Gestão completa de slots e estatísticas</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg font-semibold uppercase text-sm transition-all"
              style={{ background: 'rgba(139, 116, 96, 0.2)', color: '#b89968', border: '1px solid rgba(139, 116, 96, 0.3)' }}
            >
              Voltar ao Dashboard
            </button>
          </div>

          <div className="p-6">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#8a8a8a' }} />
                <input
                  type="text"
                  placeholder="Pesquisar slots..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-3 rounded-lg transition-all uppercase text-sm"
                  style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                />
              </div>

              <select
                value={filterProvider}
                onChange={(e) => {
                  setFilterProvider(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-4 py-3 rounded-lg transition-all uppercase text-sm"
                style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
              >
                <option value="all">Todos os Providers</option>
                {providers.map((provider) => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>

              <select
                value={filterVolatility}
                onChange={(e) => {
                  setFilterVolatility(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-4 py-3 rounded-lg transition-all uppercase text-sm"
                style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
              >
                <option value="all">Todas Volatilidades</option>
                {volatilities.map((vol) => (
                  <option key={vol} value={vol}>{vol}</option>
                ))}
              </select>

              <label className="px-6 py-3 rounded-lg font-semibold uppercase text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff', border: '1px solid #3d3d3d' }}>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  disabled={importing}
                  className="hidden"
                />
                {importing ? 'Importando...' : 'Importar CSV'}
              </label>

              <button
                onClick={handleRepairMissingImages}
                disabled={repairingImages || importing}
                className="px-6 py-3 rounded-lg font-semibold uppercase text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#ffffff', border: '1px solid #3d3d3d' }}
              >
                <Zap className="w-5 h-5" />
                {repairingImages ? 'A reparar...' : 'Reparar Imagens'}
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 rounded-lg font-semibold uppercase text-sm flex items-center justify-center gap-2 transition-all"
                style={{ background: 'linear-gradient(135deg, #8b7460 0%, #a0826d 100%)', color: '#ffffff', border: '1px solid #3d3d3d' }}
              >
                <Plus className="w-5 h-5" />
                Adicionar Slot
              </button>
            </div>

            <div className="flex items-center justify-between mb-4 text-sm" style={{ color: '#8a8a8a' }}>
              <div className="uppercase flex items-center gap-2">
                {loading && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderBottomColor: '#b89968' }}></div>
                )}
                <span>Mostrando {slots.length > 0 ? ((currentPage - 1) * ITEMS_PER_PAGE) + 1 : 0} - {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} de {totalCount} slots</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg font-semibold uppercase text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#1a1a1a', color: '#d4d4d4', border: '1px solid #3d3d3d' }}
                >
                  Anterior
                </button>
                <div className="flex items-center px-4 py-2 rounded-lg" style={{ background: '#1a1a1a', border: '1px solid #3d3d3d' }}>
                  <span className="font-bold uppercase" style={{ color: '#b89968' }}>{currentPage} / {totalPages}</span>
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-lg font-semibold uppercase text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#1a1a1a', color: '#d4d4d4', border: '1px solid #3d3d3d' }}
                >
                  Próxima
                </button>
              </div>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
              {slots.map((slot) => (
                <div key={slot.id} className="rounded-xl p-6 transition-all" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-bold uppercase text-lg mb-1" style={{ color: '#d4d4d4' }}>{slot.name}</h3>
                      <p className="text-sm uppercase" style={{ color: '#8a8a8a' }}>{slot.provider}</p>
                    </div>
                    <button
                      onClick={() => handleToggleFavorite(slot.id, slot.is_favorite || false)}
                      className="p-2 rounded-lg transition-colors"
                      style={{
                        color: slot.is_favorite ? '#b89968' : '#8a8a8a',
                        background: slot.is_favorite ? 'rgba(139, 116, 96, 0.2)' : 'transparent'
                      }}
                    >
                      <Star className="w-5 h-5" fill={slot.is_favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(139, 116, 96, 0.1)', border: '1px solid rgba(139, 116, 96, 0.2)' }}>
                      <div className="flex items-center justify-center gap-1.5 mb-1.5">
                        <Award className="w-4 h-4" style={{ color: '#b89968' }} />
                        <span className="text-xs font-semibold uppercase" style={{ color: '#b89968' }}>Max Win</span>
                      </div>
                      <p className="text-base font-bold" style={{ color: '#d4d4d4' }}>{slot.max_win}x</p>
                    </div>

                    <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(139, 116, 96, 0.1)', border: '1px solid rgba(139, 116, 96, 0.2)' }}>
                      <div className="flex items-center justify-center gap-1.5 mb-1.5">
                        <Zap className="w-4 h-4" style={{ color: '#b89968' }} />
                        <span className="text-xs font-semibold uppercase" style={{ color: '#b89968' }}>Volatilidade</span>
                      </div>
                      <p className="text-base font-bold" style={{ color: '#d4d4d4' }}>{slot.volatility}</p>
                    </div>

                    <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(139, 116, 96, 0.1)', border: '1px solid rgba(139, 116, 96, 0.2)' }}>
                      <div className="flex items-center justify-center gap-1.5 mb-1.5">
                        <TrendingUp className="w-4 h-4" style={{ color: '#b89968' }} />
                        <span className="text-xs font-semibold uppercase" style={{ color: '#b89968' }}>RTP</span>
                      </div>
                      <p className="text-base font-bold" style={{ color: '#d4d4d4' }}>{slot.rtp}%</p>
                    </div>

                    <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(139, 116, 96, 0.1)', border: '1px solid rgba(139, 116, 96, 0.2)' }}>
                      <div className="flex items-center justify-center gap-1.5 mb-1.5">
                        <DollarSign className="w-4 h-4" style={{ color: '#b89968' }} />
                        <span className="text-xs font-semibold uppercase" style={{ color: '#b89968' }}>Bet Range</span>
                      </div>
                      <p className="text-base font-bold" style={{ color: '#d4d4d4' }}>${slot.min_bet}-${slot.max_bet}</p>
                    </div>
                  </div>

                  {slot.stats && (
                    <div className="rounded-lg p-4 mb-4" style={{ background: '#1a1a1a', border: '1px solid #2d2d2d' }}>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="text-center">
                          <span className="uppercase block" style={{ color: '#8a8a8a' }}>Sessions</span>
                          <span className="font-bold" style={{ color: '#d4d4d4' }}>{slot.stats.total_sessions}</span>
                        </div>
                        <div className="text-center">
                          <span className="uppercase block" style={{ color: '#8a8a8a' }}>Best Win</span>
                          <span className="font-bold" style={{ color: '#b89968' }}>{slot.stats.best_win_multi}x</span>
                        </div>
                        <div className="text-center">
                          <span className="uppercase block" style={{ color: '#8a8a8a' }}>Bonus Buys</span>
                          <span className="font-bold" style={{ color: '#d4d4d4' }}>{slot.stats.total_bonus_buys}</span>
                        </div>
                        <div className="text-center">
                          <span className="uppercase block" style={{ color: '#8a8a8a' }}>Profit/Loss</span>
                          <span className="font-bold" style={{ color: slot.stats.profit_loss >= 0 ? '#10b981' : '#ef4444' }}>
                            {slot.stats.profit_loss >= 0 ? '+' : ''}{slot.stats.profit_loss.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingSlot(slot)}
                      className="flex-1 px-4 py-2.5 rounded-lg font-semibold uppercase text-xs flex items-center justify-center gap-1.5 transition-all"
                      style={{ background: '#1a1a1a', color: '#d4d4d4', border: '1px solid #3d3d3d' }}
                    >
                      <Edit2 className="w-4 h-4" />
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteSlot(slot.id)}
                      className="px-4 py-2.5 rounded-lg font-semibold uppercase text-xs flex items-center justify-center gap-1.5 transition-all"
                      style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {slots.length === 0 && !loading && (
              <div className="text-center py-12">
                <p className="uppercase" style={{ color: '#8a8a8a' }}>Nenhuma slot encontrada</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {(showAddModal || editingSlot) && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0, 0, 0, 0.8)' }}>
          <div className="rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', borderBottom: '1px solid #3d3d3d' }}>
              <h2 className="text-xl font-bold uppercase" style={{ color: '#d4d4d4' }}>
                {editingSlot ? 'Editar Slot' : 'Adicionar Slot'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingSlot(null);
                }}
                className="rounded-lg p-2 transition-all"
                style={{ color: '#d4d4d4' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 uppercase" style={{ color: '#8a8a8a' }}>Nome da Slot</label>
                  <input
                    type="text"
                    value={editingSlot ? editingSlot.name : newSlot.name}
                    onChange={(e) => editingSlot
                      ? setEditingSlot({ ...editingSlot, name: e.target.value })
                      : setNewSlot({ ...newSlot, name: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg transition-all uppercase text-sm"
                    style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 uppercase" style={{ color: '#8a8a8a' }}>Provider</label>
                  <input
                    type="text"
                    value={editingSlot ? editingSlot.provider : newSlot.provider}
                    onChange={(e) => editingSlot
                      ? setEditingSlot({ ...editingSlot, provider: e.target.value })
                      : setNewSlot({ ...newSlot, provider: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg transition-all uppercase text-sm"
                    style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 uppercase" style={{ color: '#8a8a8a' }}>Max Win</label>
                  <input
                    type="number"
                    value={editingSlot ? editingSlot.max_win : newSlot.max_win}
                    onChange={(e) => editingSlot
                      ? setEditingSlot({ ...editingSlot, max_win: parseInt(e.target.value) || 0 })
                      : setNewSlot({ ...newSlot, max_win: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 rounded-lg transition-all uppercase text-sm"
                    style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 uppercase" style={{ color: '#8a8a8a' }}>Volatilidade</label>
                  <select
                    value={editingSlot ? editingSlot.volatility : newSlot.volatility}
                    onChange={(e) => editingSlot
                      ? setEditingSlot({ ...editingSlot, volatility: e.target.value })
                      : setNewSlot({ ...newSlot, volatility: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg transition-all uppercase text-sm"
                    style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                  >
                    {volatilities.map((vol) => (
                      <option key={vol} value={vol}>{vol}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 uppercase" style={{ color: '#8a8a8a' }}>RTP (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingSlot ? editingSlot.rtp : newSlot.rtp}
                    onChange={(e) => editingSlot
                      ? setEditingSlot({ ...editingSlot, rtp: parseFloat(e.target.value) || 0 })
                      : setNewSlot({ ...newSlot, rtp: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 rounded-lg transition-all uppercase text-sm"
                    style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 uppercase" style={{ color: '#8a8a8a' }}>Theme</label>
                  <input
                    type="text"
                    value={editingSlot ? editingSlot.theme || '' : newSlot.theme}
                    onChange={(e) => editingSlot
                      ? setEditingSlot({ ...editingSlot, theme: e.target.value })
                      : setNewSlot({ ...newSlot, theme: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg transition-all uppercase text-sm"
                    style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 uppercase" style={{ color: '#8a8a8a' }}>Min Bet ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingSlot ? editingSlot.min_bet : newSlot.min_bet}
                    onChange={(e) => editingSlot
                      ? setEditingSlot({ ...editingSlot, min_bet: parseFloat(e.target.value) || 0 })
                      : setNewSlot({ ...newSlot, min_bet: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 rounded-lg transition-all uppercase text-sm"
                    style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 uppercase" style={{ color: '#8a8a8a' }}>Max Bet ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingSlot ? editingSlot.max_bet : newSlot.max_bet}
                    onChange={(e) => editingSlot
                      ? setEditingSlot({ ...editingSlot, max_bet: parseFloat(e.target.value) || 0 })
                      : setNewSlot({ ...newSlot, max_bet: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 rounded-lg transition-all uppercase text-sm"
                    style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 uppercase" style={{ color: '#8a8a8a' }}>Image URL</label>
                <input
                  type="text"
                  value={editingSlot ? editingSlot.image_url || '' : newSlot.image_url}
                  onChange={(e) => editingSlot
                    ? setEditingSlot({ ...editingSlot, image_url: e.target.value })
                    : setNewSlot({ ...newSlot, image_url: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg transition-all uppercase text-sm"
                  style={{ background: '#1a1a1a', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingSlot(null);
                  }}
                  className="flex-1 px-6 py-3 rounded-lg font-semibold uppercase text-sm transition-all"
                  style={{ background: '#1a1a1a', color: '#d4d4d4', border: '1px solid #3d3d3d' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={editingSlot ? handleUpdateSlot : handleAddSlot}
                  className="flex-1 px-6 py-3 rounded-lg font-semibold uppercase text-sm flex items-center justify-center gap-2 transition-all"
                  style={{ background: 'linear-gradient(135deg, #8b7460 0%, #a0826d 100%)', color: '#ffffff', border: '1px solid #3d3d3d' }}
                >
                  <Save className="w-4 h-4" />
                  {editingSlot ? 'Atualizar' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
