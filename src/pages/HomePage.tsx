import { useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH } from '../engine';
import { useOnlineStore } from '../store/onlineStore';
import { PlayingCard } from '../components/PlayingCard';
import { Modal } from '../components/Modal';
import { RulesContent } from '../components/RulesContent';
import { cx } from '../lib/ui';

const NAME_KEY = 'literature:name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* fine */
  }
}

export function HomePage({ initialCode, onLocal }: { initialCode: string | null; onLocal: () => void }) {
  const { create, join, busy, formError, removedReason, clearError } = useOnlineStore();
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(initialCode ?? '');
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nameMissing = touched && !trimmed;
  const codeMissing = touched && mode === 'join' && cleanCode.length !== 5;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!trimmed || (mode === 'join' && cleanCode.length !== 5)) return;
    rememberName(trimmed);
    if (mode === 'create') await create(trimmed);
    else await join(cleanCode, trimmed);
  };

  return (
    <div className="mx-auto min-h-full max-w-6xl px-4 pb-16 pt-10 sm:px-8 sm:pt-16">
      <header className="mb-12 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-6xl font-medium italic leading-none tracking-tight text-vellum-50 sm:text-8xl">
            Literature
          </h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-vellum-300">
            The team card game of asking, remembering and calling sets. Four to ten players, two to a team.
          </p>
          <button type="button" className="btn-quiet mt-5" onClick={() => setRulesOpen(true)} data-testid="how-to-play">
            How to play
          </button>
        </div>
        <div className="relative hidden h-44 w-64 shrink-0 sm:block" aria-hidden>
          {(
            [
              ['9H', -1],
              ['AH', 1],
              ['QH', 0],
            ] as const
          ).map(([id, k]) => (
            <div
              key={id}
              className="absolute left-1/2 top-2 origin-bottom"
              style={{ transform: `translateX(-50%) rotate(${k * 15}deg) translateY(${k === 0 ? -10 : 0}px)` }}
            >
              <PlayingCard cardId={id} width={104} />
            </div>
          ))}
        </div>
      </header>

      {removedReason && (
        <p className="mb-6 rounded-xl bg-ember/10 px-4 py-3 text-[#f3a58b]" role="status">
          {removedReason}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="folio p-6 sm:p-8" aria-labelledby="online-heading">
          <h2 id="online-heading" className="font-display text-3xl font-semibold text-vellum-50">
            Play online
          </h2>
          <p className="mt-2 text-vellum-300">Everyone plays on their own phone or computer. Create a room and share the code.</p>

          <div className="mt-6 grid grid-cols-2 rounded-full bg-black/25 p-1 text-sm font-semibold" role="tablist">
            {(['create', 'join'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  clearError();
                }}
                data-testid={`home-${m}`}
                className={cx(
                  'rounded-full px-3 py-2 transition-colors',
                  mode === m ? 'bg-vellum-100 text-walnut-950' : 'text-vellum-200 hover:text-vellum-50',
                )}
              >
                {m === 'create' ? 'Create a room' : 'Join with a code'}
              </button>
            ))}
          </div>

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-vellum-200">Your name</span>
              <input
                className="field py-3 text-lg"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="nickname"
                onChange={(e) => setName(e.target.value)}
                aria-invalid={nameMissing}
                data-testid="online-name"
              />
              {nameMissing && <span className="mt-1 block text-sm text-ember">Enter your name so the others know who you are.</span>}
            </label>
            {mode === 'join' && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-vellum-200">Room code</span>
                <input
                  className="field numeric py-3 font-display text-2xl uppercase tracking-[0.3em]"
                  value={code}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  aria-invalid={codeMissing}
                  placeholder="ABCDE"
                  data-testid="online-code"
                />
                {codeMissing && <span className="mt-1 block text-sm text-ember">Room codes are five letters and numbers.</span>}
              </label>
            )}
            {formError && (
              <p className="rounded-lg bg-ember/10 px-3 py-2 text-sm text-[#f3a58b]" role="alert" data-testid="form-error">
                {formError}
              </p>
            )}
            <button type="submit" className="btn-brass w-full py-3.5 text-lg" disabled={busy} data-testid="online-submit">
              {busy ? 'Connecting…' : mode === 'create' ? 'Create a room' : 'Join the room'}
            </button>
          </form>
        </section>

        <section className="folio flex flex-col p-6 sm:p-8" aria-labelledby="local-heading">
          <h2 id="local-heading" className="font-display text-3xl font-semibold text-vellum-50">
            One device
          </h2>
          <p className="mt-2 flex-1 text-vellum-300">
            Pass one phone or laptop around the table. Hands stay hidden between turns until the next player is ready.
          </p>
          <button type="button" className="btn-quiet mt-6 py-3" onClick={onLocal} data-testid="play-local">
            Set up a game on this device
          </button>
        </section>
      </div>

      <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title="How to play" wide>
        <RulesContent />
      </Modal>
    </div>
  );
}
