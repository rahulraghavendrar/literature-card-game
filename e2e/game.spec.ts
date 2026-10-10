import { test, expect, type Page } from '@playwright/test';
import { createDefaultConfig, createGame, getResult, nextClockwiseWithCards, partnerOf, seededRng } from '../src/engine/index.ts';
import type { GameConfig, GameState } from '../src/types/game.ts';
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
 * One-device play. The Node-side engine is seeded like the browser (`?seed=`),
 * so it knows the deal and can check every screen.
 */

function oracleConfig(names: string[], passTheDevice: boolean): GameConfig {
  const config = createDefaultConfig(names.length);
  config.players.forEach((p, i) => (p.name = names[i]));
  config.passTheDevice = passTheDevice;
  return config;
}

async function setupGame(page: Page, names: string[], seed: number, passTheDevice: boolean) {
  await page.goto(`/?seed=${seed}`);
  await page.getByTestId('play-local').click();
  if (names.length !== 4) await page.getByTestId(`count-${names.length}`).click();
  for (let i = 0; i < names.length; i++) await page.getByTestId(`name-${i}`).fill(names[i]);
  const toggle = page.getByTestId('pass-device-toggle');
  if ((await toggle.isChecked()) !== passTheDevice) await toggle.setChecked(passTheDevice, { force: true });
  await page.getByTestId('start-game').click();
}

/** Make a move, check the announcement's outcome and close it. */
async function play(page: Page, s: GameState, action: Action): Promise<GameState> {
  const expected = expectedResult(s, action);
  await perform(page, action);
  const overlay = page.getByTestId('request-overlay');
  await expect(overlay).toHaveAttribute('data-result', expected);
  await page.getByTestId('overlay-continue').click({ timeout: 2_000 }).catch(() => {});
  await expect(overlay).toBeHidden();
  return ack(apply(s, action));
}

/** Hand the device over if needed, then check the screen matches the oracle. */
async function checkTable(page: Page, s: GameState, passTheDevice: boolean, previousViewer: string | null) {
  const current = s.currentPlayerId!;
  if (passTheDevice && current !== previousViewer) {
    await expect(page.getByTestId('handoff-screen')).toContainText(`Pass the device to ${nameOf(s, current)}`);
    await expect(page.locator('[data-card-face]')).toHaveCount(0);
    await page.getByTestId('handoff-ready').click();
  }
  await expect(page.getByTestId('turn-indicator')).toContainText(nameOf(s, current));
  expect(await handOn(page)).toEqual([...s.hands[current]].sort());
  await expectNoForeignCards(page);
  await expectPublicInfo(page, s);
}

