import { useEffect, useState } from 'react';
import { supabase, Overlay } from '../lib/supabase';
import { Search, Instagram, Music, Youtube } from 'lucide-react';
import { BonusHuntOverlay } from './bonus-hunt/BonusHuntOverlay';
import { BonusOpeningOverlay } from './bonus-hunt/BonusOpeningOverlay';
import { ChillSessionOverlay } from './ChillSessionOverlay';
import { ChatOverlay } from './ChatOverlay';
import { AlertsOverlay } from './AlertsOverlay';
import { FeverChampionsOverlay } from './FeverChampionsOverlay';
import { FeverBracketOverlay } from './FeverBracketOverlay';
import FeverGroupsOverlay from './FeverGroupsOverlay';
import { MainStreamOverlay } from './MainStreamOverlay';

interface OverlayViewerProps {
  overlayId: string;
}

export function OverlayViewer({ overlayId }: OverlayViewerProps) {
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawWager, setRawWager] = useState<'raw' | 'wager'>('raw');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cryptoPrices, setCryptoPrices] = useState({
    BTC: '...',
    ETH: '...',
    LTC: '...',
    BNB: '...',
    SOL: '...',
    XRP: '...',
    ADA: '...',
    DOGE: '...'
  });
  const [currentSocial, setCurrentSocial] = useState(0);
  const [cryptoOffset, setCryptoOffset] = useState(0);
  const [nowActivity, setNowActivity] = useState('Playing Casino');
  const [nextActivity, setNextActivity] = useState('Opening Cases');
  const [showNowNext, setShowNowNext] = useState<'now' | 'next'>('now');
  const [brandLogo, setBrandLogo] = useState('');
  const [activeBrandLogo, setActiveBrandLogo] = useState('');
  const [logoFit, setLogoFit] = useState<'contain' | 'cover'>('contain');
  const [logoScale, setLogoScale] = useState(0.8);
  const [casinoLogoScale, setCasinoLogoScale] = useState(1);
  const [showWagerText, setShowWagerText] = useState(false);

  const socialLinks = [
    { platform: 'Instagram', handle: 'OFICIALFEVERB', icon: Instagram },
    { platform: 'TikTok', handle: 'OFICIALFEVERB', icon: Music },
    { platform: 'YouTube', handle: 'FEVEROFICIAL', icon: Youtube }
  ];

  useEffect(() => {
    loadOverlay();
    loadActiveBrandLogo();

    const overlayChannel = supabase
      .channel('overlay-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'overlays'
        },
        (payload) => {
          console.log('Overlay updated via realtime:', payload);

          if (payload.eventType === 'UPDATE' && payload.new.id === overlayId) {
            const updated = payload.new as Overlay;
            setOverlay(updated);
            if (updated.config?.streamMode) {
              setRawWager(updated.config.streamMode);
            }
            if (typeof updated.config?.nowText === 'string') {
              setNowActivity(updated.config.nowText);
            }
            if (updated.config?.nextText) {
              setNextActivity(updated.config.nextText);
            }
            if (updated.config?.brandLogo) {
              setBrandLogo(updated.config.brandLogo);
            }
            if (updated.config?.logoFit) {
              setLogoFit(updated.config.logoFit);
            }
            if (typeof updated.config?.logoScale === 'number') {
              setLogoScale(updated.config.logoScale);
            }
            if (typeof updated.config?.casinoLogoScale === 'number') {
              setCasinoLogoScale(updated.config.casinoLogoScale);
            }

            loadActiveBrandLogo(updated.config?.nowText);
          } else if (payload.eventType === 'UPDATE') {
            loadOverlay();
          }
        }
      )
      .subscribe();

    const brandChannel = supabase
      .channel('brand-logos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'brand_logos'
        },
        () => {
          loadActiveBrandLogo();
        }
      )
      .subscribe();

    const casinosChannel = supabase
      .channel('casinos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'casinos'
        },
        () => {
          loadActiveBrandLogo();
        }
      )
      .subscribe();

    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    const socialInterval = setInterval(() => {
      setCurrentSocial((prev) => (prev + 1) % socialLinks.length);
    }, 3000);

    const nowNextInterval = setInterval(() => {
      setShowNowNext((prev) => (prev === 'now' ? 'next' : 'now'));
    }, 30000);

    const wagerSlideInterval = setInterval(() => {
      setShowWagerText((prev) => !prev);
    }, 10000);

    const fetchCryptoPrices = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,litecoin,binancecoin,solana,ripple,cardano,dogecoin&vs_currencies=usd');
        const data = await response.json();
        setCryptoPrices({
          BTC: data.bitcoin?.usd ? Math.round(data.bitcoin.usd).toLocaleString('en-US') : '...',
          ETH: data.ethereum?.usd ? Math.round(data.ethereum.usd).toLocaleString('en-US') : '...',
          LTC: data.litecoin?.usd ? Math.round(data.litecoin.usd).toLocaleString('en-US') : '...',
          BNB: data.binancecoin?.usd ? Math.round(data.binancecoin.usd).toLocaleString('en-US') : '...',
          SOL: data.solana?.usd ? Math.round(data.solana.usd).toLocaleString('en-US') : '...',
          XRP: data.ripple?.usd ? data.ripple.usd.toFixed(2) : '...',
          ADA: data.cardano?.usd ? data.cardano.usd.toFixed(2) : '...',
          DOGE: data.dogecoin?.usd ? data.dogecoin.usd.toFixed(3) : '...'
        });
      } catch (error) {
        console.error('Error fetching crypto prices:', error);
        setCryptoPrices({
          BTC: 'N/A',
          ETH: 'N/A',
          LTC: 'N/A',
          BNB: 'N/A',
          SOL: 'N/A',
          XRP: 'N/A',
          ADA: 'N/A',
          DOGE: 'N/A'
        });
      }
    };

    fetchCryptoPrices();
    const cryptoInterval = setInterval(fetchCryptoPrices, 60000);

    const cryptoScrollInterval = setInterval(() => {
      setCryptoOffset(prev => {
        if (prev <= -1500) {
          return 0;
        }
        return prev - 1;
      });
    }, 30);

    return () => {
      overlayChannel.unsubscribe();
      brandChannel.unsubscribe();
      casinosChannel.unsubscribe();
      clearInterval(timeInterval);
      clearInterval(socialInterval);
      clearInterval(wagerSlideInterval);
      clearInterval(nowNextInterval);
      clearInterval(cryptoInterval);
      clearInterval(cryptoScrollInterval);
    };
  }, [overlayId]);

  const loadOverlay = async () => {
    try {
      const { data, error } = await supabase
        .from('overlays')
        .select('*')
        .eq('id', overlayId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setError('Overlay não encontrado');
        return;
      }

      setOverlay(data);

      if (data.config?.streamMode) {
        setRawWager(data.config.streamMode);
      }
      if (typeof data.config?.nowText === 'string') {
        setNowActivity(data.config.nowText);
      }
      if (data.config?.nextText) {
        setNextActivity(data.config.nextText);
      }
      if (data.config?.brandLogo) {
        setBrandLogo(data.config.brandLogo);
      }
      if (data.config?.logoFit) {
        setLogoFit(data.config.logoFit);
      }
      if (typeof data.config?.logoScale === 'number') {
        setLogoScale(data.config.logoScale);
      }
      if (typeof data.config?.casinoLogoScale === 'number') {
        setCasinoLogoScale(data.config.casinoLogoScale);
      }

      loadActiveBrandLogo(data.config?.nowText);
    } catch (err) {
      console.error('Error loading overlay:', err);
      setError('Erro ao carregar overlay');
    } finally {
      setLoading(false);
    }
  };

  const loadActiveBrandLogo = async (preferredCasinoName?: string) => {
    try {
      if (preferredCasinoName && preferredCasinoName.trim() !== '') {
        const { data: preferredCasinos, error: preferredError } = await supabase
          .from('casinos')
          .select('thumbnail_url, name')
          .eq('name', preferredCasinoName)
          .limit(1);

        if (!preferredError && preferredCasinos && preferredCasinos.length > 0) {
          setActiveBrandLogo(preferredCasinos[0].thumbnail_url || '');
          return;
        }
      }

      const { data: activeCasinos, error: casinoError } = await supabase
        .from('casinos')
        .select('thumbnail_url, order_index')
        .eq('is_active', true)
        .order('order_index', { ascending: true })
        .limit(1);

      if (!casinoError && activeCasinos && activeCasinos.length > 0) {
        setActiveBrandLogo(activeCasinos[0].thumbnail_url || '');
        return;
      }

      const { data, error } = await supabase
        .from('brand_logos')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setActiveBrandLogo(data.logo_url);
      } else {
        setActiveBrandLogo('');
      }
    } catch (err) {
      console.error('Error loading active brand logo:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="text-white text-2xl uppercase">Carregando...</div>
      </div>
    );
  }

  if (error || !overlay) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="text-white text-2xl uppercase">{error || 'Overlay não encontrado'}</div>
      </div>
    );
  }

  if (!overlay.is_active && overlay.type !== 'main_stream') {
    return (
      <div className="min-h-screen bg-transparent"></div>
    );
  }

  const renderOverlayContent = () => {
    switch (overlay.type) {
      case 'background':
        return (
          <div className="w-[1920px] h-[1080px] bg-gradient-to-br from-blue-900 via-purple-900 to-blue-800 animate-gradient-shift">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
              <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
              <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
            </div>
          </div>
        );

      case 'chat':
        return (
          <div className="w-[1920px] h-[1080px] relative flex items-start justify-start">
            <ChatOverlay />
          </div>
        );

      case 'alerts':
        return (
          <div className="w-[1920px] h-[1080px] relative">
            <AlertsOverlay />
          </div>
        );

      case 'bonus_hunt':
        return (
          <div className="w-[1920px] h-[1080px] relative">
            <BonusHuntOverlay />
          </div>
        );

      case 'bonus_opening':
        return (
          <div className="w-[1920px] h-[1080px] relative">
            <BonusOpeningOverlay />
          </div>
        );

      case 'chill':
        return <ChillSessionOverlay />;

      case 'fever_champions':
        return (
          <div className="w-[1920px] h-[1080px] relative">
            <FeverChampionsOverlay />
          </div>
        );

      case 'fever_bracket':
        return (
          <div className="w-[1920px] h-[1080px] relative">
            <FeverBracketOverlay />
          </div>
        );

      case 'fever_groups':
        return (
          <div className="w-[1920px] h-[1080px] relative">
            <FeverGroupsOverlay />
          </div>
        );

      case 'main_stream':
        return <MainStreamOverlay />;

      case 'bar':
        const currentMode = overlay.config?.streamMode || 'Opening';
        const rawWagerType = overlay.config?.nextText || 'Raw';

        return (
          <div className="w-[1920px] h-[1080px] relative">
            <div className="absolute top-[8px] left-[8px] right-[8px] h-[42px] bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-md border border-white/10 rounded-3xl flex items-center justify-between px-6 gap-4">

              <div className="h-full flex items-center justify-center min-w-[180px]">
                <div className="w-full h-full flex items-center justify-center">
                  <img
                    src="/logofever.png"
                    alt="Fever Logo"
                    className="w-auto object-contain"
                    style={{
                      height: '56px',
                      transform: `scale(${logoScale})`,
                      transformOrigin: 'center center'
                    }}
                  />
                </div>
              </div>

              <div className="w-px h-6 bg-white/20"></div>

              <div className="relative w-[160px] h-7 overflow-hidden">
                <div
                  className="absolute inset-0 flex items-center gap-3 transition-all duration-700"
                  style={{
                    opacity: showWagerText ? 0 : 1,
                    transform: showWagerText ? 'translateY(-100%)' : 'translateY(0)',
                  }}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      currentMode === 'Bonus Hunt' ? 'bg-orange-600 text-white' : 'bg-slate-700/50 text-white/40'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                      <line x1="12" y1="22.08" x2="12" y2="12"/>
                    </svg>
                  </div>

                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      currentMode === 'Opening' ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-white/40'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 6v6l4 2"/>
                    </svg>
                  </div>

                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      currentMode === 'Chill' ? 'bg-green-600 text-white' : 'bg-slate-700/50 text-white/40'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                      <line x1="6" y1="1" x2="6" y2="4"/>
                      <line x1="10" y1="1" x2="10" y2="4"/>
                      <line x1="14" y1="1" x2="14" y2="4"/>
                    </svg>
                  </div>

                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      currentMode === 'Fever Champions' ? 'bg-yellow-600 text-white' : 'bg-slate-700/50 text-white/40'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                      <path d="M4 22h16"/>
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                    </svg>
                  </div>
                </div>

                <div
                  className="absolute inset-0 flex items-center justify-center transition-all duration-700"
                  style={{
                    opacity: showWagerText ? 1 : 0,
                    transform: showWagerText ? 'translateY(0)' : 'translateY(100%)',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {rawWagerType.toLowerCase() === 'wager' ? (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                        <line x1="18" y1="20" x2="18" y2="10"/>
                        <line x1="12" y1="20" x2="12" y2="4"/>
                        <line x1="6" y1="20" x2="6" y2="14"/>
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                      </svg>
                    )}
                    <span
                      className="text-[12px] font-bold uppercase"
                      style={{
                        color: rawWagerType.toLowerCase() === 'wager' ? '#10b981' : '#ef4444',
                        fontFamily: 'Rubik, sans-serif'
                      }}
                    >
                      {rawWagerType.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="w-px h-6 bg-white/20"></div>

              <div className="flex items-center justify-center min-w-[140px] h-full">
                <div className="flex items-center justify-center w-full h-full">
                  {activeBrandLogo ? (
                    <img
                      src={activeBrandLogo}
                      alt="Casino"
                      className="w-auto object-contain"
                      style={{ height: '32px', transform: `scale(${casinoLogoScale})`, transformOrigin: 'center center' }}
                    />
                  ) : brandLogo ? (
                    <img
                      src={brandLogo}
                      alt="Casino"
                      className="w-auto object-contain"
                      style={{ height: '32px', transform: `scale(${casinoLogoScale})`, transformOrigin: 'center center' }}
                    />
                  ) : (
                    <img
                      src="/wVqLzwT_default.png"
                      alt="Casino"
                      className="w-auto object-contain"
                      style={{ height: '32px', transform: `scale(${casinoLogoScale})`, transformOrigin: 'center center' }}
                    />
                  )}
                </div>
              </div>

              <div className="w-px h-6 bg-white/20"></div>

              <div className="flex items-center justify-center min-w-[160px]">
                <div className="flex items-center gap-1.5">
                  {(() => {
                    const Icon = socialLinks[currentSocial].icon;
                    return <Icon className="w-[16px] h-[16px] text-white flex-shrink-0" />;
                  })()}
                  <span className="text-white text-[13px] font-medium whitespace-nowrap" style={{fontFamily: 'Rubik, sans-serif'}}>{socialLinks[currentSocial].handle}</span>
                </div>
              </div>

              <div className="w-px h-6 bg-white/20"></div>

              <div className="overflow-hidden relative w-[380px]">
                <div
                  className="flex items-center gap-4 whitespace-nowrap"
                  style={{
                    transform: `translateX(${cryptoOffset}px)`,
                    willChange: 'transform'
                  }}
                >
                  {[...Array(3)].map((_, repeatIndex) => (
                    <div key={repeatIndex} className="flex items-center gap-4">
                      <div className="w-px h-4 bg-white/20"></div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-orange-400 font-bold text-xs" style={{fontFamily: 'Rubik, sans-serif'}}>BTC</span>
                        <span className="text-white text-xs font-medium min-w-[60px]" style={{fontFamily: 'Rubik, sans-serif'}}>${cryptoPrices.BTC}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-blue-400 font-bold text-xs" style={{fontFamily: 'Rubik, sans-serif'}}>ETH</span>
                        <span className="text-white text-xs font-medium min-w-[60px]" style={{fontFamily: 'Rubik, sans-serif'}}>${cryptoPrices.ETH}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 font-bold text-xs" style={{fontFamily: 'Rubik, sans-serif'}}>LTC</span>
                        <span className="text-white text-xs font-medium min-w-[60px]" style={{fontFamily: 'Rubik, sans-serif'}}>${cryptoPrices.LTC}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-yellow-400 font-bold text-xs" style={{fontFamily: 'Rubik, sans-serif'}}>BNB</span>
                        <span className="text-white text-xs font-medium min-w-[60px]" style={{fontFamily: 'Rubik, sans-serif'}}>${cryptoPrices.BNB}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-purple-400 font-bold text-xs" style={{fontFamily: 'Rubik, sans-serif'}}>SOL</span>
                        <span className="text-white text-xs font-medium min-w-[60px]" style={{fontFamily: 'Rubik, sans-serif'}}>${cryptoPrices.SOL}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-blue-300 font-bold text-xs" style={{fontFamily: 'Rubik, sans-serif'}}>XRP</span>
                        <span className="text-white text-xs font-medium min-w-[60px]" style={{fontFamily: 'Rubik, sans-serif'}}>${cryptoPrices.XRP}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-cyan-400 font-bold text-xs" style={{fontFamily: 'Rubik, sans-serif'}}>ADA</span>
                        <span className="text-white text-xs font-medium min-w-[60px]" style={{fontFamily: 'Rubik, sans-serif'}}>${cryptoPrices.ADA}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400 font-bold text-xs" style={{fontFamily: 'Rubik, sans-serif'}}>DOGE</span>
                        <span className="text-white text-xs font-medium min-w-[60px]" style={{fontFamily: 'Rubik, sans-serif'}}>${cryptoPrices.DOGE}</span>
                      </div>
                      <div className="w-px h-4 bg-white/20"></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-px h-6 bg-white/20"></div>

              <div className="flex items-center gap-2">
                <Search size={16} className="text-white/70 flex-shrink-0" />
                <span className="text-white/80 text-[13px] font-medium whitespace-nowrap" style={{fontFamily: 'Rubik, sans-serif'}}>OFICIALFEVER.COM</span>
              </div>

              <div className="w-px h-6 bg-white/20"></div>

              <div className="flex items-center min-w-[110px] justify-center">
                <span className="text-white/90 text-[13px] font-medium whitespace-nowrap" style={{fontFamily: 'Rubik, sans-serif'}}>
                  {currentTime.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })} {currentTime.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="w-px h-6 bg-white/20"></div>

              <div className="flex items-center justify-center gap-2 min-w-[150px]">
                <span className="text-red-400 text-[13px] font-bold" style={{fontFamily: 'Rubik, sans-serif'}}>+18</span>
                <span className="text-red-300 text-[13px] font-medium whitespace-nowrap" style={{fontFamily: 'Rubik, sans-serif'}}>BeGambleAware</span>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="w-[1920px] h-[1080px] flex items-center justify-center p-8">
            <div className="text-center">
              <div className="bg-black/80 backdrop-blur-sm rounded-2xl p-12 border border-white/20">
                <h1 className="text-4xl font-bold text-white mb-4 uppercase">{overlay.name}</h1>
                <p className="text-white/80 text-xl mb-4 uppercase">Tipo: {overlay.type}</p>
                <p className="text-white/60 uppercase">ID: {overlay.id}</p>
                <div className={`mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full uppercase ${
                  overlay.is_active
                    ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                    : 'bg-gray-500/20 border border-gray-500/50 text-gray-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${overlay.is_active ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                  {overlay.is_active ? 'Ativo' : 'Inativo'}
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="w-[1920px] h-[1080px] bg-transparent overflow-hidden">
      {renderOverlayContent()}
    </div>
  );
}
