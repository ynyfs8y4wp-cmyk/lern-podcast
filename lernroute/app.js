/* Lernroute – Web-App
 * Vier Bereiche: Heute (Neues, Weiterhören, Schnellaktionen) · Lernrouten (Folgen, Themen, Fragen je Route) ·
 * Radar (eigene Wochen-Zusammenfassungen) · Ich (Profil, Sprache, Podcast-App, Konto).
 * Daten liegen in Supabase; Row Level Security sorgt dafür, dass jede Person nur ihre eigene Bibliothek sieht.
 * Texte: texte.json (deutscher Text → Englisch, Spanisch, Portugiesisch), erzeugt von scripts/texte/bauen.py.
 */
"use strict";
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const merk = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }, weg(k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } } };

const CFG = window.LR_CONFIG || {};
if (!window.supabase || !CFG.supabaseUrl || CFG.supabaseUrl.includes("DEIN-PROJEKT")) {
  document.body.textContent = "config.js: Supabase-Adresse und Publishable Key eintragen.";
  throw new Error("config.js fehlt");
}
const SB_URL = CFG.supabaseUrl.replace(/^(https:\/\/[^/]+).*$/, "$1");
const sb = window.supabase.createClient(SB_URL, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

/* ---------- Sprache ---------- */
const LANGS = ["de", "en", "es", "pt"], LIDX = { en: 0, es: 1, pt: 2 };
const LNAME = { de: "Deutsch", en: "English", es: "Español", pt: "Português" };
const LOC = { de: "de-DE", en: "en-GB", es: "es-ES", pt: "pt-PT" };
let TX = {}, uiLang = LANGS.includes(merk.get("lr-lang")) ? merk.get("lr-lang") : "de";
function T(s) { if (uiLang === "de" || s == null) return s; const r = TX[s]; return r ? r[LIDX[uiLang]] || s : s; }
const STATIC = [];
function sammleStatisch() {
  [document.querySelector(".wrap"), $("tabbar"), $("langsheet"), $("fragesheet")].forEach((root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (n.parentElement && n.parentElement.closest("#view")) continue; const k = n.nodeValue.trim(); if (k && TX[k]) STATIC.push({ n, k, raw: n.nodeValue }); }
    root.querySelectorAll("[placeholder],[aria-label]").forEach((e) => ["placeholder", "aria-label"].forEach((a) => { const v = e.getAttribute(a); if (v && TX[v]) STATIC.push({ e, a, k: v }); }));
  });
}
function statisch() { STATIC.forEach((x) => { const v = T(x.k); if (x.n) x.n.nodeValue = x.raw.replace(x.k, v); else x.e.setAttribute(x.a, v); }); document.documentElement.lang = uiLang; }
const fmt = (d) => (d && !isNaN(new Date(d)) ? new Date(d).toLocaleDateString(LOC[uiLang], { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const kurzDatum = (d) => (d && !isNaN(new Date(d)) ? new Date(d).toLocaleDateString(LOC[uiLang], { day: "numeric", month: "short" }) : "");
const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const TAG_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
function isoWoche(d = new Date()) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const tag = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - tag); const j = t.getUTCFullYear(); return [j, Math.ceil(((t - Date.UTC(j, 0, 1)) / 864e5 + 1) / 7)]; }

/* ---------- Symbole (SF-Symbols-ähnlich, als SVG) ---------- */
const ICONS = {
  kopfhoerer: '<path d="M4 14a8 8 0 0 1 16 0"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.6"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6"/>',
  kompass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  radar: '<path d="M12 12 19 5"/><path d="M20.5 12A8.5 8.5 0 1 1 12 3.5"/><path d="M16 12a4 4 0 1 1-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  frage: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8v.1"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  globus: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.6 5.6 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.6-3.6-9S9.5 5.7 12 3z"/>',
  kalender: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  podcast: '<circle cx="12" cy="10" r="2.5"/><path d="M8.2 14.2a5.5 5.5 0 1 1 7.6 0M5.4 17a9.5 9.5 0 1 1 13.2 0M12 13.5V21"/>',
  person: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"/>',
  schild: '<path d="M12 3 5 6v5.5c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V6z"/>',
  tueroffen: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  papierkorb: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  stift: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  buch: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20"/>',
  zahnrad: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.6 1.5M17.2 16l2.6 1.5M4.2 17.5 6.8 16M17.2 8l2.6-1.5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  kreis: '<circle cx="12" cy="12" r="9"/>',
};
function icon(name, farbe, gross, text) {
  const s = el("span", "ic " + (farbe || "blau") + (gross ? " gross" : "")); s.setAttribute("aria-hidden", "true");
  if (text) s.textContent = text;
  else s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + "</svg>";
  return s;
}
const CHEV = () => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "chev"); s.setAttribute("viewBox", "0 0 9 15"); s.setAttribute("aria-hidden", "true"); s.innerHTML = '<path d="M1.5 1.5 7.5 7.5l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'; return s; };

/** Zeile einer gruppierten Liste: {ic, titel, sub, wert, rechts, onClick, href, cls, chev} */
function zeile(o) {
  const z = el(o.href ? "a" : o.onClick ? "button" : "div", "zeile" + (o.ic ? " mit-ic" : "") + (o.cls ? " " + o.cls : ""));
  if (o.href) { z.href = o.href; if (/^https?:/.test(o.href)) { z.target = "_blank"; z.rel = "noopener"; } }
  if (o.onClick) { if (!o.href) z.type = "button"; z.addEventListener("click", o.onClick); }
  if (o.ic) z.appendChild(o.ic);
  const t = el("span", "txt"); t.appendChild(el("strong", null, o.titel)); if (o.sub) t.appendChild(el("span", null, o.sub)); z.appendChild(t);
  if (o.wert != null) z.appendChild(el("span", "wert", o.wert));
  if (o.rechts) z.appendChild(o.rechts);
  if ((o.onClick || o.href) && o.chev !== false && !/link|gefahr/.test(o.cls || "")) z.appendChild(CHEV());
  return z;
}
function liste(zeilen, leerText) { const l = el("div", "liste"); zeilen.filter(Boolean).forEach((z) => l.appendChild(z)); if (!l.children.length && leerText) l.appendChild(el("p", "leer", leerText)); return l; }
function gruppe(titel, inhalt, fuss, rechts) {
  const g = el("section", "gruppe"); if (titel) { const h = el("h2", null, titel); if (rechts) h.appendChild(el("small", null, rechts)); g.appendChild(h); }
  (Array.isArray(inhalt) ? inhalt : [inhalt]).filter(Boolean).forEach((x) => g.appendChild(x)); if (fuss) g.appendChild(el("p", "fuss", fuss)); return g;
}
function kopf(titel, text, ueber) { const k = el("header", "kopf"); if (ueber) k.appendChild(el("span", "ueber", ueber)); k.appendChild(el("h1", null, titel)); if (text) k.appendChild(el("p", null, text)); return k; }
function navZurueck(text, onClick) {
  const n = el("div", "nav"); const b = el("button", "zurueck"); b.type = "button";
  b.innerHTML = '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  b.appendChild(el("span", null, text)); b.onclick = onClick; n.appendChild(b); return n;
}
function knopf(text, cls, onClick) { const b = el("button", "btn " + (cls || "")); b.type = "button"; b.textContent = text; b.onclick = onClick; return b; }
function meldungsFeld() { const m = el("span", "hint"); m.setAttribute("role", "status"); return m; }
function feld(label, input) { const f = el("div", "feld"); const l = el("label", null, label); const id = input.id || "f" + Math.random().toString(36).slice(2, 8); input.id = id; l.htmlFor = id; f.append(l, input); return f; }
function eingabe(typ, wert, max, platzhalter) { const i = el(typ === "textarea" ? "textarea" : "input", "txt"); if (typ !== "textarea") i.type = "text"; i.value = wert || ""; if (max) i.maxLength = max; if (platzhalter) i.placeholder = platzhalter; return i; }
/** Knopf, der beim ersten Tippen um Bestätigung bittet */
function bestaetigen(b, text, aktion) {
  return () => { if (b.dataset.arm !== "1") { b.dataset.arm = "1"; const vorher = b.textContent; b.textContent = text; setTimeout(() => { if (b.dataset.arm === "1") { b.dataset.arm = ""; b.textContent = vorher; } }, 5000); return; } b.dataset.arm = ""; aktion(); };
}

