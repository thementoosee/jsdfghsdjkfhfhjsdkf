import { useState, useEffect, type ReactNode } from 'react';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Target, Percent, Gift, Coffee } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TOP_SLOT_FALLBACK_IMAGE } from '../lib/slot-image';
import {
  createEmptyTopSlotsPlaceholders,
  fetchTopSlotsRanking,
  isTopSlotFilled,
  type TopSlotEntry,
} from '../lib/top-slots';

/** Local admin visual tokens — isolated to Statistics (not OBS overlays). */
const st = {
  page: '#0f0f12',
  panel: '#141418',
  card: '#1c1c22',
  cardBorder: 'rgba(82, 82, 91, 0.55)',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#3b82f6',
  accentSoft: '#60a5fa',
  accentMuted: 'rgba(59, 130, 246, 0.16)',
  accentBorder: 'rgba(96, 165, 250, 0.35)',
  gold: '#fbbf24',
  goldMuted: 'rgba(251, 191, 36, 0.14)',
  goldBorder: 'rgba(251, 191, 36, 0.4)',
  success: '#22c55e',
  successMuted: 'rgba(34, 197, 94, 0.12)',
  successBorder: 'rgba(34, 197, 94, 0.35)',
  danger: '#ef4444',
  dangerMuted: 'rgba(239, 68, 68, 0.12)',
  dangerBorder: 'rgba(239, 68, 68, 0.3)',
} as const;

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

  const [topSlots, setTopSlots] = useState<TopSlotEntry[]>(() => createEmptyTopSlotsPlaceholders());

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
      loadTopSlots(),
    ]);
  };

  const loadTopSlots = async () => {
    try {
      const ranked = await fetchTopSlotsRanking();
      setTopSlots(ranked);
    } catch (error) {
      console.error('Error loading top slots:', error);
    }
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

      // Bonus Hunt statuses in app: active | opening | completed.
      // "opening" is still an in-progress hunt (Start Opening) — must count as active.
      // Do NOT invent completed; only status === 'completed' counts as complete.
      const huntList = hunts || [];
      const openingList = openings || [];

      const isHuntActive = (status: string | null | undefined) =>
        status === 'active' || status === 'opening';
      const isHuntCompleted = (status: string | null | undefined) => status === 'completed';

      const huntStats = {
        total_hunts: huntList.length,
        active_hunts: huntList.filter((h) => isHuntActive(h.status)).length,
        completed_hunts: huntList.filter((h) => isHuntCompleted(h.status)).length,
        total_invested: huntList.reduce((sum, h) => sum + (Number(h.total_invested) || 0), 0),
        total_won: huntList.reduce((sum, h) => sum + (Number(h.total_won) || 0), 0),
        total_profit: huntList.reduce((sum, h) => sum + (Number(h.profit_loss) || 0), 0),
        total_bonuses: huntList.reduce((sum, h) => sum + (Number(h.bonus_count) || 0), 0),
      };

      const openingStats = {
        total_invested: openingList.reduce((sum, o) => sum + (Number(o.total_investment) || 0), 0),
        total_won: openingList.reduce((sum, o) => sum + (Number(o.total_payout) || 0), 0),
        total_profit: openingList.reduce((sum, o) => sum + (Number(o.profit_loss) || 0), 0),
        total_bonuses: 0,
        active: openingList.filter((o) => isHuntActive(o.status)).length,
        completed: openingList.filter((o) => isHuntCompleted(o.status)).length,
      };

      const { count: openingItemsCount } = await supabase
        .from('bonus_opening_items')
        .select('id', { count: 'exact', head: true });

      openingStats.total_bonuses = openingItemsCount || 0;

      const stats = {
        total_hunts: huntStats.total_hunts + openingList.length,
        active_hunts: huntStats.active_hunts + openingStats.active,
        completed_hunts: huntStats.completed_hunts + openingStats.completed,
        total_invested: huntStats.total_invested + openingStats.total_invested,
        total_won: huntStats.total_won + openingStats.total_won,
        total_profit: huntStats.total_profit + openingStats.total_profit,
        total_bonuses: huntStats.total_bonuses + openingStats.total_bonuses,
        average_multiplier: 0,
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

  const totalProfit = bonusHuntStats.total_profit + chillStats.total_profit;
  const totalInvested = bonusHuntStats.total_invested + chillStats.total_bet;
  const totalWon = bonusHuntStats.total_won + chillStats.total_won;
  const totalBonuses = bonusHuntStats.total_bonuses + chillStats.total_bonuses;
  const overallMultiplier = totalInvested > 0 ? totalWon / totalInvested : 0;
  const profitPositive = totalProfit >= 0;

  return (
    <div className="min-h-full p-4 sm:p-6 mb-8" style={{ background: st.page, color: st.text }}>
      <div className="max-w-7xl mx-auto space-y-5">
        <header
          className="rounded-2xl px-5 py-4 flex items-start gap-3"
          style={{ background: st.panel, border: `1px solid ${st.cardBorder}` }}
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: st.accentMuted, border: `1px solid ${st.accentBorder}` }}
          >
            <BarChart3 className="w-5 h-5" style={{ color: st.accentSoft }} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wide">Estatísticas Gerais</h2>
            <p className="text-sm mt-0.5" style={{ color: st.muted }}>
              Resumo de todas as suas sessões
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <SummaryCard
            icon={<DollarSign className="w-4 h-4" />}
            badge="Total"
            label="Total Investido"
            value={`€${totalInvested.toFixed(2)}`}
          />
          <SummaryCard
            icon={<TrendingUp className="w-4 h-4" />}
            badge="Total"
            label="Total Ganho"
            value={`€${totalWon.toFixed(2)}`}
          />
          <SummaryCard
            icon={
              profitPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )
            }
            badge={profitPositive ? 'Lucro' : 'Prejuízo'}
            label="Lucro/Prejuízo"
            value={`€${totalProfit.toFixed(2)}`}
            tone={profitPositive ? 'success' : 'danger'}
          />
          <SummaryCard
            icon={<Percent className="w-4 h-4" />}
            badge="Média"
            label="Multiplicador Médio"
            value={`${overallMultiplier.toFixed(2)}x`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <StatsPanel
            icon={<Gift className="w-4 h-4" />}
            title="Bonus Hunt"
            rows={[
              { label: 'Total de Hunts', value: String(bonusHuntStats.total_hunts) },
              {
                label: 'Hunts Ativos',
                value: String(bonusHuntStats.active_hunts),
                accent: true,
              },
              { label: 'Hunts Completos', value: String(bonusHuntStats.completed_hunts) },
              { label: 'Total Bonuses', value: String(bonusHuntStats.total_bonuses) },
              { label: 'Total Investido', value: `€${bonusHuntStats.total_invested.toFixed(2)}` },
              { label: 'Total Ganho', value: `€${bonusHuntStats.total_won.toFixed(2)}` },
              {
                label: 'Lucro',
                value: `€${bonusHuntStats.total_profit.toFixed(2)}`,
                tone: bonusHuntStats.total_profit >= 0 ? 'success' : 'danger',
              },
            ]}
          />

          <StatsPanel
            icon={<Coffee className="w-4 h-4" />}
            title="Chill Sessions"
            rows={[
              { label: 'Total de Sessões', value: String(chillStats.total_sessions) },
              {
                label: 'Sessões Ativas',
                value: String(chillStats.active_sessions),
                accent: true,
              },
              { label: 'Total Bonuses', value: String(chillStats.total_bonuses) },
              { label: 'Total Apostado', value: `€${chillStats.total_bet.toFixed(2)}` },
              { label: 'Total Ganho', value: `€${chillStats.total_won.toFixed(2)}` },
              {
                label: 'Multiplicador Médio',
                value: `${chillStats.average_multiplier.toFixed(2)}x`,
              },
              {
                label: 'Lucro',
                value: `€${chillStats.total_profit.toFixed(2)}`,
                tone: chillStats.total_profit >= 0 ? 'success' : 'danger',
              },
            ]}
          />
        </div>

        <section
          className="rounded-2xl p-4 sm:p-5"
          style={{ background: st.panel, border: `1px solid ${st.cardBorder}` }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: st.accentMuted, border: `1px solid ${st.accentBorder}` }}
            >
              <Target className="w-4 h-4" style={{ color: st.accentSoft }} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-wide">Top 5 Slots</h3>
              <p className="text-xs mt-0.5" style={{ color: st.muted }}>
                Maior multiplicador individual por slot (Hunt + CHILL)
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${st.cardBorder}` }}>
                  {['#', 'Slot', 'Provider', 'Max Mult.', 'Bet', 'Win'].map((h, i) => (
                    <th
                      key={h}
                      className={`py-3 px-2 text-[10px] font-bold uppercase tracking-wide ${
                        i >= 3 ? 'text-right' : 'text-left'
                      }`}
                      style={{ color: st.muted }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topSlots.map((slot) => {
                  const filled = isTopSlotFilled(slot);
                  return (
                    <tr key={slot.rank} style={{ borderBottom: `1px solid ${st.cardBorder}` }}>
                      <td className="py-3 px-2">
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black"
                          style={{
                            background:
                              slot.rank === 1
                                ? st.goldMuted
                                : slot.rank <= 3
                                  ? st.accentMuted
                                  : st.card,
                            color:
                              slot.rank === 1
                                ? st.gold
                                : slot.rank <= 3
                                  ? st.accentSoft
                                  : st.muted,
                            border: `1px solid ${
                              slot.rank === 1
                                ? st.goldBorder
                                : slot.rank <= 3
                                  ? st.accentBorder
                                  : st.cardBorder
                            }`,
                          }}
                        >
                          {slot.rank}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-3">
                          <img
                            src={slot.slot_image || TOP_SLOT_FALLBACK_IMAGE}
                            alt={filled ? String(slot.slot_name) : 'Jigadores'}
                            className="w-10 h-14 object-cover rounded-lg"
                            style={{ border: `1px solid ${st.cardBorder}` }}
                            onError={(e) => {
                              e.currentTarget.src = TOP_SLOT_FALLBACK_IMAGE;
                            }}
                          />
                          <span
                            className="font-semibold text-sm truncate"
                            style={{ color: filled ? st.text : st.muted }}
                          >
                            {filled ? slot.slot_name : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm" style={{ color: st.muted }}>
                        {slot.provider?.trim() ? slot.provider : '—'}
                      </td>
                      <td className="py-3 px-2 text-right font-bold text-sm" style={{ color: st.gold }}>
                        {slot.max_multiplier != null
                          ? `${Number(slot.max_multiplier).toFixed(2)}x`
                          : '—'}
                      </td>
                      <td className="py-3 px-2 text-right text-sm font-medium" style={{ color: st.text }}>
                        {slot.bet_amount != null ? `€${Number(slot.bet_amount).toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3 px-2 text-right text-sm font-medium" style={{ color: st.text }}>
                        {slot.win_amount != null ? `€${Number(slot.win_amount).toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className="rounded-2xl p-4 sm:p-5"
          style={{ background: st.panel, border: `1px solid ${st.cardBorder}` }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: st.accentMuted, border: `1px solid ${st.accentBorder}` }}
            >
              <BarChart3 className="w-4 h-4" style={{ color: st.accentSoft }} />
            </div>
            <h3 className="text-base font-black uppercase tracking-wide">Resumo Total</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniMetric label="Total Bonuses" value={String(totalBonuses)} />
            <MiniMetric
              label="Taxa de Sucesso"
              value={`${totalInvested > 0 ? ((totalWon / totalInvested) * 100).toFixed(1) : '0.0'}%`}
            />
            <MiniMetric
              label="ROI"
              value={`${totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(1) : '0.0'}%`}
              tone={profitPositive ? 'success' : 'danger'}
            />
            <MiniMetric
              label="Ganho Médio/Bonus"
              value={`€${totalBonuses > 0 ? (totalWon / totalBonuses).toFixed(2) : '0.00'}`}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  badge,
  label,
  value,
  tone = 'default',
}: {
  icon: ReactNode;
  badge: string;
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}) {
  const styles =
    tone === 'success'
      ? { iconBg: st.successMuted, iconBorder: st.successBorder, iconColor: st.success, valueColor: st.success, badgeBg: st.successMuted, badgeColor: st.success }
      : tone === 'danger'
        ? { iconBg: st.dangerMuted, iconBorder: st.dangerBorder, iconColor: st.danger, valueColor: st.danger, badgeBg: st.dangerMuted, badgeColor: st.danger }
        : { iconBg: st.accentMuted, iconBorder: st.accentBorder, iconColor: st.accentSoft, valueColor: st.text, badgeBg: st.accentMuted, badgeColor: st.accentSoft };

  return (
    <div
      className="rounded-2xl p-4 sm:p-5"
      style={{ background: st.panel, border: `1px solid ${st.cardBorder}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: styles.iconBg, border: `1px solid ${styles.iconBorder}`, color: styles.iconColor }}
        >
          {icon}
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
          style={{ background: styles.badgeBg, color: styles.badgeColor }}
        >
          {badge}
        </span>
      </div>
      <p className="text-2xl sm:text-3xl font-black truncate leading-tight" style={{ color: styles.valueColor }} title={value}>
        {value}
      </p>
      <p className="text-xs font-semibold uppercase tracking-wide mt-1.5" style={{ color: st.muted }}>
        {label}
      </p>
    </div>
  );
}

