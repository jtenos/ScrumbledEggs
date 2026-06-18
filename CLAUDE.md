# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status: scaffolded & implemented.** The Vite + vanilla-TS app exists under `src/`, assets live under `public/`, Firebase config is in `firebase.json` / `database.rules.json`, and the scheduled cleanup is in `functions/`. See [README.md](README.md) for setup. Sections once marked _(planned)_ now describe live code — keep them in sync as the code changes. Known gap: server-side vote-read privacy (see Security Rules note and README).

## Project Overview

**Scrumbled Eggs** is a Scrum pointing-poker web app. A team member creates a room, shares a public link, and others join to estimate stories together. Votes are hidden until everyone reveals simultaneously. Sessions are real-time and anonymous — no sign-up required.

Core flow:
1. Host creates a room → gets a shareable public link.
2. Participants open the link, enter a display name, and join.
3. Everyone votes on the current story; votes stay hidden.
4. Host (or anyone, TBD) reveals all votes at once.
5. Discuss, optionally re-vote, advance to the next story.

## Tech Stack

- **Language:** TypeScript
- **Build/dev:** Vite
- **UI:** No framework — vanilla TypeScript + HTML with direct DOM manipulation. Do **not** introduce React/Vue/Svelte.
- **Backend / data / real-time:** Firebase **Realtime Database (RTDB)** — clients talk to Firebase directly; there is **no custom server**. Real-time sync rides Firebase's own WebSocket connection via the SDK's listeners.
- **Identity:** Firebase **Anonymous Auth** — gives each participant a stable per-session UID without a login. Display names are user-supplied and live in the room data, not in an account.
- **Hosting:** Firebase Hosting (static Vite build). The project runs on the **Blaze** (pay-as-you-go) plan — required for the scheduled cleanup function — but usage stays within the free tier and a hard budget cap prevents any large bill (see Firebase setup & security → Cleanup).

### Why these choices (so they aren't second-guessed later)

- **RTDB over Firestore:** poker produces frequent small writes (presence heartbeats, per-vote updates). Firestore bills per document read/write; RTDB bills by bandwidth with a larger free tier and lower latency for this pattern.
- **No backend server:** Firebase listeners deliver the live updates a pointing app needs, so a hand-rolled WebSocket server would be redundant infrastructure and cost. Security/authorization is enforced by **RTDB Security Rules**, not server code — see below.

## Architecture (planned)

The app is a single-page client that mirrors a room's state from RTDB. There is no request/response API; instead the UI **subscribes** to paths in RTDB and re-renders on change, and **writes** local actions (vote, join, reveal) straight to RTDB. Treat RTDB as the single source of truth.

Because there's no UI framework, the render pattern is small element-builder functions (`src/util/dom.ts` `el()`/`mount()`) composed per screen. `src/ui/room.ts` subscribes once to the room and re-renders a `content` container on each snapshot; transient UI (open share panel, mid-edit name) may reset on remote updates — an accepted tradeoff of full re-render.

**Source map** (the non-obvious wiring):
- `src/db/rooms.ts` — the only module that touches RTDB; all reads/writes go through it.
- `src/scoring.ts` — pure scoring (mean/median/recommended/spread/consensus + the numeric mapping). `src/scales.ts` — presets, deck assembly, preset-link query parse/build. Both pure → first place for tests.
- `src/ui/room.ts` — orchestrator: join gate, reveal flow + 3s veto timer, auto-reveal, modal triggers, host tools. `src/ui/board.ts` — responsive participant layout + vote sizing. `src/ui/results.ts`, `join.ts`, `modals.ts`, `expired.ts`, `home.ts` — focused screens/pieces.
- `src/auth.ts` — anonymous sign-in; `uid` is the participant identity. `src/router.ts` — hash routing (`#/room/<id>`) + preset query on home.

### Data model (proposed RTDB shape)

```
rooms/{roomId}
  meta:         { name, createdAt, hostUid, deck: ["1","2","3","5","8","?"], deckSet: {"1":true,...}, currentRoundId, autoReveal, revealRequest? }
                # deck = ordered array for display; deckSet = same values keyed for O(1) rule validation (keep in sync)
  rounds/{roundId}:
    title, startedAt, status: "queued" | "voting" | "revealed"
    overrideScore?                 # host-chosen final score; absent = no override (see scoring)
    votes/{uid}: <value>           # see vote-privacy note
  participants/{uid}: { name, icon, isObserver, connected, joinedAt, lastSeen }   # icon = filename from player-images.txt; unique per room. connected via onDisconnect()
```

