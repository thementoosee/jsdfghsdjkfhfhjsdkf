import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Target, Percent, Gift, Coffee } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BonusHuntStats {
  total_hunts: number;
  active_hunts: number;
  completed_hunts: number;
  total_invested: number;
  total_won: number;
  total_profit: number;
  total_bonuses: number;
  average_multiplier: number;
}

interface ChillSessionStats {
  total_sessions: number;
  active_sessions: number;
  total_bonuses: number;
  total_bet: number;
  total_won: number;
  total_profit: number;
  average_multiplier: number;
}

interface TopSlot {
  slot_name: string;
  slot_image: string | null;
  total_bonuses: number;
  total_bet: number;
  total_won: number;
  profit: number;
  average_multiplier: number;
}

export function Statistics() {
  const [bonusHuntStats, setBonusHuntStats] = useState<BonusHuntStats>({
    total_hunts: 0,
    active_hunts: 0,
    completed_hunts: 0,
    total_invested: 0,
    total_won: 0,
    total_profit: 0,
    total_bonuses: 0,
    average_multiplier: 0
  });

  const [chillStats, setChillStats] = useState<ChillSessionStats>({
    total_sessions: 0,
    active_sessions: 0,
    total_bonuses: 0,
    total_bet: 0,
    total_won: 0,
    total_profit: 0,
    average_multiplier: 0
  });

  const [topSlots, setTopSlots] = useState<TopSlot[]>([]);

  useEffect(() => {
    loadStatistics();

    const channel = supabase
      .channel('stats_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_hunts' }, () => {
        loadStatistics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_hunt_items' }, () => {
        loadStatistics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_openings' }, () => {
        loadStatistics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_opening_items' }, () => {
        loadStatistics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_sessions' }, () => {
        loadStatistics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chill_bonuses' }, () => {
        loadStatistics();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadStatistics = async () => {
    await Promise.all([
      loadBonusHuntStats(),
      loadChillStats(),
      loadTopSlots()
    ]);
  };

  const loadBonusHuntStats = async () => {
    try {
      const { data: hunts, error: huntsError } = await supabase
        .from('bonus_hunts')
        .select('*');

      if (huntsError) throw huntsError;

      const { data: openings, error: openingsError } = await supabase
        .from('bonus_openings')
        .select('*');

      if (openingsError) throw openingsError;

      const huntStats = {
        total_hunts: hunts?.length || 0,
        active_hunts: hunts?.filter(h => h.status === 'active').length || 0,
        completed_hunts: hunts?.filter(h => h.status === 'completed').length || 0,
        total_invested: hunts?.reduce((sum, h) => sum + (h.total_invested || 0), 0) || 0,
        total_won: hunts?.reduce((sum, h) => sum + (h.total_won || 0), 0) || 0,
        total_profit: hunts?.reduce((sum, h) => sum + (h.profit_loss || 0), 0) || 0,
        total_bonuses: hunts?.reduce((sum, h) => sum + (h.bonus_count || 0), 0) || 0,
      };

      const openingStats = {
        total_invested: openings?.reduce((sum, o) => sum + (o.total_investment || 0), 0) || 0,
        total_won: openings?.reduce((sum, o) => sum + (o.total_payout || 0), 0) || 0,
        total_profit: openings?.reduce((sum, o) => sum + (o.profit_loss || 0), 0) || 0,
        total_bonuses: 0,
      };

      const { data: openingItemsCount } = await supabase
        .from('bonus_opening_items')
        .select('id', { count: 'exact', head: true });

      openingStats.total_bonuses = openingItemsCount || 0;

      const stats = {
        total_hunts: huntStats.total_hunts + (openings?.length || 0),
        active_hunts: huntStats.active_hunts + (openings?.filter(o => o.status === 'active').length || 0),
        completed_hunts: huntStats.completed_hunts + (openings?.filter(o => o.status === 'completed').length || 0),
        total_invested: huntStats.total_invested + openingStats.total_invested,
        total_won: huntStats.total_won + openingStats.total_won,
        total_profit: huntStats.total_profit + openingStats.total_profit,
        total_bonuses: huntStats.total_bonuses + openingStats.total_bonuses,
        average_multiplier: 0
      };

      if (stats.total_invested > 0) {
        stats.average_multiplier = stats.total_won / stats.total_invested;
      }

      setBonusHuntStats(stats);
    } catch (error) {
      console.error('Error loading bonus hunt stats:', error);
    }
  };

  const loadChillStats = async () => {
    try {
      const { data: sessions, error: sessionsError } = await supabase
        .from('chill_sessions')
        .select('*');

      if (sessionsError) throw sessionsError;

      const stats = {
        total_sessions: sessions?.length || 0,
        active_sessions: sessions?.filter(s => !s.ended_at).length || 0,
        total_bonuses: sessions?.reduce((sum, s) => sum + (s.total_bonuses || 0), 0) || 0,
        total_bet: sessions?.reduce((sum, s) => sum + (s.total_bet || 0), 0) || 0,
        total_won: sessions?.reduce((sum, s) => sum + (s.total_won || 0), 0) || 0,
        total_profit: 0,
        average_multiplier: 0
      };

      stats.total_profit = stats.total_won - stats.total_bet;

      if (stats.total_bet > 0) {
        stats.average_multiplier = stats.total_won / stats.total_bet;
      }

      setChillStats(stats);
    } catch (error) {
      console.error('Error loading chill stats:', error);
    }
  };

  const loadTopSlots = async () => {
    try {
      const { data: huntItems, error: huntError } = await supabase
        .from('bonus_hunt_items')
        .select('slot_name, slot_image_url, bet_amount, payment_amount, result_amount, status');

      if (huntError) throw huntError;

      const { data: openingItems, error: openingError } = await supabase
        .from('bonus_opening_items')
        .select('slot_name, slot_image, payment, payout, status');

      if (openingError) throw openingError;

      const { data: sessions, error: sessionsError } = await supabase
        .from('chill_sessions')
        .select('slot_name, total_bonuses, total_bet, total_won');

      if (sessionsError) throw sessionsError;

      const slotMap = new Map<string, { bet: number; won: number; count: number; image: string | null }>();

      huntItems?.forEach(item => {
        if (item.status === 'opened' && item.result_amount) {
          const existing = slotMap.get(item.slot_name) || { bet: 0, won: 0, count: 0, image: null };
          slotMap.set(item.slot_name, {
            bet: existing.bet + (item.payment_amount || item.bet_amount),
            won: existing.won + item.result_amount,
            count: existing.count + 1,
            image: existing.image || item.slot_image_url
          });
        }
      });

      openingItems?.forEach(item => {
        if (item.status === 'opened' && item.payout) {
          const existing = slotMap.get(item.slot_name) || { bet: 0, won: 0, count: 0, image: null };
          slotMap.set(item.slot_name, {
            bet: existing.bet + (item.payment || 0),
            won: existing.won + (item.payout || 0),
            count: existing.count + 1,
            image: existing.image || item.slot_image
          });
        }
      });

      sessions?.forEach((session: any) => {
        if (session.slot_name && session.total_bonuses > 0) {
          const slotName = session.slot_name;
          const existing = slotMap.get(slotName) || { bet: 0, won: 0, count: 0, image: null };
          slotMap.set(slotName, {
            bet: existing.bet + (session.total_bet || 0),
            won: existing.won + (session.total_won || 0),
            count: existing.count + (session.total_bonuses || 0),
            image: existing.image
          });
        }
      });

      const slotNames = Array.from(slotMap.keys());
      const { data: slotsData } = await supabase
        .from('slots')
        .select('name, image_url')
        .in('name', slotNames);

      const slotImages = new Map(slotsData?.map(s => [s.name, s.image_url]) || []);

      const slots: TopSlot[] = Array.from(slotMap.entries()).map(([name, data]) => ({
        slot_name: name,
        slot_image: data.image || slotImages.get(name) || '/image.png',
        total_bonuses: data.count,
        total_bet: data.bet,
        total_won: data.won,
        profit: data.won - data.bet,
        average_multiplier: data.bet > 0 ? data.won / data.bet : 0
      }));

      slots.sort((a, b) => b.profit - a.profit);

      setTopSlots(slots.slice(0, 5));
    } catch (error) {
      console.error('Error loading top slots:', error);
    }
  };

  const totalProfit = bonusHuntStats.total_profit + chillStats.total_profit;
  const totalInvested = bonusHuntStats.total_invested + chillStats.total_bet;
  const totalWon = bonusHuntStats.total_won + chillStats.total_won;
  const totalBonuses = bonusHuntStats.total_bonuses + chillStats.total_bonuses;
  const overallMultiplier = totalInvested > 0 ? totalWon / totalInvested : 0;

  return (
    <div className="space-y-6 mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
          <BarChart3 className="w-6 h-6" style={{ color: '#b89968' }} />
        </div>
        <div>
          <h2 className="text-2xl font-bold uppercase" style={{ color: '#d4d4d4' }}>Estatísticas Gerais</h2>
          <p className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Resumo de todas as suas sessões</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
          <div className="flex items-center justify-between mb-3">
            <DollarSign className="w-8 h-8" style={{ color: '#b89968' }} />
            <span className="text-xs font-semibold uppercase px-2 py-1 rounded" style={{ background: 'rgba(139, 116, 96, 0.2)', color: '#b89968' }}>Total</span>
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color: '#d4d4d4' }}>€{totalInvested.toFixed(2)}</p>
          <p className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total Investido</p>
        </div>

        <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-8 h-8" style={{ color: '#b89968' }} />
            <span className="text-xs font-semibold uppercase px-2 py-1 rounded" style={{ background: 'rgba(139, 116, 96, 0.2)', color: '#b89968' }}>Total</span>
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color: '#d4d4d4' }}>€{totalWon.toFixed(2)}</p>
          <p className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total Ganho</p>
        </div>

        <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: totalProfit >= 0 ? '1px solid #10b981' : '1px solid #ef4444' }}>
          <div className="flex items-center justify-between mb-3">
            {totalProfit >= 0 ? <TrendingUp className="w-8 h-8" style={{ color: '#10b981' }} /> : <TrendingDown className="w-8 h-8" style={{ color: '#ef4444' }} />}
            <span className="text-xs font-semibold uppercase px-2 py-1 rounded" style={{ background: totalProfit >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: totalProfit >= 0 ? '#10b981' : '#ef4444' }}>Lucro</span>
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color: totalProfit >= 0 ? '#10b981' : '#ef4444' }}>€{totalProfit.toFixed(2)}</p>
          <p className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Lucro/Prejuízo</p>
        </div>

        <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
          <div className="flex items-center justify-between mb-3">
            <Percent className="w-8 h-8" style={{ color: '#b89968' }} />
            <span className="text-xs font-semibold uppercase px-2 py-1 rounded" style={{ background: 'rgba(139, 116, 96, 0.2)', color: '#b89968' }}>Média</span>
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color: '#d4d4d4' }}>{overallMultiplier.toFixed(2)}x</p>
          <p className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Multiplicador Médio</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
              <Gift className="w-5 h-5" style={{ color: '#b89968' }} />
            </div>
            <h3 className="text-lg font-bold uppercase" style={{ color: '#d4d4d4' }}>Bonus Hunt</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total de Hunts</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>{bonusHuntStats.total_hunts}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Hunts Ativos</span>
              <span className="text-lg font-bold" style={{ color: '#b89968' }}>{bonusHuntStats.active_hunts}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Hunts Completos</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>{bonusHuntStats.completed_hunts}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total Bonuses</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>{bonusHuntStats.total_bonuses}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total Investido</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>€{bonusHuntStats.total_invested.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total Ganho</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>€{bonusHuntStats.total_won.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Lucro</span>
              <span className="text-lg font-bold" style={{ color: bonusHuntStats.total_profit >= 0 ? '#10b981' : '#ef4444' }}>
                €{bonusHuntStats.total_profit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
              <Coffee className="w-5 h-5" style={{ color: '#b89968' }} />
            </div>
            <h3 className="text-lg font-bold uppercase" style={{ color: '#d4d4d4' }}>Chill Sessions</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total de Sessões</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>{chillStats.total_sessions}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Sessões Ativas</span>
              <span className="text-lg font-bold" style={{ color: '#b89968' }}>{chillStats.active_sessions}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total Bonuses</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>{chillStats.total_bonuses}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total Apostado</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>€{chillStats.total_bet.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Total Ganho</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>€{chillStats.total_won.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #3d3d3d' }}>
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Multiplicador Médio</span>
              <span className="text-lg font-bold" style={{ color: '#d4d4d4' }}>{chillStats.average_multiplier.toFixed(2)}x</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm uppercase" style={{ color: '#8a8a8a' }}>Lucro</span>
              <span className="text-lg font-bold" style={{ color: chillStats.total_profit >= 0 ? '#10b981' : '#ef4444' }}>
                €{chillStats.total_profit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {topSlots.length > 0 && (
        <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139, 116, 96, 0.2)', border: '1px solid rgba(139, 116, 96, 0.3)' }}>
              <Target className="w-5 h-5" style={{ color: '#b89968' }} />
            </div>
            <div>
              <h3 className="text-lg font-bold uppercase" style={{ color: '#d4d4d4' }}>Top 5 Slots</h3>
              <p className="text-xs uppercase" style={{ color: '#8a8a8a' }}>Ordenado por lucro</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '2px solid #3d3d3d' }}>
                  <th className="text-left py-3 px-2 text-xs font-bold uppercase" style={{ color: '#8a8a8a' }}>#</th>
                  <th className="text-left py-3 px-2 text-xs font-bold uppercase" style={{ color: '#8a8a8a' }}>Slot</th>
                  <th className="text-center py-3 px-2 text-xs font-bold uppercase" style={{ color: '#8a8a8a' }}>Bonuses</th>
                  <th className="text-right py-3 px-2 text-xs font-bold uppercase" style={{ color: '#8a8a8a' }}>Investido</th>
                  <th className="text-right py-3 px-2 text-xs font-bold uppercase" style={{ color: '#8a8a8a' }}>Ganho</th>
                  <th className="text-right py-3 px-2 text-xs font-bold uppercase" style={{ color: '#8a8a8a' }}>Mult. Médio</th>
                  <th className="text-right py-3 px-2 text-xs font-bold uppercase" style={{ color: '#8a8a8a' }}>Lucro</th>
                </tr>
              </thead>
              <tbody>
                {topSlots.map((slot, index) => (
                  <tr key={slot.slot_name} style={{ borderBottom: '1px solid #2d2d2d' }} className="transition-colors hover:bg-opacity-50">
                    <td className="py-3 px-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold" style={{
                        background: index === 0 ? '#b89968' : index === 1 ? '#8a8a8a' : index === 2 ? '#a0826d' : '#3d3d3d',
                        color: index <= 2 ? '#1a1a1a' : '#8a8a8a'
                      }}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-3">
                        <img
                          src={slot.slot_image || '/image.png'}
                          alt={slot.slot_name}
                          className="w-10 h-14 object-cover rounded"
                          style={{ border: '1px solid #3d3d3d' }}
                        />
                        <span className="font-semibold text-sm uppercase" style={{ color: '#d4d4d4' }}>{slot.slot_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center font-medium" style={{ color: '#d4d4d4' }}>{slot.total_bonuses}</td>
                    <td className="py-3 px-2 text-right font-medium" style={{ color: '#d4d4d4' }}>€{slot.total_bet.toFixed(2)}</td>
                    <td className="py-3 px-2 text-right font-medium" style={{ color: '#d4d4d4' }}>€{slot.total_won.toFixed(2)}</td>
                    <td className="py-3 px-2 text-right font-bold" style={{ color: '#b89968' }}>{slot.average_multiplier.toFixed(2)}x</td>
                    <td className="py-3 px-2 text-right font-bold" style={{ color: slot.profit >= 0 ? '#10b981' : '#ef4444' }}>
                      €{slot.profit.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, #2d2d2d 0%, #252525 100%)', border: '1px solid #3d3d3d' }}>
        <div className="flex items-center gap-3 mb-3">
          <BarChart3 className="w-6 h-6" style={{ color: '#b89968' }} />
          <h3 className="text-lg font-bold uppercase" style={{ color: '#d4d4d4' }}>Resumo Total</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs uppercase mb-1" style={{ color: '#8a8a8a' }}>Total Bonuses</p>
            <p className="text-2xl font-bold" style={{ color: '#d4d4d4' }}>{totalBonuses}</p>
          </div>
          <div>
            <p className="text-xs uppercase mb-1" style={{ color: '#8a8a8a' }}>Taxa de Sucesso</p>
            <p className="text-2xl font-bold" style={{ color: '#d4d4d4' }}>
              {totalInvested > 0 ? ((totalWon / totalInvested) * 100).toFixed(1) : '0.0'}%
            </p>
          </div>
          <div>
            <p className="text-xs uppercase mb-1" style={{ color: '#8a8a8a' }}>ROI</p>
            <p className="text-2xl font-bold" style={{ color: totalProfit >= 0 ? '#10b981' : '#ef4444' }}>
              {totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(1) : '0.0'}%
            </p>
          </div>
          <div>
            <p className="text-xs uppercase mb-1" style={{ color: '#8a8a8a' }}>Ganho Médio/Bonus</p>
            <p className="text-2xl font-bold" style={{ color: '#d4d4d4' }}>
              €{totalBonuses > 0 ? (totalWon / totalBonuses).toFixed(2) : '0.00'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
