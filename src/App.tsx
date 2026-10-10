import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { useGameStore } from './store/gameStore';
import { roomFromUrl, savedRoomCode, useOnlineStore } from './store/onlineStore';
import { HomePage } from './pages/HomePage';
import { SetupPage } from './pages/SetupPage';
import { GamePage } from './pages/GamePage';
import { ResultsPage } from './pages/ResultsPage';
import { LobbyPage } from './pages/LobbyPage';
import { OnlineGamePage } from './pages/OnlineGamePage';

type Screen = 'home' | 'local';

function LocalApp({ onHome }: { onHome: () => void }) {
  const phase = useGameStore((s) => s.phase);
  const view = useGameStore((s) => s.view);
  const result = useGameStore((s) => s.result);
  const { rematch, backToSetup } = useGameStore.getState();
  if (phase === 'setup') return <SetupPage onBack={onHome} />;
  if (phase === 'game') return <GamePage onHome={onHome} />;
  if (!view || !result) return null;
  return (
    <ResultsPage
      view={view}
      result={result}
      actions={
        <>
          <button type="button" className="btn-brass px-8 py-3.5 text-lg" onClick={rematch} data-testid="rematch">
            Rematch with the same teams
          </button>
          <button type="button" className="btn-quiet px-6 py-3.5" onClick={backToSetup} data-testid="new-game">
            Change players and teams
          </button>
        </>
      }
    />
  );
}

function OnlineApp() {
  const room = useOnlineStore((s) => s.room)!;
  const overlay = useOnlineStore((s) => s.overlay);
  const { rematch, backToLobby, leave, actionError } = useOnlineStore();
  if (room.phase === 'lobby') return <LobbyPage room={room} />;
  // Keep the table up until the final announcement has been seen.
  if (room.phase === 'game' || overlay || !room.result) return <OnlineGamePage room={room} />;
  const isHost = room.you === room.hostId;
  const host = room.lobby.players.find((p) => p.id === room.hostId);
  return (
    <ResultsPage
      view={room.game!.view}
      result={room.result}
      actions={
        <>
          {isHost ? (
            <>
              <button type="button" className="btn-brass px-8 py-3.5 text-lg" onClick={() => void rematch()} data-testid="rematch">
                Rematch with the same teams
              </button>
              <button type="button" className="btn-quiet px-6 py-3.5" onClick={() => void backToLobby()} data-testid="new-game">
                Back to the lobby
              </button>
            </>
          ) : (
            <p className="rounded-xl bg-black/20 px-4 py-3 text-vellum-300" data-testid="waiting-for-host">
              Waiting for {host?.name ?? 'the host'} to start a rematch.
            </p>
          )}
          <button type="button" className="btn-quiet px-6 py-3.5" onClick={() => void leave()} data-testid="leave-room">
            Leave room
          </button>
          {actionError && <p className="w-full text-center text-sm text-[#f3a58b]">{actionError}</p>}
        </>
      }
    />
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const room = useOnlineStore((s) => s.room);
  const localPhase = useGameStore((s) => s.phase);
  const [initialCode] = useState(roomFromUrl);
  const [resuming, setResuming] = useState(() => !!initialCode && savedRoomCode() === initialCode);

  // After a refresh, take this tab's seat back.
  useEffect(() => {
    if (!resuming) return;
    void useOnlineStore
      .getState()
      .resume()
      .finally(() => setResuming(false));
  }, [resuming]);

  let content;
  if (room) content = <OnlineApp />;
  else if (resuming) content = <p className="p-10 text-center text-vellum-300">Rejoining your game…</p>;
  else if (screen === 'local' || localPhase !== 'setup') content = <LocalApp onHome={() => setScreen('home')} />;
  else content = <HomePage initialCode={initialCode} onLocal={() => setScreen('local')} />;

  return <MotionConfig reducedMotion="user">{content}</MotionConfig>;
}
