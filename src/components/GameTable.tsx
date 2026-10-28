import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardId, GameEvent, SetId } from '../types/game';
import type { PlayerView } from '../engine';
import { Table } from './Table';
import { Hand } from './Hand';
import { MovePanel, EMPTY_SELECTION, type Selection } from './MovePanel';
import { Shelf } from './Shelf';
import { Scoreboard } from './Scoreboard';
import { RequestOverlay } from './RequestOverlay';

export interface GameTableProps {
  view: PlayerView;
  overlay: GameEvent | null;
  actionError: string | null;
  onAsk: (targetId: string, cardId: CardId) => void;
  onCall: (setId: SetId, partnerCards: CardId[], handover: boolean) => void;
  onDismissOverlay: () => void;
  onClearError: () => void;
  onOpenMenu: () => void;
  /** Hide everything private (paused, or between players on a shared screen). */
  hidden?: boolean;
  /** On a shared screen the hand is hidden while everyone watches an announcement. */
  hideHandDuringOverlay?: boolean;
  /** Replaces the table and panels (e.g. the pass-the-device screen). */
  takeover?: ReactNode;
  /** A banner under the header, e.g. connection status. */
  banner?: ReactNode;
  offlineIds?: string[];
  gameKey: string | number;
  /** The move clock, if one is running. */
  clock?: { deadline: number | null; offset: number };
}

/** The game screen shared by local and online play. */
export function GameTable({
  view,
  overlay,
  actionError,
  onAsk,
  onCall,
  onDismissOverlay,
  onClearError,
  onOpenMenu,
  hidden = false,
  hideHandDuringOverlay = false,
  takeover,
  banner,
  offlineIds,
  gameKey,
  clock,
}: GameTableProps) {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);

  // Fresh choices for every new viewer and every new game.
  useEffect(() => setSelection(EMPTY_SELECTION), [view.viewerId, gameKey]);

  // After a move resolves, keep the chosen opponent and set if they're still valid.
  const options = view.options;
  useEffect(() => {
    if (!options) return;
    setSelection((s) => ({
      targetId: options.targets.some((t) => t.id === s.targetId && t.available) ? s.targetId : null,
      setId: options.sets.some((x) => x.id === s.setId) ? s.setId : null,
      cardId: null,
    }));
  }, [options]);

  const isMyTurn = !!view.viewerId && view.currentPlayerId === view.viewerId;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex items-center gap-4 border-b border-white/5 px-4 py-2.5 sm:px-6">
        <p className="hidden font-display text-2xl font-medium italic text-vellum-50 sm:block">Literature</p>
        <div className="mx-auto min-w-0">
          <Scoreboard teams={view.teams} players={view.players} currentPlayerId={view.currentPlayerId} />
        </div>
        <button
          type="button"
          className="btn-quiet shrink-0 px-3.5 py-2"
          onClick={onOpenMenu}
          data-testid="open-menu"
          aria-label="Open the game menu"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Menu</span>
        </button>
      </header>
      {banner}

      {takeover ? (
        <main className="flex-1">{takeover}</main>
      ) : (
        <main className="grid flex-1 gap-4 p-3 sm:p-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
          <div className="flex min-h-0 flex-col">
            <div className="relative min-h-[360px] flex-1 sm:min-h-[420px]">
              <Table view={view} offlineIds={offlineIds} clock={clock} />
            </div>
            <div className="mt-10 shrink-0 px-2 sm:mt-6 lg:mt-2">
              {hidden ? (
                <p className="flex h-[168px] items-center justify-center text-vellum-400">Hand hidden.</p>
              ) : (overlay && hideHandDuringOverlay) || !view.myHand ? (
                <div className="h-[168px]" />
              ) : (
                <Hand
                  cards={view.myHand}
                  selectedSet={isMyTurn ? selection.setId : null}
                  interactive={!!options}
                  onSelectSet={(setId) => setSelection((s) => ({ ...s, setId, cardId: null }))}
                />
              )}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-4" aria-label="Your move and set progress">
            <section className="folio min-h-0 flex-1 overflow-y-auto scrollbar-thin" aria-label="Your move">
              {hidden ? (
                <p className="p-6 text-center text-vellum-400">Paused.</p>
              ) : (
                <MovePanel
                  view={view}
                  selection={selection}
                  onSelection={(s) => {
                    onClearError();
                    setSelection(s);
                  }}
                  onAsk={onAsk}
                  onCall={onCall}
                  error={actionError}
                />
              )}
            </section>
            <section className="folio shrink-0 p-4 pb-3" aria-labelledby="shelf-heading">
              <h2 id="shelf-heading" className="mb-3 font-display text-lg font-semibold text-vellum-50">
                The shelf
                <span className="ml-2 font-sans text-xs font-normal text-vellum-400">called sets in team colours</span>
              </h2>
              <Shelf sets={view.sets} teams={view.teams} players={view.players} />
            </section>
          </aside>
        </main>
      )}

      <AnimatePresence>
        {overlay && (
          <RequestOverlay
            key={overlay.id}
            event={overlay}
            players={view.players}
            teams={view.teams}
            onDismiss={onDismissOverlay}
            paused={hidden}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
