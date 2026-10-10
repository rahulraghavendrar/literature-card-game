import { useState } from 'react';
import { Modal } from './Modal';
import { RulesContent } from './RulesContent';

export interface MenuAction {
  label: string;
  /** Ask before doing it. */
  confirm?: string;
  run: () => void;
  testId: string;
}

/** The in-game menu: rules plus a few actions. On a shared screen, hands are hidden while it's open. */
export function GameMenu({
  open,
  onResume,
  actions,
  note = 'Hands are hidden while the menu is open.',
}: {
  open: boolean;
  onResume: () => void;
  actions: MenuAction[];
  note?: string;
}) {
  const [view, setView] = useState<'menu' | 'rules'>('menu');
  const [confirming, setConfirming] = useState<MenuAction | null>(null);

  const close = () => {
    setView('menu');
    setConfirming(null);
    onResume();
  };

  return (
    <Modal open={open} onClose={close} title={view === 'rules' ? 'How to play' : 'Menu'} wide={view === 'rules'} testId="game-menu">
      {view === 'rules' ? (
        <>
          <RulesContent />
          <button type="button" className="btn-quiet mt-6" onClick={() => setView('menu')}>
            Back to the menu
          </button>
        </>
      ) : confirming ? (
        <div>
          <p className="text-vellum-200">{confirming.confirm}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-brass"
              data-testid="confirm-leave"
              onClick={() => {
                const a = confirming;
                setConfirming(null);
                setView('menu');
                a.run();
              }}
            >
              {confirming.label}
            </button>
            <button type="button" className="btn-quiet" onClick={() => setConfirming(null)}>
              Keep playing
            </button>
          </div>
        </div>
      ) : (
        <div>
          {note && <p className="mb-6 text-sm text-vellum-400">{note}</p>}
          <div className="flex flex-col gap-2.5">
            <button type="button" className="btn-brass" onClick={close} data-testid="resume">
              Back to the game
            </button>
            <button type="button" className="btn-quiet" onClick={() => setView('rules')}>
              How to play
            </button>
            {actions.map((a) => (
              <button
                key={a.testId}
                type="button"
                className="btn-quiet"
                onClick={() => (a.confirm ? setConfirming(a) : (a.run(), close()))}
                data-testid={a.testId}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
