/* Hörspielwerkstatt – Admin-Bereich
 * Zugang: Rolle "admin" UND zweiter Faktor (TOTP). Beides prüft die Datenbank in jeder Admin-Funktion (ist_admin()).
 * Diese Seite ist nur die Oberfläche; ohne aal2 liefert der Server keine Daten.
 */
"use strict";
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, text) { const b = el("button", cls, text); b.type = "button"; return b; }
const fehler = (m) => { $("err").textContent = m || ""; $("err").hidden = !m; };
const meldung = (e) => (e && (e.message || e.error_description)) || "?";
const zahl = (n) => Number(n || 0).toLocaleString("de-DE");
const datum = (d) => (d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–");

const CFG = window.HW_CONFIG || {};
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
const ANSICHTEN = ["s-login", "s-mfa", "s-nein", "s-admin"];
const zeige = (id) => ANSICHTEN.forEach((x) => ($(x).hidden = x !== id));
let faktor = null;

/* ---------- Anmeldung ---------- */
$("f-mail").onsubmit = async (e) => {
  e.preventDefault(); $("login-msg").textContent = "Sende Code …";
  const { error } = await sb.auth.signInWithOtp({ email: $("mail").value.trim(), options: { shouldCreateUser: false } });
  if (error) { $("login-msg").textContent = meldung(error); return; }
  $("f-mail").hidden = true; $("f-code").hidden = false; $("login-msg").textContent = "Schau in dein Postfach.";
};
$("f-code").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.verifyOtp({ email: $("mail").value.trim(), token: $("code").value.trim(), type: "email" });
  if (error) $("login-msg").textContent = "Der Code stimmt nicht."; else start();
};
if (CFG.anmeldung === "passwort") { $("f-pw").hidden = false; $("f-mail").hidden = true; }
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
  if (fertig) { faktor = fertig.id; $("mfa-enroll").hidden = true; return; }
  // Halb eingerichtete Faktoren aufräumen, dann neu einrichten
  for (const f of data.all || []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
  const r = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Hörspielwerkstatt Admin" });
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
  ["familien", "Familien registriert", (u) => zahl(u.familien_aktiviert) + " freigeschaltet"],
  ["familien_neu_30", "Neu in 30 Tagen", (u) => zahl(u.familien_neu_7) + " in 7 Tagen"],
  ["familien_aktiv_30", "Aktiv in 30 Tagen", () => "mit Bestellung"],
  ["hoerspiele", "Hörspiele gesamt", (u) => zahl(u.hoerspiele_monat) + " diesen Monat"],
  ["hoerspiele_7", "Hörspiele 7 Tage", () => ""],
  ["fortsetzungen", "Fortsetzungen", () => "Teil 2 und mehr"],
  ["eigene_figuren", "Eigene Figuren", (u) => zahl(u.kinderprofile) + " Kinderprofile"],
  ["neu_vertonungen", "Neu-Vertonungen", () => ""],
  ["minuten", "Minuten Audio", () => "gesamt"],
  ["zeichen_monat", "Zeichen diesen Monat", () => "≈ ElevenLabs-Verbrauch"],
  ["auftraege_offen", "In Arbeit", () => "Warteschlange"],
  ["auftraege_fehler_30", "Fehlgeschlagen", (u) => zahl(u.auftraege_abgelehnt_30) + " abgelehnt · 30 Tage"],
  ["meldungen_offen", "Offene Meldungen", () => "bitte prüfen"],
  ["familien_gesperrt", "Gesperrte Konten", () => ""],
];
function kacheln(u) {
  const box = $("tiles"); box.textContent = "";
  KACHELN.forEach(([k, l, sub]) => {
    const t = el("div", "tile" + ((k === "meldungen_offen" || k === "auftraege_fehler_30") && u[k] > 0 ? " warn" : ""));
    t.append(el("b", null, zahl(u[k])), el("span", null, l)); const s = sub(u); if (s) t.appendChild(el("small", null, s)); box.appendChild(t);
  });
  $("stand").textContent = "Stand " + new Date(u.stand).toLocaleString("de-DE");
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
function tabelle(id, obj, namen) {
  const t = $(id); t.textContent = ""; const summe = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
  const kopf = el("tr"); kopf.append(el("th", null, ""), el("th", "num", "Anzahl"), el("th", "num", "Anteil")); t.appendChild(kopf);
  Object.entries(obj).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    const r = el("tr"); r.append(el("td", null, namen[k] || k), el("td", "num", zahl(n)), el("td", "num", Math.round((n / summe) * 100) + " %")); t.appendChild(r);
  });
  if (!Object.keys(obj).length) { const r = el("tr"); const c = el("td", "hint", "Noch keine Hörspiele"); c.colSpan = 3; r.appendChild(c); t.appendChild(r); }
}
const FIGUREN = { LOTTA: "Lotta", FINN: "Finn", PIP: "Pip", BRUNO: "Bruno", MIRA: "Mira", EIGENE: "Eigene Figuren" };
const SPRACHEN = { de: "Deutsch", en: "Englisch", es: "Spanisch", pt: "Portugiesisch" };
function einladungen(liste) {
  const t = $("einladungen"); t.textContent = "";
  const kopf = el("tr"); ["Code", "Notiz", "Hörspiele/Monat", "Genutzt", "Gültig bis"].forEach((x, i) => kopf.appendChild(el("th", i >= 2 && i < 4 ? "num" : null, x))); t.appendChild(kopf);
  liste.forEach((e) => {
    const r = el("tr"); const c = el("td"); const code = el("code", null, e.code); c.appendChild(code);
    const kopieren = btn("ghost", "kopieren"); kopieren.onclick = () => navigator.clipboard?.writeText(e.code).then(() => (kopieren.textContent = "✓")); c.appendChild(kopieren);
    const abgelaufen = e.gueltig_bis && new Date(e.gueltig_bis) < new Date();
    r.append(c, el("td", null, e.notiz || ""), el("td", "num", e.kontingent), el("td", "num", e.nutzungen + " / " + e.max_nutzungen), el("td", abgelaufen ? "hint" : null, e.gueltig_bis ? datum(e.gueltig_bis) + (abgelaufen ? " (abgelaufen)" : "") : "unbegrenzt"));
    t.appendChild(r);
  });
}

