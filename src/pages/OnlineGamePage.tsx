import { useEffect, useState } from 'react';
import { useOnlineStore } from '../store/onlineStore';
import type { RoomSnapshot } from '../types/protocol';
import { GameTable } from '../components/GameTable';
import { GameMenu } from '../components/GameMenu';
import { possessive } from '../lib/ui';

/** Online play: this screen belongs to one player and shows only their hand. */
export function OnlineGamePage({ room }: { room: RoomSnapshot }) {
  const { overlay, actionError, connection, ask, call, dismissOverlay, clearError, leave, clockOffset } = useOnlineStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const game = room.game!;
  const view = game.view;
  const offlineIds = room.lobby.players.filter((p) => !p.connected).map((p) => p.id);
  const myTurn = view.currentPlayerId === room.you && room.phase === 'game';
  const current = view.players.find((p) => p.id === view.currentPlayerId);

  // Let a player in another tab notice it's their turn.
  useEffect(() => {
    document.title = myTurn ? 'Your turn · Literature' : current ? `${possessive(current.name)} turn · Literature` : 'Literature';
    return () => {
      document.title = 'Literature';
    };
  }, [myTurn, current]);

  const offlineNames = room.lobby.players.filter((p) => !p.connected).map((p) => p.name);
  const banner =
    connection === 'reconnecting' ? (
      <p className="bg-ember/20 px-4 py-2 text-center text-sm font-semibold text-[#f3a58b]" role="status">
        Connection lost. Reconnecting…
      </p>
    ) : offlineNames.length > 0 ? (
      <p className="bg-black/30 px-4 py-2 text-center text-sm text-vellum-300" role="status">
        {offlineNames.join(', ')} {offlineNames.length === 1 ? 'is' : 'are'} offline. The game carries on; they can rejoin with the same link.
      </p>
    ) : null;

  return (
    <>
      <GameTable
        view={view}
        overlay={overlay}
        actionError={actionError}
        onAsk={(t, c) => void ask(t, c)}
        onCall={(s, named, handover) => void call(s, named, handover)}
        onDismissOverlay={dismissOverlay}
        onClearError={clearError}
        onOpenMenu={() => setMenuOpen(true)}
        banner={banner}
        offlineIds={offlineIds}
        gameKey={room.code}
        clock={{ deadline: room.turn.deadline, offset: clockOffset }}
      />
      <GameMenu
        open={menuOpen}
        onResume={() => setMenuOpen(false)}
        note={`Room ${room.code}`}
        actions={[
          {
            label: 'Leave the game',
            confirm: 'Leave this game? Your seat stays open, and you can come back with the same link from this tab.',
            run: () => void leave(),
            testId: 'leave-game',
          },
        ]}
      />
    </>
  );
}
