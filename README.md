# NetSync

A room-based cross-device drop zone. Open a room, share the 6-character code (or the link), and anything anyone pastes or drags in — text, code snippets, images, files — appears live on every device in that room. No accounts, no installs.

- **Live sync:** Firestore `onSnapshot` — every device sees new items within a fraction of a second.
- **Files & images:** stored in Firebase Storage, linked from the Firestore item doc.
- **Auto-cleanup:** every item is tagged with a 24h `expiresAt`; wire up a TTL policy (below) and Firestore deletes them for you.
- **No framework, no bundler:** plain HTML/CSS/JS with ES module imports. The only "build" step is a small script that writes your Firebase config from environment variables so it never ends up committed to git.

## 1. Create the Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/) → **Add project**.
2. Inside the project, click the **web (`</>`)** icon to register a web app. Skip Firebase Hosting for now if you want.
3. Copy the `firebaseConfig` object it shows you.

## 2. Turn on the three pieces this app uses

- **Authentication** → Sign-in method → enable **Anonymous**. (The app signs each visitor in anonymously so Firestore/Storage rules can require `auth != null` instead of being wide open to the internet.)
- **Firestore Database** → Create database → start in **production mode** (any region).
- **Storage** → Get started (production mode).

## 3. Configure it — without committing your keys to git

`js/firebase-config.js` (the file the app imports) is **gitignored**. It's generated automatically by `scripts/generate-firebase-config.js` from environment variables, so your real project config never lands in your repo's history.

> **Note on what this actually protects:** a Firebase web config (`apiKey`, `projectId`, etc.) is not a secret the way a server API key is — it's meant to be sent to the browser, and Google's own docs say as much. The thing that actually protects your data is the Firestore/Storage **security rules** you publish in step 4. Keeping the config out of git here is still good practice (no accidental leaks across forks/environments, easy to rotate, one repo works for multiple projects), just don't mistake it for the security boundary.

**On Netlify** (recommended path — see the deploy section below): set these under **Site settings → Environment variables**, and Netlify runs the generator automatically on every deploy.

```
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

**For local dev**, pick either:

- Copy `.env.example` to `.env`, fill in the values, then run:
  ```bash
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

Every item already carries an `expiresAt` timestamp. To make Firestore actually delete them:

**Firestore → Indexes → TTL policies** → Create policy → collection group `items` → field `expiresAt`. Firestore handles the rest in the background (usually within 24h of expiry, no Cloud Function needed).

## 6. Run it locally

Make sure `js/firebase-config.js` exists first (step 3 — either generated from `.env`, or hand-copied from the example).

Because the app uses ES module `import`s, it needs to be served over `http(s)`, not opened as a `file://` URL. Any static server works:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:PORT`.

## 7. Deploy to Netlify

1. Push this project to a GitHub/GitLab/Bitbucket repo (`js/firebase-config.js` and `.env` will be skipped automatically thanks to `.gitignore`).
2. In Netlify: **Add new site → Import an existing project**, pick the repo. `netlify.toml` already tells it the build command (`node scripts/generate-firebase-config.js`) and publish directory (`.`) — no need to set those manually.
3. Before the first deploy, go to **Site settings → Environment variables** and add the six `FIREBASE_*` values from step 3.
4. Deploy. Netlify runs the generator as part of the build, which writes `js/firebase-config.js` fresh on Netlify's own servers — it's never in your repo.

Prefer the CLI or a drag-and-drop deploy instead of Git? Same idea: run `node scripts/generate-firebase-config.js` locally with a `.env` file to produce `js/firebase-config.js`, then `netlify deploy --prod` (CLI) or drag the folder into the Netlify dashboard — either way the generated file just needs to exist on disk before you deploy.

### Alternative: Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # pick this same project, public dir = "." , single-page app = No
node scripts/generate-firebase-config.js   # make sure the config file exists first
firebase deploy
```

## Why Firestore + Storage for this

- **Firestore's realtime listeners** (`onSnapshot`) are exactly the "push new item to every open screen instantly" behavior this app needs, with no polling and no server code to write.
- **Storage** handles large binary uploads (images/files) with resumable uploads and progress events out of the box, which Firestore alone isn't built for (documents cap out around 1MB).
- **Anonymous Auth** gives just enough identity to write real security rules, without forcing anyone to create an account to drop a file into a room.
- The free "Spark" tier covers casual/small-team use comfortably, and it scales up (Blaze) without a rewrite if a room gets busy.

If you outgrow this shape — e.g. you want rooms to expire, be password-protected beyond the code, or support presence ("who's online right now") — Firestore also supports that (a `presence` subcollection + `onDisconnect`-style heartbeat, or Realtime Database specifically for presence, which is a bit cheaper/faster for that one job than Firestore).

## Project structure

```
netsync/
├── index.html
├── css/style.css
├── js/
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
└── README.md
```
