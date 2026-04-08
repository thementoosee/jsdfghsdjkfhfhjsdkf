import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { OverlayViewer } from './components/OverlayViewer';

function App() {
  const [overlayId, setOverlayId] = useState<string | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    const overlayMatch = path.match(/^\/overlay\/([a-f0-9-]+)$/);

    if (overlayMatch) {
      setOverlayId(overlayMatch[1]);
    }
  }, []);

  if (overlayId) {
    return <OverlayViewer overlayId={overlayId} />;
  }

  return <Dashboard />;
}

export default App;