Rounds are append-only and ordered by creation (RTDB push keys). Only the round referenced by `meta.currentRoundId` accepts votes/edits. Other rounds are either past (`status: "revealed"`, read-only archives) or upcoming (`status: "queued"`, enqueued by the host but not yet started). `status` is per-round. `revealRequest` (the non-host reveal flow) lives on `meta` and applies to the current round.

**`roomId`** is unique, random, and unguessable but **not** required to be cryptographically secure — a standard UUID (e.g. `crypto.randomUUID()`) is appropriate. It appears in the public share URL, so it just needs enough entropy that rooms can't be casually enumerated.

### Static assets & where they live

All runtime-referenced static files belong in Vite's **`public/`** directory, which Vite copies verbatim into the build (`dist/`) with **unchanged filenames**, served at root-relative URLs. This is required because these assets are referenced by **runtime-constructed paths** (random logo number, manifest-driven icon filenames, the fetched `.txt`); importing them through the bundler instead would hash their filenames and break those lookups.

Layout under Vite's **`public/`** directory (served verbatim at the site root → `/favicon.ico`, `/player-images.txt`, `/img/logo/logo-1.webp`, etc.):
```
public/
  favicon.ico
  player-images.txt       # manifest of player-icon filenames
  img/
    egg.webp              # vote-card background
    celebrate.gif         # consensus celebration
    spread.gif            # vote-spread alert
    waiting.gif           # "waiting on you" nudge
    eggspired.webp        # expired-room page image
    logo/                 # logo-1.webp … logo-6.webp (600×600)
    player-icons/         # *.webp (300×300)
```

Note: `firebase.json`'s `"public"` field points at the build output (`dist/`), which is a different thing from Vite's source `public/` folder despite the shared name.

### Player avatar icons

Avatar images live in `public/img/player-icons/` as **300×300 WebP** files. Because the app is fully client-side with no server, the filesystem can't be enumerated at runtime — so the list of available icons is read from **`public/player-images.txt`** (one filename per line), which the client fetches (`src/util/icons.ts`) to know which icons exist.

**This manifest must be kept in sync by hand:** whenever icons are added to or removed from `public/img/player-icons/`, update `public/player-images.txt` to match. Regenerate it with:
```bash
ls -1 public/img/player-icons/*.webp | xargs -n1 basename > public/player-images.txt
```

### Two architectural concerns that need deliberate handling

1. **Vote privacy before reveal.** Because clients read RTDB directly, you cannot rely on the UI to hide votes — a curious user could read the raw data. Security Rules must prevent reading another participant's vote in a round until that round's `status === "revealed"`. A common approach: keep vote *values* under a node that rules deny reading while the round is `"voting"`, and expose only a `hasVoted` boolean for the "who's voted" indicator. Decide and document the exact rule shape when implementing voting.

2. **Presence / disconnect.** Use RTDB's `onDisconnect()` (with `.info/connected`) to set a participant's `connected` flag to `false` when their tab closes/drops, and back to `true` when they return; keep a `lastSeen` heartbeat too. Disconnected participants are **not removed** — they stay on the board (grayed out) but don't count as active.

   **"Active participant"** = `connected === true` **and** `isObserver === false`. This is the set that gates the count-dependent behaviors: auto-reveal ("all voted"), the "waiting on you" nudge, etc. Excluding disconnected users from "active" is what prevents a dropped non-voter from hanging a round forever.

## Firebase setup & security (planned)

### Anonymous Authentication

The client must `signInAnonymously()` before any RTDB read/write; the resulting `auth.uid` **is** the participant's identity — it's the `uid` key under `participants/{uid}` and `rounds/{roundId}/votes/{uid}`.

Console setup: **Authentication → Sign-in method → Anonymous → Enable**.

**Stable identity across reloads.** Firebase persists the anonymous `auth.uid` locally, so a user who refreshes, reconnects, or reopens the room URL comes back with the **same `uid`** — they rejoin as **themself** (same `participants/{uid}` entry, name, icon, and current vote), **not** as a new participant. Joining is therefore idempotent: on entry, reuse the existing participant record for this `uid` if present rather than creating a duplicate. (Reconnect flips their `connected` flag back to `true` — see presence.)

