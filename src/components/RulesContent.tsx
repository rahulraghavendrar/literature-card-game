/** The rules, including every convention this implementation chose. */
export function RulesContent() {
  return (
    <div className="space-y-5 text-[15px] leading-relaxed text-vellum-200 [&_h3]:mb-1.5 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-vellum-50 [&_strong]:text-vellum-50">
      <section>
        <h3>The idea</h3>
        <p>
          Teams of two collect sets by asking opponents for cards, then call each finished set to score a point. The team
          with the most points wins. You see only your own cards — not even your partner’s.
        </p>
      </section>
      <section>
        <h3>The nine sets of six</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>2 to 7 of one suit</strong> — one set each for ♦ ♣ ♥ ♠.
          </li>
          <li>
            <strong>9 to Ace of one suit</strong> — one set each for ♦ ♣ ♥ ♠.
          </li>
          <li>
            <strong>Eights &amp; Jokers</strong> — all four 8s and both jokers. The two jokers are the same card: ask for
            “a Joker” and either one counts.
          </li>
        </ul>
        <p className="mt-2">All 54 cards are shuffled and dealt one at a time clockwise; hands differ by at most one card.</p>
      </section>
      <section>
        <h3>Your turn: ask</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Ask one opponent (never your partner) for one specific card.</li>
          <li>You may only ask for a card from a set you hold at least one card of, and not for a card you already hold.</li>
          <li>
            <strong>They have it:</strong> it comes to you and you ask again.
          </li>
          <li>
            <strong>They don’t:</strong> your turn ends and the player you asked takes the turn.
          </li>
          <li>
            <strong>Out of time:</strong> online games can give each move a time limit (1 minute by default). If it runs out,
            the turn passes to the next player clockwise.
          </li>
        </ul>
      </section>
      <section>
        <h3>Your turn: call a set</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            A set is finished when you and your partner hold all six cards between you — or one of you holds all six. Nothing
            happens automatically: you can keep a finished set and call it on any later turn.
          </li>
          <li>To call, choose the set and name every card of it your partner holds (the ones you don’t have).</li>
          <li>
            <strong>Right:</strong> the six cards leave the game and your team scores a point. Then either keep playing, or
            let your partner play instead of you. Your partner plays on until they miss (then the player they asked takes the
            turn as usual).
          </li>
          <li>
            <strong>Wrong:</strong> nothing moves and the turn passes to the next player clockwise.
          </li>
        </ul>
      </section>
      <section>
        <h3>Turn order</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>A miss hands the turn to the player who was asked. Wrong calls and running out of time pass it clockwise.</li>
          <li>Players with no cards are skipped. If you run out of cards on your turn, play moves clockwise.</li>
        </ul>
      </section>
      <section>
        <h3>Winning</h3>
        <p>
          The game ends when all nine sets have been called. One point per set; the team with the most points wins, and equal
          top scores are a draw.
        </p>
      </section>
      <section>
        <h3>Paying attention</h3>
        <p>
          There is no move history: each request is shown once, then it’s gone. Remember who asked for what — it tells you
          where the cards are.
        </p>
      </section>
    </div>
  );
}