/* ---------- Familien ---------- */
let sucheTimer = null;
$("suche").oninput = () => { clearTimeout(sucheTimer); sucheTimer = setTimeout(familien, 300); };
async function familien() {
  const { data, error } = await sb.rpc("admin_familien", { p_suche: $("suche").value.trim() }); if (error) { fehler(meldung(error)); return; }
  const t = $("familien"); t.textContent = "";
  const kopf = el("tr"); ["E-Mail", "Seit", "Status", "Kontingent", "Monat", "Hörspiele", "Zuletzt aktiv", ""].forEach((x, i) => kopf.appendChild(el("th", [3, 4, 5].includes(i) ? "num" : null, x))); t.appendChild(kopf);
  data.forEach((f) => {
    const r = el("tr");
    const status = f.gesperrt ? ["aus", "gesperrt"] : !f.aktiviert ? ["neu", "ohne Code"] : !f.eingewilligt ? ["neu", "ohne Zustimmung"] : ["ok", f.rolle === "admin" ? "Admin" : "aktiv"];
    const st = el("td"); st.appendChild(el("span", "st " + status[0], status[1])); if (f.gesperrt && f.gesperrt_grund) st.appendChild(el("div", "hint", f.gesperrt_grund));
    const k = el("td", "num"); const inp = el("input"); inp.type = "number"; inp.min = 0; inp.max = 1000; inp.value = f.kontingent; k.appendChild(inp);
    const akt = el("td"); const speichern = btn("soft", "Speichern");
    speichern.onclick = () => setzen(f.id, { kontingent: +inp.value, aktiviert: f.aktiviert || +inp.value > 0 });
    const sperre = btn("ghost", f.gesperrt ? "Entsperren" : "Sperren");
    sperre.onclick = () => {
      if (f.gesperrt) return setzen(f.id, { gesperrt: false });
      const grund = prompt("Grund für die Sperre (sieht nur das Team):", ""); if (grund === null) return;
      setzen(f.id, { gesperrt: true, grund });
    };
    akt.append(speichern, sperre);
    r.append(el("td", null, f.email), el("td", null, datum(f.erstellt_am)), st, k, el("td", "num", f.verbraucht), el("td", "num", f.hoerspiele), el("td", null, datum(f.zuletzt_aktiv_am)), akt);
    t.appendChild(r);
  });
}
async function setzen(id, p) {
  const { error } = await sb.rpc("admin_familie_setzen", { p_id: id, p });
  if (error) fehler(meldung(error)); else { fehler(""); familien(); uebersicht(); protokoll(); }
}

