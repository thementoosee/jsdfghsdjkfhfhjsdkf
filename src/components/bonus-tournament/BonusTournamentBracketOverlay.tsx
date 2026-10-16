/**
 * Horizontal bracket overlay for the OBS casino cutout (1288×720).
 * Read-only — never mutates tournament state.
 * Qualification: loser grays in place; winner fades in on the next-round seat (no flight).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Crown } from 'lucide-react';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { SlotThumb } from './SlotThumb';
import {
  BRACKET_OVERLAY_H,
  BRACKET_OVERLAY_W,
  type BracketSeat,
  type BracketView,
} from './bracket-structure';
import type { DrawParticipant } from './draw-types';

const GOLD = '#fbbf24';
const GOLD_SOFT = 'rgba(251,191,36,0.45)';
const CARD_BG = 'rgba(15, 23, 42, 0.82)';
const CARD_BORDER = 'rgba(148, 163, 184, 0.22)';
const MUTED = '#94a3b8';

/** Portrait slot thumb ≈ 2:3 */
const THUMB_W = 38;
const THUMB_H = Math.round(THUMB_W * 1.5);
const THUMB_W_SM = 34;
const THUMB_H_SM = Math.round(THUMB_W_SM * 1.5);
const THUMB_W_LG = 44;
const THUMB_H_LG = Math.round(THUMB_W_LG * 1.5);

const GRAY_MS = 500;
const SEAT_FADE_MS = 600;

type SeatKey =
  | 'qf-0-a'
  | 'qf-0-b'
  | 'qf-1-a'
  | 'qf-1-b'
  | 'qf-2-a'
  | 'qf-2-b'
  | 'qf-3-a'
  | 'qf-3-b'
  | 'sf-0-a'
  | 'sf-0-b'
  | 'sf-1-a'
  | 'sf-1-b'
  | 'final-a'
  | 'final-b'
  | 'champion';

/** Occupied seats → participant twitch id (for appear detection). */
export function seatOccupancyFingerprint(view: BracketView): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: SeatKey, seat: BracketSeat) => {
    if (seat.participant) out[key] = seat.participant.twitchUserId;
  };
  put('qf-0-a', view.quarterfinals[0]!.playerA);
  put('qf-0-b', view.quarterfinals[0]!.playerB);
  put('qf-1-a', view.quarterfinals[1]!.playerA);
  put('qf-1-b', view.quarterfinals[1]!.playerB);
  put('qf-2-a', view.quarterfinals[2]!.playerA);
  put('qf-2-b', view.quarterfinals[2]!.playerB);
  put('qf-3-a', view.quarterfinals[3]!.playerA);
  put('qf-3-b', view.quarterfinals[3]!.playerB);
  put('sf-0-a', view.semifinals[0]!.playerA);
  put('sf-0-b', view.semifinals[0]!.playerB);
  put('sf-1-a', view.semifinals[1]!.playerA);
  put('sf-1-b', view.semifinals[1]!.playerB);
  put('final-a', view.final.playerA);
  put('final-b', view.final.playerB);
  if (view.champion) out.champion = view.champion.twitchUserId;
  return out;
}

