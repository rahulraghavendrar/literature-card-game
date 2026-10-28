import { useEffect, useState, type ReactNode } from 'react';
import type { CardId, SetId } from '../types/game';
import { SET_BY_ID, cardName, cardPhrase, cardShortName, type PlayerView } from '../engine';
import { Avatar } from './Avatar';
import { PlayingCard } from './PlayingCard';
import { cx, playerById, possessive, teamOf } from '../lib/ui';

export interface Selection {
  targetId: string | null;
  setId: SetId | null;
  cardId: CardId | null;
}

export const EMPTY_SELECTION: Selection = { targetId: null, setId: null, cardId: null };

interface Props {
  view: PlayerView;
  selection: Selection;
  onSelection: (s: Selection) => void;
  onAsk: (targetId: string, cardId: CardId) => void;
  onCall: (setId: SetId, partnerCards: CardId[], handover: boolean) => void;
  error: string | null;
  /** Shown when it isn't the viewer's turn. */
  waitingText?: string;
}

function StepLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-vellum-200">
      <span className="numeric flex h-5 w-5 items-center justify-center rounded-full bg-brass-500/20 text-xs text-brass-300">
        {n}
      </span>
      {children}
    </h3>
  );
}

/** The current player's controls: ask an opponent for a card, or call a set. */
export function MovePanel({ view, selection, onSelection, onAsk, onCall, error, waitingText }: Props) {
  const options = view.options;
  const [mode, setMode] = useState<'ask' | 'call'>('ask');
  const canAsk = options?.canAsk ?? false;

  // Every new turn starts on "Ask".
  useEffect(() => setMode('ask'), [view.currentPlayerId, view.viewerId]);
  useEffect(() => {
    if (options && !canAsk) setMode('call');
  }, [options, canAsk]);

  if (!options) {
    const current = playerById(view.players, view.currentPlayerId);
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-1 p-6 text-center" data-testid="move-panel-waiting">
        <p className="text-vellum-300">{waitingText ?? (current ? `Waiting for ${current.name}…` : 'Waiting…')}</p>
        {current && view.viewerId && current.id !== view.viewerId && (
          <p className="text-sm text-vellum-500">Watch the table: every request is shown once.</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5" data-testid="move-panel">
      <div className="mb-4 grid grid-cols-2 rounded-full bg-black/25 p-1 text-sm font-semibold" role="tablist">
        {(['ask', 'call'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={m === 'ask' && !canAsk}
            onClick={() => setMode(m)}
            data-testid={`tab-${m}`}
            className={cx(
              'rounded-full px-3 py-1.5 transition-colors disabled:opacity-40',
              mode === m ? 'bg-vellum-100 text-walnut-950' : 'text-vellum-200 hover:text-vellum-50',
            )}
          >
            {m === 'ask' ? 'Ask for a card' : 'Call a set'}
          </button>
        ))}
      </div>

      {mode === 'ask' ? (
        <AskForm view={view} selection={selection} onSelection={onSelection} onAsk={onAsk} />
      ) : (
        <CallForm view={view} onCall={onCall} canAsk={canAsk} />
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-ember/10 px-3 py-2 text-sm text-[#f3a58b]" role="alert" data-testid="action-error">
          {error}
        </p>
      )}
    </div>
  );
}

function AskForm({
  view,
  selection,
  onSelection,
  onAsk,
}: Pick<Props, 'view' | 'selection' | 'onSelection' | 'onAsk'>) {
  const options = view.options!;
  const target = playerById(view.players, selection.targetId);
  const cards = selection.setId ? (options.cardsBySet[selection.setId] ?? []) : [];
  const readyToAsk = !!(target && selection.cardId && cards.some((c) => c.id === selection.cardId && c.available));
  const myCount = (setId: SetId) => SET_BY_ID[setId].cards.filter((c) => view.myHand?.includes(c)).length;
  const dense = options.targets.length > 5;

  return (
    <div className="space-y-4">
      <div>
        <StepLabel n={1}>Who are you asking?</StepLabel>
        <div className={cx('grid gap-2', dense ? 'grid-cols-3' : 'grid-cols-2')}>
          {options.targets.map((t) => {
            const p = playerById(view.players, t.id)!;
            const team = teamOf(view.teams, p.teamId);
            const selected = selection.targetId === t.id;
            const isPartner = t.id === view.partnerId;
            return (
              <button
                key={t.id}
                type="button"
                disabled={!t.available}
                title={t.reason ?? undefined}
                onClick={() => onSelection({ ...selection, targetId: t.id })}
                data-testid={`target-${t.id}`}
                aria-pressed={selected}
                className={cx(
                  'flex min-w-0 items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors',
                  selected ? 'border-brass-300 bg-brass-300/10' : 'border-white/10 bg-black/15 hover:border-white/25',
                  !t.available && 'opacity-45 hover:border-white/10',
                )}
              >
                <Avatar name={p.name} color={team?.color ?? '#777'} size={dense ? 24 : 30} dim={!t.available} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-vellum-50">{p.name}</span>
                  <span className="block truncate text-xs text-vellum-400">
                    {isPartner ? 'your partner' : t.available ? `${p.cardCount} cards` : 'no cards left'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <StepLabel n={2}>From which set?</StepLabel>
        <div className="flex flex-wrap gap-1.5">
          {options.sets.map((s) => {
            const set = SET_BY_ID[s.id];
            const selected = selection.setId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelection({ ...selection, setId: s.id, cardId: null })}
                data-testid={`set-${s.id}`}
                aria-pressed={selected}
                className={cx(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  selected
                    ? 'border-brass-300 bg-brass-300 font-semibold text-walnut-950'
                    : 'border-white/15 text-vellum-100 hover:border-white/35',
                )}
              >
                {set.short}
                <span className={cx('numeric ml-1.5 text-xs', selected ? 'text-walnut-800' : 'text-vellum-400')}>
                  {myCount(s.id)}/6
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-vellum-400">You can only ask from sets you hold a card of. Tap a card in your hand to pick its set.</p>
      </div>

      <div>
        <StepLabel n={3}>Which card?</StepLabel>
        {selection.setId ? (
          <div className="flex flex-wrap gap-2 pb-3">
            {cards.map((c) => {
              const selected = selection.cardId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!c.available}
                  title={c.reason ?? cardName(c.id)}
                  onClick={() => onSelection({ ...selection, cardId: c.id })}
                  data-testid={`card-${c.id}`}
                  aria-pressed={selected}
                  aria-label={c.available ? cardName(c.id) : `${cardName(c.id)} — in your hand`}
                  className={cx(
                    'relative rounded-[6px] transition-transform',
                    selected && '-translate-y-1.5 outline-2 outline-offset-2 outline-brass-300',
                    !c.available && 'opacity-35',
                    c.available && !selected && 'hover:-translate-y-1',
                  )}
                >
                  <PlayingCard cardId={c.id} width={46} />
                  {!c.available && <span className="absolute inset-x-0 -bottom-4 text-center text-[10px] text-vellum-300">yours</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-vellum-400">Pick a set first.</p>
        )}
      </div>

      <button
        type="button"
        className="btn-brass w-full"
        disabled={!readyToAsk}
        onClick={() => readyToAsk && onAsk(selection.targetId!, selection.cardId!)}
        data-testid="confirm-ask"
      >
        {readyToAsk ? `Ask ${target!.name} for ${cardPhrase(selection.cardId!)}` : 'Choose a player, a set and a card'}
      </button>
    </div>
  );
}

function CallForm({ view, onCall, canAsk }: { view: PlayerView; onCall: Props['onCall']; canAsk: boolean }) {
  const options = view.options!;
  const partner = playerById(view.players, view.partnerId);
  const partnerName = partner?.name ?? 'your partner';
  const [setId, setSetId] = useState<SetId | null>(null);
  const [named, setNamed] = useState<CardId[]>([]);
  const [handover, setHandover] = useState(false);

  useEffect(() => {
    setSetId(null);
    setNamed([]);
    setHandover(false);
  }, [view.currentPlayerId, view.viewerId, options.callableSets.length]);

  const choice = options.callableSets.find((c) => c.id === setId) ?? null;
  const allNamed = !!choice && choice.toName.every((c) => named.includes(c));
  // If the call is right, the cards leave both hands.
  const myCardsAfter = (view.myHand?.length ?? 0) - (choice?.held ?? 0);
  const partnerCardsAfter = (partner?.cardCount ?? 0) - (choice?.toName.length ?? 0);
  const canHandOver = partnerCardsAfter > 0;
  const effectiveHandover = handover && canHandOver;

  const toggle = (c: CardId) => setNamed((n) => (n.includes(c) ? n.filter((x) => x !== c) : [...n, c]));

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-vellum-300">
        {!canAsk && <strong className="text-vellum-100">No opponent has cards left, so call a set. </strong>}
        When you and {partnerName} hold all six, name {possessive(partnerName)} cards. Right: a point. Wrong: your turn ends.
      </p>

      <div>
        <StepLabel n={1}>Which set?</StepLabel>
        <div className="flex flex-wrap gap-1.5">
          {options.callableSets.map((c) => {
            const set = SET_BY_ID[c.id];
            const selected = setId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSetId(c.id);
                  setNamed([]);
                }}
                data-testid={`call-set-${c.id}`}
                aria-pressed={selected}
                className={cx(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  selected
                    ? 'border-brass-300 bg-brass-300 font-semibold text-walnut-950'
                    : c.held > 0
                      ? 'border-white/15 text-vellum-100 hover:border-white/35'
                      : 'border-white/10 text-vellum-400 hover:border-white/25',
                )}
              >
                {set.short}
                <span className={cx('numeric ml-1.5 text-xs', selected ? 'text-walnut-800' : 'text-vellum-400')}>{c.held}/6</span>
              </button>
            );
          })}
        </div>
      </div>

      {choice && (
        <div>
          <StepLabel n={2}>
            {choice.toName.length === 0 ? 'You hold all six' : `Tap the cards ${partnerName} holds`}
          </StepLabel>
          <div className="flex flex-wrap gap-2 pb-4">
            {SET_BY_ID[choice.id].cards.map((c) => {
              const mine = !choice.toName.includes(c);
              const isNamed = named.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  disabled={mine}
                  onClick={() => toggle(c)}
                  data-testid={`named-card-${c}`}
                  aria-pressed={mine ? undefined : isNamed}
                  aria-label={mine ? `${cardName(c)} — yours` : `${cardName(c)} — ${isNamed ? `named as ${possessive(partnerName)}` : 'not named yet'}`}
                  className={cx(
                    'relative rounded-[6px] transition-transform',
                    isNamed && '-translate-y-1 outline-2 outline-offset-2 outline-brass-300',
                    mine && 'opacity-50',
                  )}
                >
                  <PlayingCard cardId={c} width={46} />
                  <span
                    className={cx(
                      'absolute inset-x-0 -bottom-4 truncate text-center text-[10px]',
                      isNamed ? 'font-semibold text-brass-300' : 'text-vellum-400',
                    )}
                  >
                    {mine ? 'you' : isNamed ? partnerName : '?'}
                  </span>
                </button>
              );
            })}
          </div>
          {choice.toName.length > 0 && (
            <p className="numeric text-xs text-vellum-400" data-testid="named-count">
              Named {choice.toName.filter((c) => named.includes(c)).length} of {choice.toName.length}
            </p>
          )}
        </div>
      )}

      {choice && (
        <fieldset>
          <legend className="mb-2">
            <StepLabel n={3}>If it’s right, who plays next?</StepLabel>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: false, label: myCardsAfter > 0 ? 'I keep playing' : 'Next player' },
              { value: true, label: `${partnerName} plays` },
            ].map((o) => {
              const disabled = o.value && !canHandOver;
              const checked = (o.value ? effectiveHandover : !effectiveHandover) && !disabled;
              return (
                <label
                  key={String(o.value)}
                  className={cx(
                    'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold',
                    checked ? 'border-brass-300 bg-brass-300/10 text-vellum-50' : 'border-white/10 bg-black/15 text-vellum-200',
                    disabled && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <input
                    type="radio"
                    name="after-call"
                    className="accent-[var(--color-brass-400)]"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => setHandover(o.value)}
                    data-testid={o.value ? 'handover-yes' : 'handover-no'}
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-vellum-400">
            {!canHandOver
              ? `${partnerName} will have no cards left, so they can’t play next.`
              : effectiveHandover
                ? `${partnerName} plays on until they miss.`
                : myCardsAfter > 0
                  ? 'You carry on asking.'
                  : 'You’ll have no cards left, so play moves on clockwise.'}
          </p>
        </fieldset>
      )}

      <button
        type="button"
        className="btn-brass w-full"
        disabled={!allNamed}
        onClick={() => choice && allNamed && onCall(choice.id, choice.toName, effectiveHandover)}
        data-testid="confirm-call"
      >
        {!choice
          ? 'Choose a set to call'
          : !allNamed
            ? `Name ${possessive(partnerName)} cards first`
            : `Call ${SET_BY_ID[choice.id].short}${choice.toName.length ? ` (${choice.toName.map(cardShortName).join(' ')} with ${partnerName})` : ''}`}
      </button>
    </div>
  );
}
