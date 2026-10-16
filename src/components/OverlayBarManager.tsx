import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CasinoManager } from './CasinoManager';

/** Local admin tokens — Top Bar settings only (not OBS overlays). */
const tb = {
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#3b82f6',
  accentSoft: '#60a5fa',
  accentMuted: 'rgba(59, 130, 246, 0.16)',
  accentBorder: 'rgba(96, 165, 250, 0.35)',
  input: '#121218',
  inputBorder: 'rgba(63, 63, 70, 0.75)',
  card: '#1c1c22',
  cardBorder: 'rgba(82, 82, 91, 0.55)',
  success: '#22c55e',
} as const;

interface BarConfig {
  nowText?: string;
  nextText?: string;
  brandLogo?: string;
  streamMode?: 'raw' | 'wager';
  logoFit?: 'contain' | 'cover';
  logoScale?: number;
  casinoLogoScale?: number;
}

interface Casino {
  id: string;
  name: string;
  thumbnail_url: string;
  is_active: boolean;
  order_index: number;
}

interface OverlayBarManagerProps {
  showOnlyButtons?: boolean;
  showOnlySelects?: boolean;
}

const fieldStyle: CSSProperties = {
  background: tb.input,
  border: `1px solid ${tb.inputBorder}`,
  color: tb.text,
};

