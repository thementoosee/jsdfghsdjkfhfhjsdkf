import { LayoutDashboard, Layers, Gift, Package, Coffee, MessageSquare, Copy, ExternalLink, Check, Database, BarChart3, Trophy, Brackets, Zap, ArrowLeft } from 'lucide-react';
import { useState, useEffect, Suspense, lazy } from 'react';
import { supabase, Overlay, OverlayType } from '../lib/supabase';

const OverlayBarManager = lazy(() => import('./OverlayBarManager').then((m) => ({ default: m.OverlayBarManager })));
const BonusHuntWorkspace = lazy(() => import('./bonus-hunt/BonusHuntWorkspace').then((m) => ({ default: m.BonusHuntWorkspace })));
const SlotDatabase = lazy(() => import('./SlotDatabase').then((m) => ({ default: m.SlotDatabase })));
const ChillSessionManager = lazy(() => import('./ChillSessionManager').then((m) => ({ default: m.ChillSessionManager })));
const Statistics = lazy(() => import('./Statistics').then((m) => ({ default: m.Statistics })));
const FeverChampionsManager = lazy(() => import('./FeverChampionsManager').then((m) => ({ default: m.FeverChampionsManager })));
const StreamElementsIntegration = lazy(() => import('./StreamElementsIntegration').then((m) => ({ default: m.StreamElementsIntegration })));
const TwitchIntegration = lazy(() => import('./TwitchIntegration').then((m) => ({ default: m.TwitchIntegration })));
const GiveawayManager = lazy(() => import('./GiveawayManager').then((m) => ({ default: m.GiveawayManager })));
const CasinoManager = lazy(() => import('./CasinoManager'));

type FullscreenView = 'bar' | 'chill' | 'bonus' | 'fever' | 'giveaway' | null;
type PanelPage = 'bonus' | 'fever' | 'giveaway' | 'chill' | 'twitch' | 'streamelements' | 'database' | 'stats' | 'live_preview' | null;

