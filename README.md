# NetSync

A room-based cross-device drop zone. Open a room, share the 6-character code (or the link), and anything anyone pastes or drags in — text, code snippets, images, files — appears live on every device in that room. No accounts, no installs.

- **Live sync:** Firestore `onSnapshot` — every device sees new items within a fraction of a second.
<<<<<<< HEAD
- **Files & images:** stored in Firebase Storage, linked from the Firestore item doc.
- **Auto-cleanup:** every item is tagged with a 24h `expiresAt`; wire up a TTL policy (below) and Firestore deletes them for you.
- **No framework, no bundler:** plain HTML/CSS/JS with ES module imports. The only "build" step is a small script that writes your Firebase config from environment variables so it never ends up committed to git.
=======
- **Files & images:** stored in **Supabase Storage**, linked from the Firestore item doc. (Firebase Cloud Storage now requires its paid Blaze plan even for free-tier usage — see "Why this split" below — so file storage lives on Supabase instead, which has a genuinely free, no-card tier.)
- **Auto-cleanup:** every item is tagged with a 24h `expiresAt`; wire up a TTL policy (below) and Firestore deletes them for you.
- **No framework, no bundler:** plain HTML/CSS/JS with ES module imports. The only "build" step is a small script that writes your config files from environment variables so no keys end up committed to git.

This app uses **two** free backend services:

| Service | Used for | Plan needed |
|---|---|---|
| Firebase | Firestore (real-time sync) + Anonymous Auth | Spark (free), no card |
| Supabase | Storage (files & images) | Free, no card |
>>>>>>> master

## 1. Create the Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/) → **Add project**.
2. Inside the project, click the **web (`</>`)** icon to register a web app. Skip Firebase Hosting for now if you want.
3. Copy the `firebaseConfig` object it shows you.

<<<<<<< HEAD
## 2. Turn on the three pieces this app uses

- **Authentication** → Sign-in method → enable **Anonymous**. (The app signs each visitor in anonymously so Firestore/Storage rules can require `auth != null` instead of being wide open to the internet.)
- **Firestore Database** → Create database → start in **production mode** (any region).
- **Storage** → Get started (production mode).

## 3. Configure it — without committing your keys to git

`js/firebase-config.js` (the file the app imports) is **gitignored**. It's generated automatically by `scripts/generate-firebase-config.js` from environment variables, so your real project config never lands in your repo's history.

> **Note on what this actually protects:** a Firebase web config (`apiKey`, `projectId`, etc.) is not a secret the way a server API key is — it's meant to be sent to the browser, and Google's own docs say as much. The thing that actually protects your data is the Firestore/Storage **security rules** you publish in step 4. Keeping the config out of git here is still good practice (no accidental leaks across forks/environments, easy to rotate, one repo works for multiple projects), just don't mistake it for the security boundary.

**On Netlify** (recommended path — see the deploy section below): set these under **Site settings → Environment variables**, and Netlify runs the generator automatically on every deploy.
=======
## 2. Turn on Firestore + Anonymous Auth

- **Authentication** → Sign-in method → enable **Anonymous**. (The app signs each visitor in anonymously so Firestore rules can require `auth != null` instead of being wide open to the internet.)
- **Firestore Database** → Create database → start in **production mode** (any region).

You do **not** need to touch Firebase's Storage section at all — that's Supabase's job now.

## 3. Create the Supabase project + bucket

