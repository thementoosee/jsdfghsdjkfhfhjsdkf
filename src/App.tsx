import { useState, useEffect, lazy, Suspense } from 'react';
import { Dashboard } from './components/Dashboard';
import { OverlayViewer } from './components/OverlayViewer';
import { TournamentDesignLab } from './design-lab/tournament/TournamentDesignLab';
import { BonusTournamentOverlayPreview } from './components/bonus-tournament/BonusTournamentOverlayPreview';

const BonusTournamentManager = lazy(() =>
  import('./components/bonus-tournament/BonusTournamentManager').then((m) => ({
    default: m.BonusTournamentManager,
  })),
);

const DrawObsPage = lazy(() =>
  import('./components/bonus-tournament/DrawObsPage').then((m) => ({
    default: m.DrawObsPage,
  })),
);

const DrawVisualPreview = lazy(() =>
  import('./components/bonus-tournament/DrawVisualPreview').then((m) => ({
    default: m.DrawVisualPreview,
  })),
);

const BracketObsPage = lazy(() =>
  import('./components/bonus-tournament/BracketObsPage').then((m) => ({
    default: m.BracketObsPage,
  })),
);

const BracketVisualPreview = lazy(() =>
  import('./components/bonus-tournament/BracketVisualPreview').then((m) => ({
    default: m.BracketVisualPreview,
  })),
);

type PreviewRoute =
  | 'tournament-lab'
  | 'bonus-tournament'
  | 'bonus-tournament-overlay'
  | 'bonus-tournament-preview'
  | 'bonus-tournament-draw'
  | 'bonus-tournament-draw-preview'
  | 'bonus-tournament-bracket'
  | 'bonus-tournament-bracket-preview'
  | null;

function App() {
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [previewRoute, setPreviewRoute] = useState<PreviewRoute>(null);

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const overlayMatch = path.match(/^\/overlay\/([a-f0-9-]+)$/);

    if (overlayMatch) {
      setOverlayId(overlayMatch[1]);
      return;
    }

    if (path === '/tournament-lab') setPreviewRoute('tournament-lab');
    else if (path === '/bonus-tournament') setPreviewRoute('bonus-tournament');
    else if (path === '/bonus-tournament/overlay') setPreviewRoute('bonus-tournament-overlay');
    else if (path === '/bonus-tournament/preview') setPreviewRoute('bonus-tournament-preview');
    else if (path === '/bonus-tournament/draw') setPreviewRoute('bonus-tournament-draw');
    else if (path === '/bonus-tournament/draw-preview') setPreviewRoute('bonus-tournament-draw-preview');
    else if (path === '/bonus-tournament/bracket') setPreviewRoute('bonus-tournament-bracket');
    else if (path === '/bonus-tournament/bracket-preview')
      setPreviewRoute('bonus-tournament-bracket-preview');
  }, []);

  if (overlayId) {
    return <OverlayViewer overlayId={overlayId} />;
  }

  if (previewRoute === 'tournament-lab') {
    return <TournamentDesignLab />;
  }

  if (previewRoute === 'bonus-tournament' || previewRoute === 'bonus-tournament-preview') {
    return (
      <div className="min-h-screen p-6" style={{ background: '#0f0f0f' }}>
        <div className="max-w-7xl mx-auto">
          <Suspense fallback={<div style={{ color: '#94a3b8' }}>A carregar DEMO…</div>}>
            <BonusTournamentManager />
          </Suspense>
        </div>
      </div>
    );
  }

  if (previewRoute === 'bonus-tournament-overlay') {
    return <BonusTournamentOverlayPreview />;
  }

  if (previewRoute === 'bonus-tournament-draw') {
    return (
      <Suspense fallback={<div style={{ color: '#8a8a8a', padding: 24 }}>A carregar sorteio…</div>}>
        <DrawObsPage />
      </Suspense>
    );
  }

  if (previewRoute === 'bonus-tournament-draw-preview') {
    return (
      <Suspense fallback={<div style={{ color: '#8a8a8a', padding: 24 }}>A carregar preview DEMO…</div>}>
        <DrawVisualPreview />
      </Suspense>
    );
  }

  if (previewRoute === 'bonus-tournament-bracket') {
    return (
      <Suspense fallback={<div style={{ color: '#8a8a8a', padding: 24 }}>A carregar bracket…</div>}>
        <BracketObsPage />
      </Suspense>
    );
  }

  if (previewRoute === 'bonus-tournament-bracket-preview') {
    return (
      <Suspense fallback={<div style={{ color: '#8a8a8a', padding: 24 }}>A carregar preview DEMO…</div>}>
        <BracketVisualPreview />
      </Suspense>
    );
  }

  return <Dashboard />;
}

export default App;