export function OverlayBarManager({ showOnlyButtons = false, showOnlySelects = false }: OverlayBarManagerProps = {}) {
  const [isOpen, setIsOpen] = useState(true);
  const [config, setConfig] = useState<BarConfig>({
    nowText: '',
    nextText: '',
    brandLogo: '',
    streamMode: 'raw',
    logoFit: 'contain',
    logoScale: 0.8,
    casinoLogoScale: 1,
  });
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [casinos, setCasinos] = useState<Casino[]>([]);
  const [autoGameMode, setAutoGameMode] = useState(true);

  useEffect(() => {
    loadCasinos();
    loadBarOverlay();

    if (isOpen) {
      detectActiveOverlay();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      detectActiveOverlay();
    }
  }, [isOpen]);

  useEffect(() => {
    const casinosChannel = supabase
      .channel('casinos_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casinos' }, () => {
        loadCasinos();
      })
      .subscribe();

    const overlaysChannel = supabase
      .channel('overlays_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overlays' }, () => {
        if (autoGameMode) {
          detectActiveOverlay();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(casinosChannel);
      supabase.removeChannel(overlaysChannel);
    };
  }, [autoGameMode]);

  const loadBarOverlay = async () => {
    try {
      const { data, error } = await supabase.from('overlays').select('*').eq('type', 'bar').maybeSingle();

      if (error) throw error;

      if (data) {
        setOverlayId(data.id);
        setConfig({
          nowText: data.config?.nowText || '',
          nextText: data.config?.nextText || '',
          brandLogo: data.config?.brandLogo || '',
          streamMode: data.config?.streamMode || 'raw',
          logoFit: data.config?.logoFit || 'contain',
          logoScale: typeof data.config?.logoScale === 'number' ? data.config.logoScale : 0.8,
          casinoLogoScale:
            typeof data.config?.casinoLogoScale === 'number' ? data.config.casinoLogoScale : 1,
        });
      }
    } catch (error) {
      console.error('Error loading bar overlay:', error);
    }
  };

  const loadCasinos = async () => {
    try {
      const { data, error } = await supabase
        .from('casinos')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) {
        console.error('Error loading casinos:', error);
        return;
      }

      setCasinos(data || []);
    } catch (error) {
      console.error('Error loading casinos:', error);
    }
  };

  const detectActiveOverlay = async () => {
    try {
      const { data, error } = await supabase
        .from('overlays')
        .select('type, config')
        .eq('is_active', true)
        .in('type', ['bonus_opening', 'bonus_hunt', 'chill', 'fever_champions']);

      if (error) throw error;

      if (data && data.length > 0) {
        const activeOverlay = data[0];
        let gameMode = 'Opening';

        if (activeOverlay.type === 'bonus_opening') {
          gameMode = 'Opening';
        } else if (activeOverlay.type === 'bonus_hunt') {
          gameMode = 'Bonus Hunt';
        } else if (activeOverlay.type === 'chill') {
          gameMode = 'Chill';
        } else if (activeOverlay.type === 'fever_champions') {
          gameMode = 'Fever Champions';
        }

        if (autoGameMode) {
          setConfig((prev) => ({ ...prev, streamMode: gameMode as BarConfig['streamMode'] }));
          await handleSaveMode(gameMode);
        }
      }
    } catch (error) {
      console.error('Error detecting active overlay:', error);
    }
  };

  const handleSaveMode = async (mode: string) => {
    try {
      if (overlayId) {
        const { error } = await supabase
          .from('overlays')
          .update({
            config: { ...config, streamMode: mode },
            updated_at: new Date().toISOString(),
          })
          .eq('id', overlayId);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error saving mode:', error);
    }
  };

  const persistConfig = async (newConfig: BarConfig) => {
    setConfig(newConfig);
    if (!overlayId) return;
    await supabase
      .from('overlays')
      .update({
        config: newConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', overlayId);
  };

  const handleMarcaChange = async (name: string) => {
    const selectedCasino = casinos.find((c) => c.name === name);
    const newConfig = { ...config, nowText: name };
    setConfig(newConfig);

    if (selectedCasino) {
      await supabase.from('casinos').update({ is_active: false }).neq('id', selectedCasino.id);
      await supabase.from('casinos').update({ is_active: true }).eq('id', selectedCasino.id);
    }

    if (overlayId) {
      await supabase
        .from('overlays')
        .update({
          config: newConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', overlayId);
    }
  };

  // Marcas reais — nunca tratar Wager/Raw como opções de marca.
  const marcaOptions = casinos.filter((c) => {
    const n = c.name.trim().toLowerCase();
    return n !== 'wager' && n !== 'raw';
  });

  const wagerRawValue =
    (config.nextText || 'Wager').toLowerCase() === 'raw' ? 'Raw' : 'Wager';

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full mb-8 px-6 py-4 rounded-2xl font-semibold uppercase text-sm flex items-center justify-center gap-3 transition-all"
        style={{ background: tb.accent, color: '#fff' }}
      >
        <BarChart3 className="w-5 h-5" />
        Configurar Barra
      </button>
    );
  }

  if (showOnlyButtons) {
    return null;
  }

  const controls = (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 items-end">
        {/* 1. WAGER OU RAW — modos, não marcas */}
        <Control label="Wager ou Raw">
          <div
            className="flex rounded-xl overflow-hidden"
            style={{ border: `1px solid ${tb.inputBorder}` }}
            role="group"
            aria-label="Wager ou Raw"
          >
            {(['Wager', 'Raw'] as const).map((mode) => {
              const active = wagerRawValue === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void persistConfig({ ...config, nextText: mode })}
                  className="flex-1 px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors"
                  style={{
                    background: active ? tb.accentMuted : tb.input,
                    color: active ? tb.accentSoft : tb.muted,
                    borderRight: mode === 'Wager' ? `1px solid ${tb.inputBorder}` : undefined,
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </Control>

        {/* 2. MARCA */}
        <Control label="Marca">
          <select
            value={
              marcaOptions.some((c) => c.name === config.nowText)
                ? config.nowText
                : marcaOptions[0]?.name || ''
            }
            onChange={(e) => void handleMarcaChange(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2 min-w-0"
            style={fieldStyle}
            disabled={marcaOptions.length === 0}
          >
            {marcaOptions.length === 0 ? (
              <option value="">Sem marcas — adicionar abaixo</option>
            ) : (
              marcaOptions.map((casino) => (
                <option key={casino.id} value={casino.name}>
                  {casino.name}
                </option>
              ))
            )}
          </select>
        </Control>

        {/* 3. ADICIONAR MARCA */}
        <Control label="Adicionar Marca">
          <CasinoManager buttonLabel="Adicionar Marca" />
        </Control>

        {/* 4. TAMANHO DO LOGO (principal) */}
        <Control label="Tamanho do Logo">
          <div className="space-y-1.5">
            <input
              type="range"
              min={0.5}
              max={1.2}
              step={0.05}
              value={config.logoScale ?? 0.8}
              onChange={(e) =>
                void persistConfig({ ...config, logoScale: parseFloat(e.target.value) })
              }
              className="w-full"
              style={{ accentColor: tb.accent }}
              aria-label="Tamanho do Logo"
            />
            <p className="text-[11px] font-semibold tabular-nums" style={{ color: tb.muted }}>
              {Math.round((config.logoScale ?? 0.8) * 100)}%
            </p>
          </div>
        </Control>

        {/* 5. TAMANHO DO LOGO DA MARCA */}
        <Control label="Tamanho do Logo da Marca">
          <div className="space-y-1.5">
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.05}
              value={config.casinoLogoScale ?? 1}
              onChange={(e) =>
                void persistConfig({ ...config, casinoLogoScale: parseFloat(e.target.value) })
              }
              className="w-full"
              style={{ accentColor: tb.accent }}
              aria-label="Tamanho do Logo da Marca"
            />
            <p className="text-[11px] font-semibold tabular-nums" style={{ color: tb.muted }}>
              {Math.round((config.casinoLogoScale ?? 1) * 100)}%
            </p>
          </div>
        </Control>
      </div>

      {/* Game mode — controlo existente, fora da fila principal dos 5 */}
      <div
        className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end"
        style={{ background: tb.card, border: `1px solid ${tb.cardBorder}` }}
      >
        <Control label="Game Mode">
          <select
            value={(config.streamMode as string) || 'Opening'}
            onChange={(e) => {
              setAutoGameMode(false);
              void persistConfig({
                ...config,
                streamMode: e.target.value as BarConfig['streamMode'],
              });
            }}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-2"
            style={{
              ...fieldStyle,
              opacity: autoGameMode ? 0.6 : 1,
            }}
            disabled={autoGameMode}
          >
            <option value="Opening">Opening</option>
            <option value="Bonus Hunt">Bonus Hunt</option>
            <option value="Chill">Chill</option>
            <option value="Fever Champions">Fever Champions</option>
          </select>
        </Control>
        <button
          type="button"
          onClick={() => {
            setAutoGameMode(!autoGameMode);
            if (!autoGameMode) {
              detectActiveOverlay();
            }
          }}
          className="px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide whitespace-nowrap"
          style={{
            background: autoGameMode ? tb.success : tb.card,
            color: autoGameMode ? '#0f0f12' : tb.muted,
            border: `1px solid ${autoGameMode ? tb.success : tb.cardBorder}`,
          }}
        >
          {autoGameMode ? 'Auto' : 'Manual'}
        </button>
      </div>
    </div>
  );

  if (showOnlySelects) {
    return controls;
  }

  return <div className="space-y-4">{controls}</div>;
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label
        className="block text-[10px] font-bold uppercase tracking-wide mb-1.5 whitespace-nowrap"
        style={{ color: tb.muted }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