/* ---------- Fehler ---------- */
let gemeldet = 0, nutzer = null;
function fehlerMelden(meldung, ort, stack) {
  if (gemeldet >= 10 || !nutzer) return; gemeldet++;
  sb.rpc("fehler_melden", { p: { quelle: "web", version: window.LR_VERSION || "dev", meldung: String(meldung || "").slice(0, 500), ort: String(ort || "").slice(0, 300), stack: String(stack || "").slice(0, 2000) } }).then(() => {}, () => {});
}
window.addEventListener("error", (e) => fehlerMelden(e.message, (e.filename || "").split("/").pop() + ":" + e.lineno, e.error && e.error.stack));
window.addEventListener("unhandledrejection", (e) => fehlerMelden((e.reason && e.reason.message) || e.reason, "promise", e.reason && e.reason.stack));
const meldung = (e) => T((e && (e.message || e.error_description)) || "Das hat nicht geklappt. Versuch es noch einmal.");
function showErr(m) { $("err").textContent = m || ""; $("err").hidden = !m; }

/* ---------- Zustand ---------- */
let konto = null, routen = [], themen = [], fragen = [], folgen = [], auftraege = [], radare = [], ausgaben = [], kanal = null;
const nav = { tab: "heute", route: null, routeTab: "folgen", radar: null, neu: null };
try { Object.assign(nav, JSON.parse(merk.get("lr-nav") || "{}")); } catch (e) { /* egal */ }
const routeById = (id) => routen.find((r) => r.id === id) || null;
const radarById = (id) => radare.find((r) => r.id === id) || null;
const funktionAn = (k) => !!(konto && Array.isArray(konto.funktionen) && konto.funktionen.includes(k));
const FARBEN = ["indigo", "gruen", "orange", "pink", "teal", "lila", "blau"];
const initialen = (t) => (t || "?").replace(/[^A-Za-zÄÖÜäöü ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
const offen = (a) => ["wartet", "in_arbeit"].includes(a.status);
const feedBasis = () => SB_URL + "/functions/v1/feed/" + konto.feed_token;
const podcastLink = (u) => "podcast://" + u.replace(/^https:\/\//, "");

/* ---------- Ansichten umschalten ---------- */
const GATES = ["v-login", "v-code", "v-einw"];
function gate(id) { GATES.forEach((g) => ($(g).hidden = g !== id)); $("main").hidden = true; $("tabbar").hidden = true; $("reader").hidden = true; }
function gehe(aenderung) {
  Object.assign(nav, aenderung); merk.set("lr-nav", JSON.stringify(nav));
  GATES.forEach((g) => ($(g).hidden = true)); schliesseLeser(true);
  $("main").hidden = false; $("tabbar").hidden = false;
  document.querySelectorAll(".tabbar [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === nav.tab)));
  zeichnen(); window.scrollTo(0, 0);
}
document.querySelectorAll(".tabbar [data-tab]").forEach((b) => (b.onclick = () => gehe({ tab: b.dataset.tab, route: null, radar: null, neu: null })));

/* ---------- Anmeldung, Code, Einwilligung ---------- */
async function anmelden(neu) {
  const email = $("l-mail").value.trim(), password = $("l-pw").value, m = $("login-msg");
  if (!$("l-mail").checkValidity()) { $("l-mail").reportValidity(); return; }
  if (password.length < 10) { m.textContent = T("Das Passwort braucht mindestens 10 Zeichen."); return; }
  $("b-login").disabled = $("b-registrieren").disabled = true; m.textContent = "…";
  const { data, error } = neu ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
  $("b-login").disabled = $("b-registrieren").disabled = false;
  if (error) {
    const t = String(error.message || "");
    m.textContent = /already|registered|exists/i.test(t) ? T("Für diese E-Mail gibt es schon ein Konto. Melde dich an.") : /invalid login|credentials/i.test(t) ? T("E-Mail oder Passwort stimmt nicht.") : meldung(error);
    return;
  }
  m.textContent = neu && data && data.user && !data.session ? T("Fast geschafft: Bestätige deine E-Mail-Adresse über den Link in deinem Postfach.") : "";
}
$("f-login").addEventListener("submit", (e) => { e.preventDefault(); anmelden(false); });
$("b-registrieren").onclick = () => anmelden(true);
document.addEventListener("click", (e) => { if (e.target.closest("[data-abmelden]")) { merk.weg("lr-nav"); sb.auth.signOut(); } });
$("f-code").addEventListener("submit", async (e) => {
  e.preventDefault(); $("code-msg").textContent = "…";
  const { error } = await sb.rpc("einladung_einloesen", { p_code: $("c-code").value });
  if (error) { $("code-msg").textContent = meldung(error); return; }
  $("code-msg").textContent = ""; start();
});
$("f-einw").addEventListener("submit", async (e) => {
  e.preventDefault(); $("einw-msg").textContent = "…";
  const { error } = await sb.rpc("einwilligen");
  if (error) { $("einw-msg").textContent = meldung(error); return; }
  $("einw-msg").textContent = ""; start();
});

/* ---------- Laden und live halten ---------- */
async function ladeAlles() {
  const [r, t, q, f, a, rd, ag] = await Promise.all([
    sb.from("routen").select("*").order("reihenfolge"),
    sb.from("themen").select("*").order("reihenfolge"),
    sb.from("fragen").select("*").order("erstellt_am", { ascending: false }),
    sb.from("folgen").select("id,route_id,thema_id,thema_code,titel,uebung,uebung_erledigt,wiederholung,sprache,audio_status,audio_pfad,audio_sekunden,audio_fehler,erstellt_am").order("erstellt_am", { ascending: false }).limit(500),
    sb.from("auftraege").select("id,art,status,route_id,thema_id,radar_id,fehler,ergebnis,eingabe,erstellt_am,folge_id").order("erstellt_am", { ascending: false }).limit(60),
    sb.from("radare").select("*").order("reihenfolge"),
    sb.from("radar_ausgaben").select("id,radar_id,jahr,woche,titel,highlights,audio_status,audio_pfad,erstellt_am").order("erstellt_am", { ascending: false }).limit(100),
  ]);
  for (const x of [r, t, q, f, a]) if (x.error) throw x.error;
  routen = r.data; themen = t.data; fragen = q.data; folgen = f.data; auftraege = a.data;
  radare = rd.error ? [] : rd.data; ausgaben = ag.error ? [] : ag.data;   // vor der Radar-Migration fehlen die Tabellen
  if (nav.route && !routeById(nav.route)) nav.route = null;
  if (nav.radar && !radarById(nav.radar)) nav.radar = null;
}
let ladeTimer = null;
function neuLaden() { clearTimeout(ladeTimer); ladeTimer = setTimeout(async () => { try { await ladeAlles(); if (!$("main").hidden) zeichnen(true); } catch (e) { fehlerMelden(e.message, "neuLaden"); } }, 300); }
function abonnieren() {
  if (kanal) return;
  kanal = sb.channel("lernroute");
  ["routen", "themen", "fragen", "folgen", "auftraege", "radare", "radar_ausgaben"].forEach((tab) => kanal.on("postgres_changes", { event: "*", schema: "public", table: tab }, neuLaden));
  kanal.subscribe();
}
async function kontoLaden() { const { data, error } = await sb.rpc("mein_konto"); if (error) throw error; konto = data; return data; }
async function auftrag(p, m, b, ok) {
  if (b) b.disabled = true; m.textContent = T("Starte …");
  const { error } = await sb.rpc("auftrag_anlegen", { p });
  if (b) b.disabled = false;
  if (error) { m.textContent = meldung(error); return false; }
  m.textContent = ok; await kontoLaden(); neuLaden(); return true;
}
const OK_FOLGE = () => T("Gestartet. In etwa zehn Minuten ist die Folge hier und im Podcast.");

/* ---------- Zeichnen ---------- */
const MERKE_FOKUS = () => { const a = document.activeElement; return a && a.id && $("view").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) ? a.id : null; };
function zeichnen(nurAktualisieren) {
  if (!konto) return;
  if (nurAktualisieren && MERKE_FOKUS()) return;   // nicht in ein Formular hinein neu zeichnen, während getippt wird
  const v = $("view"); v.textContent = "";
  const seite = el("div", "view");
  if (nav.tab === "routen") (nav.neu === "route" ? neueRoute : nav.route ? routeAnsicht : routenListe)(seite);
  else if (nav.tab === "radar") (nav.neu === "radar" ? neuesRadar : nav.radar ? radarAnsicht : radarListe)(seite);
  else if (nav.tab === "ich") ich(seite);
  else heute(seite);
  v.appendChild(seite);
}

/* ---- Heute ---- */
function alleBeitraege() {
  const a = folgen.map((f) => ({ art: "folge", x: f, titel: f.titel, zeit: f.erstellt_am, von: (routeById(f.route_id) || {}).titel || "" }));
  const b = ausgaben.map((x) => ({ art: "radar", x, titel: x.titel, zeit: x.erstellt_am, von: (radarById(x.radar_id) || {}).titel || T("Radar") }));
  return a.concat(b).sort((p, q) => new Date(q.zeit) - new Date(p.zeit));
}
function beitragZeile(b) {
  const fertig = b.x.audio_status === "fertig";
  return zeile({ ic: icon(b.art === "radar" ? "radar" : "kopfhoerer", b.art === "radar" ? "orange" : "indigo"), titel: b.titel,
    sub: [b.von, kurzDatum(b.zeit), fertig ? "" : b.x.audio_status === "fehler" ? T("ohne Audio") : T("wird vertont")].filter(Boolean).join(" · "),
    onClick: () => oeffneLeser(b.art, b.x, false) });
}
function laufendListe() {
  const l = auftraege.filter(offen);
  if (!l.length) return null;
  return gruppe(T("Läuft gerade"), liste(l.map((a) => {
    const th = themen.find((t) => t.id === a.thema_id), rd = radarById(a.radar_id);
    const text = a.art === "folge" ? T("Folge entsteht") + (th ? ": " + th.titel : "") : a.art === "radar" ? T("Radar entsteht") + (rd ? ": " + rd.titel : "") : a.art === "route" ? T("Lernroute wird vorgeschlagen") : T("Ideen werden gesammelt");
    return zeile({ ic: el("span", "spinner"), titel: text, sub: a.status === "wartet" ? T("Wartet auf die Fabrik") : T("Wird geschrieben und vertont") });
  })));
}
function heute(s) {
  const h = new Date().getHours();
  s.appendChild(kopf(h < 11 ? T("Guten Morgen") : h < 18 ? T("Hallo") : T("Guten Abend"), null,
    new Date().toLocaleDateString(LOC[uiLang], { weekday: "long", day: "numeric", month: "long" })));
  const alle = alleBeitraege(), weiter = alle.find((b) => b.x.audio_status === "fertig");
  if (weiter) {
    const k = el("button", "karte blau weiter"); k.type = "button"; k.onclick = () => oeffneLeser(weiter.art, weiter.x, true);
    const c = el("span", "cover" + (weiter.art === "radar" ? " radar" : "")); c.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[weiter.art === "radar" ? "radar" : "kopfhoerer"] + "</svg>";
    const t = el("span", "txt"); t.append(el("small", null, T("Weiterhören") + " · " + weiter.von), el("strong", null, weiter.titel));
    const p = el("span", "play"); p.innerHTML = '<svg viewBox="0 0 24 24">' + ICONS.play + "</svg>"; p.setAttribute("aria-label", T("▶︎ Abspielen"));
    k.append(c, t, p); s.appendChild(k);
  }
  const lauf = laufendListe(); if (lauf) s.appendChild(lauf);
  // Schnellaktionen
  const msg = meldungsFeld();
  const akt = el("div", "aktionen");
  const a = (ic, farbe, text, fn) => { const b = el("button", "aktion"); b.type = "button"; b.append(icon(ic, farbe), el("strong", null, text)); b.onclick = fn; return b; };
  akt.append(
    a("kopfhoerer", "indigo", T("Nächste Folge"), (e) => routen.length ? auftrag({ art: "folge" }, msg, e.currentTarget, OK_FOLGE()) : gehe({ tab: "routen", neu: "route" })),
    a("frage", "teal", T("Frage an deinen Coach"), () => frageOeffnen()),
    a("kompass", "gruen", T("Neue Lernroute"), () => gehe({ tab: "routen", route: null, neu: "route" })),
    funktionAn("eigene_radare") ? a("radar", "orange", T("Neues Radar"), () => gehe({ tab: "radar", radar: null, neu: "radar" })) : a("globus", "grau", T("Sprache"), openLang));
  s.appendChild(gruppe(null, [akt, msg]));
  const neu = alle.slice(0, 6);
  s.appendChild(gruppe(T("Neu für dich"), liste(neu.map(beitragZeile), T("Noch keine Folgen. Starte oben deine erste."))));
}

/* ---- Lernrouten ---- */
function routenListe(s) {
  s.appendChild(kopf(T("Lernrouten"), T("Jede Lernroute ist eine eigene Sendung in deiner Podcast-App.")));
  s.appendChild(gruppe(null, liste(routen.map((r, i) => {
    const ts = themen.filter((t) => t.route_id === r.id), np = folgen.filter((f) => f.route_id === r.id && f.audio_status === "fertig").length;
    const nv = ts.filter((t) => t.status === "verstanden").length;
    return zeile({ ic: icon(null, FARBEN[i % FARBEN.length], true, initialen(r.titel)), titel: r.titel + (r.aktiv ? "" : T(" · pausiert")),
      sub: np + " " + T("Folgen") + " · " + nv + T(" von ") + ts.length + T(" verstanden"), onClick: () => gehe({ route: r.id, routeTab: "folgen" }) });
  }), T("Noch keine Lernroute. Lass dir unten eine vorschlagen."))));
  s.appendChild(gruppe(null, liste([zeile({ ic: icon("plus", "gruen"), titel: T("Neue Lernroute"), sub: T("Claude schlägt dir eine Route in drei Stufen vor"), onClick: () => gehe({ neu: "route" }) })])));
  const v = vorschlaegeKarten(); if (v.length) s.appendChild(gruppe(T("Vorschläge für dich"), v));
  const lauf = laufendListe(); if (lauf) s.appendChild(lauf);
}
function neueRoute(s) {
  s.appendChild(navZurueck(T("Lernrouten"), () => gehe({ neu: null })));
  s.appendChild(kopf(T("Neue Lernroute"), T("Claude macht einen Vorschlag mit drei Stufen, passend zu deinem Profil. Du entscheidest, ob du ihn übernimmst.")));
  const k = el("div", "karte"), thema = eingabe("input", "", 140, T("z. B. Ein kleiner werdendes Team führen")), ziel = eingabe("textarea", "", 500, T("z. B. Einen Business Case für Agenten vorlegen können."));
  const m = meldungsFeld();
  const gen = knopf(T("Lernroute vorschlagen"), "primary block", async () => {
    if (!thema.value.trim()) { m.textContent = T("Gib zuerst ein Themengebiet ein."); thema.focus(); return; }
    if (await auftrag({ art: "route", thema: thema.value.trim(), ziel: ziel.value.trim() }, m, gen, T("Claude erstellt deine Lernroute. Das dauert etwa eine Minute …"))) { thema.value = ""; ziel.value = ""; }
  });
  const ideen = knopf(T("Ideen für mich"), "block", () => auftrag({ art: "ideen" }, m, ideen, T("Claude sammelt Ideen …")));
  k.append(feld(T("Welches Themengebiet willst du lernen?"), thema), feld(T("Was willst du am Ende können? (optional)"), ziel), gen, ideen, m);
  s.appendChild(k);
  const v = vorschlaegeKarten(); if (v.length) s.appendChild(gruppe(T("Vorschläge für dich"), v));
}
function vorschlaegeKarten() {
  return auftraege.filter((a) => ["route", "ideen"].includes(a.art) && ["wartet", "in_arbeit", "fertig", "abgelehnt", "fehler"].includes(a.status)).slice(0, 3).map((a) => {
    const k = el("div", "karte vorschlag");
    if (offen(a)) { const z = el("div", "row"); z.append(el("span", "spinner"), el("span", null, a.art === "route" ? T("Claude erstellt deine Lernroute. Das dauert etwa eine Minute …") : T("Claude sammelt Ideen …"))); k.appendChild(z); return k; }
    if (a.status !== "fertig") { if (Date.now() - new Date(a.erstellt_am) > 864e5) return null; k.appendChild(el("p", "hint", a.fehler || T("Das hat nicht geklappt. Versuch es noch einmal."))); return k; }
    const e = a.ergebnis || {};
    const weg = knopf(T("Ausblenden"), "sm ghost", () => sb.rpc("auftrag_verwerfen", { p_auftrag: a.id }).then(neuLaden));
    if (a.art === "ideen") {
      k.appendChild(el("h3", null, T("Ideen für dich")));
      k.appendChild(liste((e.ideen || []).map((x) => zeile({ titel: x.thema, sub: x.warum, onClick: () => { gehe({ tab: "routen", neu: "route" }); setTimeout(() => { const i = document.querySelector("#view input.txt"); if (i) { i.value = x.thema; i.focus(); } }, 50); } }))));
      k.appendChild(weg); return k;
    }
    k.append(el("h3", null, e.title || ""), el("p", "hint", e.why || ""));
    (e.stages || []).forEach((st, i) => { k.appendChild(el("div", "stg", T("Stufe ") + (i + 1) + " · " + (st.name || ""))); const ol = el("ol");
      (st.topics || []).forEach((t) => ol.appendChild(el("li", null, t.title + (t.desc ? ": " + t.desc : "")))); k.appendChild(ol); });
    const m = meldungsFeld(), row = el("div", "row");
    const ok = knopf(T("Übernehmen"), "primary", async () => { ok.disabled = true; const { data: id, error } = await sb.rpc("route_uebernehmen", { p_auftrag: a.id }); if (error) { m.textContent = meldung(error); ok.disabled = false; return; } await ladeAlles(); gehe({ tab: "routen", neu: null, route: id, routeTab: "folgen" }); });
    row.append(ok, knopf(T("Verwerfen"), "", () => sb.rpc("auftrag_verwerfen", { p_auftrag: a.id }).then(neuLaden)));
    k.append(row, m); return k;
  }).filter(Boolean);
}
function ring(p) {
  const r = el("div", "ring"); r.innerHTML = '<svg viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="32" fill="none" stroke="#E9E9EE" stroke-width="8"/><circle cx="38" cy="38" r="32" fill="none" stroke="#34C759" stroke-width="8" stroke-linecap="round" stroke-dasharray="201.06" stroke-dashoffset="' + 201.06 * (1 - p / 100) + '"/></svg>';
  r.appendChild(el("span", "pct", p + "%")); return r;
}
function routeAnsicht(s) {
  const r = routeById(nav.route); if (!r) { gehe({ route: null }); return; }
  const ts = themen.filter((t) => t.route_id === r.id), mine = folgen.filter((f) => f.route_id === r.id);
  const v = ts.filter((t) => t.status === "verstanden").length, u = ts.filter((t) => t.status === "unsicher").length;
  const p = ts.length ? Math.round((v / ts.length) * 100) : 0;
  s.appendChild(navZurueck(T("Lernrouten"), () => gehe({ route: null })));
  const held = el("div", "held"); const ht = el("div"); ht.append(el("h1", null, r.titel)); if (r.warum) ht.appendChild(el("p", null, r.warum)); held.append(ring(p), ht); s.appendChild(held);
  const k = el("div", "karte"); const st = el("div", "stats");
  [["#34C759", v, T("verstanden")], ["#FF9500", u, T("unsicher")], ["#8E8E93", ts.length, T("Themen")]].forEach(([c, n, l]) => { const x = el("span"); const d = el("span", "punkt"); d.style.background = c; x.append(d, el("b", null, String(n)), document.createTextNode(" " + l)); st.appendChild(x); });
  const m = meldungsFeld(); m.textContent = T("Nach etwa zehn Minuten ist sie hier und in deiner Podcast-App.");
  const fire = knopf(T("Nächste Folge dieser Route starten"), "primary block", () => auftrag({ art: "folge", route_id: r.id }, m, fire, OK_FOLGE()));
  fire.id = "fire"; k.append(st, fire, m); s.appendChild(k);
  // Unterbereiche
  const seg = el("div", "seg"); seg.setAttribute("role", "tablist");
  [["folgen", T("Folgen")], ["themen", T("Themen")], ["fragen", T("Fragen")]].forEach(([key, l]) => { const b = knopf(l, "", () => gehe({ routeTab: key })); b.className = ""; b.dataset.v = key; b.setAttribute("aria-pressed", String(nav.routeTab === key)); seg.appendChild(b); });
  s.appendChild(seg);
  if (nav.routeTab === "themen") themenBereich(s, r, ts);
  else if (nav.routeTab === "fragen") fragenBereich(s);
  else {
    const laufend = auftraege.filter((a) => offen(a) && a.art === "folge" && (a.route_id === r.id || ts.some((t) => t.id === a.thema_id)));
    const pod = mine.filter((f) => f.audio_status === "fertig"), wait = mine.filter((f) => f.audio_status !== "fertig");
    if (laufend.length || wait.length) s.appendChild(gruppe(T("In Arbeit"), liste([
      ...laufend.map((a) => { const th = themen.find((t) => t.id === a.thema_id); return zeile({ ic: el("span", "spinner"), titel: th ? th.titel : T("Folge entsteht"), sub: a.status === "wartet" ? T("Wartet auf die Fabrik") : T("Wird geschrieben und vertont") }); }),
      ...wait.map((f) => beitragZeile({ art: "folge", x: f, titel: f.titel, zeit: f.erstellt_am, von: f.thema_code || "" }))])));
    s.appendChild(gruppe(T("Im Podcast"), liste(pod.map((f) => beitragZeile({ art: "folge", x: f, titel: f.titel, zeit: f.erstellt_am, von: f.thema_code || "" })),
      T("Noch keine Folge dieser Route. Starte oben die erste."))));
  }
  // Podcast und Verwaltung
  if (konto.feed_token) {
    const u = feedBasis() + "/" + r.id + ".xml", pm = meldungsFeld();
    s.appendChild(gruppe(T("Podcast-App"), [liste([
      zeile({ ic: icon("podcast", "lila"), titel: T("In Apple Podcasts abonnieren"), href: podcastLink(u) }),
      zeile({ ic: icon("link", "grau"), titel: T("Adresse kopieren"), onClick: () => kopieren(u, pm), chev: false })]), pm],
      T("Jede Lernroute ist eine eigene Sendung. So mischen sich die Routen nicht.")));
  }
  const lm = meldungsFeld();
  let rlh = null; const loesch = zeile({ titel: T("Lernroute löschen"), cls: "gefahr", onClick: () => rlh() });
  rlh = bestaetigen(loesch.querySelector("strong"), T("Wirklich löschen?"), async () => { const { error } = await sb.from("routen").delete().eq("id", r.id); if (error) lm.textContent = meldung(error); else { await ladeAlles(); gehe({ route: null }); } });
  s.appendChild(gruppe(T("Lernroute"), [liste([
    zeile({ titel: r.aktiv ? T("Pausieren") : T("Fortsetzen"), cls: "link", onClick: async () => { const { error } = await sb.from("routen").update({ aktiv: !r.aktiv }).eq("id", r.id); if (error) lm.textContent = meldung(error); else { r.aktiv = !r.aktiv; zeichnen(); } } }),
    loesch]), lm], T("Dein Coach wechselt zwischen allen aktiven Routen.")));
}
function themenBereich(s, r, ts) {
  const gr = [];
  const w = ts.filter((t) => t.stufe === 0); if (w.length) gr.push([T("Deine Wunschthemen"), w]);
  [1, 2, 3].forEach((n) => { const l = ts.filter((t) => t.stufe === n); if (l.length) gr.push([T("Stufe ") + n + (l[0].stufen_name ? " · " + l[0].stufen_name : ""), l]); });
  if (!gr.length) s.appendChild(el("p", "leer", T("Noch keine Themen.")));
  gr.forEach(([titel, l]) => {
    const box = el("div", "liste");
    l.forEach((t) => {
      const z = el("div", "thema"), oben = el("div", "oben"), s0 = t.status;
      const st = el("span", "st" + (s0 === "verstanden" ? " v" : s0 === "unsicher" ? " u" : t.behandelt_anzahl > 0 ? " c" : ""), s0 === "verstanden" ? "✓" : s0 === "unsicher" ? "?" : ""); st.setAttribute("aria-hidden", "true");
      const tt = el("div"); tt.append(el("strong", null, t.titel), el("div", "sub", t.code + " · " + (t.behandelt_anzahl > 0 ? T("Gehört am ") + fmt(t.zuletzt_behandelt) : t.beschreibung || T("Noch nicht dran gewesen"))));
      oben.append(st, tt); z.appendChild(oben);
      const acts = el("div", "acts"), seg = el("div", "seg klein"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", T("Status für ") + t.titel);
      [["neu", "Offen"], ["unsicher", "Unsicher"], ["verstanden", "Kann ich"]].forEach(([k, l]) => { const b = el("button", null, T(l)); b.type = "button"; b.dataset.s = k; b.setAttribute("aria-pressed", String(s0 === k));
        b.onclick = async () => { const { error } = await sb.from("themen").update({ status: k, status_am: new Date().toISOString() }).eq("id", t.id); if (error) showErr(meldung(error)); else { t.status = k; zeichnen(); } }; seg.appendChild(b); });
      const m = meldungsFeld(), lbl = t.behandelt_anzahl > 0 ? T("↻ Neue Folge") : T("▶︎ Als Folge");
      const fb = knopf(lbl, "sm", null);
      fb.onclick = bestaetigen(fb, T("Tippen zum Bestätigen"), () => { fb.textContent = lbl; auftrag({ art: "folge", thema_id: t.id, neuer_blickwinkel: t.behandelt_anzahl > 0 }, m, fb, OK_FOLGE()); });
      acts.append(seg, fb); z.append(acts, m); box.appendChild(z);
    });
    s.appendChild(gruppe(titel, box, null, l.filter((t) => t.status === "verstanden").length + " / " + l.length));
  });
  // Wunschthema
  const k = el("div", "karte"), wt = eingabe("input", "", 120, T("z. B. Was ist eine Vektor-Datenbank?")), wn = eingabe("textarea", "", 500, T("z. B. Mein Team spricht ständig davon, ich weiß nicht, wofür wir das brauchen."));
  wt.id = "wtitle"; const m = meldungsFeld();
  const wunsch = async (jetzt, b) => {
    if (!wt.value.trim()) { m.textContent = T("Gib zuerst ein Thema oder einen Begriff ein."); wt.focus(); return; }
    const { data: id, error } = await sb.rpc("wunschthema_anlegen", { p_route: r.id, p_titel: wt.value.trim(), p_beschreibung: wn.value.trim() });
    if (error) { m.textContent = meldung(error); return; }
    wt.value = ""; wn.value = "";
    if (jetzt) await auftrag({ art: "folge", thema_id: id }, m, b, OK_FOLGE()); else { m.textContent = T("Vorgemerkt. Es kommt in der nächsten Folge dran."); neuLaden(); }
  };
  const jetzt = knopf(T("Jetzt Folge erstellen"), "primary block", () => wunsch(true, jetzt));
  k.append(feld(T("Begriff oder Thema für eine eigene Folge"), wt), feld(T("Worauf soll der Coach eingehen? (optional)"), wn), jetzt, knopf(T("Für später vormerken"), "block", () => wunsch(false)), m);
  s.appendChild(gruppe(T("Wunschthema"), k, T("„Vormerken“ setzt das Thema an die Spitze der gewählten Lernroute, es kommt in der nächsten Folge dran.")));
}
function fragenBereich(s) {
  s.appendChild(gruppe(null, liste([zeile({ ic: icon("frage", "teal"), titel: T("Frage an deinen Coach"), sub: T("Dein Coach greift sie in der nächsten Folge auf."), onClick: () => frageOeffnen() })])));
  s.appendChild(gruppe(T("Deine Fragen"), liste(fragen.map((q) => {
    const z = el("div", "thema"); const o = el("div", "row"); o.append(el("span", "pill " + (q.status === "beantwortet" ? "ok" : "grau"), q.status === "beantwortet" ? T("beantwortet") : T("offen")), el("span", "hint", fmt(q.erstellt_am)));
    const del = knopf(T("entfernen"), "sm ghost", async () => { const { error } = await sb.from("fragen").delete().eq("id", q.id); if (error) showErr(meldung(error)); else neuLaden(); }); o.appendChild(del);
    z.append(o, el("div", null, q.text)); if (q.antwort) z.appendChild(el("div", "sub", q.antwort)); return z;
  }), T("Noch keine Fragen."))));
}

/* ---- Radar ---- */
function radarWoche(rd) {
  const [j, w] = isoWoche();
  return ausgaben.some((x) => x.radar_id === rd.id && x.jahr === j && x.woche === w) || auftraege.some((a) => a.art === "radar" && a.radar_id === rd.id && !["fehler", "abgelehnt"].includes(a.status) && isoWoche(new Date(a.erstellt_am)).join() === [j, w].join());
}
function radarListe(s) {
  s.appendChild(kopf(T("Radar"), T("Jede Woche eine Zusammenfassung zu Bereichen, die du selbst festlegst – als Text und als Podcast.")));
  if (!funktionAn("eigene_radare")) { const k = el("div", "karte"); k.append(el("h3", null, T("Bald für dich verfügbar")), el("p", "hint", T("Eigene Radare werden gerade getestet und bald für dein Konto freigeschaltet."))); s.appendChild(k); return; }
  s.appendChild(gruppe(T("Deine Radare"), liste(radare.map((rd) => {
    const letzte = ausgaben.find((x) => x.radar_id === rd.id);
    return zeile({ ic: icon("radar", rd.aktiv ? "orange" : "grau"), titel: rd.titel + (rd.aktiv ? "" : T(" · pausiert")),
      sub: T("Jeden ") + T(TAG_LANG[rd.wochentag - 1]) + (letzte ? " · " + T("zuletzt ") + kurzDatum(letzte.erstellt_am) : ""), onClick: () => gehe({ radar: rd.id }) });
  }), T("Noch kein Radar. Lege unten dein erstes an.")),
  null, radare.length + " / 3"));
  if (radare.length < 3) s.appendChild(gruppe(null, liste([zeile({ ic: icon("plus", "orange"), titel: T("Neues Radar"), sub: T("Bereich festlegen, Wochentag wählen"), onClick: () => gehe({ neu: "radar" }) })])));
  else s.appendChild(el("p", "hint", T("Du hast schon 3 Radare. Lösche zuerst eines.")));
  const lauf = laufendListe(); if (lauf) s.appendChild(lauf);
  const neu = ausgaben.slice(0, 5).map((x) => ({ art: "radar", x, titel: x.titel, zeit: x.erstellt_am, von: (radarById(x.radar_id) || {}).titel || "" }));
  if (neu.length) s.appendChild(gruppe(T("Neueste Ausgaben"), liste(neu.map(beitragZeile))));
}
function radarFormular(rd, fertig) {
  const k = el("div", "karte"), titel = eingabe("input", rd ? rd.titel : "", 60, T("z. B. Einkauf & Lieferketten")),
    bereich = eingabe("textarea", rd ? rd.bereich : "", 600, T("z. B. Neue Entwicklungen im strategischen Einkauf: KI-Werkzeuge, Lieferketten-Risiken, Gesetze.")),
    hinweise = eingabe("textarea", rd ? rd.hinweise : "", 300, T("z. B. Schwerpunkt Mittelstand, gern Fachmedien wie …"));
  hinweise.style.minHeight = "60px";
  let tag = rd ? rd.wochentag : 6; const chips = el("div", "chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", T("Wochentage"));
  const malen = () => { chips.textContent = ""; TAGE.forEach((n, i) => { const b = el("button", null, T(n)); b.type = "button"; b.setAttribute("aria-pressed", String(tag === i + 1)); b.onclick = () => { tag = i + 1; malen(); }; chips.appendChild(b); }); };
  malen();
  const m = meldungsFeld();
  const speichern = knopf(rd ? T("Speichern") : T("Radar anlegen"), "primary block", async () => {
    const p = { titel: titel.value.trim(), bereich: bereich.value.trim(), hinweise: hinweise.value.trim(), wochentag: tag };
    if (!p.titel) { m.textContent = T("Gib dem Radar einen Namen."); titel.focus(); return; }
    if (p.bereich.length < 3) { m.textContent = T("Beschreibe kurz, was das Radar beobachten soll."); bereich.focus(); return; }
    speichern.disabled = true;
    const res = rd ? await sb.from("radare").update(p).eq("id", rd.id) : await sb.rpc("radar_anlegen", { p });
    speichern.disabled = false;
    if (res.error) { m.textContent = meldung(res.error); return; }
    m.textContent = T("Gespeichert."); await ladeAlles(); fertig(rd ? rd.id : res.data);
  });
  k.append(feld(T("Name"), titel), feld(T("Was soll das Radar beobachten?"), bereich), feld(T("Schwerpunkte oder Quellen (optional)"), hinweise));
  const tf = el("div", "feld"); tf.append(el("label", null, T("Erscheint jeden")), chips); k.append(tf, speichern, m);
  return k;
}
function neuesRadar(s) {
  s.appendChild(navZurueck(T("Radar"), () => gehe({ neu: null })));
  s.appendChild(kopf(T("Neues Radar"), T("Beschreibe einen Bereich. Claude recherchiert jede Woche im Internet und fasst das Wichtigste zusammen.")));
  s.appendChild(radarFormular(null, (id) => gehe({ neu: null, radar: id })));
  s.appendChild(el("p", "hint", T("Bitte keine vertraulichen Firmendaten und keine Namen anderer Personen.")));
}
function radarAnsicht(s) {
  const rd = radarById(nav.radar); if (!rd) { gehe({ radar: null }); return; }
  s.appendChild(navZurueck(T("Radar"), () => gehe({ radar: null })));
  const held = el("div", "held"); const ht = el("div"); ht.append(el("h1", null, rd.titel), el("p", null, rd.bereich)); held.append(icon("radar", "orange", true), ht); s.appendChild(held);
  const k = el("div", "karte"), m = meldungsFeld(), dieseWoche = radarWoche(rd);
  k.appendChild(el("p", "klein", rd.aktiv ? T("Neue Ausgabe jeden ") + T(TAG_LANG[rd.wochentag - 1]) + T(" ab 7 Uhr.") : T("Pausiert: Es kommen keine neuen Ausgaben.")));
  const jetzt = knopf(dieseWoche ? T("Diese Woche schon erstellt") : T("Jetzt erstellen"), "primary block", () => auftrag({ art: "radar", radar_id: rd.id }, m, jetzt, T("Gestartet. In etwa zehn Minuten ist dein Radar hier und im Podcast.")));
  jetzt.disabled = dieseWoche; k.append(jetzt, m); s.appendChild(k);
  const lauf = laufendListe(); if (lauf) s.appendChild(lauf);
  s.appendChild(gruppe(T("Ausgaben"), liste(ausgaben.filter((x) => x.radar_id === rd.id).map((x) => beitragZeile({ art: "radar", x, titel: x.titel, zeit: x.erstellt_am, von: T("KW ") + x.woche })),
    T("Die erste Ausgabe erscheint am gewählten Wochentag."))));
  if (konto.feed_token) {
    const u = feedBasis() + "/radar-" + rd.id + ".xml", pm = meldungsFeld();
    s.appendChild(gruppe(T("Podcast-App"), [liste([
      zeile({ ic: icon("podcast", "lila"), titel: T("In Apple Podcasts abonnieren"), href: podcastLink(u) }),
      zeile({ ic: icon("link", "grau"), titel: T("Adresse kopieren"), onClick: () => kopieren(u, pm), chev: false })]), pm]));
  }
  s.appendChild(gruppe(T("Einstellungen"), radarFormular(rd, () => zeichnen())));
  const lm = meldungsFeld(); let rdh = null; const loesch = zeile({ titel: T("Radar löschen"), cls: "gefahr", onClick: () => rdh() });
  rdh = bestaetigen(loesch.querySelector("strong"), T("Wirklich löschen?"), async () => { const { error } = await sb.from("radare").delete().eq("id", rd.id); if (error) lm.textContent = meldung(error); else { await ladeAlles(); gehe({ radar: null }); } });
  s.appendChild(gruppe(null, [liste([
    zeile({ titel: rd.aktiv ? T("Pausieren") : T("Fortsetzen"), cls: "link", onClick: async () => { const { error } = await sb.from("radare").update({ aktiv: !rd.aktiv }).eq("id", rd.id); if (error) lm.textContent = meldung(error); else { rd.aktiv = !rd.aktiv; zeichnen(); } } }),
    loesch]), lm]));
}

/* ---- Ich ---- */
function ich(s) {
  s.appendChild(kopf(T("Ich"), nutzer ? nutzer.email : ""));
  const k = el("div", "karte"), pt = eingabe("textarea", konto.profil_text || "", 4000); pt.id = "ptext"; pt.style.minHeight = "140px";
  const pm = meldungsFeld();
  k.append(pt, knopf(T("Profil speichern"), "primary block", async () => { const f = await einstellung({ profil_text: pt.value.trim() }, pm); if (!f) pm.textContent = T("Gespeichert."); }), pm);
  s.appendChild(gruppe(T("Dein Profil"), k, T("Rolle, Situation, Ziele, Vorwissen. Daraus leitet der Coach ab, was für dich zählt. Bitte keine vertraulichen Firmendaten und keine Namen anderer Personen.")));
  // Einstellungen
  const em = meldungsFeld(), ein = [zeile({ ic: icon("globus", "blau"), titel: T("Sprache"), wert: LNAME[uiLang] + " · 🎧 " + LNAME[konto.sprache_folgen], onClick: openLang })];
  s.appendChild(gruppe(T("Einstellungen"), liste(ein)));
  if (funktionAn("automatik")) {
    const pk = el("div", "karte"), chips = el("div", "chips"), tage = konto.plan_tage || [];
    TAGE.forEach((n, i) => { const b = el("button", null, T(n)); b.type = "button"; b.setAttribute("aria-pressed", String(tage.includes(i + 1)));
      b.onclick = () => einstellung({ plan_tage: tage.includes(i + 1) ? tage.filter((x) => x !== i + 1) : [...tage, i + 1] }, em); chips.appendChild(b); });
    const std = el("select", "txt"); for (let h = 5; h <= 21; h++) { const o = el("option", null, String(h).padStart(2, "0") + ":00"); o.value = h; std.appendChild(o); }
    std.value = konto.plan_stunde; std.onchange = () => einstellung({ plan_stunde: Number(std.value), plan_zeitzone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin" }, em);
    pk.append(el("p", "klein", T("An diesen Tagen kommt automatisch eine neue Folge")), chips, feld(T("Ab dieser Uhrzeit"), std), em);
    s.appendChild(gruppe(T("Automatische Folgen"), pk));
  }
  // Podcast-App
  if (konto.feed_token) {
    const fm = meldungsFeld(), z = routen.map((r) => zeile({ ic: icon("kompass", "gruen"), titel: r.titel, sub: T("Lernroute"), href: podcastLink(feedBasis() + "/" + r.id + ".xml") }))
      .concat(funktionAn("eigene_radare") ? radare.map((rd) => zeile({ ic: icon("radar", "orange"), titel: rd.titel, sub: T("Radar"), href: podcastLink(feedBasis() + "/radar-" + rd.id + ".xml") })) : []);
    const neu = zeile({ titel: T("Neue Adressen erzeugen"), cls: "link", onClick: async () => {
      if (!confirm(T("Alle bisherigen Feed-Adressen hören auf zu funktionieren. Fortfahren?"))) return;
      const { data, error } = await sb.rpc("feed_erneuern"); if (error) { fm.textContent = meldung(error); return; } konto = data; zeichnen(); } });
    s.appendChild(gruppe(T("Podcast-App"), [liste(z), liste([neu]), fm], T("Jede Lernroute und jedes Radar ist eine eigene, private Sendung. Tippe darauf, um sie in Apple Podcasts zu abonnieren. Die Adressen sind geheim: teile sie nicht.")));
  }
  // Konto
  const km = meldungsFeld();
  const weg = zeile({ titel: T("Konto und alle Daten löschen"), cls: "gefahr", onClick: async () => {
    if (!confirm(T("Dein Konto, alle Lernrouten, Folgen und Audiodateien werden endgültig gelöscht. Das lässt sich nicht rückgängig machen. Fortfahren?"))) return;
    const { error } = await sb.rpc("konto_loeschen"); if (error) { km.textContent = meldung(error); return; }
    merk.weg("lr-nav"); await sb.auth.signOut(); location.reload(); } });
  s.appendChild(gruppe(T("Konto"), [liste([
    zeile({ ic: icon("kopfhoerer", "indigo"), titel: T("Folgen diesen Monat"), wert: konto.verbraucht + " / " + konto.kontingent }),
    konto.rolle === "admin" ? zeile({ ic: icon("schild", "grau"), titel: T("Admin-Bereich"), href: "admin.html" }) : null,
    zeile({ ic: icon("tueroffen", "grau"), titel: T("Abmelden"), onClick: () => { merk.weg("lr-nav"); sb.auth.signOut(); } }),
  ]), liste([weg]), km]));
  const links = el("div", "links"); [["impressum.html", "Impressum"], ["datenschutz.html", "Datenschutz"], ["agb.html", "Nutzungsbedingungen"]].forEach(([h, l]) => { const a = el("a", null, T(l)); a.href = h; links.appendChild(a); });
  s.appendChild(links);
}
async function einstellung(p, m) { const { data, error } = await sb.rpc("einstellungen_setzen", { p }); if (error) { if (m) m.textContent = meldung(error); return error; } konto = data; zeichnen(); return null; }
function kopieren(u, m) { navigator.clipboard.writeText(u).then(() => (m.textContent = T("Kopiert. Jetzt in der Podcast-App unter Mediathek › … › Sendung per URL folgen einfügen.")), () => (m.textContent = u)); }

/* ---------- Frage an den Coach ---------- */
function frageOeffnen() { $("qmsg").textContent = ""; $("fragesheet").hidden = false; setTimeout(() => $("qtext").focus(), 50); }
$("qzu").onclick = () => ($("fragesheet").hidden = true);
$("fragesheet").addEventListener("click", (e) => { if (e.target === $("fragesheet")) $("fragesheet").hidden = true; });
$("qsend").onclick = async () => {
  const t = $("qtext").value.trim(), m = $("qmsg"); if (!t) { m.textContent = T("Schreib zuerst deine Frage."); return; }
  $("qsend").disabled = true; const { error } = await sb.from("fragen").insert({ text: t }); $("qsend").disabled = false;
  if (error) { m.textContent = meldung(error); return; }
  $("qtext").value = ""; m.textContent = T("Gespeichert. Dein Coach greift sie in der nächsten Folge auf."); neuLaden();
};

/* ---------- Leseansicht mit Player ---------- */
function inline(node, txt) {
  txt.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).forEach((p) => { if (!p) return; let m;
    if ((m = p.match(/^\*\*([^*]+)\*\*$/))) node.appendChild(el("strong", null, m[1]));
    else if ((m = p.match(/^\[([^\]]+)\]\((https:[^)\s]+)\)$/))) { const a = el("a", null, m[1]); a.href = m[2]; a.target = "_blank"; a.rel = "noopener noreferrer"; node.appendChild(a); }
    else node.appendChild(document.createTextNode(p.replace(/`/g, ""))); });
}
function renderMd(box, text) {
  box.textContent = ""; let ul = null;
  (text || "").split(/\n/).forEach((line) => { const l = line.trim(); if (!l) { ul = null; return; } let m;
    if ((m = l.match(/^#{1,6}\s*(.+)$/))) { ul = null; box.appendChild(el("h3", null, m[1].replace(/\*\*/g, ""))); return; }
    if ((m = l.match(/^[-*•]\s+(.+)$/))) { if (!ul) { ul = el("ul"); box.appendChild(ul); } const li = el("li"); inline(li, m[1]); ul.appendChild(li); return; }
    ul = null; const p = el("p"); inline(p, l); box.appendChild(p); });
}
async function oeffneLeser(art, item, abspielen) {
  const { data: x, error } = await sb.from(art === "radar" ? "radar_ausgaben" : "folgen").select("*").eq("id", item.id).single();
  if (error) { showErr(meldung(error)); return; }
  const rd = art === "radar" ? radarById(x.radar_id) : null;
  $("rmeta").textContent = art === "radar" ? (rd ? rd.titel + " · " : "") + T("KW ") + x.woche : fmt(x.erstellt_am) + " · " + (x.thema_code || "");
  $("rtitle").textContent = x.titel; renderMd($("rbody"), x.text);
  const au = $("raudio"); au.pause(); au.removeAttribute("src"); $("rpod").hidden = true; $("rhinweis").textContent = "";
  if (x.audio_status === "fertig" && x.audio_pfad) {
    const { data: u } = await sb.storage.from("audio").createSignedUrl(x.audio_pfad, 6 * 3600);
    if (u && u.signedUrl) { au.src = u.signedUrl; $("rpod").hidden = false;
      try { if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: x.titel, artist: "Anna & Ben", album: "Lernroute", artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }] }); } catch (e) { /* egal */ }
      if (abspielen) au.play().catch(() => {}); }
  } else $("rhinweis").textContent = x.audio_status === "fehler" ? T("Die Vertonung hat nicht geklappt. Den Text kannst du lesen.") : T("Die vertonte Folge ist noch in Arbeit.");
  $("rex").hidden = !(art === "folge" && x.uebung);
  if (art === "folge" && x.uebung) { $("rextext").textContent = x.uebung; $("rexcb").checked = !!x.uebung_erledigt;
    $("rexcb").onchange = async () => { const { error: e } = await sb.rpc("uebung_setzen", { p_folge: x.id, p_erledigt: $("rexcb").checked }); if (e) { $("rexcb").checked = !$("rexcb").checked; showErr(meldung(e)); } else neuLaden(); }; }
  $("rmerk").hidden = !x.merksatz; $("rmerktext").textContent = x.merksatz || "";
  const q = $("rquellen"); q.textContent = "";
  const qs = (Array.isArray(x.quellen) ? x.quellen : []).filter((s) => /^https:\/\//.test(s.url || ""));
  if (qs.length) { q.appendChild(el("h2", null, T("Quellen"))); q.appendChild(liste(qs.map((s) => zeile({ titel: s.titel || s.url, href: s.url, cls: "link" })))); }
  $("main").hidden = true; $("tabbar").hidden = true; $("reader").hidden = false; document.body.classList.add("reading"); window.scrollTo(0, 0);
}
function schliesseLeser(still) { try { $("raudio").pause(); } catch (e) { /* egal */ } $("reader").hidden = true; document.body.classList.remove("reading"); if (!still) { $("main").hidden = false; $("tabbar").hidden = false; } }
$("rback").onclick = () => { schliesseLeser(); zeichnen(true); };

/* ---------- Sprache ---------- */
function langButtons(box, val, onPick) { box.textContent = ""; LANGS.forEach((l) => { const b = el("button", null, LNAME[l]); b.type = "button"; b.setAttribute("aria-pressed", String(l === val)); b.onclick = () => onPick(l); box.appendChild(b); }); }
function renderLang() { langButtons($("uiseg"), uiLang, (l) => setLang({ sprache_ui: l })); langButtons($("podseg"), konto ? konto.sprache_folgen : uiLang, (l) => setLang({ sprache_folgen: l })); }
async function setLang(p) {
  if (p.sprache_ui) { uiLang = p.sprache_ui; merk.set("lr-lang", uiLang); statisch(); }
  if (!konto) { renderLang(); return; }
  const { data, error } = await sb.rpc("einstellungen_setzen", { p }); if (error) { $("langmsg").textContent = meldung(error); return; }
  konto = data; $("langmsg").textContent = T("Gespeichert. Neue Folgen kommen auf ") + LNAME[konto.sprache_folgen] + "."; renderLang(); zeichnen();
}
function openLang() { $("langmsg").textContent = ""; renderLang(); $("langsheet").hidden = false; }
function closeLang() { $("langsheet").hidden = true; merk.set("lr-lang-gefragt", "1"); }
$("langdone").onclick = closeLang;
$("langsheet").addEventListener("click", (e) => { if (e.target === $("langsheet")) closeLang(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!$("langsheet").hidden) closeLang(); $("fragesheet").hidden = true; } });

/* ---------- Start ---------- */
let startLaeuft = null;
function start() { startLaeuft = (startLaeuft || Promise.resolve()).then(starten, starten).catch((e) => { showErr(meldung(e)); fehlerMelden(e && e.message, "start", e && e.stack); }); return startLaeuft; }
async function starten() {
  const { data } = await sb.auth.getSession(); nutzer = data.session ? data.session.user : null;
  if (!nutzer) { gate("v-login"); return; }
  await kontoLaden();
  if (konto.gesperrt) { gate("v-code"); $("f-code").hidden = true; $("code-msg").textContent = T("Dein Konto ist gesperrt."); return; }
  if (!konto.aktiviert) { gate("v-code"); return; }
  if (!konto.eingewilligt) { gate("v-einw"); return; }
  if (konto.sprache_ui && konto.sprache_ui !== uiLang && !merk.get("lr-lang")) { uiLang = konto.sprache_ui; merk.set("lr-lang", uiLang); statisch(); }
  await ladeAlles(); abonnieren();
  if (!["heute", "routen", "radar", "ich"].includes(nav.tab)) nav.tab = "heute";
  gehe({}); showErr("");
  if (!merk.get("lr-lang-gefragt")) setTimeout(openLang, 500);
}
(async () => {
  try { TX = await fetch("texte.json").then((r) => r.json()); } catch (e) { TX = {}; }
  sammleStatisch(); statisch();
  sb.auth.onAuthStateChange((evt) => { if (["SIGNED_IN", "SIGNED_OUT"].includes(evt)) setTimeout(start, 0); });
  await start();
})();
