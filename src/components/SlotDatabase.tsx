import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  Plus,
  Search,
  Star,
  TrendingUp,
  DollarSign,
  Zap,
  Award,
  Edit2,
  Trash2,
  Save,
  X,
  Database,
  LayoutGrid,
  Gamepad2,
  ArrowLeft,
  Filter,
  Coins,
} from 'lucide-react';
import { getSlotProviders, isValidHttpUrl, resolveSlotImageUrl, SLOT_FALLBACK_IMAGE } from '../lib/slots-search';

/** Local admin visual tokens — isolated to Slot Database (do not reuse on OBS overlays). */
const sd = {
  page: '#0f0f12',
  panel: '#141418',
  card: '#1c1c22',
  cardHover: '#22222a',
  cardBorder: 'rgba(82, 82, 91, 0.55)',
  input: '#121218',
  inputBorder: 'rgba(63, 63, 70, 0.75)',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#3b82f6',
  accentSoft: '#60a5fa',
  accentMuted: 'rgba(59, 130, 246, 0.16)',
  accentBorder: 'rgba(96, 165, 250, 0.35)',
  gold: '#fbbf24',
  goldMuted: 'rgba(251, 191, 36, 0.14)',
  goldBorder: 'rgba(251, 191, 36, 0.4)',
  danger: '#ef4444',
  dangerMuted: 'rgba(239, 68, 68, 0.14)',
  dangerBorder: 'rgba(239, 68, 68, 0.35)',
} as const;

