/* Lernroute – Admin-Bereich
 * Zugang: Rolle "admin" UND zweiter Faktor (TOTP, aal2). Beides prüft die Datenbank in jeder Admin-Funktion (admin_pruefen()).
 * Diese Seite ist nur die Oberfläche: ohne aal2 liefert der Server keine Daten. Lerninhalte der Konten sind hier nicht abrufbar.
 */
"use strict";
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, text) { const b = el("button", "btn sm " + (cls || ""), text); b.type = "button"; return b; }
const fehler = (m) => { $("err").textContent = m || ""; $("err").hidden = !m; };
const meldung = (e) => (e && (e.message || e.error_description)) || "?";
const zahl = (n) => (n == null ? "–" : Number(n).toLocaleString("de-DE"));
const datum = (d) => (d && !isNaN(new Date(d)) ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–");
const zeit = (d) => (d ? new Date(d).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–");
function leer(t, text, spalten) { const r = el("tr"); const c = el("td", "hint", text); c.colSpan = spalten; r.appendChild(c); t.appendChild(r); }
function kopf(t, namen, num = []) { const r = el("tr"); namen.forEach((x, i) => r.appendChild(el("th", num.includes(i) ? "num" : null, x))); t.appendChild(r); }
function hinweis(text) { const h = el("div", "toast", text); document.body.appendChild(h); setTimeout(() => h.remove(), 2200); }

const CFG = window.LR_CONFIG || {};
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
const ANSICHTEN = ["s-login", "s-mfa", "s-nein", "s-admin"];
const zeige = (id) => ANSICHTEN.forEach((x) => ($(x).hidden = x !== id));
let faktor = null;

/* ---------- Anmeldung ---------- */
$("f-pw").onsubmit = async (e) => {
  e.preventDefault(); $("login-msg").textContent = "…";
  const { error } = await sb.auth.signInWithPassword({ email: $("pw-mail").value.trim(), password: $("pw").value });
  if (error) $("login-msg").textContent = "E-Mail oder Passwort stimmt nicht."; else { $("login-msg").textContent = ""; start(); }
};
$("logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };

/* ---------- Zweiter Faktor (TOTP) ---------- */
async function mfa() {
  zeige("s-mfa");
  const { data, error } = await sb.auth.mfa.listFactors(); if (error) { fehler(meldung(error)); return; }
  const fertig = (data.totp || []).find((f) => f.status === "verified");
  if (fertig) { faktor = fertig.id; $("mfa-enroll").hidden = true; $("mfa-lead").hidden = false; return; }
  for (const f of data.all || []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
  const r = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Lernroute Admin" });
  if (r.error) { fehler(meldung(r.error)); return; }
  faktor = r.data.id; $("mfa-enroll").hidden = false; $("mfa-lead").hidden = true;
  const img = el("img"); img.alt = "QR-Code für die Authenticator-App"; img.src = r.data.totp.qr_code; $("qr").replaceChildren(img);
  $("secret").textContent = r.data.totp.secret;
}
$("f-mfa").onsubmit = async (e) => {
  e.preventDefault(); $("mfa-msg").textContent = "Prüfe …";
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: faktor, code: $("totp").value.trim() });
  if (error) { $("mfa-msg").textContent = "Der Code stimmt nicht. Achte auf die Uhrzeit deines Geräts."; return; }
  $("mfa-msg").textContent = ""; start();
};

/* ---------- Übersicht ---------- */
const KACHELN = [
  ["konten", "Konten", (u) => zahl(u.konten_aktiviert) + " freigeschaltet"],
  ["konten_neu_30", "Neu in 30 Tagen", (u) => zahl(u.konten_neu_7) + " in 7 Tagen"],
  ["konten_aktiv_30", "Aktiv in 30 Tagen", () => "mit Auftrag"],
  ["routen", "Lernrouten", (u) => zahl(u.themen) + " Themen"],
  ["themen_verstanden", "Themen verstanden", () => "alle Konten"],
  ["folgen", "Folgen gesamt", (u) => zahl(u.folgen_monat) + " diesen Monat"],
  ["folgen_7", "Folgen 7 Tage", (u) => zahl(u.folgen_automatik_monat) + " automatisch im Monat"],
  ["radar", "Markt-Radar", () => "Ausgaben"],
  ["minuten", "Minuten Audio", () => "gesamt"],
  ["zeichen_monat", "Zeichen diesen Monat", () => "≈ ElevenLabs-Verbrauch"],
  ["auftraege_offen", "In Arbeit", () => "Warteschlange"],
  ["auftraege_fehler_30", "Fehlgeschlagen", (u) => zahl(u.auftraege_abgelehnt_30) + " abgelehnt · 30 Tage"],
  ["konten_gesperrt", "Gesperrte Konten", () => ""],
];
function kacheln(u) {
  const box = $("tiles"); box.textContent = "";
  KACHELN.forEach(([k, l, sub]) => {
    const t = el("div", "tile" + (k === "auftraege_fehler_30" && u[k] > 0 ? " warn" : ""));
    t.append(el("b", null, zahl(u[k])), el("span", null, l)); const s = sub(u); if (s) t.appendChild(el("small", null, s)); box.appendChild(t);
  });
  $("stand").textContent = "Stand " + zeit(u.stand);
}
function balken(id, axId, reihe, feld, farbe, einheit) {
  const box = $(id), ax = $(axId); box.textContent = ""; ax.textContent = "";
  const max = Math.max(1, ...reihe.map((r) => r[feld]));
  box.setAttribute("aria-label", reihe.map((r) => r.monat + ": " + r[feld]).join(", "));
  reihe.forEach((r) => {
    const b = el("div", "bar"); b.tabIndex = 0; b.style.setProperty("--c", farbe);
    const i = el("i"); i.style.height = (r[feld] / max) * 100 + "%"; b.append(i, el("span", "tip", zahl(r[feld]) + " " + einheit + " · " + r.monat));
    box.appendChild(b);
    const [j, m] = r.monat.split("-"); ax.appendChild(el("span", null, new Date(+j, +m - 1, 1).toLocaleDateString("de-DE", { month: "short" })));
  });
}
async function uebersicht() {
  const { data, error } = await sb.rpc("admin_uebersicht"); if (error) { fehler(meldung(error)); return; }
  kacheln(data);
  const css = getComputedStyle(document.documentElement);
  balken("ch-folgen", "ax-folgen", data.pro_monat, "folgen", css.getPropertyValue("--tint").trim() || "#007AFF", "Folgen");
  balken("ch-konten", "ax-konten", data.pro_monat, "konten", css.getPropertyValue("--green-fill").trim() || "#34C759", "Konten");
  einladungen(data.einladungen);
}

/* ---------- Dienste und Kosten ---------- */
const mb = (b) => (b == null ? "–" : (b / 1048576).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " MB");
function dienstKarte(titel, gross, anteil, zeilen, link) {
  const k = el("div", "box"); k.appendChild(el("h3", null, titel));
  if (gross) k.appendChild(el("div", "gross", gross));
  if (anteil != null && isFinite(anteil)) {
    const l = el("div", "leiste" + (anteil >= 0.9 ? " voll" : anteil >= 0.7 ? " warn" : "")); const i = el("i"); i.style.width = Math.min(100, Math.round(anteil * 100)) + "%";
    l.appendChild(i); l.setAttribute("role", "img"); l.setAttribute("aria-label", Math.round(anteil * 100) + " % verbraucht"); k.appendChild(l);
  }
  zeilen.filter(Boolean).forEach((z) => k.appendChild(el("div", "hint", z)));
  if (link) { const a = el("a", null, link[0]); a.href = link[1]; a.target = "_blank"; a.rel = "noopener noreferrer"; k.appendChild(a); }
  return k;
}
async function dienste() {
  const { data: d, error } = await sb.rpc("admin_dienste"); if (error) { $("dienste").textContent = meldung(error); return; }
  const box = $("dienste"); box.textContent = ""; const m = d.monat || {};
  const ant = Object.entries(m).filter(([k]) => k.startsWith("anthropic:")), el11 = Object.entries(m).filter(([k]) => k.startsWith("elevenlabs:"));
  const sum = (l, f) => l.reduce((a, [, v]) => a + Number(v[f] || 0), 0);
  box.appendChild(dienstKarte("Anthropic (Texte, Recherche, Prüfung)", zahl(sum(ant, "input") + sum(ant, "output")) + " Tokens", null,
    [...ant.map(([k, v]) => k.split(":")[1] + ": " + zahl(v.input) + " ein / " + zahl(v.output) + " aus · " + zahl(v.aufrufe) + " Aufrufe"), "Diesen Monat. Guthaben und Limits nur in der Anthropic Console."],
    ["Guthaben und Limits", "https://console.anthropic.com/settings/billing"]));
  box.appendChild(dienstKarte("ElevenLabs (Stimmen)", zahl(sum(el11, "zeichen")) + " Zeichen", null,
    ["Diesen Monat, " + zahl(sum(el11, "aufrufe")) + " Vertonungen", "Tarif und Restguthaben im ElevenLabs-Konto."], ["Tarif und Guthaben", "https://elevenlabs.io/app/subscription"]));
  box.appendChild(dienstKarte("Supabase (Speicher)", mb(d.speicher_bytes) + " von 1.024 MB", (d.speicher_bytes || 0) / (1024 * 1048576),
    [zahl(d.audiodateien) + " Audiodateien", "Grenze des kostenlosen Tarifs"], null));
  box.appendChild(dienstKarte("Folgen (Kostenschutz)", zahl(d.folgen_heute) + " von " + zahl(d.folgen_tag_grenze) + " in 24 Stunden", d.folgen_heute / d.folgen_tag_grenze,
    ["Über dieser Grenze nimmt die Datenbank keine neuen Folgen-Aufträge an (alle Konten zusammen)."], null));
  $("dienste-stand").textContent = "Stand " + zeit(d.stand);
}

/* ---------- Warteschlange ---------- */
const ARTEN = { folge: "Folge", route: "Lernroute", ideen: "Ideen" };
const STATUS = { wartet: ["neu", "wartet"], in_arbeit: ["neu", "in Arbeit"], fehler: ["aus", "Fehler"] };
async function warteschlange() {
  const { data, error } = await sb.rpc("admin_warteschlange"); if (error) { fehler(meldung(error)); return; }
  const t = $("warteschlange"); t.textContent = "";
  if (!data.length) { leer(t, "Nichts in Arbeit, keine Fehler. 🎉", 1); return; }
  kopf(t, ["Erstellt", "Konto", "Art", "Status", "Versuche", "Fehler", ""], [4]);
  data.forEach((a) => {
    const r = el("tr"); const st = el("td"); const s = STATUS[a.status] || ["neu", a.status]; st.appendChild(el("span", "st " + s[0], s[1]));
    const akt = el("td");
    if (a.status === "fehler") { const b = btn("", "Wiederholen"); b.onclick = async () => { const { error: e } = await sb.rpc("admin_auftrag_wiederholen", { p_id: a.id }); if (e) fehler(meldung(e)); else { hinweis("Wieder eingereiht ✓"); warteschlange(); protokoll(); } }; akt.appendChild(b); }
    r.append(el("td", null, zeit(a.erstellt_am)), el("td", null, a.email), el("td", null, (ARTEN[a.art] || a.art) + (a.quelle === "plan" ? " · automatisch" : "")), st, el("td", "num", a.versuche), el("td", "hint", a.fehler || ""), akt);
    t.appendChild(r);
  });
}

/* ---------- Fehlerprotokoll ---------- */
const QUELLEN = { web: "Web-App", app: "iPhone-App", admin: "Admin-Seite", fabrik: "Fabrik" };
$("fehler-alle").onchange = fehlerliste;
async function fehlerliste() {
  const { data, error } = await sb.rpc("admin_fehler", { p_alle: $("fehler-alle").checked }); if (error) { fehler(meldung(error)); return; }
  const t = $("fehlerliste"); t.textContent = "";
  if (!data.length) { leer(t, "Keine offenen Fehler. 🎉", 1); return; }
  kopf(t, ["Zuletzt", "Wo", "Fehler", "Anzahl", "Personen", "Version", ""], [3, 4]);
  data.forEach((f) => {
    const r = el("tr"); const m = el("td"); m.appendChild(el("div", null, f.meldung)); if (f.ort) m.appendChild(el("div", "hint", f.ort));
    if (f.stack) { const d = el("details"); d.append(el("summary", null, "Details"), el("pre", null, f.stack)); m.appendChild(d); }
    const akt = el("td"); if (!f.erledigt) { const b = btn("ghost", "erledigt"); b.onclick = async () => { await sb.rpc("admin_fehler_erledigt", { p_id: f.id }); fehlerliste(); }; akt.appendChild(b); }
    r.append(el("td", null, datum(f.zuletzt_am)), el("td", null, QUELLEN[f.quelle] || f.quelle), m, el("td", "num", f.anzahl), el("td", "num", f.nutzer), el("td", "hint", f.version), akt);
    t.appendChild(r);
  });
}

/* ---------- Funktions-Schalter ---------- */
const STUFEN = { aus: "aus", admin: "nur Admin", auswahl: "ausgewählte Konten", alle: "alle" };
let KONTEN = [];
async function schalter() {
  const { data, error } = await sb.rpc("admin_funktionen"); if (error) { fehler(meldung(error)); return; }
  const box = $("schalter"); box.textContent = "";
  if (!data.length) box.appendChild(el("p", "hint", "Noch keine Schalter."));
  data.forEach((f) => {
    const w = el("div", "box"); const k = el("div", "row"); k.style.justifyContent = "space-between";
    k.append(el("strong", null, f.key), el("span", "st " + (f.stufe === "alle" ? "ok" : f.stufe === "aus" ? "aus" : "neu"), STUFEN[f.stufe] || f.stufe));
    w.appendChild(k); if (f.beschreibung) w.appendChild(el("p", "hint", f.beschreibung));
    const reihe = el("div", "row"); reihe.style.cssText = "flex-wrap:wrap;gap:8px";
    const wahl = el("select", "txt sm"); Object.entries(STUFEN).forEach(([key, v]) => { const o = el("option", null, v); o.value = key; o.selected = key === f.stufe; wahl.appendChild(o); });
    const auswahl = el("div"); auswahl.style.flexBasis = "100%";
    const zeigeAuswahl = () => { auswahl.textContent = ""; if (wahl.value !== "auswahl") return;
      KONTEN.forEach((x) => { const l = el("label", "row hint"); l.style.gap = "6px"; const c = el("input"); c.type = "checkbox"; c.value = x.id; c.checked = (f.konten || []).includes(x.id);
        l.append(c, document.createTextNode(x.email)); auswahl.appendChild(l); }); };
    wahl.onchange = zeigeAuswahl; zeigeAuswahl();
    const sp = btn("primary", "Speichern");
    sp.onclick = async () => {
      const konten = [...auswahl.querySelectorAll("input:checked")].map((c) => c.value);
      const { error: e } = await sb.rpc("admin_funktion_setzen", { p_key: f.key, p_stufe: wahl.value, p_konten: konten, p_beschreibung: null });
      if (e) fehler("Nicht gespeichert: " + meldung(e)); else { hinweis("Gespeichert ✓"); schalter(); protokoll(); }
    };
    reihe.append(wahl, sp, auswahl); w.appendChild(reihe); box.appendChild(w);
  });
}
$("f-schalter").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await sb.rpc("admin_funktion_setzen", { p_key: $("sw-key").value.trim(), p_stufe: "aus", p_konten: [], p_beschreibung: $("sw-text").value.trim() });
  if (error) { fehler("Nicht angelegt: " + meldung(error)); return; }
  $("sw-key").value = ""; $("sw-text").value = ""; hinweis("Schalter angelegt ✓"); schalter();
};

/* ---------- Konten (ohne Inhalte) ---------- */
let sucheTimer = null;
$("suche").oninput = () => { clearTimeout(sucheTimer); sucheTimer = setTimeout(konten, 300); };
async function konten() {
  const { data, error } = await sb.rpc("admin_konten", { p_suche: $("suche").value.trim() }); if (error) { fehler(meldung(error)); return; }
  if (!$("suche").value.trim()) KONTEN = data;
  const t = $("konten"); t.textContent = "";
  if (!data.length) { leer(t, "Keine Konten gefunden.", 1); return; }
  kopf(t, ["E-Mail", "Status", "Folgen/Monat", "Diesen Monat", "Routen", "Folgen", "Sprache", "Zuletzt aktiv", ""], [2, 3, 4, 5]);
  data.forEach((k) => {
    const r = el("tr"); const st = el("td");
    const s = k.gesperrt ? ["aus", "gesperrt"] : !k.aktiviert ? ["neu", "ohne Code"] : !k.eingewilligt ? ["neu", "ohne Zustimmung"] : ["ok", k.rolle === "admin" ? "Admin" : "aktiv"];
    st.appendChild(el("span", "st " + s[0], s[1])); if (k.gesperrt && k.gesperrt_grund) st.appendChild(el("div", "hint", k.gesperrt_grund));
    const kt = el("td", "num"); const inp = el("input", "txt sm"); inp.type = "number"; inp.inputMode = "numeric"; inp.min = 0; inp.max = 1000; inp.value = k.kontingent; kt.appendChild(inp);
    const akt = el("td"); akt.style.whiteSpace = "nowrap";
    const sp = btn("", k.aktiviert ? "Speichern" : "Freischalten"); sp.onclick = () => setzen(k.id, { kontingent: +inp.value, aktiviert: true }); akt.appendChild(sp);
    if (k.rolle !== "admin") {
      const sperre = btn("ghost", k.gesperrt ? "Entsperren" : "Sperren");
      sperre.onclick = () => {
        if (k.gesperrt) return setzen(k.id, { gesperrt: false });
        const grund = prompt("Grund für die Sperre (sieht nur der Admin):", ""); if (grund === null) return;
        setzen(k.id, { gesperrt: true, grund });
      };
      akt.appendChild(sperre);
    }
    r.append(el("td", null, k.email), st, kt, el("td", "num", k.verbraucht + " / " + k.kontingent), el("td", "num", k.routen), el("td", "num", k.folgen), el("td", null, (k.sprache || "").toUpperCase()), el("td", null, datum(k.zuletzt_aktiv_am)), akt);
    t.appendChild(r);
  });
}
async function setzen(id, p) {
  const { error } = await sb.rpc("admin_konto_setzen", { p_id: id, p });
  if (error) fehler("Nicht gespeichert: " + meldung(error)); else { fehler(""); hinweis("Gespeichert ✓"); konten(); uebersicht(); protokoll(); }
}

/* ---------- Einladungen ---------- */
function einladungen(liste) {
  const t = $("einladungen"); t.textContent = "";
  if (!liste.length) { leer(t, "Noch keine Codes.", 1); return; }
  kopf(t, ["Code", "Notiz", "Folgen/Monat", "Eingelöst", "Gültig bis", ""], [2, 3]);
  liste.forEach((e) => {
    const r = el("tr"); const c = el("td"); c.appendChild(el("code", null, e.code));
    const ab = e.gueltig_bis && new Date(e.gueltig_bis) < new Date();
    const akt = el("td"); akt.style.whiteSpace = "nowrap";
    const kop = btn("ghost", "kopieren"); kop.onclick = () => navigator.clipboard.writeText(e.code).then(() => (kop.textContent = "✓"), () => {}); akt.appendChild(kop);
    const weg = btn("ghost", "löschen");
    weg.onclick = async () => { if (weg.dataset.arm !== "1") { weg.dataset.arm = "1"; weg.textContent = "wirklich?"; return; }
      const { error } = await sb.rpc("admin_einladung_loeschen", { p_code: e.code }); if (error) fehler(meldung(error)); else { uebersicht(); protokoll(); } };
    akt.appendChild(weg);
    r.append(c, el("td", null, e.notiz || ""), el("td", "num", e.kontingent), el("td", "num", e.nutzungen + " / " + e.max_nutzungen),
      el("td", ab ? "hint" : null, e.gueltig_bis ? datum(e.gueltig_bis) + (ab ? " (abgelaufen)" : "") : "unbegrenzt"), akt);
    t.appendChild(r);
  });
}
$("f-einl").onsubmit = async (e) => {
  e.preventDefault();
  const { data, error } = await sb.rpc("admin_einladung_anlegen", { p_kontingent: +$("e-kont").value, p_max: +$("e-max").value, p_tage: +$("e-tage").value, p_notiz: $("e-notiz").value.trim() });
  if (error) { $("einl-msg").textContent = "Nicht erstellt: " + meldung(error); return; }
  $("einl-msg").textContent = "";
  codeZeigen(data, +$("e-kont").value, $("e-notiz").value.trim());
  $("e-notiz").value = ""; uebersicht(); protokoll();
};
const APP_URL = new URL("./", location.href).href;
const einladungsText = (code, kontingent) => "Hallo! Magst du die Lernroute testen? Ein persönlicher Lern-Coach, jede Folge auch als Podcast.\n\n"
  + "1. Öffnen: " + APP_URL + "\n2. „Neues Konto anlegen“ (E-Mail und Passwort, mindestens 10 Zeichen)\n3. Einladungscode eingeben: " + code + "\n4. Bedingungen bestätigen\n\n"
  + "Du hast " + kontingent + " Folgen pro Monat. Es ist eine Testversion; die Inhalte sind KI-generiert. Bitte gib keine vertraulichen Firmendaten ein.";
async function kopiere(text, ok) {
  try { await navigator.clipboard.writeText(text); $("cd-msg").textContent = ok; }
  catch (e) { const r = document.createRange(); r.selectNodeContents($("cd-code")); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); $("cd-msg").textContent = "Kopieren nicht möglich – der Code ist markiert."; }
}
function codeZeigen(code, kontingent, notiz) {
  const d = $("code-dialog");
  $("cd-code").textContent = code;
  $("cd-info").textContent = (notiz ? "Für " + notiz + ": " : "") + kontingent + " Folgen pro Monat. Schick den Code zusammen mit dem Link.";
  $("cd-msg").textContent = "";
  $("cd-kopieren").onclick = () => kopiere(code, "Code kopiert ✓");
  $("cd-einladung").onclick = () => kopiere(einladungsText(code, kontingent), "Einladung mit Link und Code kopiert ✓");
  $("cd-teilen").hidden = !navigator.share;
  $("cd-teilen").onclick = () => navigator.share({ text: einladungsText(code, kontingent) }).catch(() => {});
  $("cd-zu").onclick = () => d.close();
  if (d.showModal) d.showModal(); else alert("Code erstellt: " + code);
}