export function BonusTournamentBracketOverlay({
  view,
  demoBadge = true,
  reduceMotion = false,
}: {
  view: BracketView;
  demoBadge?: boolean;
  reduceMotion?: boolean;
}) {
  const seenSeatsRef = useRef<Record<string, string> | null>(null);
  const [appearing, setAppearing] = useState<Set<string>>(() => new Set());

  // Seed occupancy on first paint — refresh must not replay fade-ins.
  useLayoutEffect(() => {
    if (seenSeatsRef.current) return;
    seenSeatsRef.current = seatOccupancyFingerprint(view);
  }, [view]);

  // New seats in later rounds: soft opacity fade-in only (no flying cards).
  useEffect(() => {
    const next = seatOccupancyFingerprint(view);
    if (reduceMotion) {
      seenSeatsRef.current = next;
      setAppearing(new Set());
      return;
    }

    const seen = seenSeatsRef.current;
    if (!seen) {
      seenSeatsRef.current = next;
      return;
    }

    const fresh: string[] = [];
    for (const [key, id] of Object.entries(next)) {
      if (seen[key] !== id) fresh.push(key);
    }
    seenSeatsRef.current = next;

    if (!fresh.length) return;

    setAppearing((prev) => {
      const n = new Set(prev);
      for (const k of fresh) n.add(k);
      return n;
    });

    const t = window.setTimeout(() => {
      setAppearing((prev) => {
        const n = new Set(prev);
        for (const k of fresh) n.delete(k);
        return n;
      });
    }, SEAT_FADE_MS + 40);

    return () => window.clearTimeout(t);
  }, [
    view.quarterfinals[0]?.playerA.participant?.twitchUserId,
    view.quarterfinals[0]?.playerB.participant?.twitchUserId,
    view.quarterfinals[1]?.playerA.participant?.twitchUserId,
    view.quarterfinals[1]?.playerB.participant?.twitchUserId,
    view.quarterfinals[2]?.playerA.participant?.twitchUserId,
    view.quarterfinals[2]?.playerB.participant?.twitchUserId,
    view.quarterfinals[3]?.playerA.participant?.twitchUserId,
    view.quarterfinals[3]?.playerB.participant?.twitchUserId,
    view.semifinals[0]?.playerA.participant?.twitchUserId,
    view.semifinals[0]?.playerB.participant?.twitchUserId,
    view.semifinals[1]?.playerA.participant?.twitchUserId,
    view.semifinals[1]?.playerB.participant?.twitchUserId,
    view.final.playerA.participant?.twitchUserId,
    view.final.playerB.participant?.twitchUserId,
    view.champion?.twitchUserId,
    reduceMotion,
  ]);

  const hasChampion = Boolean(view.champion);
  const appears = (key: SeatKey) => appearing.has(key);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: BRACKET_OVERLAY_W,
        height: BRACKET_OVERLAY_H,
        borderRadius: 16,
        fontFamily: '"Rubik", "Segoe UI", system-ui, sans-serif',
        color: '#f8fafc',
        background: 'linear-gradient(165deg, #0b1220 0%, #0f172a 42%, #12101f 100%)',
      }}
      data-bracket-stage={view.stage}
    >
      <style>{`
        @keyframes btBracketEnter {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes btSeatFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .bt-bracket-enter,
          .bt-seat-fade { animation: none !important; }
        }
      `}</style>

      <ArenaAtmosphere reduceMotion={reduceMotion} />

      <div
        className={reduceMotion ? undefined : 'bt-bracket-enter'}
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '14px 22px 12px',
          animation: reduceMotion ? undefined : 'btBracketEnter 480ms ease-out both',
        }}
      >
        <header className="flex flex-col items-center flex-shrink-0 mb-2">
          <div
            className="font-black tracking-[0.28em] uppercase leading-none"
            style={{ color: GOLD, fontSize: 13 }}
          >
            Bonus Tournament{demoBadge ? ' · Demo' : ''}
          </div>
          <div
            className="mt-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase"
            style={{
              background: 'rgba(30, 58, 138, 0.45)',
              border: '1px solid rgba(96, 165, 250, 0.35)',
              color: '#bfdbfe',
            }}
          >
            8 Jogadores
          </div>
        </header>

        <div className="relative flex-1 min-h-0">
          <div
            className="relative h-full grid items-stretch"
            style={{
              gridTemplateColumns: '1.05fr 0.85fr 1.1fr 0.85fr 1.05fr',
              gap: 14,
              zIndex: 2,
            }}
          >
            <RoundColumn title="Quartos de Final">
              <MatchCard
                match={view.quarterfinals[0]!}
                reduceMotion={reduceMotion}
                appearA={appears('qf-0-a')}
                appearB={appears('qf-0-b')}
              />
              <MatchCard
                match={view.quarterfinals[1]!}
                reduceMotion={reduceMotion}
                appearA={appears('qf-1-a')}
                appearB={appears('qf-1-b')}
              />
            </RoundColumn>

            <RoundColumn title="Meias-Finais" center>
              <MatchCard
                match={view.semifinals[0]!}
                compact
                reduceMotion={reduceMotion}
                appearA={appears('sf-0-a')}
                appearB={appears('sf-0-b')}
              />
            </RoundColumn>

            <div className="flex flex-col min-w-0 justify-between py-1 gap-3">
              <RoundColumn title="Final" tight>
                <MatchCard
                  match={view.final}
                  featured
                  reduceMotion={reduceMotion}
                  appearA={appears('final-a')}
                  appearB={appears('final-b')}
                />
              </RoundColumn>
              <ChampionPanel
                champion={view.champion}
                highlight={hasChampion}
                reduceMotion={reduceMotion}
                appear={appears('champion')}
              />
            </div>

            <RoundColumn title="Meias-Finais" center>
              <MatchCard
                match={view.semifinals[1]!}
                compact
                reduceMotion={reduceMotion}
                appearA={appears('sf-1-a')}
                appearB={appears('sf-1-b')}
              />
            </RoundColumn>

            <RoundColumn title="Quartos de Final">
              <MatchCard
                match={view.quarterfinals[2]!}
                reduceMotion={reduceMotion}
                appearA={appears('qf-2-a')}
                appearB={appears('qf-2-b')}
              />
              <MatchCard
                match={view.quarterfinals[3]!}
                reduceMotion={reduceMotion}
                appearA={appears('qf-3-a')}
                appearB={appears('qf-3-b')}
              />
            </RoundColumn>
          </div>
        </div>

        <footer
          className="flex-shrink-0 text-center mt-1.5 text-[9px] font-medium tracking-wide"
          style={{ color: 'rgba(226,232,240,0.45)' }}
        >
          18+ · BeGambleAware
        </footer>
      </div>
    </div>
  );
}

