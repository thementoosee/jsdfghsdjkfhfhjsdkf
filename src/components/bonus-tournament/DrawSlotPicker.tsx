import { useEffect, useState } from 'react';
import {
  searchSlotsCatalog,
  resolveSlotImageUrl,
  SLOT_SEARCH_DEBOUNCE_MS,
  type SlotSearchResult,
} from '../../lib/slots-search';
import { SlotThumb } from './SlotThumb';
import type { DrawParticipant } from './draw-types';

export type PendingSlotPick = {
  slotId: string;
  slotName: string;
  slotImage: string;
};

/**
 * Catalog slot search for the draw Manager — reuses search_slots RPC.
 */
export function DrawSlotPicker({
  player,
  positionLabel,
  disabled,
  confirming,
  onConfirm,
  demoFallbacks,
}: {
  player: DrawParticipant;
  positionLabel: string;
  disabled?: boolean;
  confirming?: boolean;
  onConfirm: (pick: PendingSlotPick) => void;
  /** Shown when catalog search is empty (local DEMO). */
  demoFallbacks?: PendingSlotPick[];
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SlotSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PendingSlotPick | null>(null);

  useEffect(() => {
    setQuery('');
    setResults([]);
    setSelected(null);
    setError(null);
  }, [player.twitchUserId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchSlotsCatalog(q)
        .then((rows) => {
          setResults(rows);
          setError(null);
        })
        .catch((err) => {
          console.error(err);
          setError('Falha ao pesquisar o catálogo de slots');
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, SLOT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (row: SlotSearchResult) => {
    setSelected({
      slotId: row.id,
      slotName: row.name,
      slotImage: resolveSlotImageUrl(row),
    });
  };

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(251,191,36,0.28)' }}
    >
      <div className="flex items-center gap-3">
        <img
          src={player.avatarUrl}
          alt=""
          className="w-12 h-12 rounded-full object-cover"
          style={{ border: '2px solid rgba(96,165,250,0.55)' }}
        />
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#60a5fa' }}>
            {positionLabel}
          </div>
          <div className="text-sm font-black truncate" style={{ color: '#f8fafc' }}>
            {player.displayName}
          </div>
          <div className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>
            Escolher slot
          </div>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Pesquisar slot no catálogo…"
        disabled={disabled || confirming}
        className="w-full rounded-lg px-3 py-2 text-sm"
        style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
      />

      {loading && (
        <div className="text-[11px]" style={{ color: '#94a3b8' }}>
          A pesquisar…
        </div>
      )}
      {error && (
        <div className="text-[11px]" style={{ color: '#f87171' }}>
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div
          className="max-h-48 overflow-y-auto rounded-lg divide-y"
          style={{ border: '1px solid #334155', background: '#0b1220' }}
        >
          {results.map((row) => {
            const img = resolveSlotImageUrl(row);
            const on = selected?.slotId === row.id;
            return (
              <button
                key={row.id}
                type="button"
                disabled={disabled || confirming}
                onClick={() => pick(row)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5 disabled:opacity-40"
                style={{
                  background: on ? 'rgba(59,130,246,0.15)' : undefined,
                  borderLeft: on ? '2px solid #3b82f6' : '2px solid transparent',
                }}
              >
                <SlotThumb src={img} alt={row.name} className="w-8 h-11 rounded object-cover flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate" style={{ color: '#e2e8f0' }}>
                    {row.name}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: '#64748b' }}>
                    {row.provider}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loading && results.length === 0 && demoFallbacks && demoFallbacks.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-black uppercase" style={{ color: '#64748b' }}>
            Atalhos DEMO (catálogo local)
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
            {demoFallbacks.map((row) => {
              const on = selected?.slotId === row.slotId;
              return (
                <button
                  key={row.slotId}
                  type="button"
                  disabled={disabled || confirming}
                  onClick={() => setSelected(row)}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded text-left disabled:opacity-40"
                  style={{
                    background: on ? 'rgba(59,130,246,0.15)' : '#0f172a',
                    border: `1px solid ${on ? 'rgba(96,165,250,0.5)' : '#334155'}`,
                  }}
                >
                  <SlotThumb src={row.slotImage} alt={row.slotName} className="w-6 h-8 rounded object-cover" />
                  <span className="text-[10px] font-bold truncate" style={{ color: '#e2e8f0' }}>
                    {row.slotName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="flex items-center gap-3 pt-1">
          <SlotThumb
            src={selected.slotImage}
            alt={selected.slotName}
            className="w-14 h-[76px] rounded object-cover"
            style={{ border: '2px solid rgba(96,165,250,0.5)' }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>
              Selecionada
            </div>
            <div className="text-sm font-black truncate" style={{ color: '#f8fafc' }}>
              {selected.slotName}
            </div>
          </div>
          <button
            type="button"
            disabled={disabled || confirming || !selected}
            onClick={() => selected && onConfirm(selected)}
            className="px-3 py-2 rounded-xl text-[10px] font-black uppercase disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)', color: '#fff' }}
          >
            {confirming ? '…' : 'Confirmar slot'}
          </button>
        </div>
      )}
    </div>
  );
}
