import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Clock3, Trophy, Users } from 'lucide-react';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { AutoFitNumber } from './AutoFitNumber';
import { FLOAT_RING, entriesRosterIdentity, formatEntriesTimer } from './entries-carousel';
import {
  allowsVisualRepeats,
  bootstrapAgents,
  isFullyExited,
  nameMaxForAgent,
  spawnAgentFromEdge,
  stepAgents,
  takeNextFromQueue,
  type CirculationAgent,
  type CirculationQueueState,
} from './entries-circulation';
import { getEntriesRemainingSeconds } from './demo-data';
import { formatMoney } from './scoring';
import type { BonusTournamentDemo, BonusTournamentEntry, BonusTournamentStatus } from './types';

const PAD = 11;

/** Status-only indicator (no legend text). */
export const ENTRIES_DOT_GREEN = '#22C55E';
export const ENTRIES_DOT_YELLOW = '#EAB308';
export const ENTRIES_DOT_RED = '#EF4444';

/**
 * Map tournament phase → dot colour.
 * Green = inscriptions open · Yellow = closed / awaiting draw · Red = tournament running.
 */
export function entriesStatusDotColor(args: {
  status: BonusTournamentStatus;
  entriesOpen: boolean;
  timerClosed: boolean;
}): string {
  const { status, entriesOpen, timerClosed } = args;
  if (status === 'qf' || status === 'sf' || status === 'final' || status === 'completed') {
    return ENTRIES_DOT_RED;
  }
  // preparation | entries | draw
  if (entriesOpen && !timerClosed) return ENTRIES_DOT_GREEN;
  return ENTRIES_DOT_YELLOW;
}

interface EntriesOverlayProps {
  demo: BonusTournamentDemo;
}

export function EntriesOverlay({ demo }: EntriesOverlayProps) {
  const config = demo.entriesConfig;
  const entries = demo.entries;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!config.entriesOpen || config.timerPaused || config.timerStartedAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [config.entriesOpen, config.timerPaused, config.timerStartedAt]);

  const remaining = getEntriesRemainingSeconds(config, now);
  const timerLabel = formatEntriesTimer(remaining);
  const closed = !config.entriesOpen || remaining <= 0;
  const chatCommand = (config.chatCommand || '!torneio').trim() || '!torneio';
  const tournamentName = (config.tournamentTitle || demo.name || 'TORNEIO').trim() || 'TORNEIO';
  const statusDot = entriesStatusDotColor({
    status: demo.status,
    entriesOpen: config.entriesOpen,
    timerClosed: closed,
  });
  const statusOpen = statusDot === ENTRIES_DOT_GREEN;

  // Stable identity — timer ticks / poll refreshes must not remount the field
  const rosterIdentity = useMemo(() => entriesRosterIdentity(entries), [entries]);
  const fieldKey = rosterIdentity;

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      <style>{`
        @keyframes btEntriesPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bt-entries-dot { animation: none !important; }
        }
      `}</style>

      {/* Header — title + command left · status dot right (colour only) */}
      <div
        className="flex-shrink-0"
        style={{
          paddingLeft: PAD,
          paddingRight: PAD,
          paddingTop: 8,
          paddingBottom: 8,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 text-left">
            <div
              className="font-black truncate leading-tight"
              style={{ color: '#fbbf24', fontSize: 15 }}
              title={tournamentName}
            >
              {tournamentName}
            </div>
            <div
              className="mt-1.5 font-black tracking-wide leading-none truncate"
              style={{ color: '#fbbf24', fontSize: 13 }}
              title="Comando no chat"
            >
              {chatCommand}
            </div>
          </div>
          <div
            className="bt-entries-dot w-2 h-2 rounded-full flex-shrink-0 mt-1"
            style={{
              background: statusDot,
              boxShadow: statusOpen ? `0 0 10px ${ENTRIES_DOT_GREEN}` : 'none',
              animation: statusOpen ? 'btEntriesPulse 1.4s ease-in-out infinite' : 'none',
            }}
            title={
              statusDot === ENTRIES_DOT_GREEN
                ? 'Inscrições abertas'
                : statusDot === ENTRIES_DOT_YELLOW
                  ? 'Inscrições encerradas'
                  : 'Torneio a decorrer'
            }
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-2.5">
          <StatBox
            icon={<Users className="w-3 h-3" style={{ color: '#94a3b8' }} />}
            label="INSCRITOS"
            value={String(entries.length)}
            color="#e2e8f0"
          />
          <StatBox
            icon={<Trophy className="w-3 h-3" style={{ color: '#fbbf24' }} />}
            label="PRIZE POOL"
            value={formatMoney(config.prizePool)}
            color="#fde68a"
            gold
          />
          <StatBox
            icon={<Clock3 className="w-3 h-3" style={{ color: '#94a3b8' }} />}
            label="TEMPO"
            value={timerLabel}
            color={closed ? '#94a3b8' : '#e2e8f0'}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6 text-center relative z-[1]">
            <ArenaAtmosphere />
            <div className="relative z-[1]">
              <div className="font-black mb-2" style={{ color: '#e2e8f0', fontSize: 14 }}>
                Ainda sem inscritos
              </div>
              <div className="font-bold" style={{ color: '#64748b', fontSize: 11 }}>
                Escreve <span style={{ color: '#fbbf24' }}>{chatCommand}</span> no chat para entrar
              </div>
            </div>
          </div>
        ) : (
          <CirculationField key={fieldKey} entries={entries} />
        )}
      </div>
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  color,
  gold,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color: string;
  gold?: boolean;
}) {
  return (
    <div
      className="min-w-0 text-center"
      style={{
        background: gold ? 'rgba(251,191,36,0.08)' : 'rgba(22, 32, 54, 0.9)',
        borderRadius: 6,
        paddingTop: 7,
        paddingBottom: 7,
        paddingLeft: 4,
        paddingRight: 4,
        border: gold ? '1px solid rgba(251,191,36,0.22)' : '1px solid transparent',
      }}
    >
      <div className="flex items-center justify-center gap-1 mb-1">
        {icon}
        <span className="font-bold leading-none" style={{ color: '#64748b', fontSize: 7, letterSpacing: '0.05em' }}>
          {label}
        </span>
      </div>
      <AutoFitNumber value={value} maxFontSize={12} minFontSize={8} color={color} />
    </div>
  );
}