function RoundColumn({
  title,
  children,
  center,
  tight,
}: {
  title: string;
  children: ReactNode;
  center?: boolean;
  tight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col min-w-0 ${center ? 'justify-center' : 'justify-center'} ${
        tight ? 'gap-0' : 'gap-4'
      }`}
    >
      <div
        className="font-black uppercase tracking-[0.18em] text-center flex-shrink-0"
        style={{ color: GOLD, fontSize: 10, marginBottom: tight ? 6 : 2 }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function MatchCard({
  match,
  compact = false,
  featured = false,
  reduceMotion = false,
  appearA,
  appearB,
}: {
  match: BracketView['quarterfinals'][number];
  compact?: boolean;
  featured?: boolean;
  reduceMotion?: boolean;
  appearA?: boolean;
  appearB?: boolean;
}) {
  return (
    <div
      className="min-w-0 rounded-xl overflow-hidden"
      style={{
        background: featured ? 'rgba(15, 23, 42, 0.9)' : CARD_BG,
        border: `1px solid ${featured ? 'rgba(251,191,36,0.3)' : CARD_BORDER}`,
        boxShadow: featured ? '0 8px 28px rgba(0,0,0,0.28)' : '0 4px 16px rgba(0,0,0,0.18)',
      }}
    >
      <PlayerRow
        seat={match.playerA}
        compact={compact}
        featured={featured}
        reduceMotion={reduceMotion}
        appear={appearA}
      />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <PlayerRow
        seat={match.playerB}
        compact={compact}
        featured={featured}
        reduceMotion={reduceMotion}
        appear={appearB}
      />
    </div>
  );
}

function PlayerRow({
  seat,
  compact,
  featured,
  reduceMotion,
  appear,
}: {
  seat: BracketSeat;
  compact: boolean;
  featured: boolean;
  reduceMotion: boolean;
  appear?: boolean;
}) {
  const avatarSize = compact ? 26 : featured ? 32 : 30;
  const thumbW = compact ? THUMB_W_SM : featured ? THUMB_W_LG : THUMB_W;
  const thumbH = compact ? THUMB_H_SM : featured ? THUMB_H_LG : THUMB_H;
  const rowH = compact ? 62 : featured ? 72 : 68;

  if (!seat.participant) {
    return (
      <div className="flex items-center gap-2 px-2.5" style={{ height: rowH, opacity: 0.5 }}>
        <PlaceholderCircle size={avatarSize} />
        <div className="flex-1 min-w-0">
          <div
            className="h-2.5 w-[72%] max-w-[7.5rem] rounded"
            style={{ background: 'rgba(148,163,184,0.2)' }}
          />
          <div
            className="h-2 w-[48%] max-w-[5rem] rounded mt-1.5"
            style={{ background: 'rgba(148,163,184,0.12)' }}
          />
        </div>
        <div
          className="rounded-md flex-shrink-0 overflow-hidden"
          style={{
            width: thumbW,
            height: thumbH,
            background: 'rgba(30,41,59,0.8)',
            border: '1px solid rgba(148,163,184,0.15)',
          }}
        />
      </div>
    );
  }

  const p = seat.participant;
  const slotName = p.slot?.slotName ?? '';
  const slotImage = p.slot?.slotImage ?? '';
  const eliminated = seat.eliminated;
  const winner = seat.winner;
  const fadeIn = Boolean(appear && !reduceMotion && !eliminated);

  return (
    <div
      className={fadeIn ? 'bt-seat-fade' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 10px',
        height: rowH,
        opacity: eliminated ? 0.45 : 1,
        filter: eliminated ? 'grayscale(1)' : undefined,
        background: winner ? 'rgba(251,191,36,0.08)' : 'transparent',
        boxShadow: winner
          ? `inset 3px 0 0 ${GOLD_SOFT}`
          : fadeIn
            ? 'inset 0 0 0 1px rgba(251,191,36,0.2)'
            : undefined,
        animation: fadeIn ? `btSeatFadeIn ${SEAT_FADE_MS}ms ease both` : undefined,
        transition: reduceMotion
          ? undefined
          : `opacity ${GRAY_MS}ms ease, filter ${GRAY_MS}ms ease, background 400ms ease`,
      }}
    >
      <AvatarCircle url={p.avatarUrl} name={p.displayName} size={avatarSize} winner={winner} />
      <div className="flex-1 min-w-0">
        <div
          className="font-bold truncate leading-tight"
          style={{ fontSize: compact ? 11 : 12.5, color: '#fff' }}
          title={p.displayName}
        >
          {p.displayName}
        </div>
        {slotName ? (
          <div className="truncate leading-tight mt-0.5" style={{ fontSize: 10, color: MUTED }} title={slotName}>
            {slotName}
          </div>
        ) : (
          <div className="mt-0.5" style={{ fontSize: 10, color: 'rgba(148,163,184,0.45)' }}>
            —
          </div>
        )}
      </div>
      <VerticalSlotThumb
        src={slotImage}
        alt={slotName || p.displayName}
        width={thumbW}
        height={thumbH}
        winner={winner}
      />
    </div>
  );
}

function VerticalSlotThumb({
  src,
  alt,
  width,
  height,
  winner,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  winner?: boolean;
}) {
  if (!src) {
    return (
      <div
        className="rounded-md flex-shrink-0 overflow-hidden"
        style={{
          width,
          height,
          background: 'rgba(30,41,59,0.8)',
          border: '1px solid rgba(148,163,184,0.15)',
        }}
      />
    );
  }
  return (
    <div
      className="rounded-md flex-shrink-0 overflow-hidden"
      style={{
        width,
        height,
        border: winner ? `1.5px solid ${GOLD_SOFT}` : '1px solid rgba(148,163,184,0.22)',
        boxShadow: winner ? '0 0 10px rgba(251,191,36,0.2)' : 'none',
      }}
    >
      <SlotThumb
        src={src}
        alt={alt}
        className="block w-full h-full object-cover object-center"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

function AvatarCircle({
  url,
  name,
  size,
  winner,
}: {
  url: string;
  name: string;
  size: number;
  winner?: boolean;
}) {
  const parts = name.split(/[\s_]+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
      : (parts[0] ?? name).slice(0, 2).toUpperCase();

  return (
    <div
      className="relative flex-shrink-0 rounded-full overflow-hidden"
      style={{
        width: size,
        height: size,
        border: winner ? `1.5px solid ${GOLD}` : '1.5px solid rgba(226,232,240,0.55)',
        background: '#1e293b',
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      <div
        className="absolute inset-0 flex items-center justify-center font-black"
        style={{ fontSize: size * 0.32, color: '#e2e8f0', zIndex: url ? -1 : 0 }}
      >
        {initials || '?'}
      </div>
    </div>
  );
}

function PlaceholderCircle({ size }: { size: number }) {
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        border: '1.5px dashed rgba(148,163,184,0.35)',
        color: MUTED,
        fontSize: size * 0.38,
        background: 'rgba(30,41,59,0.5)',
      }}
    >
      ?
    </div>
  );
}

function ChampionPanel({
  champion,
  highlight,
  reduceMotion,
  appear,
}: {
  champion: DrawParticipant | null;
  highlight: boolean;
  reduceMotion: boolean;
  appear?: boolean;
}) {
  const fadeIn = Boolean(appear && !reduceMotion && champion);
  return (
    <div
      className={fadeIn ? 'bt-seat-fade' : undefined}
      style={{
        borderRadius: 14,
        padding: '12px 14px 14px',
        background: 'rgba(15, 23, 42, 0.92)',
        border: highlight ? `1.5px solid ${GOLD}` : `1px solid ${CARD_BORDER}`,
        boxShadow: highlight ? '0 0 28px rgba(251,191,36,0.16)' : 'none',
        animation: fadeIn ? `btSeatFadeIn ${SEAT_FADE_MS}ms ease both` : undefined,
      }}
    >
      <div className="flex items-center justify-center gap-1.5 mb-2.5">
        <Crown className="w-3.5 h-3.5" style={{ color: GOLD }} strokeWidth={2.25} />
        <div className="font-black uppercase tracking-[0.22em]" style={{ color: GOLD, fontSize: 11 }}>
          Campeão
        </div>
      </div>

      {champion ? (
        <div className="flex items-center gap-3 justify-center">
          <AvatarCircle url={champion.avatarUrl} name={champion.displayName} size={48} winner />
          <div className="min-w-0 text-left" style={{ maxWidth: 160 }}>
            <div className="font-black truncate" style={{ fontSize: 15 }} title={champion.displayName}>
              {champion.displayName}
            </div>
            {champion.slot?.slotName ? (
              <div
                className="truncate mt-0.5"
                style={{ fontSize: 11, color: MUTED }}
                title={champion.slot.slotName}
              >
                {champion.slot.slotName}
              </div>
            ) : null}
          </div>
          <VerticalSlotThumb
            src={champion.slot?.slotImage ?? ''}
            alt={champion.slot?.slotName || champion.displayName}
            width={THUMB_W_LG}
            height={THUMB_H_LG}
            winner
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-1" style={{ opacity: 0.55 }}>
          <PlaceholderCircle size={44} />
          <div className="text-[11px] font-medium" style={{ color: MUTED }}>
            Aguarda a final
          </div>
        </div>
      )}
    </div>
  );
}

