import { test, expect, type Browser, type Page } from '@playwright/test';
import { getResult, partnerOf } from '../src/engine/index.ts';
import type { GameState } from '../src/types/game.ts';
import {
  ack,
  apply,
  expectNoForeignCards,
  expectPublicInfo,
  expectedResult,
  failingMove,
  goodCall,
  goodMove,
  handOn,
  nameOf,
  perform,
  wrongCall,
  type Action,
} from './helpers.ts';

/*
 * Online play: every player has their own browser (separate contexts, like
 * separate phones). The test reads each player's own hand from their screen,
 * rebuilds the full game in a Node-side engine, and then checks every move on
 * every screen against it.
 */

interface Seat {
  id: string;
  name: string;
  page: Page;
}

async function openRoom(browser: Browser, names: string[]): Promise<{ seats: Seat[]; code: string }> {
  const pages: Page[] = [];
  for (let i = 0; i < names.length; i++) pages.push(await (await browser.newContext()).newPage());
  const [host] = pages;
  await host.goto('/');
  await host.getByTestId('online-name').fill(names[0]);
  await host.getByTestId('online-submit').click();
  await expect(host.getByTestId('lobby')).toBeVisible();
  const code = (await host.getByTestId('room-code').innerText()).replace(/\s/g, '');
  expect(code).toMatch(/^[A-Z2-9]{5}$/);
  await expect(host.getByTestId('invite-link')).toHaveValue(new RegExp(`\\?room=${code}$`));

  // Friends open the invite link: the code is filled in for them.
  for (let i = 1; i < names.length; i++) {
    const page = pages[i];
    await page.goto(`/?room=${code}`);
    await expect(page.getByTestId('online-code')).toHaveValue(code);
    await page.getByTestId('online-name').fill(names[i]);
    await page.getByTestId('online-submit').click();
    await expect(page.getByTestId('lobby')).toBeVisible();
  }
  await expect(host.getByTestId(/^lobby-player-\d+$/)).toHaveCount(names.length);
  return { seats: names.map((name, i) => ({ id: `m${i + 1}`, name, page: pages[i] })), code };
}

/** Rebuild the full game from what each player sees on their own screen. */
async function readGame(seats: Seat[], teamCount: number): Promise<GameState> {
  const hands: Record<string, string[]> = {};
  for (const s of seats) {
    await expect(s.page.getByTestId('hand')).toBeVisible();
    hands[s.id] = await handOn(s.page);
  }
  const all = Object.values(hands).flat();
  expect(all).toHaveLength(54);
  expect(new Set(all).size).toBe(54);
  const current = await whoseTurn(seats);
  const teams = Array.from({ length: teamCount }, (_, i) => ({ id: `t${i + 1}`, name: '', color: '' }));
  return {
    // New players join the emptiest team, so with 4 players teams alternate round the table.
    players: seats.map((s, i) => ({ id: s.id, name: s.name, teamId: `t${(i % teamCount) + 1}`, seat: i })),
    teams,
    hands,
    currentPlayerId: current,
    startingPlayerId: current,
    called: {},
    resumeAfterId: null,
    handoverFromId: null,
    status: 'playing',
    pendingEvent: null,
    eventCounter: 0,
    passTheDevice: false,
  };
}

/** The player whose screen shows the move controls. */
async function whoseTurn(seats: Seat[]): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    for (const s of seats) if (await s.page.getByTestId('move-panel').isVisible()) return s.id;
    await seats[0].page.waitForTimeout(100);
  }
  throw new Error('Nobody has the move controls');
}

async function play(seats: Seat[], s: GameState, action: Action): Promise<GameState> {
  const me = seats.find((x) => x.id === s.currentPlayerId)!;
  const expected = expectedResult(s, action);
  await perform(me.page, action);
  // Every player sees the same announcement, with the same outcome.
  await Promise.all(
    seats.map(async (x) => {
      const overlay = x.page.getByTestId('request-overlay');
      await expect(overlay).toHaveAttribute('data-actor', me.id);
      await expect(overlay).toHaveAttribute('data-result', expected);
      await x.page.getByTestId('overlay-continue').click({ timeout: 3_000 }).catch(() => {});
      await expect(overlay).toBeHidden();
    }),
  );
  return ack(apply(s, action));
}

/** Check every screen against the oracle. */
async function checkScreens(seats: Seat[], s: GameState) {
  if (s.status !== 'playing') return; // the results screen shows every called set
  expect(await whoseTurn(seats)).toBe(s.currentPlayerId);
  await Promise.all(
    seats.map(async (x) => {
      await expect.poll(() => handOn(x.page)).toEqual([...s.hands[x.id]].sort());
      await expectNoForeignCards(x.page);
      await expectPublicInfo(x.page, s);
    }),
  );
}

