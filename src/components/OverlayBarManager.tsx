import { useState, useEffect } from 'react';
import { Save, Type, Image as ImageIcon, TrendingUp, Upload, Check, Trash2, X, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

export function OverlayBarManager({ showOnlyButtons = false, showOnlySelects = false }: OverlayBarManagerProps = {}) {
  const [isOpen, setIsOpen] = useState(true);
  const [config, setConfig] = useState<BarConfig>({
    nowText: '',
    nextText: '',
    brandLogo: '',
    streamMode: 'raw',
    logoFit: 'contain',
    logoScale: 0.8,
    casinoLogoScale: 1
  });
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [casinos, setCasinos] = useState<Casino[]>([]);
  const [autoGameMode, setAutoGameMode] = useState(true);

  useEffect(() => {
    // Always load casinos on mount
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'casinos' },
        () => {
          loadCasinos();
        }
      )
      .subscribe();

    const overlaysChannel = supabase
      .channel('overlays_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'overlays' },
        () => {
          if (autoGameMode) {
            detectActiveOverlay();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(casinosChannel);
      supabase.removeChannel(overlaysChannel);
    };
  }, [autoGameMode]);

  const loadBarOverlay = async () => {
    try {
      const { data, error } = await supabase
        .from('overlays')
        .select('*')
        .eq('type', 'bar')
        .maybeSingle();

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
          casinoLogoScale: typeof data.config?.casinoLogoScale === 'number' ? data.config.casinoLogoScale : 1
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
      
      console.log('Casinos loaded:', data);
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
          setConfig(prev => ({ ...prev, streamMode: gameMode as any }));
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
            updated_at: new Date().toISOString()
          })
          .eq('id', overlayId);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error saving mode:', error);
    }
  };


  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    try {
      if (overlayId) {
        const { error } = await supabase
          .from('overlays')
          .update({
            config: config,
            updated_at: new Date().toISOString()
          })
          .eq('id', overlayId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('overlays')
          .insert({
            type: 'bar',
            name: 'Barra Principal',
            config: config,
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;
        setOverlayId(data.id);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Erro ao guardar configuração');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full mb-8 px-6 py-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-2xl font-semibold uppercase text-sm flex items-center justify-center gap-3 hover:from-red-600 hover:to-red-700 transition-all shadow-lg hover:shadow-xl"
      >
        <BarChart3 className="w-5 h-5" />
        Configurar Barra
      </button>
    );
  }

  if (showOnlyButtons) {
    return null;
  }

  if (showOnlySelects) {
    return (
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#8a8a8a' }}>Casino</label>
          <select
            value={config.nowText || (casinos.length > 0 ? casinos[0].name : '')}
            onChange={async (e) => {
              const selectedCasino = casinos.find(c => c.name === e.target.value);
              const newConfig = { ...config, nowText: e.target.value };
              setConfig(newConfig);

              if (selectedCasino) {
                await supabase
                  .from('casinos')
                  .update({ is_active: false })
                  .neq('id', selectedCasino.id);

                await supabase
                  .from('casinos')
                  .update({ is_active: true })
                  .eq('id', selectedCasino.id);
              }

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              background: '#1f1f1f',
              border: '1px solid #3a3a3a',
              color: '#d4d4d4'
            }}
            disabled={casinos.length === 0}
          >
            {casinos.length === 0 ? (
              <option value="">No casinos - Add one in "Manage Casinos"</option>
            ) : (
              casinos.map(casino => (
                <option key={casino.id} value={casino.name}>{casino.name}</option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#8a8a8a' }}>Type</label>
          <select
            value={config.nextText || 'Wager'}
            onChange={async (e) => {
              const newConfig = { ...config, nextText: e.target.value };
              setConfig(newConfig);

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              background: '#1f1f1f',
              border: '1px solid #3a3a3a',
              color: '#d4d4d4'
            }}
          >
            <option value="Wager">Wager</option>
            <option value="Raw">Raw</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#8a8a8a' }}>Fever Logo Size</label>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.05}
            value={config.logoScale ?? 0.8}
            onChange={async (e) => {
              const newScale = parseFloat(e.target.value);
              const newConfig = { ...config, logoScale: newScale };
              setConfig(newConfig);

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full"
            style={{ accentColor: '#6366f1', background: '#1f1f1f' }}
          />
          <div className="text-xs text-gray-400 mt-1">{Math.round((config.logoScale ?? 0.8) * 100)}%</div>

          <label className="block text-sm font-medium mb-2 mt-4" style={{ color: '#8a8a8a' }}>Casino Logo Size</label>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.05}
            value={config.casinoLogoScale ?? 1}
            onChange={async (e) => {
              const newScale = parseFloat(e.target.value);
              const newConfig = { ...config, casinoLogoScale: newScale };
              setConfig(newConfig);

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full"
            style={{ accentColor: '#6366f1', background: '#1f1f1f' }}
          />
          <div className="text-xs text-gray-400 mt-1">{Math.round((config.casinoLogoScale ?? 1) * 100)}%</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium" style={{ color: '#8a8a8a' }}>Game Mode</label>
            <button
              onClick={() => {
                setAutoGameMode(!autoGameMode);
                if (!autoGameMode) {
                  detectActiveOverlay();
                }
              }}
              className="text-xs px-2 py-1 rounded"
              style={{
                background: autoGameMode ? '#22c55e' : '#3a3a3a',
                color: autoGameMode ? '#000' : '#8a8a8a'
              }}
            >
              {autoGameMode ? 'Auto' : 'Manual'}
            </button>
          </div>
          <select
            value={config.streamMode || 'Opening'}
            onChange={async (e) => {
              setAutoGameMode(false);
              const newConfig = { ...config, streamMode: e.target.value as 'raw' | 'wager' };
              setConfig(newConfig);

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              background: '#1f1f1f',
              border: '1px solid #3a3a3a',
              color: '#d4d4d4',
              opacity: autoGameMode ? 0.6 : 1
            }}
            disabled={autoGameMode}
          >
            <option value="Opening">Opening</option>
            <option value="Bonus Hunt">Bonus Hunt</option>
            <option value="Chill">Chill</option>
            <option value="Fever Champions">Fever Champions</option>
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#8a8a8a' }}>Casino</label>
          <select
            value={config.nowText || (casinos.length > 0 ? casinos[0].name : '')}
            onChange={async (e) => {
              const selectedCasino = casinos.find(c => c.name === e.target.value);
              const newConfig = { ...config, nowText: e.target.value };
              setConfig(newConfig);

              if (selectedCasino) {
                await supabase
                  .from('casinos')
                  .update({ is_active: false })
                  .neq('id', selectedCasino.id);

                await supabase
                  .from('casinos')
                  .update({ is_active: true })
                  .eq('id', selectedCasino.id);
              }

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              background: '#1f1f1f',
              border: '1px solid #3a3a3a',
              color: '#d4d4d4'
            }}
          >
            {casinos.map(casino => (
              <option key={casino.id} value={casino.name}>{casino.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#8a8a8a' }}>Type</label>
          <select
            value={config.nextText || 'Wager'}
            onChange={async (e) => {
              const newConfig = { ...config, nextText: e.target.value };
              setConfig(newConfig);

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              background: '#1f1f1f',
              border: '1px solid #3a3a3a',
              color: '#d4d4d4'
            }}
          >
            <option value="Wager">Wager</option>
            <option value="Raw">Raw</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#8a8a8a' }}>Fever Logo Size</label>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.05}
            value={config.logoScale ?? 0.8}
            onChange={async (e) => {
              const newScale = parseFloat(e.target.value);
              const newConfig = { ...config, logoScale: newScale };
              setConfig(newConfig);

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full"
            style={{ accentColor: '#6366f1', background: '#1f1f1f' }}
          />
          <div className="text-xs text-gray-400 mt-1">{Math.round((config.logoScale ?? 0.8) * 100)}%</div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#8a8a8a' }}>Casino Logo Size</label>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.05}
            value={config.casinoLogoScale ?? 1}
            onChange={async (e) => {
              const newScale = parseFloat(e.target.value);
              const newConfig = { ...config, casinoLogoScale: newScale };
              setConfig(newConfig);

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full"
            style={{ accentColor: '#6366f1', background: '#1f1f1f' }}
          />
          <div className="text-xs text-gray-400 mt-1">{Math.round((config.casinoLogoScale ?? 1) * 100)}%</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium" style={{ color: '#8a8a8a' }}>Game Mode</label>
            <button
              onClick={() => {
                setAutoGameMode(!autoGameMode);
                if (!autoGameMode) {
                  detectActiveOverlay();
                }
              }}
              className="text-xs px-2 py-1 rounded"
              style={{
                background: autoGameMode ? '#22c55e' : '#3a3a3a',
                color: autoGameMode ? '#000' : '#8a8a8a'
              }}
            >
              {autoGameMode ? 'Auto' : 'Manual'}
            </button>
          </div>
          <select
            value={config.streamMode || 'Opening'}
            onChange={async (e) => {
              setAutoGameMode(false);
              const newConfig = { ...config, streamMode: e.target.value as 'raw' | 'wager' };
              setConfig(newConfig);

              if (overlayId) {
                await supabase
                  .from('overlays')
                  .update({
                    config: newConfig,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', overlayId);
              }
            }}
            className="w-full px-4 py-3 rounded-lg text-sm"
            style={{
              background: '#1f1f1f',
              border: '1px solid #3a3a3a',
              color: '#d4d4d4',
              opacity: autoGameMode ? 0.6 : 1
            }}
            disabled={autoGameMode}
          >
            <option value="Opening">Opening</option>
            <option value="Bonus Hunt">Bonus Hunt</option>
            <option value="Chill">Chill</option>
            <option value="Fever Champions">Fever Champions</option>
          </select>
        </div>
      </div>
    </div>
  );
}
