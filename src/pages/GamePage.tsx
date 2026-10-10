import { useGameStore } from '../store/gameStore';
import { GameTable } from '../components/GameTable';
import { HandoffScreen } from '../components/HandoffScreen';
import { GameMenu } from '../components/GameMenu';
import { playerById } from '../lib/ui';

/** Local play: everyone shares one screen. */
export function GamePage({ onHome }: { onHome: () => void }) {
  const view = useGameStore((s) => s.view);
  const overlay = useGameStore((s) => s.overlay);
  const handoffTo = useGameStore((s) => s.handoffTo);
  const paused = useGameStore((s) => s.paused);
  const actionError = useGameStore((s) => s.actionError);
  const gameNumber = useGameStore((s) => s.gameNumber);
  const { ask, call, dismissOverlay, confirmHandoff, setPaused, clearError, rematch, backToSetup } = useGameStore.getState();

  if (!view) return null;
  const handoffPlayer = playerById(view.players, handoffTo);
  const handoverFrom = playerById(view.players, view.handoverFromId);

  return (
    <>
      <GameTable
        view={view}
        overlay={overlay}
        actionError={actionError}
        onAsk={(t, c) => ask(t, c)}
        onCall={(s, named, handover) => call(s, named, handover)}
        onDismissOverlay={dismissOverlay}
        onClearError={clearError}
        onOpenMenu={() => setPaused(true)}
        hidden={paused}
        hideHandDuringOverlay
        gameKey={gameNumber}
        takeover={
          handoffPlayer ? (
            <HandoffScreen
              player={handoffPlayer}
              teams={view.teams}
              onReady={confirmHandoff}
              note={handoverFrom && view.currentPlayerId === handoffPlayer.id ? `${handoverFrom.name} handed the turn to you.` : undefined}
            />
          ) : undefined
        }
      />
      <GameMenu
        open={paused}
        onResume={() => setPaused(false)}
        actions={[
          { label: 'Restart with the same teams', confirm: 'Start a new game with the same players and teams? This game will be lost.', run: rematch, testId: 'restart' },
          { label: 'Change players and teams', confirm: 'Go back to setup? This game will be lost.', run: backToSetup, testId: 'to-setup' },
          { label: 'Back to the home screen', confirm: 'Leave this game? It will be lost.', run: () => { backToSetup(); onHome(); }, testId: 'to-home' },
        ]}
      />
    </>
  );
}
