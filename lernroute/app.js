/* Lernroute – Web-App
 * Anmeldung, Freischaltung, Einwilligung; Lernrouten (Ebene 1) mit Folgen im Podcast / noch nicht / noch offen (Ebene 2),
 * Themen, Fragen, Wunschthemen, Routen-Vorschläge, Profil, Wochenplan, Sprachen, private Podcast-Feeds und Konto.
 * Daten liegen in Supabase; Row Level Security sorgt dafür, dass jede Person nur ihre eigene Bibliothek sieht.
 * Texte: texte.json (deutscher Text → Englisch, Spanisch, Portugiesisch).
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
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

/* ---------- Sprache ---------- */
const LANGS = ["de", "en", "es", "pt"], LIDX = { en: 0, es: 1, pt: 2 };
const LNAME = { de: "Deutsch", en: "English", es: "Español", pt: "Português" };
const LOC = { de: "de-DE", en: "en-GB", es: "es-ES", pt: "pt-PT" };
let TX = {}, uiLang = LANGS.includes(merk.get("lr-lang")) ? merk.get("lr-lang") : "de";
function T(s) { if (uiLang === "de" || s == null) return s; const r = TX[s]; return r ? r[LIDX[uiLang]] || s : s; }
const STATIC = [];
function sammleStatisch() {
  [document.querySelector(".wrap"), $("tabbar"), $("langsheet")].forEach((root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const k = n.nodeValue.trim(); if (k && TX[k]) STATIC.push({ n, k, raw: n.nodeValue }); }
    root.querySelectorAll("[placeholder],[aria-label]").forEach((e) => ["placeholder", "aria-label"].forEach((a) => { const v = e.getAttribute(a); if (v && TX[v]) STATIC.push({ e, a, k: v }); }));
  });
}
function statisch() { STATIC.forEach((x) => { const v = T(x.k); if (x.n) x.n.nodeValue = x.raw.replace(x.k, v); else x.e.setAttribute(x.a, v); }); document.documentElement.lang = uiLang; }
const fmt = (d) => { if (!d || isNaN(new Date(d))) return ""; return new Date(d).toLocaleDateString(LOC[uiLang], { day: "2-digit", month: "2-digit", year: "numeric" }); };

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
let konto = null, routen = [], themen = [], fragen = [], folgen = [], auftraege = [], radar = [];
let cur = merk.get("lr-route") || null, viewRoute = merk.get("lr-view") || null, rvTab = "pod", kanal = null;
const routeById = (id) => routen.find((r) => r.id === id) || null;
const funktionAn = (k) => !!(konto && Array.isArray(konto.funktionen) && konto.funktionen.includes(k));
const COLORS = ["linear-gradient(145deg,#5E5CE6,#007AFF)", "linear-gradient(145deg,#34C759,#30B0C7)", "linear-gradient(145deg,#FF9F0A,#FF6B22)", "linear-gradient(145deg,#FF375F,#BF5AF2)", "linear-gradient(145deg,#64D2FF,#0A84FF)"];
const initialen = (t) => (t || "?").replace(/[^A-Za-zÄÖÜäöü ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
const offen = (a) => ["wartet", "in_arbeit"].includes(a.status);

/* ---------- Ansichten ---------- */
const GATES = ["v-login", "v-code", "v-einw"];
function gate(id) { GATES.forEach((g) => ($(g).hidden = g !== id)); $("main").hidden = true; $("tabbar").hidden = true; $("reader").hidden = true; }
const TABS = ["heute", "themen", "fragen", "mehr"];
function showTab(name) {
  if (!TABS.includes(name)) name = "heute";
  if (name !== "heute") viewRoute = null;
  GATES.forEach((g) => ($(g).hidden = true));
  $("main").hidden = false; $("tabbar").hidden = false; $("reader").hidden = true; document.body.classList.remove("reading");
  TABS.forEach((n) => { $("tab-" + n).hidden = n !== name || (n === "heute" && !!viewRoute); });
  $("tab-route").hidden = !(name === "heute" && viewRoute);
  viewRoute ? merk.set("lr-view", viewRoute) : merk.weg("lr-view");
  document.querySelectorAll(".tabbar [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  merk.set("lr-tab", name); window.scrollTo(0, 0);
}
document.querySelectorAll(".tabbar [data-tab]").forEach((b) => (b.onclick = () => { if (b.dataset.tab === "heute") viewRoute = null; showTab(b.dataset.tab); }));
function setGreeting() {
  const d = new Date(), h = d.getHours();
  $("today").textContent = d.toLocaleDateString(LOC[uiLang], { weekday: "long", day: "numeric", month: "long" });
  $("t-heute").textContent = h < 11 ? T("Guten Morgen") : h < 18 ? T("Hallo") : T("Guten Abend");
}

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
document.addEventListener("click", (e) => { if (e.target.closest("[data-abmelden]")) { merk.weg("lr-view"); sb.auth.signOut(); } });
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
  const [r, t, q, f, a, rd] = await Promise.all([
    sb.from("routen").select("*").order("reihenfolge"),
    sb.from("themen").select("*").order("reihenfolge"),
    sb.from("fragen").select("*").order("erstellt_am", { ascending: false }),
    sb.from("folgen").select("id,route_id,thema_id,thema_code,titel,uebung,uebung_erledigt,wiederholung,sprache,audio_status,audio_pfad,audio_sekunden,audio_fehler,erstellt_am").order("erstellt_am", { ascending: false }).limit(500),
    sb.from("auftraege").select("id,art,status,route_id,thema_id,fehler,ergebnis,eingabe,erstellt_am,folge_id").order("erstellt_am", { ascending: false }).limit(50),
    sb.from("radar").select("id,jahr,woche,sprache,titel,highlights,audio_status,audio_pfad,erstellt_am").order("erstellt_am", { ascending: false }).limit(20),
  ]);
  for (const x of [r, t, q, f, a, rd]) if (x.error) throw x.error;
  routen = r.data; themen = t.data; fragen = q.data; folgen = f.data; auftraege = a.data; radar = rd.data;
  if (!routeById(cur)) cur = routen[0] ? routen[0].id : null;
  if (viewRoute && !routeById(viewRoute)) viewRoute = null;
}
let ladeTimer = null;
function neuLaden() { clearTimeout(ladeTimer); ladeTimer = setTimeout(async () => { try { await ladeAlles(); renderAlles(); } catch (e) { fehlerMelden(e.message, "neuLaden"); } }, 300); }
function abonnieren() {
  if (kanal) return;
  kanal = sb.channel("lernroute");
  ["routen", "themen", "fragen", "folgen", "auftraege"].forEach((tab) => kanal.on("postgres_changes", { event: "*", schema: "public", table: tab }, neuLaden));
  kanal.subscribe();
}
async function kontoLaden() { const { data, error } = await sb.rpc("mein_konto"); if (error) throw error; konto = data; return data; }

/* ---------- Ebene 1: Lernrouten ---------- */
function renderHome() {
  const box = $("homeroutes"); box.textContent = "";
  if (!routen.length) { box.appendChild(el("p", "empty", T("Noch keine Lernroute. Lass dir unten eine vorschlagen."))); }
  routen.forEach((r, i) => {
    const ts = themen.filter((t) => t.route_id === r.id), fs = folgen.filter((f) => f.route_id === r.id);
    const np = fs.filter((f) => f.audio_status === "fertig").length, nw = fs.length - np, nv = ts.filter((t) => t.status === "verstanden").length;
    const b = el("button", "rcard"); const av = el("span", "rav", initialen(r.titel)); av.style.background = COLORS[i % COLORS.length]; av.setAttribute("aria-hidden", "true"); b.appendChild(av);
    b.appendChild(el("span", "t", r.titel + (r.aktiv ? "" : T(" · pausiert"))));
    b.appendChild(el("span", "s", "🎧 " + np + T(" im Podcast") + (nw ? " · " + nw + T(" in Arbeit") : "") + " · " + nv + T(" von ") + ts.length + T(" verstanden")));
    const bar = el("span", "bar"); const fill = el("i"); fill.style.width = (ts.length ? Math.round((nv / ts.length) * 100) : 0) + "%"; bar.appendChild(fill); b.appendChild(bar);
    const ch = el("span", "chev", "›"); ch.setAttribute("aria-hidden", "true"); b.appendChild(ch);
    b.onclick = () => openRoute(r.id); box.appendChild(b);
  });
  // Laufende Aufträge oben anzeigen
  const lb = $("laeuft"); lb.textContent = ""; const l = auftraege.filter(offen);
  lb.hidden = !l.length;
  l.forEach((a) => { const z = el("div", "lauf"); z.appendChild(el("span", "spinner")); const th = themen.find((t) => t.id === a.thema_id);
    z.appendChild(el("span", null, a.art === "folge" ? T("Folge entsteht") + (th ? ": " + th.titel : "") : a.art === "route" ? T("Lernroute wird vorgeschlagen") : T("Ideen werden gesammelt"))); lb.appendChild(z); });
}
function openRoute(id) { viewRoute = id; cur = id; merk.set("lr-route", id); showTab("heute"); renderAlles(); }
$("rvback").onclick = () => { viewRoute = null; showTab("heute"); };
$("homeadd").onclick = () => { showTab("mehr"); setTimeout(() => { $("sec-new").scrollIntoView({ behavior: "smooth" }); $("ntopic").focus(); }, 80); };

/* ---------- Ebene 2: eine Lernroute ---------- */
document.querySelectorAll("#rvseg button").forEach((b) => (b.onclick = () => { rvTab = b.dataset.v; renderRouteView(); }));
const feedBasis = () => CFG.supabaseUrl.replace(/\/$/, "") + "/functions/v1/feed/" + konto.feed_token;
const feedUrl = (id) => feedBasis() + "/" + id + ".xml";
function renderHeader() {
  const r = routeById(cur); const ts = themen.filter((t) => t.route_id === cur);
  $("htitle").textContent = r ? r.titel : ""; $("hlead").textContent = r ? r.warum || T("Deine eigene Lernroute.") : "";
  const bar = $("route"); bar.textContent = "";
  ts.forEach((t) => bar.appendChild(el("span", t.status === "verstanden" ? "v" : t.status === "unsicher" ? "u" : t.behandelt_anzahl > 0 ? "c" : "")));
  const v = ts.filter((t) => t.status === "verstanden").length, u = ts.filter((t) => t.status === "unsicher").length, c = ts.filter((t) => t.behandelt_anzahl > 0).length;
  const st = $("stats"); st.textContent = "";
  [["var(--green-fill)", "verstanden", v], ["var(--orange-fill)", "unsicher", u], ["var(--tint)", "behandelt", c]].forEach(([col, l, x]) => {
    const s = el("span"); const d = el("span", "dot"); d.style.background = col; s.append(d, el("b", null, String(x)), document.createTextNode(" " + T(l))); st.appendChild(s); });
  st.appendChild(el("span", null, ts.length + (ts.length === 1 ? T(" Thema") : T(" Themen"))));
  const p = ts.length ? Math.round((v / ts.length) * 100) : 0; $("ringp").textContent = p + "%"; $("ringc").setAttribute("stroke-dashoffset", String(201.06 * (1 - p / 100)));
  $("routecount").textContent = (r ? r.titel : "") + " · " + v + T(" von ") + ts.length + T(" verstanden");
}
function renderRouteView() {
  if (!viewRoute) return;
  renderHeader();
  const r = routeById(cur); if (!r) return;
  const feed = !!konto.feed_token; $("podcard").hidden = !feed;
  if (feed) { $("podtitle").textContent = T("Sendung „Lernroute ") + r.titel + T("“"); const u = feedUrl(r.id); $("podurl").textContent = u; $("podopen").href = "podcast://" + u.replace(/^https:\/\//, ""); }
  const mine = folgen.filter((f) => f.route_id === cur);
  const pod = mine.filter((f) => f.audio_status === "fertig"), wait = mine.filter((f) => f.audio_status !== "fertig");
  const laufend = auftraege.filter((a) => offen(a) && a.art === "folge" && (a.route_id === cur || themen.some((t) => t.id === a.thema_id && t.route_id === cur)));
  const done = new Set(mine.map((f) => f.thema_id)), inArbeit = new Set(laufend.map((a) => a.thema_id));
  const off = themen.filter((t) => t.route_id === cur && !(t.behandelt_anzahl > 0) && !done.has(t.id) && !inArbeit.has(t.id));
  const lab = { pod: T("Im Podcast · ") + pod.length, wait: T("Noch nicht · ") + (wait.length + laufend.length), open: T("Noch offen · ") + off.length };
  document.querySelectorAll("#rvseg button").forEach((b) => { b.textContent = lab[b.dataset.v]; b.setAttribute("aria-pressed", String(b.dataset.v === rvTab)); });
  $("rvhint").textContent = { pod: T("Diese Folgen kannst du hier oder in der Podcast-App hören."), wait: T("Diese Folgen entstehen gerade oder werden noch vertont."), open: T("Themen dieser Route, zu denen es noch keine Folge gibt.") }[rvTab];
  const box = $("folgenliste"); box.textContent = "";
  if (rvTab === "open") {
    if (!off.length) { box.appendChild(el("p", "empty", T("Zu allen Themen gibt es schon eine Folge."))); return; }
    off.forEach((t) => { const row = el("div", "otopic"); const d = el("div"); d.append(el("strong", null, t.titel), el("div", "sub", t.beschreibung || t.code)); row.appendChild(d);
      const m = el("span", "hint"); m.setAttribute("role", "status"); row.append(themaKnopf(t, m), m); box.appendChild(row); });
    return;
  }
  if (rvTab === "wait") {
    laufend.forEach((a) => { const z = el("div", "lauf"); z.appendChild(el("span", "spinner")); const th = themen.find((t) => t.id === a.thema_id);
      z.appendChild(el("span", null, (a.status === "wartet" ? T("Wartet auf die Fabrik") : T("Wird geschrieben und vertont")) + (th ? ": " + th.titel : ""))); box.appendChild(z); });
  }
  const list = rvTab === "pod" ? pod : wait;
  if (!list.length && !(rvTab === "wait" && laufend.length)) { box.appendChild(el("p", "empty", rvTab === "pod" ? T("Noch keine Folge dieser Route. Starte oben die erste.") : T("Alles, was geschrieben ist, ist schon vertont."))); return; }
  list.forEach((f) => { const it = el("div", "item"); it.appendChild(karte("folge", f)); const a = el("div", "acts2");
    if (f.audio_status === "fertig") { a.appendChild(el("span", "badge pod", T("🎧 Im Podcast"))); const pb = el("button", "mk", T("▶︎ Abspielen")); pb.onclick = () => oeffneLeser("folge", f, true); a.appendChild(pb); }
    else a.appendChild(el("span", "badge " + (f.audio_status === "fehler" ? "none" : "wait"), f.audio_status === "fehler" ? T("⚠️ Vertonung fehlgeschlagen, Text lesbar") : T("⏳ Wird gerade vertont")));
    it.appendChild(a); box.appendChild(it); });
}

/* ---------- Aufträge ---------- */
async function auftrag(p, m, b, ok) {
  if (b) b.disabled = true; m.textContent = T("Starte …");
  const { error } = await sb.rpc("auftrag_anlegen", { p });
  if (b) b.disabled = false;
  if (error) { m.textContent = meldung(error); return false; }
  m.textContent = ok; await kontoLaden(); neuLaden(); return true;
}
$("fire").onclick = () => auftrag({ art: "folge", route_id: cur }, $("firemsg"), $("fire"), T("Gestartet. In etwa zehn Minuten ist die Folge hier und im Podcast."));
function themaKnopf(t, msg) {
  const lbl = () => (t.behandelt_anzahl > 0 ? T("↻ Neue Folge") : T("▶︎ Als Folge"));
  const pb = el("button", "mk", lbl());
  pb.onclick = () => {
    if (pb.dataset.arm !== "1") { pb.dataset.arm = "1"; pb.textContent = T("Tippen zum Bestätigen"); setTimeout(() => { if (pb.dataset.arm === "1") { pb.dataset.arm = ""; pb.textContent = lbl(); } }, 5000); return; }
    pb.dataset.arm = ""; pb.textContent = lbl();
    auftrag({ art: "folge", thema_id: t.id, neuer_blickwinkel: t.behandelt_anzahl > 0 }, msg, pb, T("Gestartet. In etwa zehn Minuten ist die Folge hier und im Podcast."));
  };
  return pb;
}

/* ---------- Themen ---------- */
function gruppen() {
  const ts = themen.filter((t) => t.route_id === cur), out = [];
  const w = ts.filter((t) => t.stufe === 0); if (w.length) out.push({ lvl: T("Eigene Themen"), name: T("Deine Wunschthemen"), list: w });
  [1, 2, 3].forEach((s) => { const l = ts.filter((t) => t.stufe === s); if (!l.length) return; out.push({ lvl: T("Stufe ") + s, name: l[0].stufen_name || T("Stufe ") + s, list: l }); });
  return out;
}
function renderTopics() {
  const box = $("phases"); box.textContent = "";
  if (!routen.length) { box.appendChild(el("p", "empty", T("Noch keine Lernroute. Lass dir unter „Mehr“ eine vorschlagen."))); return; }
  const wrap = el("div"); wrap.style.cssText = "display:flex;flex-direction:column;gap:24px"; box.appendChild(wrap);
  gruppen().forEach((g) => {
    const ph = el("div", "phase"); const hd = el("div"); hd.appendChild(el("div", "phase-h")).appendChild(el("span", "lvl", g.lvl));
    const h = el("div", "phase-h"); h.append(el("h3", null, g.name), el("span", "cnt", g.list.filter((t) => t.status === "verstanden").length + " / " + g.list.length)); hd.appendChild(h); ph.appendChild(hd);
    const card = el("div", "list"); ph.appendChild(card);
    g.list.forEach((t) => {
      const row = el("div", "topic"); const s0 = t.status;
      const st = el("div", "st" + (s0 === "verstanden" ? " v" : s0 === "unsicher" ? " u" : t.behandelt_anzahl > 0 ? " c" : ""), s0 === "verstanden" ? "✓" : s0 === "unsicher" ? "?" : ""); st.setAttribute("aria-hidden", "true"); row.appendChild(st);
      const tt = el("div", "ttl"); tt.append(el("strong", null, t.titel), el("span", "code", t.code));
      tt.appendChild(el("span", "sub", t.behandelt_anzahl > 0 ? T("Gehört am ") + fmt(t.zuletzt_behandelt) + (t.behandelt_anzahl > 1 ? " · " + t.behandelt_anzahl + "×" : "") : t.beschreibung || T("Noch nicht dran gewesen")));
      row.appendChild(tt);
      const acts = el("div", "acts"); const seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", T("Status für ") + t.titel);
      [["neu", "Offen"], ["unsicher", "Unsicher"], ["verstanden", "Kann ich"]].forEach(([s, l]) => { const b = el("button", null, T(l)); b.dataset.s = s; b.setAttribute("aria-pressed", String(s0 === s));
        b.onclick = async () => { const { error } = await sb.from("themen").update({ status: s, status_am: new Date().toISOString() }).eq("id", t.id); if (error) showErr(meldung(error)); else { t.status = s; renderAlles(); } }; seg.appendChild(b); });
      const msg = el("span", "hint"); msg.setAttribute("role", "status");
      acts.append(seg, themaKnopf(t, msg)); row.append(acts, msg); card.appendChild(row);
    });
    wrap.appendChild(ph);
  });
}
function renderChips() {
  const box = $("rchips"); box.textContent = "";
  routen.forEach((r) => { const b = el("button", "rchip" + (r.aktiv ? "" : " paused"), r.titel); b.setAttribute("aria-pressed", String(r.id === cur)); b.onclick = () => { cur = r.id; merk.set("lr-route", r.id); renderAlles(); }; box.appendChild(b); });
}

/* ---------- Fragen und Wunschthemen ---------- */
function renderQs() {
  const ul = $("qlist"); ul.textContent = ""; ul.hidden = !fragen.length;
  fragen.forEach((q) => { const li = el("li", "q"); const m = el("div", "meta"); m.appendChild(el("span", null, fmt(q.erstellt_am)));
    m.appendChild(el("span", "pill " + (q.status === "beantwortet" ? "done" : "open"), q.status === "beantwortet" ? T("beantwortet") : T("offen")));
    const del = el("button", "linkbtn", T("entfernen")); del.onclick = async () => { const { error } = await sb.from("fragen").delete().eq("id", q.id); if (error) showErr(meldung(error)); else neuLaden(); }; m.appendChild(del);
    li.append(m, el("div", null, q.text)); if (q.antwort) li.appendChild(el("div", "ans", q.antwort)); ul.appendChild(li); });
  const sel = $("wroute"), war = sel.value; sel.textContent = "";
  routen.forEach((r) => { const o = el("option", null, r.titel); o.value = r.id; sel.appendChild(o); });
  sel.value = war && routeById(war) ? war : cur || "";
}
$("qsend").onclick = async () => {
  const t = $("qtext").value.trim(), m = $("qmsg"); if (!t) { m.textContent = T("Schreib zuerst deine Frage."); return; }
  $("qsend").disabled = true; const { error } = await sb.from("fragen").insert({ text: t }); $("qsend").disabled = false;
  if (error) { m.textContent = meldung(error); return; }
  $("qtext").value = ""; m.textContent = T("Gespeichert. Dein Coach greift sie in der nächsten Folge auf."); neuLaden();
};
async function wunsch(jetzt) {
  const t = $("wtitle").value.trim(), m = $("wmsg"), r = $("wroute").value;
  if (!r) { m.textContent = T("Lege zuerst eine Lernroute an."); return; }
  if (!t) { m.textContent = T("Gib zuerst ein Thema oder einen Begriff ein."); $("wtitle").focus(); return; }
  const { data: id, error } = await sb.rpc("wunschthema_anlegen", { p_route: r, p_titel: t, p_beschreibung: $("wnote").value.trim() });
  if (error) { m.textContent = meldung(error); return; }
  $("wtitle").value = ""; $("wnote").value = "";
  if (jetzt) await auftrag({ art: "folge", thema_id: id }, m, $("wnow"), T("Gestartet. In etwa zehn Minuten ist die Folge hier und im Podcast."));
  else { m.textContent = T("Vorgemerkt. Es kommt in der nächsten Folge dran."); neuLaden(); }
}
$("wnow").onclick = () => wunsch(true);
$("wsave").onclick = () => wunsch(false);

/* ---------- Radar und Folgen-Karten ---------- */
function karte(art, item) {
  const b = el("button", "scard" + (art === "radar" ? " radar" : ""));
  const ic = el("span", "ic", art === "radar" ? "◎" : "🎧"); ic.setAttribute("aria-hidden", "true"); b.appendChild(ic);
  b.appendChild(el("span", "meta", art === "radar" ? T("KW ") + item.woche + " · " + fmt(item.erstellt_am) : fmt(item.erstellt_am) + " · " + (item.thema_code || "") + (item.wiederholung ? T(" · Wiederholung") : "")));
  b.appendChild(el("span", "t", item.titel));
  if (art === "folge" && item.uebung) b.appendChild(el("span", item.uebung_erledigt ? "done" : "todo", item.uebung_erledigt ? T("✓ Mini-Übung erledigt") : T("Mini-Übung offen")));
  const ch = el("span", "chev", "›"); ch.setAttribute("aria-hidden", "true"); b.appendChild(ch);
  b.onclick = () => oeffneLeser(art, item, false); return b;
}
function renderRadar() {
  const box = $("radar"); box.textContent = "";
  const r = radar.filter((x) => x.sprache === (konto.sprache_folgen || "de"));
  if (!r.length) { box.appendChild(el("p", "empty", T("Der erste Markt-Radar erscheint hier am Samstag."))); return; }
  const c = el("div", "cards"); r.forEach((x) => c.appendChild(karte("radar", x))); box.appendChild(c);
}

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
  const tab = art === "radar" ? "radar" : "folgen";
  const { data, error } = await sb.from(tab).select("*").eq("id", item.id).single();
  if (error) { showErr(meldung(error)); return; }
  const x = data;
  $("rmeta").textContent = art === "radar" ? T("Markt-Radar KW ") + x.woche : fmt(x.erstellt_am) + " · " + (x.thema_code || "");
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
  if (Array.isArray(x.quellen) && x.quellen.length) { q.appendChild(el("h3", "group-title", T("Quellen"))); const ul = el("ul");
    x.quellen.forEach((s) => { if (!/^https:\/\//.test(s.url || "")) return; const li = el("li"); const a = el("a", null, s.titel || s.url); a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer"; li.appendChild(a); ul.appendChild(li); }); q.appendChild(ul); }
  $("main").hidden = true; $("tabbar").hidden = true; $("reader").hidden = false; document.body.classList.add("reading"); window.scrollTo(0, 0);
}
function schliesseLeser() { try { $("raudio").pause(); } catch (e) { /* egal */ } $("reader").hidden = true; $("main").hidden = false; $("tabbar").hidden = false; document.body.classList.remove("reading"); }
$("rback").onclick = schliesseLeser; $("rback2").onclick = schliesseLeser;

/* ---------- Mehr: Routen, Vorschläge, Profil, Plan, Feeds, Konto ---------- */
function renderRoutes() {
  const box = $("rlist"); box.textContent = "";
  if (!routen.length) { box.appendChild(el("p", "empty", T("Noch keine Lernroute."))); return; }
  routen.forEach((r) => {
    const row = el("div", "rrow"); const nm = el("button", "nm"); nm.style.cssText = "text-align:left;color:var(--ink)"; nm.onclick = () => openRoute(r.id);
    const ts = themen.filter((t) => t.route_id === r.id); nm.appendChild(el("strong", null, r.titel));
    nm.appendChild(el("small", null, ts.filter((t) => t.status === "verstanden").length + T(" von ") + ts.length + T(" verstanden") + (r.aktiv ? "" : T(" · pausiert")))); row.appendChild(nm);
    const p = el("button", "linkbtn", r.aktiv ? T("pausieren") : T("fortsetzen"));
    p.onclick = async () => { const { error } = await sb.from("routen").update({ aktiv: !r.aktiv }).eq("id", r.id); if (error) showErr(meldung(error)); else neuLaden(); };
    const d = el("button", "linkbtn", T("löschen"));
    d.onclick = async () => { if (d.dataset.arm !== "1") { d.dataset.arm = "1"; d.textContent = T("Wirklich löschen?"); setTimeout(() => { d.dataset.arm = ""; d.textContent = T("löschen"); }, 5000); return; }
      const { error } = await sb.from("routen").delete().eq("id", r.id); if (error) showErr(meldung(error)); else neuLaden(); };
    row.append(p, d); box.appendChild(row);
  });
}
function renderVorschlaege() {
  const box = $("vorschlaege"); box.textContent = "";
  auftraege.filter((a) => ["route", "ideen"].includes(a.art) && ["wartet", "in_arbeit", "fertig", "abgelehnt", "fehler"].includes(a.status)).slice(0, 3).forEach((a) => {
    const k = el("div", "prev");
    if (offen(a)) { const z = el("div", "lauf"); z.style.padding = "0"; z.append(el("span", "spinner"), el("span", null, a.art === "route" ? T("Claude erstellt deine Lernroute. Das dauert etwa eine Minute …") : T("Claude sammelt Ideen …"))); k.appendChild(z); box.appendChild(k); return; }
    if (a.status !== "fertig") { if (Date.now() - new Date(a.erstellt_am) < 864e5) { k.appendChild(el("p", "hint", a.fehler || T("Das hat nicht geklappt. Versuch es noch einmal."))); box.appendChild(k); } return; }
    const e = a.ergebnis || {};
    if (a.art === "ideen") {
      k.appendChild(el("div", "stg", T("Ideen für dich"))); const s = el("div", "sugg");
      (e.ideen || []).forEach((x) => { const b = el("button"); b.appendChild(document.createTextNode(x.thema)); b.appendChild(el("small", null, x.warum)); b.onclick = () => { $("ntopic").value = x.thema; $("ntopic").focus(); }; s.appendChild(b); });
      const weg = el("button", "btn ghost", T("Ausblenden")); weg.onclick = () => sb.rpc("auftrag_verwerfen", { p_auftrag: a.id }).then(neuLaden);
      k.append(s, weg); box.appendChild(k); return;
    }
    k.append(el("h3", null, e.title || ""), el("p", "hint", e.why || ""));
    (e.stages || []).forEach((st, i) => { k.appendChild(el("div", "stg", T("Stufe ") + (i + 1) + " · " + (st.name || ""))); const ol = el("ol");
      (st.topics || []).forEach((t) => { const li = el("li"); li.appendChild(el("strong", null, t.title)); if (t.desc) li.appendChild(document.createTextNode(": " + t.desc)); ol.appendChild(li); }); k.appendChild(ol); });
    const row = el("div", "row"); const ok = el("button", "btn primary", T("Übernehmen")); const no = el("button", "btn", T("Verwerfen")); const msg = el("span", "hint");
    ok.onclick = async () => { ok.disabled = true; const { data: id, error } = await sb.rpc("route_uebernehmen", { p_auftrag: a.id }); if (error) { msg.textContent = meldung(error); ok.disabled = false; return; } await ladeAlles(); openRoute(id); };
    no.onclick = () => sb.rpc("auftrag_verwerfen", { p_auftrag: a.id }).then(neuLaden);
    row.append(ok, no); k.append(row, msg); box.appendChild(k);
  });
}
$("ngen").onclick = async () => {
  const thema = $("ntopic").value.trim(); if (!thema) { $("nmsg").textContent = T("Gib zuerst ein Themengebiet ein."); $("ntopic").focus(); return; }
  if (await auftrag({ art: "route", thema, ziel: $("ngoal").value.trim() }, $("nmsg"), $("ngen"), T("Claude erstellt deine Lernroute. Das dauert etwa eine Minute …"))) { $("ntopic").value = ""; $("ngoal").value = ""; }
};
$("nsugg").onclick = () => auftrag({ art: "ideen" }, $("nmsg"), $("nsugg"), T("Claude sammelt Ideen …"));
$("psave").onclick = async () => { const { data, error } = await sb.rpc("einstellungen_setzen", { p: { profil_text: $("ptext").value.trim() } }); if (error) { $("pmsg").textContent = meldung(error); return; } konto = data; $("pmsg").textContent = T("Gespeichert."); };
const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
function renderPlan() {
  $("sec-plan").hidden = !funktionAn("automatik");
  const box = $("plantage"); box.textContent = ""; const tage = konto.plan_tage || [];
  TAGE.forEach((n, i) => { const b = el("button", null, T(n)); b.setAttribute("aria-pressed", String(tage.includes(i + 1)));
    b.onclick = async () => { const neu = tage.includes(i + 1) ? tage.filter((x) => x !== i + 1) : [...tage, i + 1]; await einstellung({ plan_tage: neu }, $("planmsg")); }; box.appendChild(b); });
  const s = $("planstunde"); if (!s.options.length) for (let h = 5; h <= 21; h++) { const o = el("option", null, String(h).padStart(2, "0") + ":00"); o.value = h; s.appendChild(o); }
  s.value = konto.plan_stunde; s.onchange = () => einstellung({ plan_stunde: Number(s.value), plan_zeitzone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin" }, $("planmsg"));
}
async function einstellung(p, m) { const { data, error } = await sb.rpc("einstellungen_setzen", { p }); if (error) { m.textContent = meldung(error); return; } konto = data; m.textContent = T("Gespeichert."); renderAlles(); }
function renderFeeds() {
  $("sec-feeds").hidden = !konto.feed_token; if (!konto.feed_token) return;
  const box = $("feeds"); box.textContent = "";
  [...routen.map((r) => [r.titel, feedUrl(r.id)]), [T("Markt-Radar"), feedBasis() + "/radar.xml"]].forEach(([titel, u]) => {
    const f = el("div", "feed"); f.appendChild(el("strong", null, titel)); const row = el("div", "row");
    const a = el("a", "btn primary", T("Abonnieren")); a.href = "podcast://" + u.replace(/^https:\/\//, ""); a.target = "_blank"; a.rel = "noopener";
    const c = el("button", "btn", T("Adresse kopieren")); c.onclick = () => navigator.clipboard.writeText(u).then(() => (c.textContent = "✓"), () => {});
    row.append(a, c); f.appendChild(row); box.appendChild(f); });
}
$("podcopy").onclick = () => navigator.clipboard.writeText($("podurl").textContent).then(() => ($("podmsg").textContent = T("Kopiert. Jetzt in der Podcast-App unter Mediathek › … › Sendung per URL folgen einfügen.")), () => ($("podmsg").textContent = T("Kopieren ging nicht. Halte den Finger auf die Adresse.")));
$("feederneuern").onclick = async () => { if (!confirm(T("Alle bisherigen Feed-Adressen hören auf zu funktionieren. Fortfahren?"))) return; const { data, error } = await sb.rpc("feed_erneuern"); if (error) { $("feedmsg").textContent = meldung(error); return; } konto = data; $("feedmsg").textContent = T("Neue Adressen erzeugt. Abonniere die Sendungen neu."); renderAlles(); };
$("kontoweg").onclick = async () => {
  if (!confirm(T("Dein Konto, alle Lernrouten, Folgen und Audiodateien werden endgültig gelöscht. Das lässt sich nicht rückgängig machen. Fortfahren?"))) return;
  const { error } = await sb.rpc("konto_loeschen"); if (error) { $("kontomsg").textContent = meldung(error); return; }
  merk.weg("lr-view"); await sb.auth.signOut(); location.reload();
};
function renderKonto() {
  $("kontingent").textContent = T("Folgen diesen Monat: ") + konto.verbraucht + " / " + konto.kontingent;
  $("kontomail").textContent = nutzer ? nutzer.email : ""; $("adminlink").hidden = konto.rolle !== "admin";
  if (document.activeElement !== $("ptext")) $("ptext").value = konto.profil_text || "";
}

/* ---------- Sprache ---------- */
function langButtons(box, val, onPick) { box.textContent = ""; LANGS.forEach((l) => { const b = el("button", null, LNAME[l]); b.setAttribute("aria-pressed", String(l === val)); b.onclick = () => onPick(l); box.appendChild(b); }); }
function renderLang() { langButtons($("uiseg"), uiLang, (l) => setLang({ sprache_ui: l })); langButtons($("podseg"), konto ? konto.sprache_folgen : uiLang, (l) => setLang({ sprache_folgen: l }));
  $("langbtn").textContent = "🌐 " + LNAME[uiLang]; $("langbtn2").textContent = "🌐 " + LNAME[uiLang] + " · 🎧 " + LNAME[konto ? konto.sprache_folgen : uiLang]; }
async function setLang(p) {
  if (p.sprache_ui) { uiLang = p.sprache_ui; merk.set("lr-lang", uiLang); statisch(); }
  if (!konto) { renderLang(); return; }
  const { data, error } = await sb.rpc("einstellungen_setzen", { p }); if (error) { $("langmsg").textContent = meldung(error); return; }
  konto = data; $("langmsg").textContent = T("Gespeichert. Neue Folgen kommen auf ") + LNAME[konto.sprache_folgen] + "."; renderAlles();
}
function openLang() { $("langmsg").textContent = ""; renderLang(); $("langsheet").hidden = false; }
function closeLang() { $("langsheet").hidden = true; merk.set("lr-lang-gefragt", "1"); }
$("langbtn").onclick = openLang; $("langbtn2").onclick = openLang; $("langdone").onclick = closeLang;
$("langsheet").addEventListener("click", (e) => { if (e.target === $("langsheet")) closeLang(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("langsheet").hidden) closeLang(); });

/* ---------- Alles zeichnen ---------- */
function renderAlles() {
  if (!konto) return;
  setGreeting(); renderLang(); renderHome(); renderChips(); renderTopics(); renderQs(); renderRadar(); renderRoutes(); renderVorschlaege(); renderPlan(); renderFeeds(); renderKonto();
  if (viewRoute) renderRouteView();
}

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
  showTab(merk.get("lr-tab") || "heute"); renderAlles(); showErr("");
  if (!merk.get("lr-lang-gefragt")) setTimeout(openLang, 500);
}
(async () => {
  try { TX = await fetch("texte.json").then((r) => r.json()); } catch (e) { TX = {}; }
  sammleStatisch(); statisch(); renderLang();
  sb.auth.onAuthStateChange((evt) => { if (["SIGNED_IN", "SIGNED_OUT"].includes(evt)) setTimeout(start, 0); });
  await start();
})();
