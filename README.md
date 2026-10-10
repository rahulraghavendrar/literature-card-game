# Literature

The team card game Literature, for 4–10 players in teams of two. Play **online** (everyone on their own phone or computer, joining with a room code) or **on one device** (pass it round the table).

Built with React, TypeScript, Vite, Tailwind CSS, Framer Motion and Zustand in the browser, and Node, Express and Socket.IO on the server.

## Run it on your computer

You need **Node.js 20.19 or newer** (22 recommended).

```bash
npm install
npm run build
npm start
```

Open **http://localhost:3000**. The terminal also prints a network address such as `http://192.168.1.5:3000` — anyone **on the same Wi‑Fi** can open that (or the invite link in the lobby) to join your room. If Windows asks whether to allow Node.js on networks, choose **Private networks**.

For development with hot reload use `npm run dev` instead.

## Put it online so anyone can join

### Option A — instant link from your computer (no account)

Your computer hosts the game while it's on; a free Cloudflare tunnel gives it a public address.

1. Start the game: `npm run build` then `npm start`.
2. Install Cloudflare's tunnel tool once. On Windows: `winget install --id Cloudflare.cloudflared`
3. In a second terminal: `cloudflared tunnel --url http://localhost:3000`
4. It prints a link like `https://something-random.trycloudflare.com`. Open it, create a room, and send the invite link to your friends.

The link changes each time you run step 3, and stops working when you close it or your computer sleeps.

### Option B — a permanent link on Render (free account)

1. Put this folder on GitHub (create an empty repository called `literature-card-game` at https://github.com/new, then run):
   ```bash
   git init -b main
   git add -A
   git commit -m "Literature card game"
   git remote add origin https://github.com/<your-username>/literature-card-game.git
   git push -u origin main
   ```
2. Sign in at https://render.com with GitHub.
3. **New → Blueprint**, pick the `literature-card-game` repository and click **Apply**. Render reads `render.yaml` and builds it (a few minutes).
4. Your game is at `https://literature-card-game.onrender.com` (or similar). Share that link.

On Render's free plan the server sleeps after 15 minutes without visitors; the first visit after that takes about a minute to wake it. Rooms live in memory, so a restart or redeploy ends games in progress.

### Option C — any container host

A `Dockerfile` is included for Railway, Fly.io or your own server:

```bash
docker build -t literature .
docker run -p 3000:3000 literature
```

Settings (environment variables): `PORT` (default 3000), `HOST` (default `0.0.0.0`), `LITERATURE_EVENT_LOCK_MS` — how long each announcement stays up before the next move (default 2600).

## How to play

**The nine sets of six cards**

| Set | Cards |
|---|---|
| 2–7 of each suit (4 sets) | 2 3 4 5 6 7 of ♦, of ♣, of ♥, of ♠ |
| 9–A of each suit (4 sets) | 9 10 J Q K A of ♦, of ♣, of ♥, of ♠ |
| Eights & Jokers (1 set) | 8♦ 8♣ 8♥ 8♠ Joker 1 Joker 2 |

All 54 cards are dealt one at a time clockwise; hands differ by at most one card. You see only your own hand — not even your partner's.

**On your turn, ask** one opponent (never your partner) for one card. You may only ask for a card from a set you hold at least one card of, and not for a card you already hold.
- They have it: it comes to you and you ask again.
- They don't: play passes to the next player clockwise.

**Or call a set.** When you and your partner hold all six cards of a set between you (or one of you holds all six), call it: choose the set and name every card of it your partner holds. Nothing is collected automatically — you can keep a finished set and call it on a later turn.
- Right: the six cards leave the game and your team scores **1 point**. Then either keep playing, or let your partner play instead of you. Your partner plays until they miss; after that, play goes to the player clockwise after **you**.
- Wrong: nothing moves and the turn passes clockwise.

**Turn order.** Seats are fixed and play always moves clockwise. Players with no cards are skipped.

**Winning.** When all nine sets are called, the team with the most points wins. Equal top scores are a draw.

There is no move history: each request is shown once on everyone's screen, then it's gone.

## Playing online

1. One person chooses **Play online → Create a room**. They're the host.
2. Everyone else opens the invite link (or the game, then **Join with a code**).
3. In the lobby, players pick their team; the host can also move players, reorder seats, rename teams, pick who goes first, and start once every team has exactly two players.
4. Each player sees only their own cards on their own screen. If someone's connection drops or they refresh, they get their seat and hand back automatically; if the host drops out, the next player gets the host controls until they return.

The server holds the whole game and checks every move. Each browser only ever receives its own hand plus public information (names, card counts, scores, called sets).

## Tests

```bash
npm test                         # 126 rules, server and screen tests (Vitest)
npx playwright install chromium  # once
npm run test:e2e                 # 8 full games in real browsers (Playwright)
```

The browser tests play complete games through the real interface: one-device games for 4, 6, 8 and 10 players, and a 4-player online game in four separate browsers. A copy of the rules engine knows every hand, picks the moves, and checks every screen after every move — the right hand, card counts, scores and turn order, no other player's cards, and nothing left over from earlier requests.

## Project layout

```
src/
  types/        cards, sets, game state, events, client–server messages
  engine/       deck and sets, dealing, asking, calling, turn order, scoring, per-player views
  store/        gameStore (one device) and onlineStore (Socket.IO client)
  components/   cards, table, hand, move panel, announcements, shelf, menus
  pages/        home, one-device setup, online lobby, game, results
server/
  rooms.ts      rooms, lobby and game actions (no networking — unit-tested)
  app.ts        HTTP + Socket.IO server; serves the app
  index.ts      starts it
e2e/            Playwright end-to-end games
```

Turn transitions live in one function, `resolveNextTurn` in `src/engine/game.ts`.
