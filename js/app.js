import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, getDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp, Timestamp, setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// Supabase is used for Storage only (files & images) — Firebase Cloud Storage
// now requires the paid Blaze plan even for free-tier usage, while Supabase
// Storage has a genuinely free, no-card tier. Firestore + Auth stay on
// Firebase, unaffected by that change.
//
// jsdelivr's `+esm` build is Supabase's own documented no-bundler import
// path. If you ever hit "Cannot read properties of null (reading
// 'AuthClient')" in the console, switch this to:
//   https://esm.sh/@supabase/supabase-js@2
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import { firebaseConfig } from "./firebase-config.js";
import { supabaseConfig } from "./supabase-config.js";

/* ===================== Firebase + Supabase init ===================== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
const SUPABASE_BUCKET = "netsync-files";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const ROOM_TTL_HOURS = 24;
const MAX_FEED_ITEMS = 150;

let uid = null;
let authReady = false;
let currentRoomId = null;
let unsubscribeFeed = null;

/* ===================== DOM refs ===================== */
const $ = (sel) => document.querySelector(sel);

const landing = $("#landing");
const roomScreen = $("#roomScreen");
const createRoomBtn = $("#createRoomBtn");
const joinRoomForm = $("#joinRoomForm");
const joinRoomInput = $("#joinRoomInput");

const roomCodeDisplay = $("#roomCodeDisplay");
const pulseDot = $("#pulseDot");
const copyCodeBtn = $("#copyCodeBtn");
const copyLinkBtn = $("#copyLinkBtn");
const leaveRoomBtn = $("#leaveRoomBtn");

const composer = $("#composer");
const composerTabs = document.querySelectorAll(".composer-tab");
const composerText = $("#composerText");
const languageSelect = $("#languageSelect");
const sendBtn = $("#sendBtn");
const fileInput = $("#fileInput");
const pendingFileName = $("#pendingFileName");
const uploadProgress = $("#uploadProgress");
const uploadProgressBar = $("#uploadProgressBar");

const feedList = $("#feedList");
const emptyState = $("#emptyState");
const itemCount = $("#itemCount");

const dropOverlay = $("#dropOverlay");
const toastRoot = $("#toastRoot");

const lightbox = $("#lightbox");
const lightboxImg = $("#lightboxImg");
const lightboxClose = $("#lightboxClose");

/* ===================== Utilities ===================== */
function toast(message, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " is-error" : "");
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function genRoomCode(len = 6) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