### Security Rules: write-ownership

Rules are the only server-side authority — the client cannot be trusted, so all integrity guarantees live here. Enforce that a user can only write their own data:
- `participants/$uid` — writable only when `auth.uid === $uid`.
- `rounds/$roundId/votes/$uid` — writable only when `auth.uid === $uid`, and only for the **current** round (`$roundId === meta.currentRoundId`); archived rounds reject all vote writes. The written **value must be a member of `meta.deck`** (including any special cards `0`/`∞`/`?` that were enabled for the room) — reject any value not in the deck. Enforce this in the rules, not just the UI. (RTDB rules can't iterate an array, so to validate membership cheaply, also store the deck as a keyed set — e.g. `meta.deckSet: { "1": true, "2": true, "?": true }` — and have the rule check `meta.deckSet[newValue] === true`.)
- Vote **reads** are gated by the round's `status` (see vote-privacy note in Architecture).
- Host-only fields (room name, `currentRoundId`, kicking a user, cancelling a reveal request) — writable only when `auth.uid === meta.hostUid`.

### Cleanup

**Unused anonymous users.** Anonymous sign-ins accumulate one throwaway account per device/session. Enable Firebase's built-in auto-deletion: **Authentication → Settings → automatically delete anonymous accounts inactive for 30 days** (free; prevents unbounded growth).

**Old rooms — scheduled Cloud Function (Blaze plan).** RTDB has no native TTL, so a scheduled function deletes expired rooms. This requires the pay-as-you-go **Blaze** plan, but a tiny daily job sits well within the free usage tier — effectively free. The budget cap below ensures a usage spike can never produce a large bill.

Implementation:
1. Upgrade the project to **Blaze** (Console → top-left plan selector → Upgrade).
2. Stamp each room with `meta.createdAt` and update a `meta.lastActivity` timestamp on writes; pick a retention window (e.g. 24–48h after last activity).
3. Scaffold functions: `firebase init functions` (TypeScript).
4. Write a scheduled function using the v2 scheduler — `onSchedule('every 24 hours', ...)` — that queries `rooms` where `lastActivity` is older than the cutoff and, for each, **deletes all of the room's contents but leaves a tombstone**: replace the room node with `{ status: "expired" }` (keeping the `roomId` so its URL resolves to an expired page rather than a missing room). Deploy with `firebase deploy --only functions`.

**Budget cap so a spike can't bill you.** A Cloud Billing **budget alert only emails you — it does not stop spending.** To enforce a true ceiling:
1. Cloud Console → **Billing → Budgets & alerts → Create budget**; set the amount (e.g. $5/mo) and alert thresholds (50/90/100%).
2. Configure the budget to publish to a **Pub/Sub** topic.
3. Deploy a Cloud Function subscribed to that topic that calls the Cloud Billing API to **disable billing on the project** once spend crosses the cap (Google's documented "cap (disable) billing" pattern). Disabling billing halts Blaze services — for this app that's the desired fail-safe.
4. Optionally also set **per-API quota limits** (e.g. on Cloud Functions invocations and RTDB egress) to throttle the blast radius before the cap even triggers.

## Commands

```bash
npm install          # install deps
npm run dev          # local dev server with HMR (http://localhost:5173)
npm run build        # type-check (tsc) + production build to dist/
npm run preview      # serve the production build locally
npm run typecheck    # tsc --noEmit — the quality gate (no ESLint configured yet)
```

There is no test runner configured yet; `npm run typecheck` is the gate. The scoring logic
(`src/scoring.ts`) and scales (`src/scales.ts`) are pure and the natural first place to add
Vitest tests.

Firebase:
```bash
firebase emulators:start                 # local RTDB + Auth + Hosting + Functions emulators
firebase deploy                          # hosting + database rules + functions
firebase deploy --only database          # rules only
firebase deploy --only functions         # cleanup function only
```

## Features

> Maintained by the project owner. Add planned and implemented features below; keep this as the running source of truth for scope. Mark items as `[ ]` planned / `[x]` done so future Claude instances know what exists.

### MVP
- [ ] Create room, get shareable public link
- [ ] Anonymous join with display name
- [ ] Vote with a configurable deck (Fibonacci by default)
- [ ] Hidden votes until reveal; synchronized reveal
- [ ] Re-vote / clear for next round
- [ ] Live participant presence

### Additional features
- [ ] **Share room link** — room creator can copy the room URL to the clipboard via a button. A QR code encoding that same room URL is also available to copy/share for quick mobile join.
- [ ] **Pointing-scale selection** — when creating a room, the host picks the deck. Details below.
- [ ] **Editable room name** — the room name (`meta.name`) is shown as the page title. The host can click the title to edit it inline; the new name is saved automatically on blur (when focus leaves the textbox) — no save/cancel buttons. The update writes straight to RTDB and propagates to all participants in real time.
- [ ] **Name + icon on join** — every participant (including the host) enters a display name and picks an avatar icon when joining. Once a participant selects an icon, it is **disabled/unavailable** for everyone else in that room, so icons are unique per room. Store the chosen icon (e.g. its filename) on the participant record so the taken-set can be derived from current `participants`.
  - **Best-effort uniqueness only.** Disabling taken icons is a client-side UI convenience driven by the current `participants` data. Because clients write directly to RTDB with no server arbitration, two people selecting the same free icon at nearly the same moment can both succeed. This is acceptable — **do not** add transactions, locking, or error states to prevent it; just let the duplicate happen.
- [ ] **Vote reveal & scoring** — reveal all votes and compute scores. Details below.
- [ ] **Responsive participant layout** — works on all devices; layout adapts to participant count and screen size. Details below.
- [ ] **Download results** — once votes are shown, a **"Download Results"** button (available to **all** users) generates a self-contained HTML file from the current story's data and downloads it client-side. The file contains: the **story name** as the title, a **summary** of the mean and recommended score, and **each participant's individual vote**. If the host set a final-score override (`overrideScore`), show it **separately from** the recommended score so both are visible. Also offer a **"Download Session"** option (available to all users) that produces a **single file** containing every round in the room — each story's section (name, summary, individual votes, override) laid out one after another in round order. Same format/generation approach as the per-story download.
- [ ] **Changeable votes** — a user can change their vote at any time, **before or after** reveal. After reveal, a vote change immediately recomputes the mean and recommended score and updates the display for **everyone** in real time. (Mean/recommended are derived from current `votes`, so they recalculate naturally on any change.)
- [ ] **"Has voted" indicator** — as each participant casts a vote (pre-reveal), apply a CSS shimmer around their icon and bold their name, so everyone can see at a glance who has voted. This must convey *that* they voted without revealing *what* — drive it from the `hasVoted` boolean, not the vote value (see vote-privacy note in Architecture).
- [ ] **Spectator-only toggle** — any participant (host included) can toggle a "spectator only" mode **for themselves only**. A spectator is removed from the voting table — they don't vote and aren't counted in the mean/recommended score — but still watch the room live. Backed by the participant's `isObserver` flag; toggling is self-service and never controls another user.
- [ ] **Disconnected-player display** — when a participant disconnects, **gray out** their icon and name for everyone else and stop treating them as an active player (excluded from auto-reveal, the "waiting on you" nudge, and other active-count logic — see "Active participant" in Architecture). They are **not removed** — they stay visible on the board grayed out. When they rejoin/reconnect, restore full color and treat them as active again. Driven by the participant's `connected` flag.
- [ ] **Reassign host** — the host can select another participant and **"Reassign as Host"**, which sets `meta.hostUid` to that participant. The former host immediately becomes an ordinary participant and the new host gains all host tools. Since host-only UI is derived from `meta.hostUid`, every client should react to the change live (host controls appear for the new host, disappear for the old one); trigger a data refresh or page reload if needed to ensure the new host fully picks up the host tools. Note the host-only write rules then key off the new `hostUid`.
- [ ] **Host can remove a user** — the host can kick any participant at any time, removing them from the room entirely (their `participants` entry is deleted and their client should detect this and leave). A cookie is set on the kicked user that blocks them from rejoining **that room** while the cookie persists. This is a **soft ban, not real security** — the user can clear the cookie to return — but it's enough to keep them out briefly. Scope the cookie to the specific `roomId`.
- [ ] **Remember name & icon** — when a user sets their name and icon, persist both in a cookie so they're pre-filled the next time the user enters any room. The values are defaults only — the user can pick a new icon or change their name on join. (Note: a remembered icon may already be taken in the new room; fall back to the selection UI when that happens.)
- [ ] **Egg-shaped vote cards** — each selectable score option in the voting deck is rendered as its value text overlaid on `img/egg.webp`. The value must fit **inside** the egg image — shrink the font as needed so longer values (e.g. `100`, `XXL`, `½`, `∞`) don't overflow. (Distinct from the reveal-time relative sizing, which scales *cast* votes against each other.)
- [ ] **"Waiting on you" nudge** — shown **only to the current user**: when every other **active participant** (connected, non-spectator) has voted and *you* are the only one who hasn't, display `img/waiting.gif` centered as an overlay for **2 seconds**. Preload the GIF hidden at page load for cache warmth. Overlay one of these egg puns in a big, fun font, growing smoothly over the 2-second display: `Get cracking.`, `Egg-specting you...`, `Let's scramble`. Let the full 2 seconds play out even if it overlaps a reveal (e.g. you vote and auto-reveal fires) — no need to suppress or shorten it.
- [ ] **Consensus celebration** — when votes are revealed and **all cast votes are identical**, show `img/celebrate.gif` centered as a modal for **3 seconds**, then dismiss. Preload the GIF hidden at page load so it's already in browser cache and doesn't re-download on first display. Overlay one of these egg puns in a big, fun font: `Egg-cellent!`, `Shell Yeah!`, `Yolk Yeah!`, `Shell-ebrate!`, `Egg-citing!`. The overlay text starts moderately small and **grows smoothly** over the 3-second display. (Consensus is judged among participants who actually voted; non-voters are ignored — consistent with the scoring rules. Requires **2 or more** voters: a single voter never counts as consensus. Non-voters don't block it — show the celebration as long as ≥2 people voted and all their votes match.)
- [ ] **Spread alert** — when votes are revealed and the cast votes are **more than one deck position apart** (e.g. a `3` and an `8` in Fibonacci are two steps apart → trigger; adjacent values like `3` and `5` do not), show `img/spread.gif` centered as a modal for **1 second**, then dismiss. Measure spread by **index distance in the deck** (not numeric difference), so it works for non-numeric scales too. Preload the GIF hidden at page load for cache warmth. Overlay one of these puns in a big, fun font: `Eggsasperating…`, `Oh shell no…`, `Oh yolk!`, `Eggads!`. The overlay text **grows smoothly** over the 1-second display. Like consensus, judge only among real votes from participants who voted — exclude the special values `0`/`∞`/`?` from the spread calc (consistent with scoring), and it needs ≥2 real votes. Consensus and spread are mutually exclusive (identical votes have zero spread).
- [ ] **Expired-room page** — when a user visits a room URL whose node has `status: "expired"` (left as a tombstone by the cleanup job), don't render the room. Instead show a page with `img/eggspired.webp`, a message that the room has expired, and a link back to the home page.
- [ ] **Light/dark mode** — a sun/moon toggle switches between light and dark themes, applying the new styles **immediately** (no reload). Purely client-side and per-user — persist the choice (cookie/localStorage, consistent with other client prefs) so it survives reloads; default to the OS preference (`prefers-color-scheme`) on first visit. Not stored in RTDB.
- [ ] **Random logo** — on page load, pick a random integer 1–6 and display `img/logo/logo-{n}.webp` as the app logo. The `img/logo/` directory holds six 600×600 WebP logo variants named `logo-1.webp` … `logo-6.webp`, so the filename is built directly from the number (no manifest needed, unlike player icons).
- [ ] **Auth-enforced write security & cleanup** — anonymous-auth identity gates writes (users can only write their own participant info and votes; host-only fields gated to the host), plus automatic cleanup of unused anonymous users and old rooms. See **Firebase setup & security** for rules and config.
- [ ] **Story name per round** — on room creation, and whenever the host starts a new round *without a queued story waiting* (see Story queue), prompt the host for a story name (what's being estimated). Store it as the round's `title`. Display the current round's story name as a **subtitle beneath the room name** (which is the page title). Each round in the history keeps its own story name. The bookmarkable preset link still prompts for a story name (it only skips the *scale* questions, not this one).
- [ ] **Reset votes** — a host-only "Reset Votes" button clears every participant's vote in the **current** round without advancing to a new round or archiving anything. The same round stays current; if it had been revealed, it returns to the `voting` state (status → `voting`, clear `overrideScore`) so the team can re-vote. Use after discussion when the team wants a fresh vote on the same story.
- [ ] **Auto-reveal toggle** — a room-level setting (`meta.autoReveal`, host-only, **defaults to on**) controlling whether votes auto-reveal once everyone has voted. When off, votes only reveal via the "Show Votes" action (host immediate / non-host request). See the reveal-trigger logic in Vote reveal & scoring.
- [ ] **Story queue** — the host has a place to **enqueue** upcoming stories by name; each enqueued story is added as a new round with `status: "queued"`, ordered after any existing queued rounds. When the host clicks **Next Round**: if one or more queued rounds exist, advance to the **oldest queued** one (set it current, `status → "voting"`); otherwise prompt the host for a new story name and create a fresh round. Enqueued rounds inherit the room-level deck (`meta.deck`) — only a title is needed per story. The queue is **visible to the host only**. Deliberately out of scope: no reordering or removing of queued stories, and no bulk/paste enqueue (one at a time).
- [ ] **Next Round (multi-round with history)** — the host can start a fresh round of voting via a **"Next Round"** button (which advances to the next queued story, or prompts for a new name — see Story queue). Previous rounds are **preserved** and remain viewable by the host and all users so they can revisit past scores, but archived rounds are **read-only** — no voting or vote edits on them. Voting/editing applies only to the current round. **Only the host can start a new round** — no other user can, with **no fallback**: if the host disconnects or leaves, nobody else can advance, and the group must create a brand-new room and re-send invitations.
<!-- Add features here. -->

#### Vote reveal & scoring

**Reveal trigger.** Votes become visible when someone clicks **"Show Votes"**, or — **when `meta.autoReveal` is on (the default)** — automatically once every **active participant** (connected, non-spectator — see Architecture) has voted. With auto-reveal off, only the explicit "Show Votes" action reveals. On reveal, the current round's `status` flips to `revealed` and all votes for that round are shown to everyone.

**Anyone can reveal, with a host veto:**
- If the **host** clicks "Show Votes", reveal happens immediately.
- If a **non-host** clicks it, it becomes a *request*: the host sees a message — `User {name} has requested to reveal scores. [Cancel]`. If the host does **not** cancel within **3 seconds**, the reveal proceeds. If the host **cancels** within that window, the reveal is aborted and the requester sees: `The host has cancelled your reveal request`.

Implementation note (serverless): model the request as state in RTDB (e.g. `meta.revealRequest: { byUid, byName, requestedAt }`) plus a cancel flag the host can set. The **requester's client owns the 3-second timer** — it starts the moment they click and flips `status` to `revealed` when it elapses, unless it has observed a cancel flag from the host in the meantime. The host's prompt should appear as soon as the request lands.

This is intentionally **fail-open**: it's not a security control, and the worst case is scores shown slightly early. So if the host has lost their connection, is lagging, or simply isn't present, the cancel won't arrive in time and the reveal proceeds — that's acceptable, no special handling needed.

**Numeric mapping (so scoring works for any scale).**
- `½` is stored/displayed as the glyph but is converted to `0.5` for all math.
- Non-numeric scales are mapped ordinally onto the Fibonacci sequence by position. e.g. T-shirt `XS, S, M, L, XL, XXL` ≡ `1, 2, 3, 5, 8, 13`. So any N-value non-numeric scale uses the first N Fibonacci numbers, in order, for calculation; results map back to the original labels for display.

**Scores shown on reveal.**
1. **Mean** — the ordinary arithmetic mean of the (mapped) numeric votes.
1. **Median** — the median of the same (mapped) numeric votes, displayed next to the mean. (With an even number of votes, use the average of the two middle values.)
2. **Recommended score** — the deck value **closest to the mean**. If the mean falls exactly halfway between two deck values, **pick the higher** one (e.g. votes of `3` and `13` → mean `8` → recommended `8`). For non-numeric scales, compute on the mapped numbers, then display the corresponding label.

**Non-voters.** If votes are revealed before everyone has voted (e.g. via "Show Votes"), participants who didn't vote are **excluded from the calculation entirely** — they don't count toward the mean or recommended score and aren't treated as a value.

**Host override (final score).** Next to the displayed recommended score, the **host only** sees an option to override it. Choosing it prompts the host to pick a **final score** — limited to the room's **deck values** (not a free-form entry) — stored separately as the round's `overrideScore` — it does **not** replace or alter the computed recommended score; both coexist. Once set, the override is shown to everyone alongside (clearly distinguished from) the recommendation. Use it for the case where the team discusses and commits to a value different from the calculated suggestion.

**Special values (`0`, `∞`, `?`).** All three are **excluded from the mean and recommended-score math** — only real scale values are considered. `∞` and `?` aren't numbers; `0` is deliberately treated as an exception too (a `0` vote does **not** pull the mean down). If *any* participant picked `0`, `∞`, or `?`, render those votes as **extra-large** text with a **very noticeable shimmer** animation so it's obvious someone chose them.

**Relative sizing for ordinary votes.** Size each ordinary numeric vote's display relative to the other ordinary votes — smaller values smaller, larger values larger. Cap at **3 distinct sizes** (small / medium / large), or **4** counting the extra-large special-value size. With more than 3 distinct values present, bucket them into those 3 size tiers by rank. The difference should be clearly noticeable but not extreme. Example: votes `3, 5, 8` → `3` small, `5` medium, `8` large.

#### Responsive participant layout

The UI must work on all devices. The participant display adapts to **screen size** and **participant count**.

**Medium+ screens (desktop browsers)** — show up to **25** participants fully, each with icon, name, and vote:

| Participants | Layout |
|---|---|
| 1–9 | Circular "poker table" arrangement |
| 10–16 | 4×4 grid |
| 17–25 | Up to 5×5 grid |
| 26+ | **No icons** — a plain list of names + scores in rows and columns |

Within those layouts:
- Icons display **no larger than their native 300×300**, and shrink as needed to fit.
- Names are capped at **20 characters**, truncated with an ellipsis (`…`) if longer.
- Shrink elements as necessary so everyone fits on screen.

**Results placement (desktop):**
- **Poker-table layout (1–9):** results render in the **middle** of the table.
- **10+ participants:** results render at the **top** of the screen, with participants below.

**Mobile** — always render **one participant per row** with icon / name / vote as columns; the list scrolls vertically to reach all voters. Results are **always pinned at the top** in a **sticky** section.

#### Pointing-scale selection

On room creation the host chooses one of these preset scales:

| Scale | Values |
|---|---|
| Fibonacci (Classic) | `1, 2, 3, 5, 8, 13, 21` |
| Modified Fibonacci | `½, 1, 2, 3, 5, 8, 13, 20, 40, 100` |
| Powers of 2 | `1, 2, 4, 8, 16, 32, 64` |
| Linear Scale | `1, 2, 3, 4, 5, 6, 7, 8, 9, 10` |
| T-Shirt Sizes | `XS, S, M, L, XL, XXL` |
| Custom | User-entered, comma-delimited values |

Three independent toggles append special cards to the chosen scale. **All default to off:**
- **Include zero** → adds `0`
- **Include unknown** → adds `?`
- **Include infinity** → adds `∞`

Card ordering when specials are included: `0` (if on) comes **before** the scale values; after the scale values come `∞` then `?` (in that order). Example with all three on for Fibonacci: `0, 1, 2, 3, 5, 8, 13, 21, ∞, ?`.

**Bookmarkable preset link.** After the host configures a scale, surface a link that re-creates this exact configuration, and encourage saving it as a bookmark. Opening that link **immediately creates a new room with the saved scale, skipping the selection prompts entirely.**

Query-string format:
```
?scale=x,y,z&zero=1&unknown=0&infinity=1
```
- `scale` — comma-delimited deck values (the chosen preset's values, or the custom values).
- `zero` / `unknown` / `infinity` — `1` = include, `0` = omit. Absent param is treated as `0` (off).

When this query string is present on the create/landing route, bypass the scale picker and create the room directly from these parameters. The host is **still prompted for a story name** (see Story name per round) — only the scale-selection questions are skipped.

## Open decisions (resolve as you implement)

- [ ] Are rooms ephemeral, or should they (and estimation history) persist?
- [ ] Exact RTDB Security Rules for vote privacy (see Architecture note 1).