test('four players on four devices play a full online game', async ({ browser }) => {
  const errors: string[] = [];
  const { seats } = await openRoom(browser, ['Rahul', 'Priya', 'Arjun', 'Meera']);
  for (const x of seats) x.page.on('pageerror', (e) => errors.push(`${x.name}: ${e.message}`));
  const host = seats[0].page;

  // Only the host can start; the others are told who they're waiting for.
  await expect(seats[1].page.getByTestId('waiting-for-host')).toContainText('Waiting for Rahul');
  await expect(seats[1].page.getByTestId('lobby-start')).toHaveCount(0);
  await host.getByTestId('lobby-start').click();

  let s = await readGame(seats, 2);
  await checkScreens(seats, s);

  // 1. A miss passes the turn clockwise.
  const before = s.currentPlayerId!;
  s = await play(seats, s, failingMove(s)!);
  expect(s.players.findIndex((p) => p.id === s.currentPlayerId)).toBe((s.players.findIndex((p) => p.id === before) + 1) % 4);
  await checkScreens(seats, s);

  // 2. A wrong call changes nothing and passes the turn.
  const wrong = wrongCall(s);
  if (wrong) {
    const caller = s.currentPlayerId!;
    s = await play(seats, s, wrong);
    expect(s.currentPlayerId).not.toBe(caller);
    await checkScreens(seats, s);
  }

  // 3. A player refreshes their page mid-game and gets their seat and hand back.
  const refresher = seats.find((x) => x.id !== s.currentPlayerId)!;
  await refresher.page.reload();
  await expect.poll(() => handOn(refresher.page)).toEqual([...s.hands[refresher.id]].sort());

  // 4. Play the rest out with perfect knowledge, handing the turn over after the first correct call.
  let handedOver = false;
  let moves = 0;
  while (s.status === 'playing') {
    // Hand over on the first correct call where the partner still has cards afterwards.
    const call = !handedOver ? goodCall(s, true) : null;
    const partnerId = partnerOf(s, s.currentPlayerId!)!.id;
    let action: Action;
    if (call && call.kind === 'call' && s.hands[partnerId].length > call.named.length) action = call;
    else action = moves % 9 === 4 ? (failingMove(s) ?? goodMove(s)) : goodMove(s);
    const caller = s.currentPlayerId!;
    s = await play(seats, s, action);
    if (action.kind === 'call' && action.handover && s.handoverFromId === caller) {
      handedOver = true;
      // The partner now plays, and everyone can see who handed over.
      await expect(seats[0].page.getByTestId('handover-note')).toContainText(`handed over by ${nameOf(s, caller)}`);
    }
    moves++;
    await checkScreens(seats, s);
    expect(moves).toBeLessThan(200);
  }
  expect(handedOver).toBe(true);

  // Results on every screen; only the host can start a rematch.
  const result = getResult(s);
  for (const x of seats) {
    await expect(x.page.getByTestId('results')).toBeVisible();
    for (const t of s.teams) await expect(x.page.getByTestId(`final-${t.id}`)).toContainText(String(result.scores[t.id]));
  }
  await expect(seats[2].page.getByTestId('waiting-for-host')).toBeVisible();
  await host.screenshot({ path: 'e2e/screenshots/online-results.png', fullPage: true });

  await host.getByTestId('rematch').click();
  for (const x of seats) await expect(x.page.getByTestId('table')).toBeVisible();
  const again = await readGame(seats, 2);
  expect(Object.values(again.hands).flat()).toHaveLength(54);

  expect(errors).toEqual([]);
});

test('lobby: teams, seats and validation before starting', async ({ browser }) => {
  const { seats } = await openRoom(browser, ['Rahul', 'Priya', 'Arjun', 'Meera', 'Kavya']);
  const host = seats[0].page;
  // Five players can't make pairs.
  await expect(host.getByTestId('lobby-issues')).toContainText('must be even');
  await expect(host.getByTestId('lobby-start')).toBeDisabled();
  // The fifth player leaves; four can start.
  await seats[4].page.getByTestId('leave-room').click();
  await expect(host.getByTestId(/^lobby-player-\d+$/)).toHaveCount(4);
  await expect(host.getByTestId('lobby-start')).toBeEnabled();
  // A player renames themself and everyone sees it.
  await seats[1].page.getByTestId('my-name').fill('Priya S');
  await seats[1].page.getByTestId('my-name').press('Enter');
  await expect(host.getByTestId('lobby-player-1')).toContainText('Priya S');
  await host.screenshot({ path: 'e2e/screenshots/online-lobby.png', fullPage: true });
});

test('a wrong room code is explained', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('home-join').click();
  await page.getByTestId('online-name').fill('Sam');
  await page.getByTestId('online-code').fill('ZZZZZ');
  await page.getByTestId('online-submit').click();
  await expect(page.getByTestId('form-error')).toContainText('no room with that code');
});