function isValidRoomCode(code) {
  return /^[A-Z2-9]{4,10}$/.test(code);
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB"];
  let val = bytes / 1024, i = 0;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(date) {
  if (!date) return "sending…";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fileExtBadge(name) {
  const ext = (name.split(".").pop() || "file").slice(0, 4).toUpperCase();
  return ext;
}

const FILE_ICON_SVG = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M14 3v5a1 1 0 0 0 1 1h5M6 3h8l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

/* ===================== Screen switching ===================== */
function showLanding() {
  landing.hidden = false;
  roomScreen.hidden = true;
}
function showRoom() {
  landing.hidden = true;
  roomScreen.hidden = false;
}

/* ===================== Room lifecycle ===================== */
// Enters a room's UI directly — no existence check. Only call this once
// you've already confirmed the room exists (joinRoom does that check) or
// you just created it yourself (createRoom does).
function enterRoom(code) {
  code = code.toUpperCase();
  currentRoomId = code;
  roomCodeDisplay.textContent = code;

  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  window.history.replaceState(null, "", url);
  localStorage.setItem("netsync:lastRoom", code);

  showRoom();
  attachFeedListener(code);
}

// Used for manual "Join" codes and ?room= links — anything where we don't
// already know the room is real. Without this check, typing any
// well-formed code (right length/characters) would silently drop you into
// an empty room that looks legitimate, even though nobody ever created it.
async function joinRoom(code) {
  code = code.trim().toUpperCase();
  if (!isValidRoomCode(code)) {
    toast("Room codes are 4–10 letters/numbers.", true);
    return;
  }
  try {
    const snap = await getDoc(doc(db, "rooms", code));
    if (!snap.exists()) {
      toast(`Room ${code} doesn't exist. Check the code, or start a new one.`, true);
      return;
    }
  } catch (e) {
    console.error(e);
    toast("Couldn't check that room. Check your Firebase setup.", true);
    return;
  }
  enterRoom(code);
}

function leaveRoom() {
  if (unsubscribeFeed) { unsubscribeFeed(); unsubscribeFeed = null; }
  currentRoomId = null;
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState(null, "", url);
  feedList.querySelectorAll(".item-card").forEach(n => n.remove());
  emptyState.hidden = false;
  showLanding();
}

async function createRoom() {
  const code = genRoomCode();
  try {
    await setDoc(doc(db, "rooms", code), { createdAt: serverTimestamp() });
  } catch (e) {
    // Now that joinRoom requires this marker doc to exist, a failed write
    // here would create a room nobody else could ever join — so this
    // needs to be fatal, not a warn-and-continue like before.
    console.error("Could not create room:", e);
    toast("Couldn't create the room. Check your Firebase setup.", true);
    return;
  }
  enterRoom(code);
}


/* ===================== Feed rendering ===================== */
function attachFeedListener(roomId) {
  if (unsubscribeFeed) unsubscribeFeed();

  const q = query(
    collection(db, "rooms", roomId, "items"),
    orderBy("createdAt", "desc"),
    limit(MAX_FEED_ITEMS)
  );

  unsubscribeFeed = onSnapshot(q, (snap) => {
    const liveDocs = sweepExpiredItems(snap.docs);
    renderFeed(liveDocs);
    pulseDot.classList.remove("is-pulsing");
    void pulseDot.offsetWidth; // restart animation
    pulseDot.classList.add("is-pulsing");
  }, (err) => {
    console.error(err);
    toast("Lost connection to the room. Check your Firebase setup.", true);
  });
}

// The Firestore TTL policy (if you've set one up) only ever deletes the
// Firestore *document* — it has no reach into Supabase Storage, so a file
// left behind there would never get cleaned up on its own. This runs
// whenever anyone has the room open: any item already past its expiresAt
// gets deleted from both Firestore and Supabase right away, instead of
// waiting on (and only half-trusting) Firestore's background sweep.
//
// Caveat: this only runs while someone is connected to the room. A room
// nobody ever revisits after it expires will still accumulate orphaned
// files in Supabase — Firestore's TTL cleans up its own side regardless of
// visits, but there's no equivalent for Supabase without a scheduled
// server-side job, which is a step beyond this app's zero-backend design.
function sweepExpiredItems(docs) {
  const now = Date.now();
  const live = [];
  for (const d of docs) {
    const data = d.data();
    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : null;
    if (expiresAt && expiresAt.getTime() <= now) {
      deleteDoc(doc(db, "rooms", currentRoomId, "items", d.id)).catch(() => {});
      if (data.filePath) {
        supabase.storage.from(SUPABASE_BUCKET).remove([data.filePath]).catch(() => {});
      }
      continue;
    }
    live.push(d);
  }
  return live;
}

function renderFeed(docs) {
  feedList.querySelectorAll(".item-card").forEach(n => n.remove());
  itemCount.textContent = `${docs.length} item${docs.length === 1 ? "" : "s"}`;
  emptyState.hidden = docs.length > 0;

  for (const d of docs) {
    const item = { id: d.id, ...d.data() };
    feedList.appendChild(buildItemCard(item));
  }
}

function buildItemCard(item) {
  const card = document.createElement("div");
  card.className = "item-card";
  card.dataset.type = item.type;

  const createdAt = item.createdAt?.toDate ? item.createdAt.toDate() : null;

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.innerHTML = `
    <span class="item-tag tag-${item.type}">${item.type}</span>
    <span class="item-time">${timeAgo(createdAt)}</span>
    <span class="item-spacer"></span>
  `;

  if (item.type === "text" || item.type === "snippet") {
    const copyBtn = iconButton(`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="1.5"/></svg>`, () => {
      navigator.clipboard.writeText(item.content || "").then(() => toast("Copied to clipboard"));
    });
    meta.appendChild(copyBtn);
  }
  meta.appendChild(deleteButton(item));
  card.appendChild(meta);

  if (item.type === "text") {
    const p = document.createElement("div");
    p.className = "item-text";
    p.textContent = item.content || "";
    card.appendChild(p);
  } else if (item.type === "snippet") {
    const pre = document.createElement("pre");
    pre.className = "item-code";
    const code = document.createElement("code");
    code.className = item.language ? `language-${item.language}` : "";
    code.textContent = item.content || "";
    pre.appendChild(code);
    card.appendChild(pre);
    if (window.hljs) window.hljs.highlightElement(code);
  } else if (item.type === "image") {
    const wrap = document.createElement("div");
    wrap.className = "item-image";
    const img = document.createElement("img");
    img.src = item.fileUrl;
    img.alt = item.fileName || "shared image";
    img.loading = "lazy";
    img.addEventListener("click", () => openLightbox(item.fileUrl));
    wrap.appendChild(img);
    card.appendChild(wrap);
  } else if (item.type === "file") {
    const wrap = document.createElement("div");
    wrap.className = "item-file";
    wrap.innerHTML = `
      <div class="file-icon">${FILE_ICON_SVG}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(item.fileName || "file")}</div>
        <div class="file-size">${formatBytes(item.fileSize)} · ${fileExtBadge(item.fileName || "file")}</div>
      </div>
    `;
    const a = document.createElement("a");
    a.href = item.fileUrl;
    a.className = "file-download";
    a.textContent = "Download";
    a.target = "_blank";
    a.rel = "noopener";
    wrap.appendChild(a);
    card.appendChild(wrap);
  }

  return card;
}

function iconButton(svg, onClick) {
  const btn = document.createElement("button");
  btn.className = "item-icon-btn";
  btn.innerHTML = svg;
  btn.addEventListener("click", onClick);
  return btn;
}

function deleteButton(item) {
  return iconButton(
    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-7 0v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    async () => {
      try {
        await deleteDoc(doc(db, "rooms", currentRoomId, "items", item.id));
        if (item.filePath) {
          supabase.storage.from(SUPABASE_BUCKET).remove([item.filePath]).catch(() => {});
        }
      } catch (e) {
        toast("Couldn't delete that item.", true);
      }
    }
  );
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ===================== Lightbox ===================== */
function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.hidden = false;
}
lightboxClose.addEventListener("click", () => { lightbox.hidden = true; lightboxImg.src = ""; });
lightbox.addEventListener("click", (e) => { if (e.target === lightbox) { lightbox.hidden = true; lightboxImg.src = ""; } });

/* ===================== Composer: text / snippet ===================== */
let composerMode = "text";

composerTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    composerTabs.forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    composerMode = tab.dataset.mode;
    languageSelect.hidden = composerMode !== "snippet";
    composerText.classList.toggle("is-code", composerMode === "snippet");
    composerText.placeholder = composerMode === "snippet"
      ? "Paste a code snippet…"
      : "Paste or type something to broadcast…";
  });
});