test('a full 4-player game on one device, from setup to results, rematch and back to setup', async ({ page }) => {
  const names = ['Rahul', 'Priya', 'Arjun', 'Meera'];
  const seed = 4242;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let s = createGame(oracleConfig(names, true), { rng: seededRng(seed) });
  await setupGame(page, names, seed, true);
  let viewer: string | null = null;
  await checkTable(page, s, true, viewer);
  viewer = s.currentPlayerId;

  // A miss passes the turn clockwise.
  const before = s.currentPlayerId!;
  s = await play(page, s, failingMove(s)!);
  expect(s.currentPlayerId).toBe(nextClockwiseWithCards(s, before));
  await checkTable(page, s, true, viewer);
  viewer = s.currentPlayerId;

  // Play the game out with perfect information, handing over after the first possible call.
  let handedOver = false;
  let moves = 0;
  while (s.status === 'playing') {
    const call = !handedOver ? goodCall(s, true) : null;
    const partnerId = partnerOf(s, s.currentPlayerId!)!.id;
    const action = call && call.kind === 'call' && s.hands[partnerId].length > call.named.length ? call : goodMove(s);
    const caller = s.currentPlayerId!;
    s = await play(page, s, action);
    if (action.kind === 'call' && action.handover && s.handoverFromId === caller) {
      handedOver = true;
      await expect(page.getByTestId('handoff-note')).toContainText(`${nameOf(s, caller)} handed the turn to you.`);
    }
    moves++;
    if (s.status === 'playing') {
      await checkTable(page, s, true, viewer);
      viewer = s.currentPlayerId;
    }
    expect(moves).toBeLessThan(200);
  }
  expect(handedOver).toBe(true);

  const result = getResult(s);
  await expect(page.getByTestId('results')).toBeVisible();
  if (result.winnerTeamId) {
    await expect(page.getByTestId('winner')).toContainText(s.teams.find((t) => t.id === result.winnerTeamId)!.name);
  } else {
    await expect(page.getByTestId('draw')).toBeVisible();
  }
  for (const t of s.teams) await expect(page.getByTestId(`final-${t.id}`)).toContainText(String(result.scores[t.id]));
  await expect(page.locator('[data-testid^="shelf-"][data-status="in-play"]')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/local-results.png', fullPage: true });

  await page.getByTestId('rematch').click();
  await expect(page.getByTestId('handoff-screen')).toBeVisible();
  await page.getByTestId('open-menu').click();
  await page.getByTestId('to-setup').click();
  await page.getByTestId('confirm-leave').click();
  await expect(page.getByTestId('name-0')).toHaveValue('Rahul');
  expect(errors).toEqual([]);
});

for (const n of [6, 8, 10]) {
  test(`a full ${n}-player game on one device, with misses and a wrong call`, async ({ page }) => {
    const names = ['Rahul', 'Priya', 'Arjun', 'Meera', 'Kavya', 'Vikram', 'Ananya', 'Rohan', 'Divya', 'Karthik'].slice(0, n);
    const seed = 500 + n;
    const passTheDevice = n === 10;
    let s = createGame(oracleConfig(names, passTheDevice), { rng: seededRng(seed) });
    await setupGame(page, names, seed, passTheDevice);
    let viewer: string | null = null;
    await checkTable(page, s, passTheDevice, viewer);
    viewer = s.currentPlayerId;

    // Misses walk once round the table, clockwise.
    const seat = (id: string) => s.players.find((p) => p.id === id)!.seat;
    for (let i = 0; i < n; i++) {
      const from = s.currentPlayerId!;
      s = await play(page, s, failingMove(s)!);
      expect(seat(s.currentPlayerId!)).toBe((seat(from) + 1) % n);
      await checkTable(page, s, passTheDevice, viewer);
      viewer = s.currentPlayerId;
    }

    let wrongDone = false;
    let moves = 0;
    while (s.status === 'playing') {
      const wrong = !wrongDone ? wrongCall(s) : null;
      const action = wrong ?? (moves % 7 === 3 ? (failingMove(s) ?? goodMove(s)) : goodMove(s));
      if (wrong) wrongDone = true;
      s = await play(page, s, action);
      moves++;
      if (s.status === 'playing') {
        await checkTable(page, s, passTheDevice, viewer);
        viewer = s.currentPlayerId;
      }
      expect(moves).toBeLessThan(400);
    }
    await expect(page.getByTestId('results')).toBeVisible();
  });
}

test('setup validation and supported player counts', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play-local').click();
  for (const n of [5, 7, 9]) await expect(page.getByTestId(`count-${n}`)).toBeDisabled();
  await page.getByTestId('name-0').fill('Sam');
  await page.getByTestId('name-1').fill('sam');
  await page.getByTestId('assign-1-t1').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('setup-errors')).toContainText('Two players are called');
  await expect(page.getByTestId('setup-errors')).toContainText('Crimson has 3 players');

  for (const n of [4, 6, 8, 10]) {
    await page.getByTestId(`count-${n}`).click();
    await expect(page.getByTestId(/^name-\d+$/)).toHaveCount(n);
  }
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('setup-errors')).toContainText('Two players are called');
  await page.getByTestId('name-1').fill('Alex');
  await expect(page.getByTestId('setup-errors')).toHaveCount(0);
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('handoff-screen')).toBeVisible();
});