/**
 * Continuous organic circulation — no fade batch swaps.
 * Motion via rAF + translate3d; React state only when a slot recycles its entry.
 */
function CirculationField({ entries }: { entries: BonusTournamentEntry[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 266, h: 480 });
  const reduceMotion = usePrefersReducedMotion();

  // Roster for React chips — updated only on recycle (not every frame)
  const [roster, setRoster] = useState<
    Array<{ slotId: string; entry: BonusTournamentEntry; w: number; depth: CirculationAgent['depth'] }>
  >([]);

  const agentsRef = useRef<CirculationAgent[]>([]);
  const queueRef = useRef<CirculationQueueState | null>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fieldRef = useRef(size);
  fieldRef.current = size;
  const uniqueCount = entries.length;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rosterIdentity = useMemo(() => entriesRosterIdentity(entries), [entries]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // Soft-patch display names / avatars without restarting motion (same roster ids).
  useEffect(() => {
    const byId = new Map(entries.map((e) => [e.twitchUserId, e]));
    let patched = false;
    agentsRef.current = agentsRef.current.map((a) => {
      const next = byId.get(a.entry.twitchUserId);
      if (!next || next === a.entry) return a;
      if (
        next.displayName === a.entry.displayName &&
        next.avatarUrl === a.entry.avatarUrl &&
        next.id === a.entry.id
      ) {
        return a;
      }
      patched = true;
      return { ...a, entry: next };
    });
    if (queueRef.current) {
      const byTwitch = new Map(entries.map((e) => [e.twitchUserId, e]));
      queueRef.current = {
        ...queueRef.current,
        order: queueRef.current.order.map((e) => byTwitch.get(e.twitchUserId) ?? e),
      };
    }
    if (patched) {
      setRoster((prev) =>
        prev.map((slot) => {
          const next = byId.get(slot.entry.twitchUserId);
          return next ? { ...slot, entry: next } : slot;
        }),
      );
    }
  }, [entries]);

  // Hard bootstrap only when roster membership or field size changes — NOT on poll refreshes.
  useEffect(() => {
    if (size.w < 80 || size.h < 80) return;
    const liveEntries = entriesRef.current;
    if (reduceMotion) {
      const { agents } = bootstrapAgents(liveEntries, size.w, size.h);
      agentsRef.current = agents.map((a) => ({ ...a, vx: 0, vy: 0 }));
      queueRef.current = null;
      setRoster(agents.map((a) => ({ slotId: a.slotId, entry: a.entry, w: a.w, depth: a.depth })));
      return;
    }

    const { agents, queue } = bootstrapAgents(liveEntries, size.w, size.h);
    agentsRef.current = agents;
    queueRef.current = queue;
    setRoster(agents.map((a) => ({ slotId: a.slotId, entry: a.entry, w: a.w, depth: a.depth })));
  }, [rosterIdentity, size.w, size.h, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      for (const a of agentsRef.current) {
        const el = nodeRefs.current.get(a.slotId);
        if (el) el.style.transform = `translate3d(${a.x}px, ${a.y}px, 0)`;
      }
      return;
    }

    let raf = 0;
    let last = performance.now();
    let rosterDirty = false;

    const tick = (now: number) => {
      const rawDt = (now - last) / 1000;
      last = now;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      const fieldW = fieldRef.current.w;
      const fieldH = fieldRef.current.h;

      let agents = stepAgents(agentsRef.current, dt, fieldW, fieldH);
      let queue = queueRef.current;
      if (!queue) {
        agentsRef.current = agents;
        for (const a of agents) {
          const el = nodeRefs.current.get(a.slotId);
          if (el) el.style.transform = `translate3d(${a.x}px, ${a.y}px, 0)`;
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      const activeIds = new Set<string>();
      if (!allowsVisualRepeats(uniqueCount)) {
        for (const a of agents) activeIds.add(a.entry.twitchUserId);
      }

      for (let i = 0; i < agents.length; i += 1) {
        if (!isFullyExited(agents[i], fieldW, fieldH)) continue;
        const prevId = agents[i].entry.twitchUserId;
        const { entry, queue: q2 } = takeNextFromQueue(queue, activeIds, uniqueCount);
        queue = q2;
        const recycled = spawnAgentFromEdge(
          entry,
          agents[i].slotId,
          fieldW,
          fieldH,
          () => Math.random(),
          undefined,
          agents[i].depth,
        );
        // Advance along entry vector so the replacement is already clipping in —
        // keeps visible density near TARGET without fade gaps while someone exits.
        const enterT = 0.45 + Math.random() * 0.7;
        recycled.x += recycled.vx * enterT;
        recycled.y += recycled.vy * enterT;
        agents[i] = recycled;
        if (!allowsVisualRepeats(uniqueCount)) {
          activeIds.delete(prevId);
          activeIds.add(entry.twitchUserId);
        }
        rosterDirty = true;
      }

      agentsRef.current = agents;
      queueRef.current = queue;

      for (const a of agents) {
        const el = nodeRefs.current.get(a.slotId);
        if (el) {
          el.style.transform = `translate3d(${a.x}px, ${a.y}px, 0)`;
          el.style.zIndex = String(a.depth.z);
        }
      }

      if (rosterDirty) {
        rosterDirty = false;
        setRoster(
          agents.map((a) => ({ slotId: a.slotId, entry: a.entry, w: a.w, depth: a.depth })),
        );
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // uniqueCount tracks membership size; rosterIdentity covers id set. Never depend on `entries` ref.
  }, [reduceMotion, uniqueCount, rosterIdentity, size.w, size.h]);

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden">
      <ArenaAtmosphere reduceMotion={reduceMotion} />
      {roster.map((slot) => {
        const agent = agentsRef.current.find((a) => a.slotId === slot.slotId);
        const depth = agent?.depth ?? slot.depth;
        const nameMax = agent ? nameMaxForAgent(agent) : Math.max(36, slot.w - depth.avatar - depth.gap);
        return (
          <div
            key={slot.slotId}
            ref={(node) => {
              if (node) nodeRefs.current.set(slot.slotId, node);
              else nodeRefs.current.delete(slot.slotId);
            }}
            className="absolute top-0 left-0 will-change-transform"
            style={{
              height: agent?.h ?? depth.h,
              zIndex: depth.z,
              opacity: depth.opacity,
              transform: `translate3d(${agent?.x ?? 0}px, ${agent?.y ?? 0}px, 0)`,
            }}
          >
            <FloaterChip entry={slot.entry} nameMax={nameMax} depth={depth} />
          </div>
        );
      })}
    </div>
  );
}

function FloaterChip({
  entry,
  nameMax,
  depth,
}: {
  entry: BonusTournamentEntry;
  nameMax: number;
  depth: CirculationAgent['depth'];
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [entry.twitchUserId]);
  const initials = entry.displayName.slice(0, 2).toUpperCase();
  const av = depth.avatar;

  return (
    <div
      className="flex items-center h-full"
      style={{ gap: depth.gap, paddingLeft: FLOAT_RING, paddingRight: FLOAT_RING }}
    >
      {!failed && entry.avatarUrl ? (
        <img
          src={entry.avatarUrl}
          alt=""
          width={av}
          height={av}
          className="rounded-full object-cover flex-shrink-0"
          style={{
            width: av,
            height: av,
            boxShadow: `0 0 0 ${FLOAT_RING}px rgba(251,191,36,0.35)`,
          }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center font-black flex-shrink-0"
          style={{
            width: av,
            height: av,
            background: '#0f172a',
            color: '#fde68a',
            fontSize: Math.round(av * 0.32),
            boxShadow: `0 0 0 ${FLOAT_RING}px rgba(251,191,36,0.35)`,
          }}
        >
          {initials}
        </div>
      )}
      <span
        className="font-semibold leading-tight"
        style={{
          color: '#ffffff',
          fontSize: depth.fontSize,
          fontWeight: 600,
          maxWidth: nameMax,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 4px rgba(0,0,0,0.55)',
        }}
        title={entry.displayName}
      >
        {entry.displayName}
      </span>
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