function StatsPanel({
  icon,
  title,
  rows,
}: {
  icon: ReactNode;
  title: string;
  rows: Array<{
    label: string;
    value: string;
    accent?: boolean;
    tone?: 'success' | 'danger';
  }>;
}) {
  return (
    <section
      className="rounded-2xl p-4 sm:p-5"
      style={{ background: st.panel, border: `1px solid ${st.cardBorder}` }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: st.accentMuted, border: `1px solid ${st.accentBorder}`, color: st.accentSoft }}
        >
          {icon}
        </div>
        <h3 className="text-base font-black uppercase tracking-wide">{title}</h3>
      </div>
      <div>
        {rows.map((row, index) => {
          const valueColor =
            row.tone === 'success'
              ? st.success
              : row.tone === 'danger'
                ? st.danger
                : row.accent
                  ? st.accentSoft
                  : st.text;
          return (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 py-2.5"
              style={{
                borderBottom: index < rows.length - 1 ? `1px solid ${st.cardBorder}` : 'none',
              }}
            >
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: st.muted }}>
                {row.label}
              </span>
              <span className="text-base font-bold tabular-nums" style={{ color: valueColor }}>
                {row.value}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}) {
  const color =
    tone === 'success' ? st.success : tone === 'danger' ? st.danger : st.text;
  return (
    <div
      className="rounded-xl px-3.5 py-3"
      style={{ background: st.card, border: `1px solid ${st.cardBorder}` }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: st.muted }}>
        {label}
      </p>
      <p className="text-xl font-black truncate" style={{ color }} title={value}>
        {value}
      </p>
    </div>
  );
}
