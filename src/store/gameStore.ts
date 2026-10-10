import { create } from 'zustand';
import type { GameConfig, GameEvent, GameState, SetId } from '../types/game';
import {
  acknowledgeEvent,
  callSet,
  createDefaultConfig,
  createGame,
  getPlayerView,
  getResult,
  publicEvent,
  requestCard,
  seededRng,
  validateConfig,
  type ConfigIssue,
  type GameResult,
  type PlayerView,
  type PublicSet,
} from '../engine';

export type Phase = 'setup' | 'game' | 'results';

export interface GameStore {
  phase: Phase;
  /** The configuration of the current (or most recent) game. */
  config: GameConfig;
  /** The only game data the UI sees: the viewer's own hand plus public info. */
  view: PlayerView | null;
  /** The current request or call announcement. Never a list. */
  overlay: GameEvent | null;
  /** When set, the hand-off screen asks this player to take the device. */
  handoffTo: string | null;
  paused: boolean;
  actionError: string | null;
  result: GameResult | null;
  finalSets: PublicSet[] | null;
  /** Increments for every new game; used to reset per-game UI state. */
  gameNumber: number;

  startGame: (config: GameConfig, options?: { seed?: number }) => { ok: boolean; issues: ConfigIssue[] };
  ask: (targetId: string, cardId: string) => boolean;
  call: (setId: SetId, partnerCards: string[], handover: boolean) => boolean;
  dismissOverlay: () => void;
  confirmHandoff: () => void;
  setPaused: (paused: boolean) => void;
  clearError: () => void;
  rematch: () => void;
  backToSetup: () => void;
}

// ---------------------------------------------------------------------------
// Private engine state. Kept out of the reactive store on purpose: components
// can only reach `view`, which never contains anyone else's cards.
// ---------------------------------------------------------------------------
let engine: GameState | null = null;
let viewerId: string | null = null;
let lastSeed: number | undefined;

function seedFromUrl(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export const useGameStore = create<GameStore>((set, get) => {
  const refreshView = () => {
    set({ view: engine ? getPlayerView(engine, viewerId) : null });
  };

  /** After an announcement is dismissed: end the game, or hand the device on. */
  const settleTurn = () => {
    if (!engine) return;
    if (engine.status === 'finished') {
      viewerId = null;
      const view = getPlayerView(engine, null);
      set({
        phase: 'results',
        view,
        handoffTo: null,
        result: getResult(engine),
        finalSets: view.sets,
        paused: false,
      });
      return;
    }
    const current = engine.currentPlayerId;
    if (current !== viewerId) {
      if (engine.passTheDevice) {
        viewerId = null;
        set({ handoffTo: current });
      } else {
        viewerId = current;
        set({ handoffTo: null });
      }
    }
    refreshView();
  };

  const begin = (config: GameConfig, seed: number | undefined) => {
    engine = createGame(config, seed === undefined ? {} : { rng: seededRng(seed) });
    viewerId = null;
    lastSeed = seed;
    set((s) => ({
      phase: 'game',
      config: structuredClone(config),
      overlay: null,
      handoffTo: null,
      paused: false,
      actionError: null,
      result: null,
      finalSets: null,
      gameNumber: s.gameNumber + 1,
    }));
    settleTurn();
  };

  return {
    phase: 'setup',
    config: createDefaultConfig(4),
    view: null,
    overlay: null,
    handoffTo: null,
    paused: false,
    actionError: null,
    result: null,
    finalSets: null,
    gameNumber: 0,

    startGame: (config, options) => {
      const issues = validateConfig(config);
      if (issues.length > 0) return { ok: false, issues };
      begin(config, options?.seed ?? seedFromUrl());
      return { ok: true, issues: [] };
    },

    ask: (targetId, cardId) => {
      const { overlay, handoffTo, paused } = get();
      if (!engine || !viewerId || overlay || handoffTo || paused) {
        set({ actionError: 'Wait for the current request to finish.' });
        return false;
      }
      const result = requestCard(engine, viewerId, targetId, cardId);
      if (!result.ok) {
        set({ actionError: result.error.message });
        return false;
      }
      engine = result.state;
      set({ overlay: publicEvent(engine.pendingEvent), actionError: null });
      refreshView();
      return true;
    },

    call: (setId, partnerCards, handover) => {
      const { overlay, handoffTo, paused } = get();
      if (!engine || !viewerId || overlay || handoffTo || paused) {
        set({ actionError: 'Wait for the current request to finish.' });
        return false;
      }
      const result = callSet(engine, viewerId, setId, partnerCards, handover);
      if (!result.ok) {
        set({ actionError: result.error.message });
        return false;
      }
      engine = result.state;
      set({ overlay: publicEvent(engine.pendingEvent), actionError: null });
      refreshView();
      return true;
    },

    dismissOverlay: () => {
      if (!engine || !get().overlay) return;
      const result = acknowledgeEvent(engine);
      if (result.ok) engine = result.state;
      set({ overlay: null });
      settleTurn();
    },

    confirmHandoff: () => {
      const { handoffTo } = get();
      if (!engine || !handoffTo || engine.currentPlayerId !== handoffTo) return;
      viewerId = handoffTo;
      set({ handoffTo: null, actionError: null });
      refreshView();
    },

    setPaused: (paused) => set({ paused }),

    clearError: () => set({ actionError: null }),

    rematch: () => {
      const seed = lastSeed === undefined ? undefined : lastSeed + 1;
      begin(get().config, seed);
    },

    backToSetup: () => {
      engine = null;
      viewerId = null;
      set({
        phase: 'setup',
        view: null,
        overlay: null,
        handoffTo: null,
        paused: false,
        actionError: null,
        result: null,
        finalSets: null,
      });
    },
  };
});

/**
 * Test-only access to private engine state. Only defined under Vitest, so it
 * doesn't exist in the dev server or the production build.
 */
export const __testing =
  import.meta.env.MODE === 'test'
    ? {
        getEngine: (): GameState | null => engine,
        getViewerId: (): string | null => viewerId,
        /** Replace the engine state (used to set up end-game scenarios). */
        setEngine: (state: GameState, viewer: string | null) => {
          engine = state;
          viewerId = viewer;
          useGameStore.setState({ overlay: null, handoffTo: null, view: getPlayerView(state, viewer) });
        },
      }
    : undefined;