composerText.addEventListener("input", () => {
  sendBtn.disabled = composerText.value.trim().length === 0;
});

composerText.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    sendComposerText();
  }
});

async function sendComposerText() {
  const content = composerText.value.trim();
  if (!content || !currentRoomId) return;
  sendBtn.disabled = true;
  try {
    await addDoc(collection(db, "rooms", currentRoomId, "items"), {
      type: composerMode,
      content,
      language: composerMode === "snippet" ? languageSelect.value : null,
      fileUrl: null, fileName: null, filePath: null, fileSize: null,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + ROOM_TTL_HOURS * 3600 * 1000)),
      createdBy: uid
    });
    composerText.value = "";
  } catch (e) {
    console.error(e);
    toast("Broadcast failed. Check your Firebase setup.", true);
  } finally {
    sendBtn.disabled = composerText.value.trim().length === 0;
  }
}

sendBtn.addEventListener("click", sendComposerText);

/* ===================== File uploads ===================== */
async function uploadFiles(fileList) {
  if (!currentRoomId) return;
  const files = Array.from(fileList);
  for (const file of files) {
    await uploadOneFile(file);
  }
}

async function uploadOneFile(file) {
  if (!currentRoomId) return;
  const isImage = file.type.startsWith("image/");
  const itemRef = doc(collection(db, "rooms", currentRoomId, "items"));
  const itemId = itemRef.id;
  const path = `${currentRoomId}/${itemId}/${file.name}`;

  pendingFileName.textContent = `Uploading ${file.name}…`;
  uploadProgress.hidden = false;
  // Supabase's browser upload() doesn't expose byte-level progress, so this
  // shows a moving indeterminate bar rather than a real percentage.
  uploadProgressBar.classList.add("is-indeterminate");

  try {
    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path);

    await setDoc(itemRef, {
      type: isImage ? "image" : "file",
      content: null, language: null,
      fileUrl: urlData.publicUrl,
      fileName: file.name,
      filePath: path,
      fileSize: file.size,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + ROOM_TTL_HOURS * 3600 * 1000)),
      createdBy: uid
    });
  } catch (err) {
    console.error(err);
    toast(`Couldn't upload ${file.name}. Check your Supabase bucket & policies.`, true);
  } finally {
    uploadProgress.hidden = true;
    uploadProgressBar.classList.remove("is-indeterminate");
    pendingFileName.textContent = "";
  }
}

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) uploadFiles(fileInput.files);
  fileInput.value = "";
});

/* Drag & drop across the whole window */
let dragCounter = 0;
window.addEventListener("dragenter", (e) => {
  if (!currentRoomId) return;
  if (!e.dataTransfer?.types?.includes("Files")) return;
  dragCounter++;
  dropOverlay.classList.add("is-active");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", () => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) dropOverlay.classList.remove("is-active");
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove("is-active");
  if (!currentRoomId) return;
  if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
});

/* ===================== Room controls ===================== */
createRoomBtn.addEventListener("click", createRoom);

joinRoomForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = joinRoomInput.value.trim();
  if (code) joinRoom(code);
});

copyCodeBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(currentRoomId).then(() => toast("Room code copied"));
});
copyLinkBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(window.location.href).then(() => toast("Room link copied"));
});
leaveRoomBtn.addEventListener("click", leaveRoom);

/* ===================== Boot ===================== */
function boot() {
  const yearEl = document.getElementById("copyrightYear");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const lastRoom = localStorage.getItem("netsync:lastRoom");
  if (lastRoom) joinRoomInput.value = lastRoom;

  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");
  if (roomFromUrl && isValidRoomCode(roomFromUrl.toUpperCase())) {
    joinRoom(roomFromUrl);
  } else {
    showLanding();
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    authReady = true;
    boot();
  }
});

signInAnonymously(auth).catch((err) => {
  console.error(err);
  toast("Sign-in failed — enable Anonymous auth in your Firebase console.", true);
});