/* ---------- Meldungen ---------- */
const GRUENDE = { unpassend: "Unpassend für Kinder", angst: "Macht Angst", falsch: "Inhaltlich falsch", technik: "Technisches Problem", sonstiges: "Etwas anderes" };
$("meld-alle").onchange = meldungen;
async function meldungen() {
  const { data, error } = await sb.rpc("admin_meldungen", { p_alle: $("meld-alle").checked }); if (error) { fehler(meldung(error)); return; }
  const box = $("meldungen"); box.textContent = "";
  if (!data.length) box.appendChild(el("p", "hint", "Keine offenen Meldungen."));
  data.forEach((m) => {
    const w = el("div", "meld");
    const kopf = el("div", "row"); kopf.append(el("strong", null, m.titel || "(Hörspiel gelöscht)"), el("span", "st " + (m.status === "offen" ? "aus" : "ok"), m.status === "offen" ? GRUENDE[m.grund] : "erledigt"));
    w.append(kopf, el("span", "hint", datum(m.erstellt_am) + " · " + m.email + (m.sprache ? " · " + (SPRACHEN[m.sprache] || m.sprache) : "") + (m.gesperrt ? " · Hörspiel gesperrt" : "")));
    if (m.text) w.appendChild(el("p", null, "„" + m.text + "“"));
    if (m.pruefung && m.pruefung.probleme && m.pruefung.probleme.length) w.appendChild(el("p", "hint", "Automatische Prüfung: " + m.pruefung.probleme.join("; ")));
    if (m.skript) { const d = el("details"); d.append(el("summary", null, "Skript ansehen"), el("pre", null, m.skript)); w.appendChild(d); }
    if (m.status === "offen") {
      const antwort = el("input"); antwort.placeholder = "Notiz (optional)"; antwort.maxLength = 1000;
      const ok = btn("soft", "Erledigt, Hörspiel bleibt"); const sperren = btn(null, "Hörspiel sperren und erledigen"); sperren.style.borderColor = "var(--berry)"; sperren.style.color = "var(--berry)";
      const fertig = async (sp) => { const { error: e } = await sb.rpc("admin_meldung_erledigen", { p_id: m.id, p_antwort: antwort.value.trim(), p_sperren: sp }); if (e) fehler(meldung(e)); else { meldungen(); uebersicht(); protokoll(); } };
      ok.onclick = () => fertig(false); sperren.onclick = () => fertig(true);
      const r = el("div", "row"); r.append(antwort, ok, sperren); w.appendChild(r);
    } else if (m.antwort) w.appendChild(el("p", "hint", "Notiz: " + m.antwort));
    box.appendChild(w);
  });
}

/* ---------- Einladungen anlegen, Protokoll ---------- */
$("f-einl").onsubmit = async (e) => {
  e.preventDefault();
  const { data, error } = await sb.rpc("admin_einladung_anlegen", { p_kontingent: +$("e-kont").value, p_max: +$("e-max").value, p_tage: +$("e-tage").value, p_notiz: $("e-notiz").value.trim() });
  if (error) { $("einl-msg").textContent = "Nicht erstellt: " + meldung(error); return; }
  $("einl-msg").textContent = "";
  codeZeigen(data, +$("e-kont").value, $("e-notiz").value.trim());
  $("e-notiz").value = ""; uebersicht(); protokoll();
};

