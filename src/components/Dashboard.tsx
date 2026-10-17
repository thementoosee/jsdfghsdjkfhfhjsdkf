import {
  LayoutDashboard,
  Layers,
  Gift,
  Package,
  Coffee,
  MessageSquare,
  ExternalLink,
  Database,
  BarChart3,
  Trophy,
  Brackets,
  Zap,
  Music2,
  Copy,
  MonitorSmartphone,
  Swords,
  Settings,
  Home,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, Suspense, lazy } from 'react';
import { supabase, Overlay, OverlayType } from '../lib/supabase';
import { exchangeSpotifyCode } from '../lib/spotify';
import {
  getOverlayModuleDeckUrl,
  parseShowSecondSlot,
  setSecondSlotVisible,
} from '../lib/overlay-modules';

/** Admin-only visual tokens — do not use on OBS overlays. */
const dash = {
  page: '#0f0f12',
  sidebar: '#141418',
  sidebarBorder: 'rgba(63, 63, 70, 0.55)',
  card: '#1c1c22',
  cardHover: '#22222a',
  cardBorder: 'rgba(82, 82, 91, 0.55)',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#3b82f6',
  accentSoft: '#60a5fa',
  accentMuted: 'rgba(59, 130, 246, 0.16)',
  accentBorder: 'rgba(96, 165, 250, 0.35)',
} as const;

const OverlayBarManager = lazy(() => import('./OverlayBarManager').then((m) => ({ default: m.OverlayBarManager })));
const BonusHuntWorkspace = lazy(() => import('./bonus-hunt/BonusHuntWorkspace').then((m) => ({ default: m.BonusHuntWorkspace })));
const SlotDatabase = lazy(() => import('./SlotDatabase').then((m) => ({ default: m.SlotDatabase })));
const ChillSessionManager = lazy(() => import('./ChillSessionManager').then((m) => ({ default: m.ChillSessionManager })));
const Statistics = lazy(() => import('./Statistics').then((m) => ({ default: m.Statistics })));
const FeverChampionsManager = lazy(() => import('./FeverChampionsManager').then((m) => ({ default: m.FeverChampionsManager })));
const BonusTournamentManager = lazy(() =>
  import('./bonus-tournament/BonusTournamentManager').then((m) => ({ default: m.BonusTournamentManager })),
);
const StreamElementsIntegration = lazy(() => import('./StreamElementsIntegration').then((m) => ({ default: m.StreamElementsIntegration })));
const TwitchIntegration = lazy(() => import('./TwitchIntegration').then((m) => ({ default: m.TwitchIntegration })));
const SpotifyIntegration = lazy(() => import('./SpotifyIntegration').then((m) => ({ default: m.SpotifyIntegration })));
const GiveawayManager = lazy(() => import('./GiveawayManager').then((m) => ({ default: m.GiveawayManager })));

type FullscreenView = 'bar' | 'chill' | 'bonus' | 'fever' | 'giveaway' | null;
type PanelPage =
  | 'bonus'
  | 'fever'
  | 'bonus_tournament'
  | 'giveaway'
  | 'chill'
  | 'twitch'
  | 'streamelements'
  | 'spotify'
  | 'database'
  | 'stats'
  | 'live_preview'
  | 'settings'
  | null;

type NavId =
  | 'home'
  | 'bonus'
  | 'bonus_tournament'
  | 'chill'
  | 'fever'
  | 'giveaway'
  | 'twitch'
  | 'streamelements'
  | 'spotify'
  | 'database'
  | 'stats'
  | 'settings';