/* ---------- Protokoll ---------- */
const AKTIONEN = { konto_geaendert: "Konto geändert", einladung_angelegt: "Einladung angelegt", einladung_geloescht: "Einladung gelöscht", funktion_geschaltet: "Schalter geändert", auftrag_wiederholt: "Auftrag wiederholt" };
async function protokoll() {
  const { data, error } = await sb.rpc("admin_protokoll_lesen"); if (error) return;
  const t = $("protokoll"); t.textContent = "";
  if (!data.length) { leer(t, "Noch keine Einträge.", 1); return; }
  kopf(t, ["Zeit", "Admin", "Aktion", "Ziel", "Details"]);
  data.slice(0, 100).forEach((p) => { const r = el("tr"); r.append(el("td", null, zeit(p.zeit)), el("td", null, p.admin || "–"), el("td", null, AKTIONEN[p.aktion] || p.aktion), el("td", "hint", p.ziel || ""), el("td", "hint", JSON.stringify(p.details || {}))); t.appendChild(r); });
}

/* Fehler der Admin-Seite selbst melden */
window.addEventListener("error", (e) => sb.rpc("fehler_melden", { p: { quelle: "admin", version: window.LR_VERSION || "dev", meldung: String(e.message).slice(0, 500), ort: (e.filename || "").split("/").pop() + ":" + e.lineno } }).then(() => {}, () => {}));

async function start() {
  fehler("");
  const { data } = await sb.auth.getSession();
  if (!data.session) { $("logout").hidden = true; zeige("s-login"); return; }
  $("logout").hidden = false;
  const { data: konto } = await sb.rpc("mein_konto");
  if (!konto || konto.rolle !== "admin") { zeige("s-nein"); return; }
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.currentLevel !== "aal2") { await mfa(); return; }
  zeige("s-admin");
  await konten();
  await Promise.all([uebersicht(), dienste(), warteschlange(), fehlerliste(), schalter(), protokoll()]);
}
start();