/* Hinweisfenster: Code erstellt, direkt kopieren oder als fertige Einladung teilen */
const APP_URL = new URL("./", location.href).href;
function einladungsText(code) {
  return "Hallo! Magst du die Hörspielwerkstatt testen? Persönliche Mutmach-Hörspiele für dein Kind.\n\n"
    + "1. In Safari öffnen: " + APP_URL + "\n2. „Neues Konto anlegen“ (E-Mail und Passwort, mind. 8 Zeichen)\n"
    + "3. Einladungscode eingeben: " + code + "\n4. Bedingungen bestätigen\n\n"
    + "Du hast 5 Hörspiele pro Monat. Bitte hör jedes zuerst selbst an, bevor du es deinem Kind vorspielst – es ist eine Testversion.";
}
async function kopiere(text, ok) {
  try { await navigator.clipboard.writeText(text); $("cd-msg").textContent = ok; }
  catch (e) {   // ältere Browser: Text markieren, damit man ihn selbst kopieren kann
    const r = document.createRange(); r.selectNodeContents($("cd-code")); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    $("cd-msg").textContent = "Kopieren nicht möglich – der Code ist markiert, bitte lange drücken und „Kopieren“ wählen.";
  }
}
function codeZeigen(code, kontingent, notiz) {
  const d = $("code-dialog");
  $("cd-code").textContent = code;
  $("cd-info").textContent = (notiz ? "Für " + notiz + ": " : "") + kontingent + " Hörspiele pro Monat. Schick den Code zusammen mit dem Link.";
  $("cd-msg").textContent = "";
  $("cd-kopieren").onclick = () => kopiere(code, "Code kopiert ✓");
  $("cd-einladung").onclick = () => kopiere(einladungsText(code), "Einladung mit Link und Code kopiert ✓ – jetzt in WhatsApp einfügen.");
  $("cd-teilen").hidden = !navigator.share;
  $("cd-teilen").onclick = () => navigator.share({ text: einladungsText(code) }).catch(() => {});
  $("cd-zu").onclick = () => d.close();
  if (d.showModal) d.showModal(); else alert("Code erstellt: " + code);
}
const AKTIONEN = { konto_geaendert: "Konto geändert", einladung_angelegt: "Einladung angelegt", meldung_erledigt: "Meldung erledigt" };
async function protokoll() {
  const { data, error } = await sb.rpc("admin_protokoll_lesen"); if (error) return;
  const t = $("protokoll"); t.textContent = "";
  const kopf = el("tr"); ["Zeit", "Admin", "Aktion", "Details"].forEach((x) => kopf.appendChild(el("th", null, x))); t.appendChild(kopf);
  data.slice(0, 50).forEach((p) => { const r = el("tr"); r.append(el("td", null, new Date(p.zeit).toLocaleString("de-DE")), el("td", null, p.admin || "–"), el("td", null, AKTIONEN[p.aktion] || p.aktion), el("td", "hint", JSON.stringify(p.details))); t.appendChild(r); });
  if (!data.length) { const r = el("tr"); const c = el("td", "hint", "Noch keine Einträge"); c.colSpan = 4; r.appendChild(c); t.appendChild(r); }
}

async function uebersicht() {
  const { data, error } = await sb.rpc("admin_uebersicht"); if (error) { fehler(meldung(error)); return; }
  kacheln(data);
  const css = getComputedStyle(document.documentElement);
  balken("ch-hs", "ax-hs", data.pro_monat, "hoerspiele", css.getPropertyValue("--meadow").trim() || "#2F8063", "Hörspiele");
  balken("ch-fam", "ax-fam", data.pro_monat, "familien", css.getPropertyValue("--sky2").trim() || "#433A85", "Familien");
  tabelle("t-figur", data.pro_figur, FIGUREN); tabelle("t-sprache", data.pro_sprache, SPRACHEN);
  einladungen(data.einladungen);
}

async function start() {
  fehler("");
  const { data } = await sb.auth.getSession();
  if (!data.session) { $("logout").hidden = true; zeige("s-login"); return; }
  $("logout").hidden = false;
  const { data: konto } = await sb.rpc("mein_konto");
  if (!konto || konto.rolle !== "admin") { zeige("s-nein"); return; }
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.currentLevel !== "aal2") { await mfa(); return; }
  zeige("s-admin");
  await Promise.all([uebersicht(), familien(), meldungen(), protokoll()]);
}
start();
