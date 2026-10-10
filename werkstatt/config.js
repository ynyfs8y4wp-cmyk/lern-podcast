// Öffentliche Verbindungsdaten zu deinem Supabase-Projekt (Settings → API).
// Der "anon"-Schlüssel darf öffentlich sein: Row Level Security schützt die Daten.
// Den "service_role"-Schlüssel hier NIEMALS eintragen.
window.HW_CONFIG = {
  supabaseUrl: "https://dukunyhkzqtvczyjmlot.supabase.co",
  supabaseAnonKey: "sb_publishable_3fn9Jb8sb45ajki2R1hhsw_olQ7AoEQ",
  // "passwort": Anmeldung mit E-Mail und Passwort (ohne eigenen Mailversand, gut für die Freunde-Beta)
  // "code": Anmeldecode per E-Mail (braucht eigenen SMTP-Versand in Supabase)
  anmeldung: "passwort",
  oauth: false,   // true, sobald "Mit Apple/Google anmelden" in Supabase eingerichtet ist
};
