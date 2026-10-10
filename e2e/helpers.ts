import { expect, type Page } from '@playwright/test';
import {
  acknowledgeEvent,
  callSet,
  cardsToName,
  eligibleSets,
  partnerOf,
  requestCard,
  requestableCards,
  setOf,
  teamScores,
  uncalledSets,
} from '../src/engine/index.ts';
import type { GameState, SetId } from '../src/types/game.ts';

/*
 * End-to-end helpers. A Node-side copy of the engine acts as an oracle: it
 * knows every hand, so tests can choose moves and check that each browser
 * shows exactly what the rules say it should.
 */

export type Action =
  | { kind: 'ask'; target: string; card: string }
  | { kind: 'call'; setId: SetId; named: string[]; handover: boolean };

export function apply(state: GameState, action: Action): GameState {
  const me = state.currentPlayerId!;
  const r =
    action.kind === 'ask'
      ? requestCard(state, me, action.target, action.card)
      : callSet(state, me, action.setId, action.named, action.handover);
  if (!r.ok) throw new Error(`oracle rejected ${JSON.stringify(action)}: ${r.error.message}`);
  return r.state;
}

export function ack(state: GameState): GameState {
  const r = acknowledgeEvent(state);
  return r.ok ? r.state : state;
}

export const teamOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.teamId;
export const nameOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.name;

/** A call that is right: a set the current player's team holds completely. */
export function goodCall(s: GameState, handover = false): Action | null {
  const me = s.currentPlayerId!;
  const partner = partnerOf(s, me)!.id;
  const setId = uncalledSets(s).find((id) => cardsToName(s, me, id).every((c) => s.hands[partner].includes(c)));
  return setId ? { kind: 'call', setId, named: cardsToName(s, me, setId), handover } : null;
}

/** A call that is wrong: some card of the set is with an opponent. */
export function wrongCall(s: GameState): Action | null {
  const me = s.currentPlayerId!;
  const partner = partnerOf(s, me)!.id;
  const setId = eligibleSets(s, me).find((id) => cardsToName(s, me, id).some((c) => !s.hands[partner].includes(c)));
  return setId ? { kind: 'call', setId, named: cardsToName(s, me, setId), handover: false } : null;
}

/** A move that will succeed: ask an opponent who has the card, or call a set the team holds. */
export function goodMove(s: GameState, preferHandover = false): Action {
  const me = s.currentPlayerId!;
  const call = goodCall(s, preferHandover);
  if (call && preferHandover) return call;
  for (const setId of eligibleSets(s, me)) {
    for (const card of requestableCards(s, me, setId)) {
      const holder = s.players.find((p) => s.hands[p.id].includes(card))!;
      if (teamOf(s, holder.id) !== teamOf(s, me) && s.hands[holder.id].length > 0) return { kind: 'ask', target: holder.id, card };
    }
  }
  if (call) return call;
  throw new Error('No good move — the oracle and the rules disagree.');
}

/** A request that will fail: ask an opponent for a card they don't hold. */
export function failingMove(s: GameState): Action | null {
  const me = s.currentPlayerId!;
  for (const setId of eligibleSets(s, me)) {
    for (const card of requestableCards(s, me, setId)) {
      const target = s.players.find(
        (p) => teamOf(s, p.id) !== teamOf(s, me) && s.hands[p.id].length > 0 && !s.hands[p.id].includes(card),
      );
      if (target) return { kind: 'ask', target: target.id, card };
    }
  }
  return null;
}

export function expectedResult(s: GameState, action: Action): string {
  const next = apply(s, action).pendingEvent!;
  if (next.kind === 'request') return next.success ? 'success' : 'failure';
  return next.correct ? 'correct' : 'wrong';
}

/** Make a move through the UI, exactly like a player would. */
export async function perform(page: Page, action: Action) {
  if (action.kind === 'ask') {
    await page.getByTestId('tab-ask').click();
    await page.getByTestId(`target-${action.target}`).click();
    await page.getByTestId(`set-${setOf(action.card)}`).click();
    await page.getByTestId(`card-${action.card}`).click();
    await page.getByTestId('confirm-ask').click();
  } else {
    await page.getByTestId('tab-call').click();
    await page.getByTestId(`call-set-${action.setId}`).click();
    for (const c of action.named) await page.getByTestId(`named-card-${c}`).click();
    if (action.handover) await page.getByTestId('handover-yes').check();
    await page.getByTestId('confirm-call').click();
  }
}

export async function handOn(page: Page): Promise<string[]> {
  const faces = await page
    .getByTestId('hand')
    .locator('[data-card-face]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card-face')!));
  return faces.sort();
}

/** No card faces anywhere except the viewer's own hand and the move panel's set listings. */
export async function expectNoForeignCards(page: Page) {
  const elsewhere = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-card-face]')].filter(
        (el) => !el.closest('[data-testid="hand"], [data-testid="move-panel"], [data-testid="request-overlay"]'),
      ).length,
  );
  expect(elsewhere).toBe(0);
}

/** Card counts and scores everyone can see. */
export async function expectPublicInfo(page: Page, s: GameState) {
  for (const p of s.players) {
    if (s.hands[p.id].length > 0) await expect(page.getByTestId(`count-${p.id}`)).toHaveText(String(s.hands[p.id].length));
  }
  const scores = teamScores(s);
  for (const t of s.teams) await expect(page.getByTestId(`score-value-${t.id}`)).toHaveText(String(scores[t.id]));
  // No history: once an announcement is gone, nothing about past requests remains.
  await expect(page.getByText(/ asked .* for the /)).toHaveCount(0);
}
