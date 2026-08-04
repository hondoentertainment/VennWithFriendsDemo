# Making "With Friends" real

The app is named for multiplayer but is single-device: one human, one AI
opponent (`Circuit`), and a profile in `localStorage`. This note scopes what
real multiplayer would take, so the decision is a deliberate one rather than
something the codebase drifts into.

## What exists today

- `App.tsx` holds the entire game in React state. Phase transitions, the
  countdown, submissions, and scoring are all local.
- The server (`server.mjs` + `server/genai.mjs`) is stateless. It proxies
  Gemini calls and serves static files; it knows nothing about games.
- Player identity is a random string in `localStorage` with no server-side
  record.

Nothing here is wrong for a demo. It just means multiplayer is a new system
rather than an extension of an existing one.

## What multiplayer actually requires

**1. Server-authoritative rounds.** The client currently owns the clock and
decides when a round ends. With several players that has to move server-side,
or the first client to hit zero ends the round for everyone — and any client
can lie about its timer. The server owns phase, deadline, and submissions;
clients render what they are told.

**2. Rooms and presence.** A room code, a join flow, a host, and a policy for
disconnects (does the round wait, or proceed without them?). The current
"everyone has submitted" check assumes a fixed roster that never changes
mid-round.

**3. A transport for pushes.** Scores and phase changes have to reach every
client. WebSockets or SSE; SSE plus POSTs is simpler and enough here, since
the only client→server events are "submit" and "start".

**4. Durable identity.** `localStorage` ids collide and vanish. Multiplayer
needs accounts, or at minimum signed session cookies, before scores across
players mean anything.

**5. Moderation called once per round, by the server.** Today each client
would independently call `/api/moderate` and get different verdicts. The
server must make exactly one call and broadcast the result — this also makes
the per-IP rate limiting in `server/guard.mjs` meaningful, since the number
of Gemini calls stops scaling with the number of players.

**6. Auth in front of the proxy.** With real accounts, `/api/*` can require a
session instead of relying on origin checks and rate limits, which is the only
thing that actually stops a determined caller from spending the API key.

## Rough shape

A minimal version is a single-process server holding rooms in memory:

```
POST /rooms                 -> { roomCode }
POST /rooms/:code/join      -> { playerId, token }
GET  /rooms/:code/events    -> SSE: phase, roster, timer, results
POST /rooms/:code/submit    -> { content }
```

In-memory state means one instance and no persistence across restarts, which
is fine for a demo but is the thing that has to change first for anything
real.

## Recommendation

Don't build this unless the goal is a product. It is a larger change than
everything on this branch combined, and it invalidates the current shape of
`App.tsx` — game state moves out of React and into a server the client
subscribes to. If the aim is to demonstrate the concept, the current
single-player-versus-AI loop does that, and the honest fix is naming and copy
that don't promise friends.