interface Slot {
  id: string;
  name: string;
  provider: string;
  image_url: string | null;
  image_storage_path?: string | null;
  max_win: number;
  volatility: string;
  rtp: number;
  min_bet: number;
  max_bet: number;
  theme: string | null;
  release_date: string | null;
  features: string[];
  aliases?: string[];
  is_active?: boolean;
  feature_buy?: boolean | null;
  source_name?: string | null;
  source_url?: string | null;
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
    min_bet: 0.2,
    max_bet: 100,
    theme: '',
    release_date: '',
    features: [] as string[],
    aliasesText: '',
    is_active: true,
    feature_buy: false,
    source_name: '',
    source_url: '',
  });
  const realtimeReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSlots();

    const scheduleReload = () => {
      if (realtimeReloadTimer.current) clearTimeout(realtimeReloadTimer.current);
      realtimeReloadTimer.current = setTimeout(() => {
        loadSlots();
      }, 400);
    };

    const channel = supabase
      .channel('slots_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_stats' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_favorites' }, scheduleReload)
      .subscribe();

    return () => {
      if (realtimeReloadTimer.current) clearTimeout(realtimeReloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [currentPage, searchTerm, filterProvider, filterVolatility]);

  // Lock dashboard main scroll while slot modal is open; restore on close.
  useEffect(() => {
    const modalOpen = showAddModal || !!editingSlot;
    const main = document.querySelector<HTMLElement>('[data-dashboard-main]');
    if (!main || !modalOpen) return;

    const prevOverflowY = main.style.overflowY;
    const prevScrollTop = main.scrollTop;
    main.style.overflowY = 'hidden';

    return () => {
      main.style.overflowY = prevOverflowY;
      main.scrollTop = prevScrollTop;
    };
  }, [showAddModal, editingSlot]);

  const loadSlots = async () => {
    try {
      setLoading(true);
      let query = supabase.from('slots').select('*', { count: 'exact' });

      if (searchTerm) {
        query = query.or(
          `name.ilike.%${searchTerm}%,provider.ilike.%${searchTerm}%,search_normalized.ilike.%${searchTerm}%`
        );
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

  const parseAliases = (text: string) =>
    text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

  const validateSlotForm = (slot: {
    name: string;
    provider: string;
    rtp: number;
    min_bet: number;
    max_bet: number;
    max_win: number;
    image_url?: string | null;
  }) => {
    if (!slot.name?.trim() || !slot.provider?.trim()) {
      return 'Por favor preencha pelo menos o nome e provider da slot';
    }
    if (Number.isNaN(slot.rtp) || slot.rtp < 0 || slot.rtp > 100) {
      return 'RTP deve estar entre 0 e 100';
    }
    if (slot.min_bet < 0 || slot.max_bet < 0 || slot.max_win < 0) {
      return 'Apostas e max win não podem ser negativos';
    }
    if (slot.image_url && slot.image_url.trim() && !isValidHttpUrl(slot.image_url.trim()) && !slot.image_url.startsWith('/')) {
      return 'URL de imagem inválida (use http/https ou path local)';
    }
    return null;
  };

  const handleAddSlot = async () => {
    const validationError = validateSlotForm(newSlot);
    if (validationError) {
      alert(validationError);
      return;
    }

    try {
      const { data: duplicate } = await supabase
        .from('slots')
        .select('id')
        .ilike('name', newSlot.name.trim())
        .ilike('provider', newSlot.provider.trim())
        .maybeSingle();

      if (duplicate?.id) {
        alert('Já existe uma slot com o mesmo nome e provider');
        return;
      }

      const slotData = {
        name: newSlot.name.trim(),
        provider: newSlot.provider.trim(),
        image_url: newSlot.image_url || null,
        max_win: newSlot.max_win,
        volatility: newSlot.volatility,
        rtp: newSlot.rtp,
        min_bet: newSlot.min_bet,
        max_bet: newSlot.max_bet,
        theme: newSlot.theme || null,
        release_date: newSlot.release_date || null,
        features: newSlot.features,
        aliases: parseAliases(newSlot.aliasesText),
        is_active: newSlot.is_active,
        feature_buy: newSlot.feature_buy,
        source_name: newSlot.source_name || null,
        source_url: newSlot.source_url || null,
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
        features: [],
        aliasesText: '',
        is_active: true,
        feature_buy: false,
        source_name: '',
        source_url: '',
      });
      await loadSlots();
    } catch (error) {
      console.error('Error adding slot:', error);
      alert(`Erro ao adicionar slot: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  const handleUpdateSlot = async () => {
    if (!editingSlot) return;

    const validationError = validateSlotForm({
      name: editingSlot.name,
      provider: editingSlot.provider,
      rtp: editingSlot.rtp,
      min_bet: editingSlot.min_bet,
      max_bet: editingSlot.max_bet,
      max_win: editingSlot.max_win,
      image_url: editingSlot.image_url,
    });
    if (validationError) {
      alert(validationError);
      return;
    }

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
          aliases: editingSlot.aliases || [],
          is_active: editingSlot.is_active ?? true,
          feature_buy: editingSlot.feature_buy ?? null,
          source_name: editingSlot.source_name || null,
          source_url: editingSlot.source_url || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingSlot.id);

      if (error) throw error;

      setEditingSlot(null);
      await loadSlots();
    } catch (error) {
      console.error('Error updating slot:', error);
      alert(`Erro ao atualizar slot: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
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
      const _minBetIdx = headers.indexOf('Min Bet');
      const _maxBetIdx = headers.indexOf('Max Bet');
      const _themeIdx = headers.indexOf('Theme');
      void _minBetIdx; void _maxBetIdx; void _themeIdx;

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
    // CSV import rows are loosely typed from dynamic headers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const defaultImage = SLOT_FALLBACK_IMAGE;

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
      try {
        const uniqueProviders = await getSlotProviders();
        setProviders(uniqueProviders);
      } catch (error) {
        console.error('Error loading providers:', error);
      }
    };
    loadProviders();
  }, []);

  const [providers, setProviders] = useState<string[]>([]);

  const rangeStart = slots.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0;
  const rangeEnd = Math.min(currentPage * ITEMS_PER_PAGE, totalCount);
  const modalImageUrl = editingSlot
    ? editingSlot.image_url || ''
    : newSlot.image_url;
  const closeModal = () => {
    setShowAddModal(false);
    setEditingSlot(null);
  };

  const fieldStyle: CSSProperties = {
    background: sd.input,
    border: `1px solid ${sd.inputBorder}`,
    color: sd.text,
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8" style={{ background: sd.page, color: sd.text }}>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <header
          className="rounded-2xl px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          style={{ background: sd.panel, border: `1px solid ${sd.cardBorder}` }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: sd.goldMuted, border: `1px solid ${sd.goldBorder}` }}
            >
              <Coins className="w-5 h-5" style={{ color: sd.gold }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wide" style={{ color: sd.text }}>
                Slot Database
              </h1>
              <p className="text-sm mt-0.5" style={{ color: sd.muted }}>
                Gestão de slots, imagens e estatísticas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-colors flex-shrink-0"
            style={{
              background: 'transparent',
              color: sd.gold,
              border: `1px solid ${sd.goldBorder}`,
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao Dashboard
          </button>
        </header>

        {/* Stats — only metrics already available locally */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard icon={<LayoutGrid className="w-4 h-4" />} label="Total de slots" value={String(totalCount)} />
          <StatCard icon={<Gamepad2 className="w-4 h-4" />} label="Providers" value={String(providers.length)} />
          <StatCard icon={<Zap className="w-4 h-4" />} label="Volatilidades" value={String(volatilities.length)} />
        </div>

        {/* Filters + actions */}
        <section
          className="rounded-2xl p-4 sm:p-5 space-y-4"
          style={{ background: sd.panel, border: `1px solid ${sd.cardBorder}` }}
        >
          <div className="flex flex-col xl:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: sd.muted }}
              />
              <input
                type="text"
                placeholder="Pesquisar slot..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none"
                style={fieldStyle}
              />
            </div>

            <select
              value={filterProvider}
              onChange={(e) => {
                setFilterProvider(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-3 rounded-xl text-sm min-w-[160px]"
              style={fieldStyle}
            >
              <option value="all">Todos os Providers</option>
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>

            <select
              value={filterVolatility}
              onChange={(e) => {
                setFilterVolatility(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-3 rounded-xl text-sm min-w-[160px]"
              style={fieldStyle}
            >
              <option value="all">Todas Volatilidades</option>
              {volatilities.map((vol) => (
                <option key={vol} value={vol}>
                  {vol}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => loadSlots()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wide"
              style={{ background: sd.accent, color: '#fff', border: `1px solid ${sd.accent}` }}
            >
              <Filter className="w-3.5 h-3.5" />
              Filtrar
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2" style={{ color: sd.muted }}>
              {loading && (
                <div
                  className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-t-transparent"
                  style={{ borderColor: sd.accent, borderTopColor: 'transparent' }}
                />
              )}
              <span>
                Mostrando {rangeStart} – {rangeEnd} de {totalCount} slots
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <label
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide cursor-pointer transition-opacity"
                style={{
                  background: sd.card,
                  color: sd.text,
                  border: `1px solid ${sd.cardBorder}`,
                  opacity: importing ? 0.5 : 1,
                  pointerEvents: importing ? 'none' : 'auto',
                }}
              >
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
                type="button"
                onClick={handleRepairMissingImages}
                disabled={repairingImages || importing}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: sd.accentMuted, color: sd.accentSoft, border: `1px solid ${sd.accentBorder}` }}
              >
                <Zap className="w-3.5 h-3.5" />
                {repairingImages ? 'A reparar...' : 'Reparar Imagens'}
              </button>

              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide"
                style={{ background: sd.gold, color: '#0f0f12', border: `1px solid ${sd.gold}` }}
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Slot
              </button>
            </div>
          </div>
        </section>

        {/* Grid */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 transition-opacity ${
            loading ? 'opacity-50' : 'opacity-100'
          }`}
        >
          {slots.map((slot) => (
            <article
              key={slot.id}
              className="rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: sd.card,
                border: `1px solid ${sd.cardBorder}`,
                opacity: slot.is_active === false ? 0.65 : 1,
              }}
            >
              <div className="relative" style={{ background: sd.input }}>
                <img
                  src={resolveSlotImageUrl(slot)}
                  alt={slot.name}
                  loading="lazy"
                  className="w-full h-36 object-cover"
                  onError={(e) => {
                    e.currentTarget.src = SLOT_FALLBACK_IMAGE;
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(slot.id, slot.is_favorite || false)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg"
                  style={{
                    color: slot.is_favorite ? sd.gold : sd.muted,
                    background: 'rgba(15, 15, 18, 0.72)',
                    border: `1px solid ${slot.is_favorite ? sd.goldBorder : sd.cardBorder}`,
                  }}
                  aria-label={slot.is_favorite ? 'Remover favorito' : 'Marcar favorito'}
                >
                  <Star className="w-4 h-4" fill={slot.is_favorite ? 'currentColor' : 'none'} />
                </button>
              </div>

              <div className="p-4 flex flex-col flex-1 gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-sm leading-snug truncate" style={{ color: sd.text }} title={slot.name}>
                    {slot.name}
                  </h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color: sd.muted }}>
                    {slot.provider}
                  </p>
                  {slot.is_active === false && (
                    <p className="text-[10px] font-bold uppercase mt-1" style={{ color: sd.danger }}>
                      Inativa
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <MiniStat icon={<Award className="w-3 h-3" />} label="Max Win" value={`${slot.max_win}x`} />
                  <MiniStat icon={<Zap className="w-3 h-3" />} label="Volatilidade" value={slot.volatility} />
                  <MiniStat icon={<TrendingUp className="w-3 h-3" />} label="RTP" value={`${slot.rtp}%`} />
                  <MiniStat
                    icon={<DollarSign className="w-3 h-3" />}
                    label="Bet Range"
                    value={`$${slot.min_bet}-$${slot.max_bet}`}
                  />
                </div>

                {slot.stats && (
                  <div
                    className="rounded-xl p-3 grid grid-cols-2 gap-2 text-[11px]"
                    style={{ background: sd.input, border: `1px solid ${sd.inputBorder}` }}
                  >
                    <div>
                      <span className="block" style={{ color: sd.muted }}>
                        Sessions
                      </span>
                      <span className="font-bold" style={{ color: sd.text }}>
                        {slot.stats.total_sessions}
                      </span>
                    </div>
                    <div>
                      <span className="block" style={{ color: sd.muted }}>
                        Best Win
                      </span>
                      <span className="font-bold" style={{ color: sd.gold }}>
                        {slot.stats.best_win_multi}x
                      </span>
                    </div>
                    <div>
                      <span className="block" style={{ color: sd.muted }}>
                        Bonus Buys
                      </span>
                      <span className="font-bold" style={{ color: sd.text }}>
                        {slot.stats.total_bonus_buys}
                      </span>
                    </div>
                    <div>
                      <span className="block" style={{ color: sd.muted }}>
                        Profit/Loss
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: slot.stats.profit_loss >= 0 ? '#10b981' : sd.danger }}
                      >
                        {slot.stats.profit_loss >= 0 ? '+' : ''}
                        {slot.stats.profit_loss.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-auto pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingSlot(slot)}
                    className="flex-1 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide inline-flex items-center justify-center gap-1.5"
                    style={{ background: sd.input, color: sd.text, border: `1px solid ${sd.inputBorder}` }}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSlot(slot.id)}
                    className="px-3 py-2 rounded-xl inline-flex items-center justify-center"
                    style={{
                      background: sd.dangerMuted,
                      color: sd.danger,
                      border: `1px solid ${sd.dangerBorder}`,
                    }}
                    aria-label="Eliminar slot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {slots.length === 0 && !loading && (
          <div
            className="text-center py-14 rounded-2xl"
            style={{ background: sd.panel, border: `1px solid ${sd.cardBorder}`, color: sd.muted }}
          >
            Nenhuma slot encontrada
          </div>
        )}

        {/* Pagination */}
        <div
          className="rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{ background: sd.panel, border: `1px solid ${sd.cardBorder}` }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: sd.muted }}>
            Página {currentPage} / {Math.max(totalPages, 1)} · {ITEMS_PER_PAGE} por página
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: sd.card, color: sd.text, border: `1px solid ${sd.cardBorder}` }}
            >
              Anterior
            </button>
            <div
              className="px-4 py-2 rounded-xl text-xs font-black flex items-center"
              style={{ background: sd.accentMuted, color: sd.accentSoft, border: `1px solid ${sd.accentBorder}` }}
            >
              {currentPage}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: sd.card, color: sd.text, border: `1px solid ${sd.cardBorder}` }}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {(showAddModal || editingSlot) && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0, 0, 0, 0.72)' }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div
            className="w-full sm:max-w-3xl max-h-[92dvh] sm:max-h-[92vh] flex flex-col min-h-0 rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{ background: sd.panel, border: `1px solid ${sd.cardBorder}` }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div
              className="flex-shrink-0 px-5 py-4 flex items-start justify-between gap-3"
              style={{ borderBottom: `1px solid ${sd.cardBorder}` }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: sd.goldMuted, border: `1px solid ${sd.goldBorder}` }}
                >
                  {editingSlot ? (
                    <Edit2 className="w-4 h-4" style={{ color: sd.gold }} />
                  ) : (
                    <Plus className="w-4 h-4" style={{ color: sd.gold }} />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-black uppercase tracking-wide" style={{ color: sd.text }}>
                    {editingSlot ? 'Editar Slot' : 'Adicionar Slot'}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: sd.muted }}>
                    {editingSlot
                      ? 'Atualizar dados da slot no catálogo'
                      : 'Registar uma nova slot no catálogo'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 rounded-lg"
                style={{ color: sd.muted }}
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 ${
                editingSlot ? 'py-5 space-y-6' : 'py-4 space-y-4'
              }`}
            >
              <FormSection icon={<Database className="w-3.5 h-3.5" />} title="Informações básicas">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Nome da Slot">
                    <input
                      type="text"
                      value={editingSlot ? editingSlot.name : newSlot.name}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, name: e.target.value })
                          : setNewSlot({ ...newSlot, name: e.target.value })
                      }
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                      style={fieldStyle}
                    />
                  </Field>
                  <Field label="Provider">
                    <input
                      type="text"
                      value={editingSlot ? editingSlot.provider : newSlot.provider}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, provider: e.target.value })
                          : setNewSlot({ ...newSlot, provider: e.target.value })
                      }
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                      style={fieldStyle}
                    />
                  </Field>
                  <Field label="Max Win">
                    <input
                      type="number"
                      value={editingSlot ? editingSlot.max_win : newSlot.max_win}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, max_win: parseInt(e.target.value) || 0 })
                          : setNewSlot({ ...newSlot, max_win: parseInt(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                      style={fieldStyle}
                    />
                  </Field>
                  <Field label="Volatilidade">
                    <select
                      value={editingSlot ? editingSlot.volatility : newSlot.volatility}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, volatility: e.target.value })
                          : setNewSlot({ ...newSlot, volatility: e.target.value })
                      }
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                      style={fieldStyle}
                    >
                      {volatilities.map((vol) => (
                        <option key={vol} value={vol}>
                          {vol}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="RTP (%)">
                    <input
                      type="number"
                      step="0.01"
                      value={editingSlot ? editingSlot.rtp : newSlot.rtp}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, rtp: parseFloat(e.target.value) || 0 })
                          : setNewSlot({ ...newSlot, rtp: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                      style={fieldStyle}
                    />
                  </Field>
                  {editingSlot && (
                    <Field label="Theme">
                      <input
                        type="text"
                        value={editingSlot.theme || ''}
                        onChange={(e) =>
                          setEditingSlot({ ...editingSlot, theme: e.target.value })
                        }
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                        style={fieldStyle}
                      />
                    </Field>
                  )}
                </div>
              </FormSection>

              <FormSection icon={<DollarSign className="w-3.5 h-3.5" />} title="Apostas">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Min Bet ($)">
                    <input
                      type="number"
                      step="0.01"
                      value={editingSlot ? editingSlot.min_bet : newSlot.min_bet}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, min_bet: parseFloat(e.target.value) || 0 })
                          : setNewSlot({ ...newSlot, min_bet: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                      style={fieldStyle}
                    />
                  </Field>
                  <Field label="Max Bet ($)">
                    <input
                      type="number"
                      step="0.01"
                      value={editingSlot ? editingSlot.max_bet : newSlot.max_bet}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, max_bet: parseFloat(e.target.value) || 0 })
                          : setNewSlot({ ...newSlot, max_bet: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                      style={fieldStyle}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection icon={<Award className="w-3.5 h-3.5" />} title="Imagem">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3 items-start">
                  <Field label="Image URL">
                    <input
                      type="text"
                      value={modalImageUrl}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, image_url: e.target.value })
                          : setNewSlot({ ...newSlot, image_url: e.target.value })
                      }
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                      style={fieldStyle}
                    />
                  </Field>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: sd.muted }}>
                      Pré-visualização
                    </div>
                    <div
                      className="rounded-xl overflow-hidden h-[72px] flex items-center justify-center"
                      style={{ background: sd.input, border: `1px solid ${sd.inputBorder}` }}
                    >
                      {modalImageUrl.trim() ? (
                        <img
                          src={modalImageUrl.trim()}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = SLOT_FALLBACK_IMAGE;
                          }}
                        />
                      ) : (
                        <span className="text-[10px]" style={{ color: sd.muted }}>
                          —
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection icon={<Zap className="w-3.5 h-3.5" />} title="Configurações">
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: sd.text }}>
                    <input
                      type="checkbox"
                      checked={editingSlot ? editingSlot.is_active !== false : newSlot.is_active}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, is_active: e.target.checked })
                          : setNewSlot({ ...newSlot, is_active: e.target.checked })
                      }
                      className="w-4 h-4 rounded accent-blue-500"
                    />
                    Ativa
                  </label>
                  <label className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: sd.text }}>
                    <input
                      type="checkbox"
                      checked={editingSlot ? Boolean(editingSlot.feature_buy) : newSlot.feature_buy}
                      onChange={(e) =>
                        editingSlot
                          ? setEditingSlot({ ...editingSlot, feature_buy: e.target.checked })
                          : setNewSlot({ ...newSlot, feature_buy: e.target.checked })
                      }
                      className="w-4 h-4 rounded accent-blue-500"
                    />
                    Feature Buy
                  </label>
                </div>
              </FormSection>

              {editingSlot && (
                <FormSection icon={<Search className="w-3.5 h-3.5" />} title="Informações avançadas">
                  <div className="space-y-3">
                    <Field label="Aliases (separados por vírgula)">
                      <input
                        type="text"
                        value={(editingSlot.aliases || []).join(', ')}
                        onChange={(e) =>
                          setEditingSlot({ ...editingSlot, aliases: parseAliases(e.target.value) })
                        }
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                        style={fieldStyle}
                        placeholder="GOO 1000, gates 1000"
                      />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Source Name">
                        <input
                          type="text"
                          value={editingSlot.source_name || ''}
                          onChange={(e) =>
                            setEditingSlot({ ...editingSlot, source_name: e.target.value })
                          }
                          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                          style={fieldStyle}
                        />
                      </Field>
                      <Field label="Source URL">
                        <input
                          type="text"
                          value={editingSlot.source_url || ''}
                          onChange={(e) =>
                            setEditingSlot({ ...editingSlot, source_url: e.target.value })
                          }
                          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
                          style={fieldStyle}
                        />
                      </Field>
                    </div>
                  </div>
                </FormSection>
              )}
            </div>

            <div
              className="flex-shrink-0 px-5 py-4 flex flex-col-reverse sm:flex-row gap-2"
              style={{ borderTop: `1px solid ${sd.cardBorder}`, background: sd.panel }}
            >
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wide"
                style={{ background: sd.card, color: sd.text, border: `1px solid ${sd.cardBorder}` }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={editingSlot ? handleUpdateSlot : handleAddSlot}
                className="flex-1 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wide inline-flex items-center justify-center gap-2"
                style={{ background: sd.gold, color: '#0f0f12', border: `1px solid ${sd.gold}` }}
              >
                <Save className="w-3.5 h-3.5" />
                {editingSlot ? 'Atualizar' : 'Adicionar Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
      style={{ background: sd.panel, border: `1px solid ${sd.cardBorder}` }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: sd.accentMuted, color: sd.accentSoft, border: `1px solid ${sd.accentBorder}` }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: sd.muted }}>
          {label}
        </div>
        <div className="text-xl font-black truncate" style={{ color: sd.text }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-xl px-2.5 py-2 text-center"
      style={{ background: sd.input, border: `1px solid ${sd.inputBorder}` }}
    >
      <div className="flex items-center justify-center gap-1 mb-0.5" style={{ color: sd.muted }}>
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xs font-bold truncate" style={{ color: sd.text }} title={value}>
        {value}
      </p>
    </div>
  );
}

function FormSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: sd.accentSoft }}>{icon}</span>
        <h3 className="text-[11px] font-black uppercase tracking-widest" style={{ color: sd.accentSoft }}>
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span
        className="block text-[10px] font-bold uppercase tracking-wide mb-1.5"
        style={{ color: sd.muted }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