export function Dashboard() {
  const [overlaysByType, setOverlaysByType] = useState<Record<string, Overlay[]>>({});
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fullscreenView, setFullscreenView] = useState<FullscreenView>(null);
  const [activePanelPage, setActivePanelPage] = useState<PanelPage>(null);
  const [previewOverlayType, setPreviewOverlayType] = useState<OverlayType>('main_stream');

  const sectionLoader = (
    <div className="py-10 text-center text-sm text-slate-400 uppercase tracking-wide">A carregar...</div>
  );

  const overlayTypes = [
    {
      id: 'main_stream',
      title: 'Main Stream',
      description: 'Overlay principal da stream',
      icon: LayoutDashboard,
      color: '#10B981'
    },
    {
      id: 'bar',
      title: 'Barra',
      description: 'Configure a barra de informações da stream',
      icon: LayoutDashboard,
      color: '#EF4444'
    },
    {
      id: 'background',
      title: 'Fundo',
      description: 'Personalize o fundo da sua stream',
      icon: Layers,
      color: '#3B82F6'
    },
    {
      id: 'chat',
      title: 'Chat',
      description: 'Chat box para a sua stream',
      icon: MessageSquare,
      color: '#EC4899'
    },
    {
      id: 'alerts',
      title: 'Alertas',
      description: 'Alertas de follows, subs, raids',
      icon: Zap,
      color: '#3B82F6'
    },
    {
      id: 'bonus_hunt',
      title: 'Bonus Hunt',
      description: 'Overlay para sessões de bonus hunt',
      icon: Gift,
      color: '#10B981'
    },
    {
      id: 'bonus_opening',
      title: 'Bonus Opening',
      description: 'Tela para abertura de bônus',
      icon: Package,
      color: '#F59E0B'
    },
    {
      id: 'chill',
      title: 'Chill',
      description: 'Modo relaxado para momentos tranquilos',
      icon: Coffee,
      color: '#8B5CF6'
    },
    {
      id: 'fever_champions',
      title: 'Fever Champions League',
      description: 'Competição de slots',
      icon: Trophy,
      color: '#EAB308'
    },
    {
      id: 'fever_bracket',
      title: 'Fever Champions League Bracket',
      description: 'Bracket do torneio de eliminação',
      icon: Brackets,
      color: '#F97316'
    },
    {
      id: 'fever_groups',
      title: 'Fever Champions League Groups',
      description: 'Grupos da fase de grupos',
      icon: Trophy,
      color: '#06B6D4'
    }
  ];

  useEffect(() => {
    loadAllOverlays();

    const channel = supabase
      .channel('overlays_dashboard_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'overlays' },
        () => {
          loadAllOverlays();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAllOverlays = async () => {
    try {
      const { data, error } = await supabase
        .from('overlays')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const grouped = (data || []).reduce((acc, overlay) => {
        if (!acc[overlay.type]) {
          acc[overlay.type] = [];
        }
        acc[overlay.type].push(overlay);
        return acc;
      }, {} as Record<string, Overlay[]>);

      setOverlaysByType(grouped);

      await ensureDefaultOverlaysExist();
    } catch (error) {
      console.error('Error loading overlays:', error);
    } finally {
      setLoading(false);
    }
  };

  const ensureDefaultOverlaysExist = async () => {
    try {
      const requiredTypes: { type: OverlayType; name: string }[] = [
        { type: 'bonus_hunt', name: 'Bonus Hunt Principal' },
        { type: 'bonus_opening', name: 'Bonus Opening Principal' },
        { type: 'chill', name: 'Chill Principal' },
        { type: 'fever_champions', name: 'Fever Champions Principal' }
      ];

      for (const { type, name } of requiredTypes) {
        const { data: existing } = await supabase
          .from('overlays')
          .select('id')
          .eq('type', type)
          .maybeSingle();

        if (!existing) {
          await supabase
            .from('overlays')
            .insert({
              type,
              name,
              config: {},
              is_active: type === 'chill'
            });
        }
      }
    } catch (error) {
      console.error('Error ensuring default overlays exist:', error);
    }
  };

  const getOverlayUrl = (id: string) => {
    return `${window.location.origin}/overlay/${id}`;
  };

  const copyToClipboard = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = getOverlayUrl(id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const openOverlay = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = getOverlayUrl(id);
    window.open(url, '_blank');
  };

  const getOrCreateDefaultOverlay = async (type: OverlayType, typeName: string) => {
    try {
      let { data: existing, error: fetchError } = await supabase
        .from('overlays')
        .select('*')
        .eq('type', type)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        return existing;
      }

      const { data, error } = await supabase
        .from('overlays')
        .insert({
          type: type,
          name: `${typeName} Principal`,
          config: {},
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      await loadAllOverlays();
      return data;
    } catch (error) {
      console.error('Error creating overlay:', error);
      alert('Erro ao criar overlay');
      return null;
    }
  };

  const handleCopyLink = async (type: OverlayType, typeName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const overlay = await getOrCreateDefaultOverlay(type, typeName);
    if (overlay) {
      copyToClipboard(overlay.id, e);
    }
  };

  const handleOpenOverlay = async (type: OverlayType, typeName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const overlay = await getOrCreateDefaultOverlay(type, typeName);
    if (overlay) {
      const url = getOverlayUrl(overlay.id);
      window.open(url, '_blank');
    }
  };

  const panelPageTitles: Record<Exclude<PanelPage, null>, string> = {
    bonus: 'Bonus Hunt / Opening',
    fever: 'Fever Champions League',
    giveaway: 'Giveaways',
    chill: 'Chill',
    twitch: 'Twitch Integration',
    streamelements: 'StreamElements',
    database: 'Slots Database',
    stats: 'Statistics',
    live_preview: 'Live Preview (OBS)'
  };

  const previewOverlay = overlaysByType[previewOverlayType]?.[0] || null;

  const renderPanelPage = () => {
    if (activePanelPage === 'bonus') {
      return <Suspense fallback={sectionLoader}><BonusHuntWorkspace /></Suspense>;
    }
    if (activePanelPage === 'chill') {
      return <Suspense fallback={sectionLoader}><ChillSessionManager /></Suspense>;
    }
    if (activePanelPage === 'fever') {
      return <Suspense fallback={sectionLoader}><FeverChampionsManager /></Suspense>;
    }
    if (activePanelPage === 'database') {
      return <Suspense fallback={sectionLoader}><SlotDatabase /></Suspense>;
    }
    if (activePanelPage === 'giveaway') {
      return <Suspense fallback={sectionLoader}><GiveawayManager /></Suspense>;
    }
    if (activePanelPage === 'streamelements') {
      return <Suspense fallback={sectionLoader}><StreamElementsIntegration /></Suspense>;
    }
    if (activePanelPage === 'twitch') {
      return <Suspense fallback={sectionLoader}><TwitchIntegration /></Suspense>;
    }
    if (activePanelPage === 'stats') {
      return <Suspense fallback={sectionLoader}><Statistics /></Suspense>;
    }
    if (activePanelPage === 'live_preview') {
      return (
        <div className="space-y-4">
          <div className="rounded-lg p-4" style={{ background: '#1f1f1f', border: '1px solid #3a3a3a' }}>
            <h3 className="text-sm font-bold uppercase mb-3" style={{ color: '#d4d4d4' }}>Overlay to preview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {overlayTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setPreviewOverlayType(type.id as OverlayType)}
                  className="rounded-md p-2 text-xs uppercase font-medium transition-all text-left"
                  style={{
                    background: previewOverlayType === type.id ? 'linear-gradient(135deg, #8b7460 0%, #a0826d 100%)' : '#2a2a2a',
                    border: '1px solid #3d3d3d',
                    color: '#d4d4d4'
                  }}
                >
                  {type.title}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg p-4" style={{ background: '#1f1f1f', border: '1px solid #3a3a3a' }}>
            {previewOverlay ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>{previewOverlay.name}</h3>
                  <button
                    onClick={(e) => openOverlay(previewOverlay.id, e)}
                    className="px-3 py-1.5 rounded text-xs uppercase font-medium flex items-center gap-2"
                    style={{ background: 'linear-gradient(135deg, #8b7460 0%, #a0826d 100%)', color: '#fff' }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open tab
                  </button>
                </div>

                <div className="w-full overflow-hidden rounded-lg" style={{ border: '1px solid #3a3a3a', aspectRatio: '16 / 9' }}>
                  <iframe
                    src={getOverlayUrl(previewOverlay.id)}
                    title="Live Preview"
                    className="w-full h-full bg-black"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm" style={{ color: '#8a8a8a' }}>No overlay found for this type yet.</p>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const activateOverlay = async (type: 'bonus_hunt' | 'bonus_opening' | 'chill' | 'fever_champions') => {
    try {
      console.log('[Dashboard] Activating overlay:', type);

      const overlayTypes = ['bonus_hunt', 'bonus_opening', 'chill', 'fever_champions'];

      for (const overlayType of overlayTypes) {
        const shouldBeActive = overlayType === type;

        await supabase
          .from('overlays')
          .update({ is_active: shouldBeActive })
          .eq('type', overlayType);
      }

      console.log('[Dashboard] Clearing all show_on_main_overlay flags...');
      await supabase.from('chill_sessions').update({ show_on_main_overlay: false }).neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('bonus_hunts').update({ show_on_main_overlay: false }).neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('bonus_openings').update({ show_on_main_overlay: false }).neq('id', '00000000-0000-0000-0000-000000000000');

      console.log('[Dashboard] Setting show_on_main_overlay for type:', type);
      if (type === 'chill') {
        const { data: activeChill } = await supabase
          .from('chill_sessions')
          .select('id')
          .is('ended_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeChill) {
          console.log('[Dashboard] Activating chill session:', activeChill.id);
          await supabase
            .from('chill_sessions')
            .update({ show_on_main_overlay: true })
            .eq('id', activeChill.id);
        }
      } else if (type === 'bonus_hunt') {
        const { data: activeHunt } = await supabase
          .from('bonus_hunts')
          .select('id')
          .in('status', ['active', 'opening'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeHunt) {
          console.log('[Dashboard] Activating bonus hunt:', activeHunt.id);
          await supabase
            .from('bonus_hunts')
            .update({ show_on_main_overlay: true })
            .eq('id', activeHunt.id);
        }
      } else if (type === 'bonus_opening') {
        const { data: activeOpening } = await supabase
          .from('bonus_openings')
          .select('id')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeOpening) {
          console.log('[Dashboard] Activating bonus opening:', activeOpening.id);
          await supabase
            .from('bonus_openings')
            .update({ show_on_main_overlay: true })
            .eq('id', activeOpening.id);
        }
      }

      console.log('[Dashboard] Activation complete');
      await loadAllOverlays();
    } catch (error) {
      console.error('Error activating overlay:', error);
    }
  };

  const ensureChillActive = async () => {
    try {
      const { data, error } = await supabase
        .from('overlays')
        .select('type, is_active')
        .in('type', ['bonus_hunt', 'bonus_opening', 'fever_champions'])
        .eq('is_active', true);

      if (error) throw error;

      if (!data || data.length === 0) {
        await supabase
          .from('overlays')
          .update({ is_active: true })
          .eq('type', 'chill');

        await loadAllOverlays();
      }
    } catch (error) {
      console.error('Error ensuring chill active:', error);
    }
  };

  useEffect(() => {
    if (!loading) {
      ensureChillActive();
    }
  }, [loading]);

  if (fullscreenView) {
    return (
      <div className="min-h-screen h-screen overflow-y-auto" style={{ background: 'linear-gradient(to bottom, #1a1a1a 0%, #0f0f0f 100%)' }}>
        <header className="sticky top-0 z-50 px-6 py-3 border-b" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', borderColor: '#3a3a3a' }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center">
              <button
                onClick={() => setFullscreenView(null)}
                className="hover:opacity-80 transition-opacity"
              >
                <img src="/logofever.png" alt="Fever Logo" className="h-6" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFullscreenView('bar')}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1"
                style={{
                  background: fullscreenView === 'bar' ? 'linear-gradient(135deg, #8b7460 0%, #a0826d 100%)' : 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)',
                  border: '1px solid #3d3d3d',
                  color: fullscreenView === 'bar' ? '#ffffff' : '#d4d4d4'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <LayoutDashboard className="w-4 h-4" />
                Barra
              </button>

              <button
                onClick={() => {
                  setFullscreenView('chill');
                  activateOverlay('chill');
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1"
                style={{
                  background: fullscreenView === 'chill' ? 'linear-gradient(135deg, #8b7460 0%, #a0826d 100%)' : 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)',
                  border: '1px solid #3d3d3d',
                  color: fullscreenView === 'chill' ? '#ffffff' : '#d4d4d4'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <Coffee className="w-4 h-4" />
                Chill
              </button>

              <button
                onClick={() => {
                  setFullscreenView('bonus');
                  activateOverlay('bonus_hunt');
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1"
                style={{
                  background: fullscreenView === 'bonus' ? 'linear-gradient(135deg, #8b7460 0%, #a0826d 100%)' : 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)',
                  border: '1px solid #3d3d3d',
                  color: fullscreenView === 'bonus' ? '#ffffff' : '#d4d4d4'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <Gift className="w-4 h-4" />
                Hunt
              </button>

              <button
                onClick={() => {
                  setFullscreenView('fever');
                  activateOverlay('fever_champions');
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1"
                style={{
                  background: fullscreenView === 'fever' ? 'linear-gradient(135deg, #8b7460 0%, #a0826d 100%)' : 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)',
                  border: '1px solid #3d3d3d',
                  color: fullscreenView === 'fever' ? '#ffffff' : '#d4d4d4'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <Trophy className="w-4 h-4" />
                Fever
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
          <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', border: '1px solid #3a3a3a' }}>
            {fullscreenView === 'bar' && <Suspense fallback={sectionLoader}><OverlayBarManager /></Suspense>}
            {fullscreenView === 'chill' && <Suspense fallback={sectionLoader}><ChillSessionManager /></Suspense>}
            {fullscreenView === 'bonus' && <Suspense fallback={sectionLoader}><BonusHuntWorkspace /></Suspense>}
            {fullscreenView === 'fever' && <Suspense fallback={sectionLoader}><FeverChampionsManager /></Suspense>}
            {fullscreenView === 'giveaway' && <Suspense fallback={sectionLoader}><GiveawayManager /></Suspense>}
          </div>
        </div>
      </div>
    );
  }

  if (activePanelPage) {
    return (
      <div className="min-h-screen h-screen overflow-y-auto" style={{ background: 'linear-gradient(to bottom, #1a1a1a 0%, #0f0f0f 100%)' }}>
        <header className="sticky top-0 z-50 px-3 md:px-6 py-3 border-b" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', borderColor: '#3a3a3a' }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActivePanelPage(null)}
                className="px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
              >
                <ArrowLeft className="w-4 h-4" />
                Main Page
              </button>
              <h1 className="text-sm md:text-base font-bold uppercase" style={{ color: '#d4d4d4' }}>
                {panelPageTitles[activePanelPage]}
              </h1>
            </div>

            <button
              onClick={() => window.location.href = '/'}
              className="hover:opacity-80 transition-opacity"
            >
              <img src="/logofever.png" alt="Fever Logo" className="h-7" />
            </button>
          </div>
        </header>

        <div className="px-3 md:px-6 py-4 md:py-8">
          {renderPanelPage()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen h-screen overflow-y-auto" style={{ background: 'linear-gradient(to bottom, #1a1a1a 0%, #0f0f0f 100%)' }}>
      <header className="sticky top-0 z-50 px-3 md:px-6 py-3 border-b" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', borderColor: '#3a3a3a' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center">
            <button
              onClick={() => window.location.href = '/'}
              className="hover:opacity-80 transition-opacity"
            >
              <img src="/logofever.png" alt="Fever Logo" className="h-8" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => {
                setFullscreenView('bonus');
                activateOverlay('bonus_hunt');
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1"
              style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
            >
              <Gift className="w-4 h-4" />
              Bonus Hunt
            </button>

            <button
              onClick={() => {
                setFullscreenView('chill');
                activateOverlay('chill');
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1"
              style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
            >
              <Coffee className="w-4 h-4" />
              Chill
            </button>

            <button
              onClick={() => {
                setFullscreenView('fever');
                activateOverlay('fever_champions');
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1"
              style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d', color: '#d4d4d4' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
            >
              <Trophy className="w-4 h-4" />
              Fever Champions
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">

        <div className="mb-6 rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', border: '1px solid #3a3a3a' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold uppercase" style={{ color: '#a8a8a8' }}>Settings</h2>
            <div className="flex items-center gap-2">
              <Suspense fallback={null}><CasinoManager /></Suspense>
              <Suspense fallback={null}><OverlayBarManager showOnlyButtons={true} /></Suspense>
            </div>
          </div>
          <Suspense fallback={sectionLoader}><OverlayBarManager showOnlySelects={true} /></Suspense>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', border: '1px solid #3a3a3a' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold uppercase" style={{ color: '#a8a8a8' }}>Panels</h2>
              <span className="text-xs px-3 py-1 rounded-full" style={{ background: '#1f1f1f', color: '#8a8a8a', border: '1px solid #3a3a3a' }}>9</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={() => setActivePanelPage('bonus')}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Gift className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Bonus Hunt / Opening</h3>
                </div>
              </button>

              <button
                onClick={() => setActivePanelPage('fever')}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Trophy className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Fever Champions League</h3>
                </div>
              </button>

              <button
                onClick={() => setActivePanelPage('giveaway')}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Package className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Giveaways</h3>
                </div>
              </button>

              <button
                onClick={() => setActivePanelPage('chill')}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Coffee className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Chill</h3>
                </div>
              </button>

              <button
                onClick={() => setActivePanelPage('twitch')}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <MessageSquare className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Twitch Integration</h3>
                </div>
              </button>

              <button
                onClick={() => setActivePanelPage('streamelements')}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Zap className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>StreamElements</h3>
                </div>
              </button>

              <button
                onClick={() => setActivePanelPage('database')}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Database className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Slots Database</h3>
                </div>
              </button>

              <button
                onClick={() => setActivePanelPage('stats')}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <BarChart3 className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Statistics</h3>
                </div>
              </button>

              <button
                onClick={() => setActivePanelPage('live_preview')}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <LayoutDashboard className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Live Preview (OBS)</h3>
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)', border: '1px solid #3a3a3a' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold uppercase" style={{ color: '#a8a8a8' }}>Overlays</h2>
              <span className="text-xs px-3 py-1 rounded-full" style={{ background: '#1f1f1f', color: '#8a8a8a', border: '1px solid #3a3a3a' }}>8</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={(e) => handleOpenOverlay('main_stream', 'Main Overlay', e)}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <LayoutDashboard className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Main Overlay</h3>
                </div>
              </button>

              <button
                onClick={(e) => handleOpenOverlay('bar', 'Stream Bar', e)}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <LayoutDashboard className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Stream Bar</h3>
                </div>
              </button>

              <button
                onClick={(e) => handleOpenOverlay('bonus_hunt', 'Bonus Hunt', e)}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Gift className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Bonus Hunt</h3>
                </div>
              </button>

              <button
                onClick={(e) => handleOpenOverlay('bonus_opening', 'Bonus Opening', e)}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Package className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Bonus Opening</h3>
                </div>
              </button>

              <button
                onClick={(e) => handleOpenOverlay('chill', 'Chill', e)}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Coffee className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Chill</h3>
                </div>
              </button>

              <button
                onClick={(e) => handleOpenOverlay('fever_champions', 'Fever Champions League', e)}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Trophy className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Fever Champions League</h3>
                </div>
              </button>

              <button
                onClick={(e) => handleOpenOverlay('fever_bracket', 'Fever Champions Bracket', e)}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Brackets className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Fever Champions Bracket</h3>
                </div>
              </button>

              <button
                onClick={(e) => handleOpenOverlay('fever_groups', 'Fever Champions Groups', e)}
                className="rounded-lg p-3 transition-all text-left"
                style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#5a5a5a'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3d3d3d'}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
                    <Trophy className="w-4 h-4" style={{ color: '#b89968' }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: '#d4d4d4' }}>Fever Champions Groups</h3>
                </div>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
