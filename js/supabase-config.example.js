// TEMPLATE ONLY — this file is committed to git and contains no real values.
//
// js/supabase-config.js (the file the app actually imports) is generated
// automatically from environment variables by scripts/generate-config.js
// and is gitignored, so your real project keys never get committed.
//
// For quick local testing without the generator script, you can copy this
// file to js/supabase-config.js and fill in real values by hand instead —
// see README.md for both options.
//
// The anonKey here is Supabase's public key — either the legacy "anon" key
// (a long JWT string) or the newer "publishable" key (starts sb_publishable_)
// both work identically here. Supabase is retiring the legacy anon/service_role
// keys by the end of 2026 in favor of publishable/secret, so grab the
// publishable key if your dashboard offers one. Either way: this is the
// PUBLIC key, safe to expose in the browser by design — never use the
// secret/service_role key here.

export const supabaseConfig = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY"
};