1. Go to [supabase.com](https://supabase.com/) → **New project** (free tier, no card).
2. Once it's provisioned: **Storage** → **New bucket** → name it exactly `netsync-files` → toggle **Public bucket** on → Create.
3. **Project Settings → Data API** (sometimes labeled "API") → copy the **Project URL** and the **anon / public** key. (Not the `service_role` key — that one's secret and shouldn't go in a browser app.)

## 4. Configure it — without committing your keys to git

`js/firebase-config.js` and `js/supabase-config.js` (the files the app imports) are **gitignored**. Both are generated automatically by `scripts/generate-config.js` from environment variables, so your real project keys never land in your repo's history.

> **Note on what this actually protects:** a Firebase web config and a Supabase anon key aren't secrets the way a server API key is — both are meant to be sent to the browser, and both vendors say as much in their own docs. What actually protects your data is the Firestore rules and Supabase storage policies you publish in step 5. Keeping the config out of git is still good practice (no accidental leaks across forks/environments, easy to rotate, one repo works for multiple projects) — just don't mistake it for the security boundary.

**On Netlify** (recommended — see the deploy section below): set these under **Site settings → Environment variables**, and Netlify runs the generator automatically on every deploy.
>>>>>>> master

```
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
<<<<<<< HEAD
=======
SUPABASE_URL
SUPABASE_ANON_KEY
>>>>>>> master
```

**For local dev**, pick either:

- Copy `.env.example` to `.env`, fill in the values, then run:
  ```bash
<<<<<<< HEAD
  node scripts/generate-firebase-config.js
  ```
- Or skip the script entirely: copy `js/firebase-config.example.js` to `js/firebase-config.js` and fill in values by hand, exactly like editing any other file.

Either way, `.env` and `js/firebase-config.js` stay out of git — only the `.example` versions are committed.

## 4. Publish the security rules

In the Firebase console:

- **Firestore → Rules** → paste in the contents of `firestore.rules` → Publish.
- **Storage → Rules** → paste in the contents of `storage.rules` → Publish.

These rules mean: *anyone who is signed in anonymously and knows a room's code can read, post to, and delete items in that room.* The room code is the only access control — treat it like a shared link, and don't use this for sensitive data. If you want it locked down further (e.g. only your team can create rooms at all), that's a rule change away.

## 5. (Optional) Auto-delete items after 24 hours
=======
  node scripts/generate-config.js
  ```
- Or skip the script entirely: copy `js/firebase-config.example.js` → `js/firebase-config.js` and `js/supabase-config.example.js` → `js/supabase-config.js`, filling in values by hand.

Either way, `.env`, `js/firebase-config.js`, and `js/supabase-config.js` stay out of git — only the `.example` versions are committed.

## 5. Publish the security rules

**Firestore** — Firebase console → **Firestore Database → Rules** → paste in the contents of `firestore.rules` → Publish.

**Supabase storage policies** — Supabase dashboard → **SQL Editor → New query** → paste in the contents of `supabase-storage-policies.sql` → Run. (This is the Supabase equivalent of a rules file — Postgres Row Level Security policies scoped to the `netsync-files` bucket.)

Both amount to the same access model: *anyone who knows a room's code can read, post to, and delete items in that room.* The room code is the only access control — treat it like a shared link, and don't use this for sensitive data.

## 6. (Optional) Auto-delete items after 24 hours
>>>>>>> master

Every item already carries an `expiresAt` timestamp. To make Firestore actually delete them:

**Firestore → Indexes → TTL policies** → Create policy → collection group `items` → field `expiresAt`. Firestore handles the rest in the background (usually within 24h of expiry, no Cloud Function needed).

<<<<<<< HEAD
## 6. Run it locally

Make sure `js/firebase-config.js` exists first (step 3 — either generated from `.env`, or hand-copied from the example).
=======
Files in the Supabase bucket won't auto-delete alongside the Firestore doc unless you delete them from the app UI (the trash icon on each item does this already) — Supabase doesn't have an equivalent TTL feature as of writing, so stale files just sit in the bucket until you clear them out manually or write a small scheduled job if that starts to matter.

## 7. Run it locally

Make sure both `js/firebase-config.js` and `js/supabase-config.js` exist first (step 4).
>>>>>>> master

Because the app uses ES module `import`s, it needs to be served over `http(s)`, not opened as a `file://` URL. Any static server works:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:PORT`.

<<<<<<< HEAD
## 7. Deploy to Netlify

1. Push this project to a GitHub/GitLab/Bitbucket repo (`js/firebase-config.js` and `.env` will be skipped automatically thanks to `.gitignore`).
2. In Netlify: **Add new site → Import an existing project**, pick the repo. `netlify.toml` already tells it the build command (`node scripts/generate-firebase-config.js`) and publish directory (`.`) — no need to set those manually.
3. Before the first deploy, go to **Site settings → Environment variables** and add the six `FIREBASE_*` values from step 3.
4. Deploy. Netlify runs the generator as part of the build, which writes `js/firebase-config.js` fresh on Netlify's own servers — it's never in your repo.

Prefer the CLI or a drag-and-drop deploy instead of Git? Same idea: run `node scripts/generate-firebase-config.js` locally with a `.env` file to produce `js/firebase-config.js`, then `netlify deploy --prod` (CLI) or drag the folder into the Netlify dashboard — either way the generated file just needs to exist on disk before you deploy.
=======
## 8. Deploy to Netlify

1. Push this project to a GitHub/GitLab/Bitbucket repo (the generated config files and `.env` are skipped automatically thanks to `.gitignore`).
2. In Netlify: **Add new site → Import an existing project**, pick the repo. `netlify.toml` already sets the build command (`node scripts/generate-config.js`) and publish directory (`.`) — no need to set those manually.
3. Before the first deploy, go to **Site settings → Environment variables** and add all eight values from step 4 (six `FIREBASE_*` + two `SUPABASE_*`).
4. Deploy. Netlify runs the generator as part of the build, writing both config files fresh on Netlify's own servers — neither is ever in your repo.

Prefer the CLI or a drag-and-drop deploy instead of Git? Same idea: run `node scripts/generate-config.js` locally with a `.env` file to produce both config files, then `netlify deploy --prod` (CLI) or drag the folder into the Netlify dashboard — either way the generated files just need to exist on disk before you deploy.
>>>>>>> master

### Alternative: Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # pick this same project, public dir = "." , single-page app = No
<<<<<<< HEAD
node scripts/generate-firebase-config.js   # make sure the config file exists first
firebase deploy
```

## Why Firestore + Storage for this

- **Firestore's realtime listeners** (`onSnapshot`) are exactly the "push new item to every open screen instantly" behavior this app needs, with no polling and no server code to write.
- **Storage** handles large binary uploads (images/files) with resumable uploads and progress events out of the box, which Firestore alone isn't built for (documents cap out around 1MB).
- **Anonymous Auth** gives just enough identity to write real security rules, without forcing anyone to create an account to drop a file into a room.
- The free "Spark" tier covers casual/small-team use comfortably, and it scales up (Blaze) without a rewrite if a room gets busy.

If you outgrow this shape — e.g. you want rooms to expire, be password-protected beyond the code, or support presence ("who's online right now") — Firestore also supports that (a `presence` subcollection + `onDisconnect`-style heartbeat, or Realtime Database specifically for presence, which is a bit cheaper/faster for that one job than Firestore).
=======
node scripts/generate-config.js   # make sure both config files exist first
firebase deploy
```

## Why this split (Firebase + Supabase)

- **Firestore's realtime listeners** (`onSnapshot`) are exactly the "push new item to every open screen instantly" behavior this app needs, with no polling and no server code to write — still the best fit here, and unaffected by any of Firebase's storage pricing changes.
- **Anonymous Auth** gives just enough identity to write real Firestore security rules, without forcing anyone to create an account to drop a file into a room.
- **Firebase Cloud Storage changed in Feb 2026**: it now requires the pay-as-you-go Blaze plan (a linked credit card) even to provision a new bucket on the free tier, let alone use one. That's a real, permanent platform change, not a setting to find a way around.
- **Supabase Storage** is the replacement for just that one piece: a free, no-card tier (1GB storage), an S3-compatible API, and a browser client that's arguably simpler to use than Firebase's — uploads are a single `await`, no event-listener boilerplate.
- Firestore/Auth stay on Firebase because they were never affected by the pricing change and there's no reason to move them.

If you'd rather run everything on one vendor: moving Firestore + Auth to Supabase too (Postgres + Realtime + Supabase Auth) is a bigger rewrite than this one, but is possible if you want a single-provider setup later. Conversely, if you're fine putting a card on file, upgrading to Firebase Blaze and reverting Storage to Firebase is the smaller change — its free quota (1GiB storage, 10GB/month download) would comfortably cover casual use, you'd just be back to needing billing set up.
>>>>>>> master

## Project structure

```
netsync/
├── index.html
├── css/style.css
├── js/
<<<<<<< HEAD
│   ├── app.js                      ← all app logic
│   ├── firebase-config.example.js  ← committed template
│   └── firebase-config.js          ← gitignored, generated (or hand-copied) — not in the repo
├── scripts/
│   └── generate-firebase-config.js ← writes firebase-config.js from env vars
├── .env.example                    ← committed template for local dev
├── .env                            ← gitignored, your local values
├── .gitignore
├── netlify.toml                    ← Netlify build command + publish dir
├── firestore.rules
├── storage.rules
=======
│   ├── app.js                       ← all app logic
│   ├── firebase-config.example.js   ← committed template
│   ├── firebase-config.js           ← gitignored, generated (or hand-copied)
│   ├── supabase-config.example.js   ← committed template
│   └── supabase-config.js           ← gitignored, generated (or hand-copied)
├── scripts/
│   └── generate-config.js           ← writes both config files from env vars
├── .env.example                     ← committed template for local dev
├── .env                             ← gitignored, your local values
├── .gitignore
├── netlify.toml                     ← Netlify build command + publish dir
├── firestore.rules
├── supabase-storage-policies.sql
>>>>>>> master
└── README.md
```
