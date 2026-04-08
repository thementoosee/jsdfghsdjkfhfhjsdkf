import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Alert {
  id: string;
  alert_type: string;
  username: string;
  display_name: string;
  message?: string;
  amount: number;
  tier?: string;
  months: number;
  created_at: string;
}

export function AlertsOverlay() {
  const [currentAlert, setCurrentAlert] = useState<Alert | null>(null);
  const [shownAlertIds, setShownAlertIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const channel = supabase
      .channel('alerts_overlay')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'twitch_alerts' }, (payload) => {
        const newAlert = payload.new as Alert;

        setShownAlertIds((prev) => {
          if (prev.has(newAlert.id)) {
            console.log('Duplicate alert ignored (already shown):', newAlert.id);
            return prev;
          }

          showAlert(newAlert);

          const updated = new Set(prev);
          updated.add(newAlert.id);
          return updated;
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'streamelements_events' }, (payload) => {
        const seEvent = payload.new as any;
        const mappedAlert: Alert = {
          id: seEvent.id,
          alert_type: seEvent.event_type || 'unknown',
          username: seEvent.username,
          display_name: seEvent.display_name || seEvent.username,
          message: seEvent.message,
          amount: seEvent.amount || 0,
          tier: seEvent.tier,
          months: seEvent.months || 0,
          created_at: seEvent.created_at,
        };

        setShownAlertIds((prev) => {
          if (prev.has(mappedAlert.id)) {
            console.log('Duplicate SE alert ignored (already shown):', mappedAlert.id);
            return prev;
          }

          showAlert(mappedAlert);

          const updated = new Set(prev);
          updated.add(mappedAlert.id);
          return updated;
        });
      })
      .subscribe();

    const cleanupInterval = setInterval(() => {
      setShownAlertIds(new Set());
    }, 60000);

    return () => {
      channel.unsubscribe();
      clearInterval(cleanupInterval);
    };
  }, []);

  const showAlert = (alert: Alert) => {
    setCurrentAlert(alert);

    setTimeout(() => {
      setCurrentAlert(null);
    }, 5000);
  };

  if (!currentAlert) return null;

  const getAlertContent = () => {
    switch (currentAlert.alert_type) {
      case 'follow':
      case 'follower':
        return {
          title: 'NEW FOLLOWER',
          message: `${currentAlert.display_name} seguiu o canal!`,
          color: 'from-blue-500 to-blue-600',
          icon: '👋'
        };
      case 'subscription':
      case 'subscriber':
        const tierText = currentAlert.tier === '1000' ? 'Tier 1' :
                        currentAlert.tier === '2000' ? 'Tier 2' :
                        currentAlert.tier === '3000' ? 'Tier 3' : 'Prime';
        const monthsText = currentAlert.months > 1 ? ` por ${currentAlert.months} meses` : '';
        return {
          title: 'NEW SUBSCRIBER',
          message: `${currentAlert.display_name} subscreveu (${tierText})${monthsText}!`,
          color: 'from-purple-500 to-purple-600',
          icon: '⭐'
        };
      case 'raid':
        return {
          title: 'RAID',
          message: `${currentAlert.display_name} fez raid com ${currentAlert.amount} viewers!`,
          color: 'from-red-500 to-red-600',
          icon: '🔥'
        };
      case 'cheer':
        return {
          title: 'CHEER',
          message: `${currentAlert.display_name} deu ${currentAlert.amount} bits!`,
          color: 'from-yellow-500 to-yellow-600',
          icon: '💎'
        };
      case 'tip':
      case 'donation':
        return {
          title: 'DONATION',
          message: `${currentAlert.display_name} doou €${currentAlert.amount?.toFixed(2)}!`,
          color: 'from-green-500 to-green-600',
          icon: '💰'
        };
      case 'host':
        return {
          title: 'HOST',
          message: `${currentAlert.display_name} está a hospedar o canal!`,
          color: 'from-cyan-500 to-cyan-600',
          icon: '📺'
        };
      default:
        return {
          title: 'ALERT',
          message: `${currentAlert.display_name}`,
          color: 'from-gray-500 to-gray-600',
          icon: '🔔'
        };
    }
  };

  const alertContent = getAlertContent();

  return (
    <div className="fixed inset-0 pointer-events-none flex items-center justify-center p-8">
      <div>
        <div className={`bg-gradient-to-r ${alertContent.color} rounded-3xl shadow-2xl p-8 min-w-[500px] border-4 border-white/30`}>
          <div className="text-center space-y-4">
            <div className="text-6xl">{alertContent.icon}</div>
            <h2 className="text-3xl font-black text-white uppercase tracking-wider">
              {alertContent.title}
            </h2>
            <p className="text-2xl font-bold text-white/90">
              {alertContent.message}
            </p>
            {currentAlert.message && (
              <p className="text-lg text-white/80 italic">
                "{currentAlert.message}"
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
