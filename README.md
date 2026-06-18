# Scrumbled Eggs 🥚

A real-time Scrum pointing-poker app. Create a room, share a public link, and estimate
stories together — anonymous, no sign-up. Built with Vite + vanilla TypeScript and Firebase
(Realtime Database + Anonymous Auth); there is no custom backend.

See [CLAUDE.md](CLAUDE.md) for the full architecture and feature spec.

## Quick start

```bash
npm install
cp .env.example .env      # then fill in your Firebase web config
npm run dev               # http://localhost:5173
```

### Firebase setup

1. Create a Firebase project and a **Realtime Database**.
2. **Authentication → Sign-in method → Anonymous → Enable.**
3. **Authentication → Settings →** enable automatic deletion of anonymous accounts inactive for 30 days.
4. Copy your web app config (Project settings → General → SDK setup) into `.env`.
5. Deploy the database rules: `firebase deploy --only database`.

### Local emulators (no live project needed)

```bash
# set VITE_USE_EMULATORS=1 in .env
firebase emulators:start
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` (the quality gate) |
| `npm run emulators` | Start Firebase emulators |

## Deploy

```bash
npm run build
firebase deploy            # hosting + database rules + functions
```

## Scheduled cleanup (Blaze plan)

`functions/` contains `cleanupExpiredRooms`, a daily job that deletes the contents of rooms
inactive for 48h and leaves a `{ meta: { status: "expired" } }` tombstone (so old links show
the expired page). It requires the **Blaze** plan but stays within the free usage tier.

### Cost protection

A Cloud Billing **budget alert only emails you — it does not stop spending.** For a hard cap:
1. Cloud Console → Billing → Budgets & alerts → create a budget (e.g. $5/mo).
2. Publish the budget to a **Pub/Sub** topic.
3. Deploy a function subscribed to that topic that calls the Cloud Billing API to **disable
   billing** when the cap is crossed (Google's documented "cap (disable) billing" pattern).
4. Optionally add per-API quota limits as an earlier throttle.

## Known limitation: server-side vote privacy

The client subscribes to the whole room node, which requires read access to it, so vote
**values** are technically readable before reveal by a crafted client (the UI cooperatively
hides them until reveal). The **write** rules are fully enforced (you can only write your own
participant record and your own vote, votes must be a deck value, host-only fields are gated).
Enforcing read-side vote privacy requires splitting the room subscription into granular paths
(meta / participants / `voted` / `votes`-only-when-revealed) — see the vote-privacy note in
CLAUDE.md. Tracked as future work.