export function Dashboard() {
  const [overlaysByType, setOverlaysByType] = useState<Record<string, Overlay[]>>({});
  const [loading, setLoading] = useState(true);
  const [fullscreenView, setFullscreenView] = useState<FullscreenView>(null);
  const [activePanelPage, setActivePanelPage] = useState<PanelPage>(null);
  const [previewOverlayType, setPreviewOverlayType] = useState<OverlayType>('main_stream');
  const [showSecondSlot, setShowSecondSlot] = useState(true);
  const [secondSlotBusy, setSecondSlotBusy] = useState(false);
  const [copiedDeckLink, setCopiedDeckLink] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sectionLoader = (
    <div className="py-10 text-center text-sm uppercase tracking-wide" style={{ color: dash.muted }}>
      A carregar...
    </div>
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

    // Complete Spotify OAuth on dashboard root (before Twitch panel steals ?code=)
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const verifier = sessionStorage.getItem('spotify_pkce_verifier');
    const savedState = sessionStorage.getItem('spotify_pkce_state');
    if (code && state && verifier && savedState && state === savedState) {
      const redirectUri = `${window.location.origin}/`;
      sessionStorage.removeItem('spotify_pkce_verifier');
      sessionStorage.removeItem('spotify_pkce_state');
      window.history.replaceState({}, document.title, window.location.pathname);
      void exchangeSpotifyCode({ code, redirectUri, codeVerifier: verifier })
        .then(() => setActivePanelPage('spotify'))
        .catch((err) => console.error('[Spotify OAuth]', err));
    }

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

      const mainStream = grouped.main_stream?.[0];
      if (mainStream) {
        setShowSecondSlot(parseShowSecondSlot(mainStream.config as Record<string, unknown>));
      }

      await ensureDefaultOverlaysExist();
    } catch (error) {
      console.error('Error loading overlays:', error);
    } finally {
      setLoading(false);
    }
  };

  const ensureDefaultOverlaysExist = async () => {
    try {
      const requiredTypes: { type: OverlayType; name: string; isActive?: boolean }[] = [
        { type: 'bonus_hunt', name: 'Bonus Hunt Principal' },
        { type: 'bonus_opening', name: 'Bonus Opening Principal' },
        { type: 'chill', name: 'Chill Principal', isActive: true },
        { type: 'fever_champions', name: 'Fever Champions Principal' },
        { type: 'bar', name: 'Default Bar', isActive: true },
        { type: 'chat', name: 'Chat Interface', isActive: true },
        { type: 'main_stream', name: 'Main Overlay Principal', isActive: true }
      ];

      for (const { type, name, isActive } of requiredTypes) {
        const { data: existingRows, error: existingError } = await supabase
          .from('overlays')
          .select('id, is_active')
          .eq('type', type)
          .order('created_at', { ascending: true })
          .limit(1);

        if (existingError) throw existingError;

        if (!existingRows?.length) {
          await supabase
            .from('overlays')
            .insert({
              type,
              name,
              config: {},
              is_active: isActive ?? type === 'chill'
            });
        } else if (isActive && !existingRows[0].is_active) {
          await supabase
            .from('overlays')
            .update({ is_active: true })
            .eq('id', existingRows[0].id);
        }
      }
    } catch (error) {
      console.error('Error ensuring default overlays exist:', error);
    }
  };

  const getOverlayUrl = (id: string) => {
    return `${window.location.origin}/overlay/${id}`;
  };

  const openOverlay = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = getOverlayUrl(id);
    window.open(url, '_blank');
  };

  const getOrCreateDefaultOverlay = async (type: OverlayType, typeName: string) => {
    const payload = {
      type,
      name: `${typeName} Principal`,
      config: {},
      is_active: true
    };

    try {
      console.log('[getOrCreateDefaultOverlay] payload', payload);

      const { data: existingRows, error: fetchError } = await supabase
        .from('overlays')
        .select('*')
        .eq('type', type)
        .order('created_at', { ascending: true })
        .limit(1);

      if (fetchError) throw fetchError;

      if (existingRows?.length) {
        return existingRows[0];
      }

      const { data, error } = await supabase
        .from('overlays')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      await loadAllOverlays();
      return data;
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        code?: string;
        details?: string;
        hint?: string;
        status?: number;
      };
      console.error('[getOrCreateDefaultOverlay] erro real', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        status: err?.status,
        payload,
        raw: error
      });
      alert(
        `Erro ao criar overlay\n` +
          `message: ${err?.message ?? String(error)}\n` +
          `code: ${err?.code ?? 'n/a'}\n` +
          `details: ${err?.details ?? 'n/a'}\n` +
          `hint: ${err?.hint ?? 'n/a'}\n` +
          `status: ${err?.status ?? 'n/a'}`
      );
      return null;
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

  const toggleSecondSlot = async () => {
    if (secondSlotBusy) return;
    setSecondSlotBusy(true);
    const next = !showSecondSlot;
    setShowSecondSlot(next);
    try {
      await setSecondSlotVisible(next);
    } catch (err) {
      console.error('[Dashboard] second slot toggle failed', err);
      setShowSecondSlot(!next);
      alert('Não foi possível atualizar a 2ª slot.');
    } finally {
      setSecondSlotBusy(false);
    }
  };

  const copyDeckUrl = async (action: 'show' | 'hide' | 'toggle') => {
    const url = getOverlayModuleDeckUrl('second_slot', action);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedDeckLink(action);
      setTimeout(() => setCopiedDeckLink(null), 1500);
    } catch {
      prompt('Copia este link para o Stream Deck:', url);
    }
  };

  const panelPageTitles: Record<Exclude<PanelPage, null>, string> = {
    bonus: 'Bonus Hunt / Opening',
    fever: 'Fever Champions League',
    bonus_tournament: 'Bonus Tournament',
    giveaway: 'Giveaways',
    chill: 'Chill',
    twitch: 'Twitch Integration',
    streamelements: 'StreamElements',
    spotify: 'Spotify Now Playing',
    database: 'Slots Database',
    stats: 'Statistics',
    live_preview: 'Live Preview (OBS)',
    settings: 'Definições',
  };

  const goHome = () => {
    setFullscreenView(null);
    setActivePanelPage(null);
    setSidebarOpen(false);
  };

  const goPanel = (page: Exclude<PanelPage, null>) => {
    setFullscreenView(null);
    setActivePanelPage(page);
    setSidebarOpen(false);
  };

  const activeNav: NavId = (() => {
    if (activePanelPage === 'settings') return 'settings';
    if (fullscreenView === 'bonus' || activePanelPage === 'bonus') return 'bonus';
    if (fullscreenView === 'chill' || activePanelPage === 'chill') return 'chill';
    if (fullscreenView === 'fever' || activePanelPage === 'fever') return 'fever';
    if (fullscreenView === 'giveaway' || activePanelPage === 'giveaway') return 'giveaway';
    if (activePanelPage === 'bonus_tournament') return 'bonus_tournament';
    if (activePanelPage === 'twitch') return 'twitch';
    if (activePanelPage === 'streamelements') return 'streamelements';
    if (activePanelPage === 'spotify') return 'spotify';
    if (activePanelPage === 'database') return 'database';
    if (activePanelPage === 'stats') return 'stats';
    if (fullscreenView === 'bar') return 'settings';
    return 'home';
  })();

  const mainNavItems: { id: NavId; label: string; icon: LucideIcon; onClick: () => void }[] = [
    { id: 'home', label: 'Início', icon: Home, onClick: goHome },
    {
      id: 'bonus',
      label: 'Bonus Hunt / Opening',
      icon: Gift,
      onClick: () => goPanel('bonus'),
    },
    {
      id: 'bonus_tournament',
      label: 'Bonus Tournament',
      icon: Swords,
      onClick: () => goPanel('bonus_tournament'),
    },
    { id: 'chill', label: 'Chill', icon: Coffee, onClick: () => goPanel('chill') },
    { id: 'giveaway', label: 'Giveaways', icon: Package, onClick: () => goPanel('giveaway') },
    {
      id: 'twitch',
      label: 'Twitch Integration',
      icon: MessageSquare,
      onClick: () => goPanel('twitch'),
    },
    {
      id: 'streamelements',
      label: 'StreamElements',
      icon: Zap,
      onClick: () => goPanel('streamelements'),
    },
    { id: 'spotify', label: 'Spotify', icon: Music2, onClick: () => goPanel('spotify') },
    {
      id: 'database',
      label: 'Slots Database',
      icon: Database,
      onClick: () => goPanel('database'),
    },
    { id: 'stats', label: 'Statistics', icon: BarChart3, onClick: () => goPanel('stats') },
  ];

  const previewOverlay = overlaysByType[previewOverlayType]?.[0] || null;

  const renderSettingsPage = () => (
    <div className="space-y-5">
      <div
        className="rounded-2xl border p-5 sm:p-6"
        style={{ background: dash.card, borderColor: dash.cardBorder }}
      >
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.28em]" style={{ color: dash.accentSoft }}>
            Stream bar
          </p>
          <h2 className="text-xl font-black uppercase mt-1" style={{ color: dash.text }}>
            Definições
          </h2>
          <p className="text-sm mt-1" style={{ color: dash.muted }}>
            Wager ou Raw, marca, tamanhos de logótipo e modo de jogo.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="py-6 text-center text-sm uppercase" style={{ color: dash.muted }}>
              A carregar definições…
            </div>
          }
        >
          <OverlayBarManager showOnlySelects={true} />
        </Suspense>
      </div>

      <div
        className="rounded-2xl border p-5 sm:p-6"
        style={{ background: dash.card, borderColor: dash.cardBorder }}
      >
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: dash.accentMuted, border: `1px solid ${dash.accentBorder}` }}
            >
              <MonitorSmartphone className="w-4 h-4" style={{ color: dash.accentSoft }} />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase" style={{ color: dash.text }}>
                2ª Slot (canto)
              </h2>
              <p className="text-xs" style={{ color: dash.muted }}>
                Buraco transparente no canto inferior esquerdo da Main Overlay
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void toggleSecondSlot()}
            disabled={secondSlotBusy}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all"
            style={{
              background: showSecondSlot
                ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)'
                : '#1e1e24',
              border: `1px solid ${showSecondSlot ? dash.accent : dash.cardBorder}`,
              color: '#fff',
              opacity: secondSlotBusy ? 0.6 : 1,
            }}
          >
            {showSecondSlot ? 'ON na stream' : 'OFF na stream'}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide" style={{ color: dash.muted }}>
            Stream Deck — usa o plugin API Request (GET). Website abre sempre o browser.
          </p>
          {(
            [
              { action: 'show' as const, label: 'Mostrar 2ª slot', hint: '/second_slot/show' },
              { action: 'hide' as const, label: 'Esconder 2ª slot', hint: '/second_slot/hide' },
              { action: 'toggle' as const, label: 'Toggle 2ª slot', hint: '/second_slot/toggle' },
            ] as const
          ).map(({ action, label, hint }) => (
            <div
              key={action}
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: '#141418', border: `1px solid ${dash.cardBorder}` }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase" style={{ color: dash.text }}>
                  {label}
                </div>
                <div
                  className="text-[11px] truncate font-mono"
                  style={{ color: '#64748b' }}
                  title={getOverlayModuleDeckUrl('second_slot', action)}
                >
                  …{hint}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void copyDeckUrl(action)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase flex-shrink-0"
                style={{
                  background: copiedDeckLink === action ? 'rgba(34,197,94,0.2)' : '#1e1e24',
                  border: `1px solid ${dash.cardBorder}`,
                  color: copiedDeckLink === action ? '#4ade80' : dash.text,
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedDeckLink === action ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPanelPage = () => {
    if (activePanelPage === 'settings') {
      return renderSettingsPage();
    }
    if (activePanelPage === 'bonus') {
      return <Suspense fallback={sectionLoader}><BonusHuntWorkspace /></Suspense>;
    }
    if (activePanelPage === 'chill') {
      return <Suspense fallback={sectionLoader}><ChillSessionManager /></Suspense>;
    }
    if (activePanelPage === 'fever') {
      return <Suspense fallback={sectionLoader}><FeverChampionsManager /></Suspense>;
    }
    if (activePanelPage === 'bonus_tournament') {
      return <Suspense fallback={sectionLoader}><BonusTournamentManager /></Suspense>;
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
    if (activePanelPage === 'spotify') {
      return <Suspense fallback={sectionLoader}><SpotifyIntegration /></Suspense>;
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


  const renderHomePage = () => {
    const featured: {
      title: string;
      description: string;
      icon: LucideIcon;
      onClick: () => void;
    }[] = [
      {
        title: 'Bonus Hunt / Opening',
        description: 'Gere hunts, openings e o overlay principal de bónus.',
        icon: Gift,
        onClick: () => goPanel('bonus'),
      },
      {
        title: 'Bonus Tournament',
        description: 'Torneio DEMO — inscrições, sorteio e confrontos.',
        icon: Swords,
        onClick: () => goPanel('bonus_tournament'),
      },
      {
        title: 'Chill',
        description: 'Sessões relaxadas e overlay chill para a stream.',
        icon: Coffee,
        onClick: () => goPanel('chill'),
      },
      {
        title: 'Giveaways',
        description: 'Cria e gere giveaways para a tua audiência.',
        icon: Package,
        onClick: () => goPanel('giveaway'),
      },
    ];

    const tools: {
      title: string;
      icon: LucideIcon;
      onClick: () => void;
    }[] = [
      { title: 'Twitch Integration', icon: MessageSquare, onClick: () => goPanel('twitch') },
      { title: 'StreamElements', icon: Zap, onClick: () => goPanel('streamelements') },
      { title: 'Spotify', icon: Music2, onClick: () => goPanel('spotify') },
      { title: 'Slots Database', icon: Database, onClick: () => goPanel('database') },
      { title: 'Statistics', icon: BarChart3, onClick: () => goPanel('stats') },
      { title: 'Live Preview (OBS)', icon: LayoutDashboard, onClick: () => goPanel('live_preview') },
    ];

    const overlayCards: { type: OverlayType; title: string; icon: LucideIcon }[] = [
      { type: 'main_stream', title: 'Main Overlay', icon: LayoutDashboard },
      { type: 'bar', title: 'Stream Bar', icon: LayoutDashboard },
      { type: 'bonus_hunt', title: 'Bonus Hunt', icon: Gift },
      { type: 'bonus_opening', title: 'Bonus Opening', icon: Package },
      { type: 'chill', title: 'Chill', icon: Coffee },
      { type: 'fever_champions', title: 'Fever Champions League', icon: Trophy },
      { type: 'fever_bracket', title: 'Fever Champions Bracket', icon: Brackets },
      { type: 'fever_groups', title: 'Fever Champions Groups', icon: Trophy },
    ];

    return (
      <div className="space-y-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: dash.accentSoft }}>
            Stream Control Center
          </p>
          <h1 className="text-3xl sm:text-4xl font-black uppercase mt-2" style={{ color: dash.text }}>
            Dashboard
          </h1>
          <p className="text-sm sm:text-base mt-2 max-w-2xl" style={{ color: dash.muted }}>
            Gere as tuas overlays e ferramentas de streaming num único lugar.
          </p>
        </div>

        <div
          className="rounded-2xl border p-5 sm:p-6"
          style={{ background: dash.card, borderColor: dash.cardBorder }}
        >
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.28em]" style={{ color: dash.accentSoft }}>
              Stream bar
            </p>
            <h2 className="text-lg font-black uppercase mt-1" style={{ color: dash.text }}>
              Top Bar
            </h2>
            <p className="text-sm mt-1" style={{ color: dash.muted }}>
              Wager ou Raw, marca e tamanhos de logótipo da barra.
            </p>
          </div>
          <Suspense
            fallback={
              <div className="py-4 text-center text-sm uppercase" style={{ color: dash.muted }}>
                A carregar Top Bar…
              </div>
            }
          >
            <OverlayBarManager showOnlySelects={true} />
          </Suspense>
        </div>

        <div>
          <h2 className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: dash.muted }}>
            Módulos principais
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featured.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={item.onClick}
                  className="rounded-2xl border p-5 text-left transition-all group"
                  style={{ background: dash.card, borderColor: dash.cardBorder }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = dash.accentBorder;
                    e.currentTarget.style.background = dash.cardHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = dash.cardBorder;
                    e.currentTarget.style.background = dash.card;
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: dash.accentMuted, border: `1px solid ${dash.accentBorder}` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: dash.accentSoft }} />
                  </div>
                  <h3 className="text-base font-black uppercase" style={{ color: dash.text }}>
                    {item.title}
                  </h3>
                  <p className="text-sm mt-2" style={{ color: dash.muted }}>
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: dash.muted }}>
            Outras ferramentas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tools.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={item.onClick}
                  className="rounded-xl border px-4 py-3.5 text-left transition-all flex items-center gap-3"
                  style={{ background: dash.card, borderColor: dash.cardBorder }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = dash.accentBorder;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = dash.cardBorder;
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: dash.accentMuted, border: `1px solid ${dash.accentBorder}` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: dash.accentSoft }} />
                  </div>
                  <h3 className="text-sm font-bold uppercase" style={{ color: dash.text }}>
                    {item.title}
                  </h3>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: dash.muted }}>
              Overlays OBS
            </h2>
            <span
              className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full"
              style={{ background: '#141418', color: dash.muted, border: `1px solid ${dash.cardBorder}` }}
            >
              Browser Sources
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {overlayCards.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={(e) => handleOpenOverlay(item.type, item.title, e)}
                  className="rounded-xl border p-3.5 text-left transition-all"
                  style={{ background: dash.card, borderColor: dash.cardBorder }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = dash.accentBorder;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = dash.cardBorder;
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: dash.accentMuted, border: `1px solid ${dash.accentBorder}` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: dash.accentSoft }} />
                    </div>
                    <h3 className="text-xs font-bold uppercase" style={{ color: dash.text }}>
                      {item.title}
                    </h3>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMainContent = () => {
    if (fullscreenView === 'bar') {
      return (
        <Suspense fallback={sectionLoader}>
          <OverlayBarManager />
        </Suspense>
      );
    }
    if (fullscreenView === 'chill') {
      return (
        <Suspense fallback={sectionLoader}>
          <ChillSessionManager />
        </Suspense>
      );
    }
    if (fullscreenView === 'bonus') {
      return (
        <Suspense fallback={sectionLoader}>
          <BonusHuntWorkspace />
        </Suspense>
      );
    }
    if (fullscreenView === 'fever') {
      return (
        <Suspense fallback={sectionLoader}>
          <FeverChampionsManager />
        </Suspense>
      );
    }
    if (fullscreenView === 'giveaway') {
      return (
        <Suspense fallback={sectionLoader}>
          <GiveawayManager />
        </Suspense>
      );
    }
    if (activePanelPage) {
      return renderPanelPage();
    }
    return renderHomePage();
  };

  const contentTitle = fullscreenView
    ? ({
        bar: 'Barra',
        chill: 'Chill',
        bonus: 'Bonus Hunt / Opening',
        fever: 'Fever Champions League',
        giveaway: 'Giveaways',
      } as const)[fullscreenView]
    : activePanelPage
      ? panelPageTitles[activePanelPage]
      : 'Dashboard';

  const sidebarNavBtn = (item: { id: NavId; label: string; icon: LucideIcon; onClick: () => void }) => {
    const Icon = item.icon;
    const on = activeNav === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={item.onClick}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-colors"
        style={{
          background: on ? dash.accentMuted : 'transparent',
          color: on ? dash.text : dash.muted,
          border: on ? `1px solid ${dash.accentBorder}` : '1px solid transparent',
        }}
      >
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: on ? dash.accentSoft : dash.muted }} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: dash.page, color: dash.text }}>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[272px] flex flex-col border-r transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{ background: dash.sidebar, borderColor: dash.sidebarBorder }}
      >
        <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-2 border-b" style={{ borderColor: dash.sidebarBorder }}>
          <button type="button" onClick={goHome} className="hover:opacity-90 transition-opacity min-w-0">
            <img
              src="/logo-jigadores-wordmark.png?v=2"
              alt="Jigadores Logo"
              className="h-9 w-auto max-w-[180px] object-contain"
            />
          </button>
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg"
            style={{ color: dash.muted }}
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {mainNavItems.map(sidebarNavBtn)}
        </nav>

        <div className="px-3 pb-5 pt-2 border-t" style={{ borderColor: dash.sidebarBorder }}>
          {sidebarNavBtn({
            id: 'settings',
            label: 'Definições',
            icon: Settings,
            onClick: () => goPanel('settings'),
          })}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-0 h-full">
        <header
          className="flex-shrink-0 z-30 px-4 sm:px-6 py-3.5 border-b flex items-center justify-between gap-3"
          style={{ background: 'rgba(15,15,18,0.92)', borderColor: dash.sidebarBorder, backdropFilter: 'blur(10px)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 rounded-xl"
              style={{ background: dash.card, border: `1px solid ${dash.cardBorder}`, color: dash.text }}
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: dash.accentSoft }}>
                Jigadores
              </p>
              <h1 className="text-sm sm:text-base font-bold uppercase truncate" style={{ color: dash.text }}>
                {contentTitle}
              </h1>
            </div>
          </div>

          {(fullscreenView || activePanelPage) && (
            <button
              type="button"
              onClick={goHome}
              className="px-3 py-2 rounded-xl text-xs font-bold uppercase flex-shrink-0"
              style={{ background: dash.card, border: `1px solid ${dash.cardBorder}`, color: dash.muted }}
            >
              Início
            </button>
          )}
        </header>

        <main
          data-dashboard-main
          className="flex-1 min-h-0 px-4 sm:px-6 py-5 sm:py-8 overflow-x-hidden overflow-y-auto"
        >
          <div
            className={`mx-auto w-full ${
              activePanelPage === 'bonus' || fullscreenView === 'bonus'
                ? 'max-w-[1600px]'
                : 'max-w-6xl'
            }`}
          >
            {fullscreenView ? (
              <div
                className="rounded-2xl border p-4 sm:p-6"
                style={{ background: dash.card, borderColor: dash.cardBorder }}
              >
                {renderMainContent()}
              </div>
            ) : (
              renderMainContent()
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
