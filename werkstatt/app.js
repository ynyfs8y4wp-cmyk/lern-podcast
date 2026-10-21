/* Hörspielwerkstatt – Web-App
 * Anmeldung, Freischaltung, Bestellung in fünf antippbaren Schritten, Bibliothek mit Player, Hilfe, Konto,
 * Einführung für neue Familien und vier Sprachen (Deutsch, Englisch, Spanisch, Portugiesisch).
 * Eigene Figuren (Figuren-Werkstatt), Stimmwahl vor der Bestellung und Neu-Vertonung mit den drei passendsten Stimmen.
 * Daten liegen in Supabase (Row Level Security). Texte kommen aus texte.json, Figuren und Themen aus katalog.json,
 * Stimmen aus stimmen.json; Avatar, Vorschläge und Editor aus figuren.js.
 */
"use strict";
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, text) { const b = el("button", cls, text); b.type = "button"; return b; }
function fehler(m) { const e = $("err"); e.textContent = m || ""; e.hidden = !m; }
function meldung(e) { return (e && (e.message || e.error_description)) || "?"; }
const merk = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } } };

const CFG = window.HW_CONFIG || {};
if (!window.supabase || !CFG.supabaseUrl || CFG.supabaseUrl.includes("DEIN-PROJEKT")) {
  document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">config.js: Supabase-URL und anon-Schlüssel eintragen.</p>';
  throw new Error("config.js fehlt");
}
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

let K = null, TX = null, KAT = null, FIG = {}, HF = null;
let nutzer = null, konto = null, kinder = [], figuren = [], auftraege = [], hoerspiele = [], kanal = null, aktuell = null, ansicht = "login";
const st = { step: 1, kidId: null, age: null, fig: null, comp: [], voices: {}, fort: null, themes: [], people: [], concepts: [], len: "mittel", mood: "abenteuerlich", out: "de" };
let bearbeite = false, wunsch = {}, filter = "alle", suche = "";

/* ---------- Sprache ---------- */
let LANG = "de";
const LI = () => TX.sprachen.findIndex((s) => s.key === LANG);
const pick = (a) => (Array.isArray(a) ? a[LI()] ?? a[0] : a);
function t(k, vars) { let s = pick(TX.ui[k]) ?? k; if (vars) Object.keys(vars).forEach((v) => { s = s.split("{" + v + "}").join(vars[v]); }); return s; }
const eigene = (k, liste) => (liste || []).find((f) => f && f.rolle === k) || figuren.find((f) => f.rolle === k) || null;
const figName = (k, liste) => (TX.figuren[k] ? pick(TX.figuren[k].name) : (eigene(k, liste) || {}).name || k);
const themaName = (x) => (TX.themen[x] ? pick(TX.themen[x]) : x);
const konName = (x) => (TX.konzepte[x] ? pick(TX.konzepte[x].name) : x);
const ROLLEN_LABEL = { "ERZÄHLER": ["Erzähler", "Narrator", "Narrador", "Narrador"], MAMA: ["Mama", "Mum", "Mamá", "Mamãe"], PAPA: ["Papa", "Dad", "Papá", "Papai"], OMA: ["Oma", "Grandma", "Abuela", "Vovó"], OPA: ["Opa", "Grandpa", "Abuelo", "Vovô"], FRAU: ["Frau", "Woman", "Mujer", "Mulher"], MANN: ["Mann", "Man", "Hombre", "Homem"], KIND: ["Kind", "Child", "Niño", "Criança"] };
const rolle = (w, liste) => (FIG[w] ? w.charAt(0) + w.slice(1).toLowerCase() : ROLLEN_LABEL[w] ? pick(ROLLEN_LABEL[w]) : (eigene(w, liste) || {}).name || w.charAt(0) + w.slice(1).toLowerCase());
const fmt = (d) => { try { return new Date(d).toLocaleDateString({ de: "de-DE", en: "en-GB", es: "es-ES", pt: "pt-PT" }[LANG], { day: "2-digit", month: "2-digit", year: "numeric" }); } catch (e) { return ""; } };
function statisch() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = t(e.dataset.t); });
  document.querySelectorAll("[data-ph]").forEach((e) => { e.placeholder = t(e.dataset.ph); });
}
const gibt = (k) => !!(FIG[k] || eigene(k));
function tileVar(k, liste) { if (FIG[k]) return `var(--t-${k.toLowerCase()}, var(--moon-soft))`; const f = eigene(k, liste); return f ? HF.tint(f.farbe) : "var(--moon-soft)"; }
function figSvg(key, cls, liste) { const f = FIG[key]; const e = f ? null : eigene(key, liste);
  return '<svg viewBox="0 0 64 64" ' + (cls ? 'class="' + cls + '" ' : "") + 'aria-hidden="true">' + (f ? f.svg : e ? HF.avatar(e) : "") + "</svg>"; }

/* ---------- Ansichten ---------- */
const TABS = ["neu", "lib", "hilfe", "konto"];
function zeige(name) {
  ansicht = name;
  ["login", "invite", "einw", "neu", "lib", "read", "hilfe", "konto"].forEach((v) => { $("v-" + v).hidden = v !== name; });
  $("tabs").hidden = !(TABS.includes(name) || name === "read") || !$("intro").hidden;
  TABS.forEach((x) => $("t-" + x).setAttribute("aria-selected", String(x === name || (name === "read" && x === "lib"))));
  if (name !== "read") aktuell = null;
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => zeige(b.dataset.tab)));
document.addEventListener("click", (ev) => { if (ev.target.closest("[data-logout]")) sb.auth.signOut(); });

/* ---------- Anmeldung ---------- */
$("f-mail").addEventListener("submit", async (ev) => {
  ev.preventDefault(); $("b-mail").disabled = true; $("login-msg").textContent = t("sendeCode");
  const { error } = await sb.auth.signInWithOtp({ email: $("mail").value.trim(), options: { shouldCreateUser: true } });
  $("b-mail").disabled = false;
  if (error) { $("login-msg").textContent = meldung(error); return; }
  $("f-mail").hidden = true; $("f-code").hidden = false; $("code").focus(); $("login-msg").textContent = t("postfach");
});
$("f-code").addEventListener("submit", async (ev) => {
  ev.preventDefault(); $("b-code").disabled = true;
  const { error } = await sb.auth.verifyOtp({ email: $("mail").value.trim(), token: $("code").value.trim(), type: "email" });
  $("b-code").disabled = false; if (error) $("login-msg").textContent = t("codeFalsch");
});
/* Anmeldung mit Passwort (Freunde-Beta ohne eigenen Mailversand): HW_CONFIG.anmeldung = "passwort" */
const PASSWORT = CFG.anmeldung === "passwort";
function loginArt() {
  $("f-pw").hidden = !PASSWORT; $("f-mail").hidden = PASSWORT; $("f-code").hidden = true;
  const anbieter = Array.isArray(CFG.oauth) ? CFG.oauth : CFG.oauth ? ["apple", "google"] : [];
  $("b-apple").hidden = !anbieter.includes("apple"); $("b-google").hidden = !anbieter.includes("google");
  $("oauth").hidden = !anbieter.length; $("oauth-oder").hidden = !anbieter.length;
  if (PASSWORT) $("login-text").dataset.t = "loginTextPw";
}
async function pwAnmelden(neu) {
  const email = $("pw-mail").value.trim(), password = $("pw").value;
  if (!email || !$("pw-mail").checkValidity()) { $("pw-mail").reportValidity(); return; }
  if (password.length < 8) { $("login-msg").textContent = t("pwKurz"); return; }
  $("b-pw").disabled = $("b-neu").disabled = true; $("login-msg").textContent = "…";
  const { data, error } = neu ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
  $("b-pw").disabled = $("b-neu").disabled = false;
  if (error) {
    const m = String(error.message || "");
    $("login-msg").textContent = /already|registered|exists/i.test(m) ? t("kontoDa") : /invalid login|credentials/i.test(m) ? t("pwFalsch") : meldung(error);
    return;
  }
  if (neu && data && data.user && !data.session) { $("login-msg").textContent = t("kontoDa"); return; }
  $("login-msg").textContent = "";
}
$("f-pw").addEventListener("submit", (ev) => { ev.preventDefault(); pwAnmelden(false); });
$("b-neu").onclick = () => pwAnmelden(true);
loginArt();
$("b-andere").onclick = () => { $("f-code").hidden = true; $("f-mail").hidden = false; };
async function oauth(provider) {
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
  if (error) $("login-msg").textContent = meldung(error);
}
$("b-apple").onclick = () => oauth("apple");
$("b-google").onclick = () => oauth("google");
$("f-einw").addEventListener("submit", async (ev) => {
  ev.preventDefault(); $("einw-msg").textContent = "…";
  const { data, error } = await sb.rpc("einwilligen");
  if (error) { $("einw-msg").textContent = meldung(error); return; }
  $("einw-msg").textContent = ""; konto = data; await start();
});
$("f-invite").addEventListener("submit", async (ev) => {
  ev.preventDefault(); $("invite-msg").textContent = t("pruefe");
  const { error } = await sb.rpc("einladung_einloesen", { p_code: $("invite").value });
  if (error) { $("invite-msg").textContent = meldung(error); return; }
  $("invite-msg").textContent = ""; await start();
});

/* ---------- Bestellung: Schritte frei antippbar, Prüfung beim Bestellen ---------- */
const STEPS = 5, SKEY = ["s1", "s2", "s3", "s4", "s5"];
function gruppenMitThema() { return K.themen.filter((g) => g.liste.some((x) => st.themes.includes(x))); }
function empfFiguren() { const s = new Set(); gruppenMitThema().forEach((g) => g.empfohleneFiguren.forEach((f) => s.add(f))); return s; }
function empfKonzepte() { const out = []; gruppenMitThema().forEach((g) => g.empfohleneKonzepte.forEach((k) => { if (!out.includes(k)) out.push(k); }));
  if (!out.length) out.push("Bindungs- und bedürfnisorientiert", "Resilienzförderung"); return out.slice(0, 3); }
function fehlt() { const m = []; if (!st.age) m.push([1, t("fAlter")]); if (!st.themes.length && !$("tfree").value.trim()) m.push([2, t("fThema")]);
  if (!st.fig || !gibt(st.fig)) m.push([3, t("fFigur")]); if (!st.concepts.length) m.push([4, t("fAnsatz")]); return m; }
function erledigt(n) { return n === 1 ? !!st.age : n === 2 ? !!(st.themes.length || $("tfree").value.trim()) : n === 3 ? !!(st.fig && gibt(st.fig)) : n === 4 ? st.concepts.length > 0 : false; }
function gehe(n) { st.step = n; if (n === 4 && !st.concepts.length) st.concepts = empfKonzepte(); zeigeSchritt(); $("steps").scrollIntoView({ block: "start" }); }
function zeigeSchritt() {
  document.querySelectorAll("[data-step]").forEach((p) => (p.hidden = +p.dataset.step !== st.step));
  const nav = $("steps"); nav.textContent = "";
  for (let i = 1; i <= STEPS; i++) {
    const ok = erledigt(i) && i !== st.step; const b = btn(ok ? "fin" : ""); if (i === st.step) b.setAttribute("aria-current", "step");
    b.append(el("b", null, ok ? "✓" : String(i)), el("span", null, t(SKEY[i - 1]))); b.onclick = () => gehe(i); nav.appendChild(b);
  }
  $("stepn").textContent = t("schrittVon", { n: st.step, m: STEPS });
  const box = document.querySelector('[data-nav="' + st.step + '"]'); box.textContent = "";
  if (st.step > 1) { const b = btn(null, t("zurueck")); b.onclick = () => gehe(st.step - 1); box.appendChild(b); }
  box.appendChild(el("span", "grow"));
  if (st.step < STEPS) { const b = btn("cta", t("weiterZu", { x: t(SKEY[st.step]) }) + " ›"); b.onclick = () => gehe(st.step + 1); box.appendChild(b); }
  else { const b = btn("cta", t("bestellen")); b.id = "orderbtn"; b.onclick = bestellen; box.appendChild(b); }
  if (st.step === 2) zeigeFortsetzung();
  if (st.step === 3) { baueFiguren(); baueBegleiter(); } if (st.step === 4) baueKonzepte(); if (st.step === 5) { baueStimmen(); bestellung(); }
}
$("reset").onclick = () => zuruecksetzen(true);
function zuruecksetzen(alles) {
  if (alles) { st.kidId = null; st.age = null; $("kname").value = ""; $("kinfo").value = ""; }
  Object.assign(st, { fig: null, comp: [], voices: {}, fort: null, themes: [], people: [], concepts: [], step: 1 });
  $("tfree").value = ""; $("sleep").checked = false; $("usename").checked = false; $("speechrow").hidden = true; editorZu();
  baueAlles(); zeigeSchritt();
}
function baueProfile() {
  const box = $("profiles"); box.textContent = "";
  kinder.forEach((k) => {
    const b = btn("kidchip"); b.setAttribute("aria-pressed", String(st.kidId === k.id));
    b.append(el("span", "av", (k.name || "?").charAt(0).toUpperCase()), document.createTextNode((k.name || "?") + (k.alter_jahre ? " · " + k.alter_jahre : "")));
    b.onclick = () => {
      if (st.kidId === k.id) { st.kidId = null; st.age = null; $("kname").value = ""; $("kinfo").value = ""; }
      else { st.kidId = k.id; st.age = k.alter_jahre || null; $("kname").value = k.name || ""; $("kinfo").value = k.infos || ""; }
      baueProfile(); baueAlter(); zeigeSchritt();
    };
    box.appendChild(b);
  });
  if (kinder.length) { const n = btn("kidchip"); n.append(el("span", "av", "+"), document.createTextNode(t("anderesKind"))); n.setAttribute("aria-pressed", String(!st.kidId));
    n.onclick = () => { st.kidId = null; st.age = null; $("kname").value = ""; $("kinfo").value = ""; baueProfile(); baueAlter(); zeigeSchritt(); $("kname").focus(); }; box.appendChild(n); }
}
function baueAlter() {
  const box = $("age"); box.textContent = "";
  for (let a = 1; a <= 10; a++) { const b = btn(null, String(a)); b.setAttribute("aria-pressed", String(st.age === a)); b.setAttribute("aria-label", t("jahre", { n: a }));
    b.onclick = () => { st.age = a; baueAlter(); zeigeSchritt(); }; box.appendChild(b); }
}
function baueThemen() {
  const box = $("themes"); box.textContent = "";
  K.themen.forEach((g) => {
    const w = el("div", "tgroup"); const h = el("h3"); const dot = el("i"); dot.style.background = g.farbe; h.append(dot, document.createTextNode(pick(TX.gruppen[g.gruppe]) || g.gruppe)); w.appendChild(h);
    const c = el("div", "chips");
    g.liste.forEach((x) => { const an = st.themes.includes(x); const b = btn("chip", themaName(x)); b.setAttribute("aria-pressed", String(an)); b.disabled = !an && st.themes.length >= 3;
      b.onclick = () => { st.themes = an ? st.themes.filter((y) => y !== x) : [...st.themes, x]; st.concepts = []; baueThemen(); zeigeSchritt(); }; c.appendChild(b); });
    w.appendChild(c); box.appendChild(w);
  });
  $("tcount").textContent = st.themes.length ? t("gewaehlt", { n: st.themes.length }) : "";
}
function bauePersonen() {
  const box = $("people"); box.textContent = "";
  K.personen.forEach((p) => { const an = st.people.includes(p); const b = btn("chip", pick(TX.personen[p]) || p); b.setAttribute("aria-pressed", String(an));
    b.onclick = () => { st.people = an ? st.people.filter((x) => x !== p) : [...st.people, p]; bauePersonen(); }; box.appendChild(b); });
}
function zeigeFortsetzung() {
  const box = $("fortbox"); box.textContent = ""; const v = st.fort ? hoerspiele.find((x) => x.id === st.fort) : null;
  box.hidden = !v; $("tfree").placeholder = v ? t("veraendertPh") : t("konkretPh"); if (!v) return;
  const tx = el("div"); tx.style.cssText = "flex:1 1 220px;display:flex;flex-direction:column;gap:2px";
  tx.append(el("strong", null, t("fortsetzungVon", { t: v.titel })), el("span", "hint", t("fortsetzungHint")));
  const x = btn(null, t("fortsetzungAus")); x.onclick = () => { st.fort = null; zeigeFortsetzung(); bestellung(); };
  box.append(tx, x);
}
function zeigeSpruch() {
  const row = $("speechrow"); const e = FIG[st.fig] ? null : eigene(st.fig);
  if (!st.fig || (!FIG[st.fig] && !e)) { row.hidden = true; return; }
  $("speech").textContent = "„" + (e ? t("halloIch", { n: e.name }) : pick(TX.figuren[st.fig].hallo)) + "“"; $("figeditbtn").hidden = !e; row.hidden = bearbeite;
}
$("figeditbtn").onclick = () => { const f = figuren.find((x) => x.rolle === st.fig); if (f) editorAuf(f); };
function baueFiguren() {
  const box = $("figs"); box.textContent = ""; box.hidden = bearbeite; $("compbox").hidden = bearbeite; const emp = empfFiguren();
  const liste = [...K.figuren].sort((a, b) => (emp.has(b.key) ? 1 : 0) - (emp.has(a.key) ? 1 : 0));
  liste.forEach((f) => {
    const b = btn("fig"); b.setAttribute("aria-pressed", String(st.fig === f.key)); b.setAttribute("aria-label", figName(f.key));
    const tile = el("div", "tile"); tile.style.background = tileVar(f.key); tile.innerHTML = figSvg(f.key); b.appendChild(tile);
    if (emp.has(f.key)) b.appendChild(el("span", "badge", t("passtGut")));
    if (st.fig === f.key) b.appendChild(el("span", "check", "✓"));
    const tx = el("div", "txt"); tx.append(el("strong", null, figName(f.key)), el("span", "d", pick(TX.figuren[f.key].kurz))); b.appendChild(tx);
    b.onclick = () => { st.fig = f.key; st.comp = st.comp.filter((x) => x !== f.key); zeigeSpruch(); zeigeSchritt(); };
    box.appendChild(b);
  });
  figuren.forEach((f) => {
    const b = btn("fig"); b.setAttribute("aria-pressed", String(st.fig === f.rolle)); b.setAttribute("aria-label", f.name);
    const tile = el("div", "tile"); tile.style.background = HF.tint(f.farbe); tile.innerHTML = figSvg(f.rolle); b.appendChild(tile);
    b.appendChild(el("span", "own", t("eigeneFigur"))); if (st.fig === f.rolle) b.appendChild(el("span", "check", "✓"));
    const tx = el("div", "txt"); tx.append(el("strong", null, f.name), el("span", "d", f.art || "")); b.appendChild(tx);
    b.onclick = () => { st.fig = f.rolle; st.comp = st.comp.filter((x) => x !== f.rolle); zeigeSpruch(); zeigeSchritt(); }; box.appendChild(b);
  });
  const n = btn("fig new"); const tile = el("div", "tile"); tile.appendChild(el("span", "plus", "+")); n.appendChild(tile);
  const tx = el("div", "txt"); tx.append(el("strong", null, t("figNeu")), el("span", "d", t("figNeuHint"))); n.appendChild(tx); n.onclick = () => editorAuf(null); box.appendChild(n);
  if ((liste.length + figuren.length + 1) % 2) box.lastChild.style.gridColumn = "1 / -1";
  zeigeSpruch();
}
function baueBegleiter() {
  const box = $("companions"); box.textContent = ""; st.comp = st.comp.filter((x) => x !== st.fig && gibt(x));
  [...K.figuren.map((f) => f.key), ...figuren.map((f) => f.rolle)].filter((k) => k !== st.fig).forEach((k) => {
    const an = st.comp.includes(k); const b = btn("chip"); b.setAttribute("aria-pressed", String(an)); b.style.gap = "6px"; b.style.paddingLeft = "8px";
    b.innerHTML = figSvg(k); b.firstChild.style.cssText = "width:24px;height:24px"; b.appendChild(document.createTextNode(rolle(k)));
    b.disabled = !an && st.comp.length >= 2; b.onclick = () => { st.comp = an ? st.comp.filter((x) => x !== k) : [...st.comp, k]; baueBegleiter(); }; box.appendChild(b);
  });
}

/* ---------- Figuren-Werkstatt ---------- */
function editorAuf(f) {
  bearbeite = true; $("speechrow").hidden = true;
  HF.editor($("figedit"), f, {
    sprache: () => st.out || LANG,
    abbrechen: editorZu,
    speichern: async (id, zeile) => {
      const alt = id ? figuren.find((x) => x.id === id) : null;
      const q = id ? sb.from("figuren").update(zeile).eq("id", id).select().single() : sb.from("figuren").insert(zeile).select().single();
      const { data, error } = await q;
      if (error) return error.code === "23505" ? t("feNameBelegt") : meldung(error);
      figuren = figuren.filter((x) => x.id !== data.id).concat([data]);
      if (alt && alt.rolle !== data.rolle) { if (st.fig === alt.rolle) st.fig = data.rolle; st.comp = st.comp.map((x) => (x === alt.rolle ? data.rolle : x));
        if (st.voices[alt.rolle]) { st.voices[data.rolle] = st.voices[alt.rolle]; delete st.voices[alt.rolle]; } }
      if (!alt) st.fig = data.rolle;
      editorZu(); zeigeSchritt(); return null;
    },
    loeschen: async (id) => {
      const f = figuren.find((x) => x.id === id); const { error } = await sb.from("figuren").delete().eq("id", id); if (error) return meldung(error);
      figuren = figuren.filter((x) => x.id !== id); if (f && st.fig === f.rolle) st.fig = null; if (f) st.comp = st.comp.filter((x) => x !== f.rolle);
      editorZu(); zeigeSchritt(); return null;
    },
  });
  baueFiguren(); $("figedit").scrollIntoView({ block: "start" });
}
function editorZu() { if (HF) HF.stopProbe(); bearbeite = false; const b = $("figedit"); b.hidden = true; b.textContent = ""; if (K && st.step === 3) { baueFiguren(); baueBegleiter(); } }

/* ---------- Stimmen vor der Bestellung (optional) ---------- */
function rollenDerBestellung() { const r = ["ERZÄHLER"]; if (st.fig) r.push(st.fig); st.comp.forEach((x) => r.push(x)); st.people.forEach((p) => { if (HF.PERSON_ROLLE[p]) r.push(HF.PERSON_ROLLE[p]); }); return [...new Set(r)]; }
function gewaehlteStimmen() { const r = rollenDerBestellung(); return Object.keys(st.voices).filter((k) => r.includes(k) && HF.VMAP[st.voices[k]]); }
function baueStimmen() {
  const box = $("wvoices"); box.textContent = "";
  rollenDerBestellung().forEach((r) => {
    const w = el("div", "vsel"), rl = el("span", "rl"); if (r !== "ERZÄHLER" && gibt(r)) rl.innerHTML = figSvg(r); rl.appendChild(el("span", null, rolle(r)));
    const fest = HF.vkey((eigene(r) || {}).stimme), sg = HF.vorschlag(HF.prefRolle(r, eigene(r)));
    const s = el("select"); s.setAttribute("aria-label", t("feStimme") + ": " + rolle(r));
    const opt = (v, txt) => { const o = el("option", null, txt); o.value = v; s.appendChild(o); };
    opt("", t("automatisch") + (fest ? " · " + HF.VMAP[fest].name : ""));
    const lab = (v) => v.name + " · " + t("g_" + v.g) + ", " + t("a_" + v.alter);
    sg.forEach((k) => opt(k, "★ " + lab(HF.VMAP[k]))); HF.VOICES.filter((v) => !sg.includes(v.key)).forEach((v) => opt(v.key, lab(v)));
    s.value = st.voices[r] || ""; s.onchange = () => { if (s.value) st.voices[r] = s.value; else delete st.voices[r]; stimmSumme(); bestellung(); };
    const p = btn("play", "▶"); p.setAttribute("aria-pressed", "false"); p.setAttribute("aria-label", t("probe") + ": " + rolle(r)); p.onclick = () => HF.playProbe(s.value || fest || sg[0], st.out, p, $("probemsg"));
    w.append(rl, s, p); box.appendChild(w);
  });
  stimmSumme();
}
function stimmSumme() { const n = gewaehlteStimmen().length; $("vsum").textContent = "· " + (n ? t("stimmenGewaehlt", { n }) : t("stimmenAuto")); }
function baueKonzepte() {
  const emp = empfKonzepte(); const rb = $("recbox"); rb.textContent = "";
  const gleich = emp.length === st.concepts.length && emp.every((r) => st.concepts.includes(r));
  rb.appendChild(el("span", null, t("empfohlenFuer", { x: emp.map(konName).join(" " + t("und") + " ") })));
  if (!gleich) { const u = btn("soft", t("uebernehmen")); u.onclick = () => { st.concepts = emp; zeigeSchritt(); }; rb.appendChild(u); }
  const box = $("concepts"); box.textContent = "";
  K.konzepte.forEach((k) => {
    const an = st.concepts.includes(k.name); const b = btn("con"); b.setAttribute("aria-pressed", String(an)); b.disabled = !an && st.concepts.length >= 3;
    b.appendChild(el("span", "box", an ? "✓" : "")); const tx = el("span"); tx.append(el("strong", null, konName(k.name)), el("span", "d", pick(TX.konzepte[k.name].kurz)));
    if (emp.includes(k.name)) tx.appendChild(el("span", "tip", t("empfohlen"))); b.appendChild(tx);
    b.onclick = () => { st.concepts = an ? st.concepts.filter((x) => x !== k.name) : [...st.concepts, k.name]; zeigeSchritt(); }; box.appendChild(b);
  });
}
function baueWahl(id, src, key) {
  const box = $(id); box.textContent = "";
  Object.keys(src).forEach((v) => { const b = btn(null); b.setAttribute("aria-pressed", String(st[key] === v)); b.append(el("span", null, pick(src[v][0])), el("small", null, pick(src[v][1])));
    b.onclick = () => { st[key] = v; baueWahl(id, src, key); bestellung(); }; box.appendChild(b); });
}
function baueHsSprache() { const s = $("outlang"); s.textContent = ""; TX.sprachen.forEach((x) => { const o = el("option", null, x.name); o.value = x.key; o.selected = x.key === st.out; s.appendChild(o); }); }
$("outlang").onchange = (e) => { st.out = e.target.value; bestellung(); };
function bestellung() {
  const o = $("order"); o.innerHTML = st.fig ? figSvg(st.fig) : ""; const tx = el("div");
  tx.appendChild(el("strong", null, t("erlebt", { f: st.fig ? figName(st.fig) : "…", k: ($("kname").value.trim() || t("deinKind")) + (st.age ? " (" + st.age + ")" : "") })));
  const ul = el("ul"); const th = st.themes.map(themaName); if ($("tfree").value.trim()) th.push(t("eureBeschreibung"));
  [[t("thema"), th.join(", ") || "…"], [t("ansatz"), st.concepts.map(konName).join(", ") || "…"],
   [t("rahmen"), pick(TX.laengen[st.len][1]) + ", " + pick(TX.stimmungen[st.mood][0]) + ($("sleep").checked ? ", " + t("zumEinschlafen") : "")],
   ...(st.fort && hoerspiele.find((x) => x.id === st.fort) ? [[t("fortsetzen"), t("fortsetzungVon", { t: hoerspiele.find((x) => x.id === st.fort).titel })]] : []),
   ...(st.comp.length ? [[t("mitDabei"), st.comp.map((k) => rolle(k)).join(", ")]] : []),
   [t("sprache"), TX.sprachen.find((x) => x.key === st.out).name],
   [t("stimmen"), gewaehlteStimmen().length ? t("stimmenGewaehlt", { n: gewaehlteStimmen().length }) : t("stimmenAuto")]]
    .forEach(([a, b]) => { const li = el("li"); li.append(el("b", null, a + ": "), document.createTextNode(b)); ul.appendChild(li); });
  tx.appendChild(ul); o.appendChild(tx);
  $("quota").textContent = konto ? t("frei", { f: Math.max(0, konto.kontingent - konto.verbraucht), k: konto.kontingent }) : "";
  const m = fehlt(); const box = $("missing"); box.textContent = ""; box.hidden = !m.length;
  if (m.length) { box.appendChild(el("strong", null, t("fehltNoch")));
    m.forEach(([n, txt]) => { const r = el("div"); r.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap"; const b = btn(null, t("geheZu", { n })); b.onclick = () => gehe(n); r.append(el("span", null, "• " + txt), b); box.appendChild(r); }); }
  const leer = konto && konto.verbraucht >= konto.kontingent; if (leer) $("quota").textContent = t("kontingentWeg");
  const ob = $("orderbtn"); if (ob) ob.disabled = !!m.length || leer;
}
$("sleep").addEventListener("change", bestellung);
function baueAlles() { if (bearbeite) editorZu(); baueProfile(); baueAlter(); baueThemen(); bauePersonen(); baueWahl("len", TX.laengen, "len"); baueWahl("mood", TX.stimmungen, "mood"); baueHsSprache(); }

async function bestellen() {
  if (fehlt().length) return;
  const ob = $("orderbtn"); ob.disabled = true; $("ordermsg").textContent = t("bestelle");
  const kind = { name: $("kname").value.trim(), alter: st.age, infos: $("kinfo").value.trim() };
  try {
    if ($("ksave").checked) {
      const zeile = { name: kind.name, alter_jahre: kind.alter, infos: kind.infos, geaendert_am: new Date().toISOString() };
      if (st.kidId) { const { error } = await sb.from("kinder").update(zeile).eq("id", st.kidId); if (error) throw error; }
      else { const { data, error } = await sb.from("kinder").insert(zeile).select().single(); if (error) throw error; st.kidId = data.id; }
    }
    const { error } = await sb.rpc("auftrag_anlegen", { p: {
      kind_id: st.kidId, kind, name_im_hoerspiel: $("usename").checked, figur: st.fig, themen: st.themes, thema_frei: $("tfree").value.trim(),
      personen: st.people, konzepte: st.concepts, laenge: st.len, stimmung: st.mood, einschlafen: $("sleep").checked, sprache: st.out, app_sprache: LANG,
      begleiter: st.comp, fortsetzung_von: st.fort, stimmen: Object.fromEntries(gewaehlteStimmen().map((r) => [r, st.voices[r]])) } });
    if (error) throw error;
    $("ordermsg").textContent = ""; erfolg(); ladeAlles();
  } catch (e) { $("ordermsg").textContent = meldung(e); ob.disabled = false; }
}
function erfolg() {
  const b = $("donebox"); b.innerHTML = figSvg(st.fig);
  const kurz = st.fig === "MIRA" || !FIG[st.fig] ? figName(st.fig) : st.fig.charAt(0) + st.fig.slice(1).toLowerCase();
  b.append(el("h2", null, t("anDieArbeit", { f: kurz })), el("p", "lead", t("erfolgApp")));
  const r = el("div", "actions"); const a = btn("cta", t("zurBib")); a.onclick = () => zeige("lib");
  const n = btn(null, t("nochEins")); n.onclick = () => { $("success").hidden = true; $("wizard").hidden = false; zuruecksetzen(false); zeige("neu"); };
  r.append(a, n); b.appendChild(r); $("wizard").hidden = true; $("success").hidden = false; window.scrollTo(0, 0);
}

/* ---------- Listen ---------- */
function zeigeAuftraege() {
  const box = $("jobs"); box.textContent = "";
  const offen = auftraege.filter((j) => ["wartet", "in_arbeit"].includes(j.status) || (["fehler", "abgelehnt"].includes(j.status) && Date.now() - new Date(j.erstellt_am) < 7 * 864e5));
  $("jobsec").hidden = !offen.length;
  offen.forEach((j) => {
    const w = el("div", "job"); w.innerHTML = figSvg(j.figur, null, j.eigene_figuren); const tx = el("div"); tx.style.flex = "1"; tx.style.minWidth = "0";
    const lab = { wartet: ["wait pulse", t("wartet")], in_arbeit: ["wait pulse", t("schreibt")], fehler: ["bad", t("fehlgeschlagen")], abgelehnt: ["bad", t("nichtMoeglich")] }[j.status];
    const top = el("div"); top.appendChild(el("span", "pill " + lab[0], lab[1])); tx.appendChild(top);
    tx.appendChild(el("div", null, [...(j.themen || []).map(themaName), j.thema_frei ? t("eureBeschreibung") : ""].filter(Boolean).join(", ")));
    tx.appendChild(el("div", "s", ["fehler", "abgelehnt"].includes(j.status) ? (j.fehler || "") : t("bestelltAm", { d: fmt(j.erstellt_am) })));
    w.appendChild(tx); box.appendChild(w);
  });
}
function audioZustand(h) { if (h.gesperrt) return ["bad", t("gesperrtHs").split(" ").slice(0, 3).join(" ")]; if (h.audio_status === "neu_vertonen") return ["wait", t("neuVertonenLaeuft")]; if (h.audio_status === "fertig") return ["ok", t("anhoeren")]; if (h.audio_status === "fehler") return ["bad", t("nurText")]; return ["wait", t("wirdVertont")]; }
function baueFilter() {
  const box = $("libfilter"); box.textContent = "";
  const opts = [["alle", t("alle")]];
  kinder.forEach((k) => { if (hoerspiele.some((h) => h.kind_id === k.id)) opts.push(["kind:" + k.id, k.name || "?"]); });
  [...new Set(hoerspiele.map((h) => h.figur))].forEach((f) => opts.push(["figur:" + f, rolle(f, (hoerspiele.find((h) => h.figur === f) || {}).eigene_figuren)]));
  if (hoerspiele.some((h) => h.reihe_id)) opts.push(["reihen", t("reiheN", { n: "…" }).split("·")[0].trim()]);
  if (!opts.some(([k]) => k === filter)) filter = "alle";
  opts.forEach(([k, l]) => { const b = btn("chip", l); b.setAttribute("aria-pressed", String(filter === k)); b.onclick = () => { filter = k; zeigeBibliothek(); }; box.appendChild(b); });
  $("libbar").hidden = hoerspiele.length < 3;
}
$("libsuche").addEventListener("input", (e) => { suche = e.target.value.trim().toLowerCase(); zeigeBibliothek(); });
function passt(h) {
  if (filter.startsWith("kind:") && h.kind_id !== filter.slice(5)) return false;
  if (filter.startsWith("figur:") && h.figur !== filter.slice(6)) return false;
  if (filter === "reihen" && !h.reihe_id) return false;
  if (suche && ![h.titel, h.zusammenfassung, h.kind_name, figName(h.figur, h.eigene_figuren), ...(h.themen || []).map(themaName)].join(" ").toLowerCase().includes(suche)) return false;
  return true;
}
function zeigeBibliothek() {
  const box = $("lib"); box.textContent = ""; if (hoerspiele.length) baueFilter(); else $("libbar").hidden = true;
  if (!hoerspiele.length) {
    const e = el("div", "empty"); e.innerHTML = '<svg viewBox="0 0 160 64" aria-hidden="true"><g transform="translate(8,8) scale(.75)">' + FIG.PIP.svg + '</g><g transform="translate(56,0)">' + FIG.MIRA.svg + '</g><g transform="translate(112,8) scale(.75)">' + FIG.BRUNO.svg + "</g></svg>";
    e.append(el("h3", null, t("leerTitel")), el("p", null, t("leerText")));
    const b = btn("cta", t("erstesBestellen")); b.onclick = () => zeige("neu"); e.appendChild(b); box.appendChild(e); return;
  }
  const g = el("div", "lib"); const liste = hoerspiele.filter(passt);
  if (!liste.length) box.appendChild(el("p", "hint", t("keineTreffer")));
  liste.forEach((h) => {
    const b = btn("cover"); const tile = el("div", "tile"); tile.style.background = tileVar(h.figur, h.eigene_figuren); tile.innerHTML = figSvg(h.figur, null, h.eigene_figuren);
    const [c, l] = audioZustand(h); tile.appendChild(el("span", "pill " + c, l)); if (h.reihe_id) tile.appendChild(el("span", "teil", t("teilN", { n: h.teil || 1 }))); b.appendChild(tile);
    const tx = el("div", "txt"); tx.append(el("strong", null, h.titel), el("span", "m", fmt(h.erstellt_am) + (h.minuten ? " · " + t("min", { n: h.minuten }) : "") + (h.kind_name ? " · " + t("fuer", { k: h.kind_name }) : "") + (h.sprache && h.sprache !== LANG ? " · " + h.sprache.toUpperCase() : ""))); b.appendChild(tx);
    b.onclick = () => oeffne(h); g.appendChild(b);
  });
  box.appendChild(g);
}
function zeigeStatistik() {
  const s = $("stats"); s.textContent = ""; if (!konto) return;
  [[Math.max(0, konto.kontingent - konto.verbraucht) + " / " + konto.kontingent, t("freiKurz")], [hoerspiele.length, t(hoerspiele.length === 1 ? "statHs1" : "statHsN")],
   [auftraege.filter((a) => ["wartet", "in_arbeit"].includes(a.status)).length, t("statArbeit")]]
    .forEach(([x, l]) => { const e = el("span"); e.append(el("b", null, String(x)), document.createTextNode(" " + l)); s.appendChild(e); });
  $("t-lib").textContent = t("tabLib") + (hoerspiele.length ? " (" + hoerspiele.length + ")" : "");
}
function bestaetige(box, ausloeser, frage, fn) {
  ausloeser.hidden = true; const q = el("span", null, frage); const ja = btn("soft", t("ja")); const nein = btn(null, t("abbrechen"));
  ja.onclick = async () => { ja.disabled = true; await fn(); q.remove(); ja.remove(); nein.remove(); ausloeser.hidden = false; };
  nein.onclick = () => { q.remove(); ja.remove(); nein.remove(); ausloeser.hidden = false; };
  box.append(q, ja, nein);
}
function zeigeKonto() {
  if (!konto) return; $("adminlink").hidden = konto.rolle !== "admin";
  $("konto-info").textContent = (nutzer?.email || "") + " · " + t("genutzt", { v: konto.verbraucht, k: konto.kontingent });
  const box = $("kidlist"); box.textContent = "";
  if (!kinder.length) box.appendChild(el("p", "hint", t("keineProfile")));
  kinder.forEach((k) => {
    const r = el("div", "kid"); r.appendChild(el("span", null, (k.name || "?") + (k.alter_jahre ? ", " + t("jahre", { n: k.alter_jahre }) : "")));
    const d = btn("ghost", t("loeschen")); d.onclick = () => bestaetige(r, d, t("profilLoeschen"), async () => { const { error } = await sb.from("kinder").delete().eq("id", k.id); if (error) fehler(meldung(error)); else ladeAlles(); });
    r.appendChild(d); box.appendChild(r);
  });
  const del = $("delacc"); del.textContent = ""; const b = btn(null, t("kontoLoeschenKnopf")); b.style.borderColor = "var(--berry)"; b.style.color = "var(--berry)";
  b.onclick = () => bestaetige(del, b, t("wirklichAlles"), async () => {
    const { error } = await sb.rpc("konto_loeschen");   // löscht Konto und alle Daten; Audiodateien räumt die Fabrik weg
    if (error) { fehler(meldung(error)); return; } await sb.auth.signOut({ scope: "local" });
  });
  del.appendChild(b);
}

/* ---------- Hörspiel ---------- */
function inlineMd(node, txt) { (txt || "").split(/(\*\*[^*]+\*\*)/g).forEach((p) => { if (!p) return; const m = p.match(/^\*\*([^*]+)\*\*$/); node.appendChild(m ? el("strong", null, m[1]) : document.createTextNode(p)); }); }
function md(box, text) { let ul = null;
  (text || "").split(/\n/).forEach((line) => { const l = line.trim(); if (!l) { ul = null; return; } let m;
    if ((m = l.match(/^[-*•]\s+(.+)$/))) { if (!ul) { ul = el("ul"); box.appendChild(ul); } const li = el("li"); inlineMd(li, m[1]); ul.appendChild(li); return; }
    ul = null; const p = el("p"); inlineMd(p, l.replace(/^#+\s*/, "")); box.appendChild(p); }); }
async function oeffne(h) {
  if (!aktuell || aktuell.id !== h.id) wunsch = {}; HF.stopProbe();
  aktuell = h; zeige("read"); const ef = h.eigene_figuren;
  const head = $("rhead"); head.style.background = tileVar(h.figur, ef); head.innerHTML = figSvg(h.figur, null, ef);
  head.append(el("h2", null, h.titel), el("span", "m", fmt(h.erstellt_am) + (h.minuten ? " · " + t("caMin", { n: h.minuten }) : "") + (h.kind_name ? " · " + t("fuer", { k: h.kind_name }) : "")));
  if (h.zusammenfassung) head.appendChild(el("p", null, h.zusammenfassung));
  const tg = el("div", "tags"); [figName(h.figur, ef), ...(h.themen || []).map(themaName), TX.sprachen.find((x) => x.key === h.sprache)?.name].filter(Boolean).forEach((x) => tg.appendChild(el("span", "tag", x))); head.appendChild(tg);
  const pl = $("rplayer"); pl.textContent = "";
  $("rfort").hidden = !!h.gesperrt; $("ragain").hidden = !!h.gesperrt;
  zeigeReihe(h); zeigeFassungen(h); $("rmeldung").hidden = true; $("rmeldung").textContent = "";
  if (h.gesperrt) pl.appendChild(el("p", "err", t("gesperrtHs")));
  else if (h.audio_status === "fertig" && h.audio_pfad) {
    const { data, error } = await sb.storage.from("audio").createSignedUrl(h.audio_pfad, 6 * 3600);
    if (error) pl.appendChild(el("p", "hint", t("audioNichtGeladen")));
    else { const a = document.createElement("audio"); a.controls = true; a.preload = "metadata"; a.src = data.signedUrl; pl.appendChild(a);
      if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: h.titel, artist: t("titel"), artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }] }); }
  } else pl.appendChild(el("p", "hint", h.audio_status === "fehler" ? (h.audio_fehler || t("audioFehler")) : h.audio_status === "neu_vertonen" ? t("neuVertonenLaeuft") : t("spielerHint")));
  zeigeStimmen(h);
  const ki = $("rki"); ki.textContent = ""; const parts = t("kiHs").split(" · "); ki.append(el("strong", null, parts[0]), document.createTextNode(" · " + parts.slice(1).join(" · ")));
  const p = $("rparents"); p.textContent = ""; p.appendChild(el("h3", null, t("fuerEltern")));
  const info = el("div"); info.style.cssText = "display:flex;flex-direction:column;gap:6px"; md(info, h.eltern_info); p.appendChild(info);
  if ((h.impulse || []).length) { p.appendChild(el("strong", null, t("fragen"))); const ul = el("ul"); h.impulse.forEach((q) => ul.appendChild(el("li", null, q))); p.appendChild(ul); }
  if (h.ritual) { const r = el("p", "ritual"); r.append(el("strong", null, t("ritual") + " "), document.createTextNode(h.ritual)); p.appendChild(r); }
  const sc = $("rscript"); sc.textContent = "";
  (h.skript || "").split(/\n/).forEach((z) => { const i = z.indexOf(":"); if (i < 1) return; const wer = z.slice(0, i).trim(); const txt = z.slice(i + 1).trim();
    if (wer === "GERÄUSCH") { const d = el("div", "line sfx"); d.append(el("span", "who", t("geraeusch")), el("span", "t", txt.split("|")[0].trim())); sc.appendChild(d); return; }
    const d = el("div", "line" + (FIG[wer] || eigene(wer, ef) ? " main" : "")); d.append(el("span", "who", rolle(wer, ef)), el("span", "t", txt)); sc.appendChild(d); });
  $("rdet").open = false;
  const box = $("rdelbox"); box.textContent = ""; const del = btn("ghost", t("entfernen"));
  del.onclick = () => bestaetige(box, del, t("entfernen") + "?", async () => {
    const { data: fs } = await sb.from("hoerspiel_fassungen").select("audio_pfad").eq("hoerspiel_id", h.id);
    const pfade = [h.audio_pfad, ...(fs || []).map((f) => f.audio_pfad)].filter(Boolean);
    if (pfade.length) await sb.storage.from("audio").remove(pfade);
    const { error } = await sb.from("hoerspiele").delete().eq("id", h.id);
    if (error) fehler(meldung(error)); else { await ladeAlles(); zeige("lib"); }
  });
  box.append(meldeKnopf(h), del);
}
$("rback").onclick = () => zeige("lib");

/* ---------- Reihe, frühere Fassungen, Meldung ---------- */
function zeigeReihe(h) {
  const box = $("rreihe"); box.textContent = ""; const teile = h.reihe_id ? hoerspiele.filter((x) => x.reihe_id === h.reihe_id).sort((a, b) => (a.teil || 1) - (b.teil || 1)) : [];
  box.hidden = teile.length < 2; if (box.hidden) return;
  box.appendChild(el("strong", null, t("reiheN", { n: teile.length })));
  teile.forEach((x) => { const b = btn(null, t("teilN", { n: x.teil || 1 }) + " · " + x.titel); if (x.id === h.id) b.setAttribute("aria-current", "true"); b.onclick = () => oeffne(x); box.appendChild(b); });
}
async function zeigeFassungen(h) {
  const det = $("rfass"), box = $("rfasslist"); box.textContent = ""; det.hidden = true; if (!h.neu_vertonungen || h.gesperrt) return;
  const { data } = await sb.from("hoerspiel_fassungen").select("*").eq("hoerspiel_id", h.id).order("nummer", { ascending: false });
  if (!data || !data.length || !aktuell || aktuell.id !== h.id) return;
  det.hidden = false;
  for (const f of data) {
    const w = el("div", "fass"); const namen = Object.entries(f.stimmen || {}).map(([r, k]) => rolle(r, h.eigene_figuren) + ": " + (HF.VMAP[k] ? HF.VMAP[k].name : k)).join(", ");
    w.append(el("strong", null, t("fassungN", { n: f.nummer }) + " · " + fmt(f.erstellt_am)), el("span", "hint", namen));
    const b = btn(null, "▶ " + t("anhoerenKurz")); b.style.alignSelf = "flex-start";
    b.onclick = async () => { const { data: u } = await sb.storage.from("audio").createSignedUrl(f.audio_pfad, 3600); if (!u) return;
      const a = document.createElement("audio"); a.controls = true; a.src = u.signedUrl; b.replaceWith(a); a.play().catch(() => {}); };
    w.appendChild(b); box.appendChild(w);
  }
}
function meldeKnopf(h) {
  const box = $("rmeldung");
  const knopf = btn("ghost", t("melden"));
  knopf.onclick = () => {
    box.hidden = false; box.textContent = ""; knopf.hidden = true; let grund = "";
    box.appendChild(el("h3", null, t("meldenTitel")));
    const g = el("div", "grund"); ["unpassend", "angst", "falsch", "technik", "sonstiges"].forEach((k) => { const b = btn("chip", t("m_" + k)); b.setAttribute("aria-pressed", "false");
      b.onclick = () => { grund = k; g.querySelectorAll ? g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))) : null; senden.disabled = false; }; g.appendChild(b); });
    const tx = el("textarea"); tx.maxLength = 1000; tx.placeholder = t("meldenPh");
    const senden = btn("cta", t("meldenSenden")); senden.disabled = true; const abbr = btn(null, t("abbrechen"));
    const msg = el("p", "hint", t("meldenHinweis"));
    abbr.onclick = () => { box.hidden = true; knopf.hidden = false; };
    senden.onclick = async () => { senden.disabled = true;
      const { error } = await sb.from("meldungen").insert({ hoerspiel_id: h.id, grund, text: tx.value.trim() });
      if (error) { msg.textContent = meldung(error); senden.disabled = false; return; }
      box.textContent = ""; box.appendChild(el("p", null, t("meldenDanke"))); };
    const act = el("div", "actions"); act.style.justifyContent = "flex-start"; act.append(senden, abbr);
    box.append(g, tx, msg, act); box.scrollIntoView({ block: "center" });
  };
  return knopf;
}
$("rfort").onclick = () => {
  const h = aktuell; if (!h) return;
  zuruecksetzen(false);
  st.fort = h.id; st.fig = gibt(h.figur) ? h.figur : null; st.comp = (h.begleiter || []).filter(gibt).slice(0, 2);
  st.concepts = (h.konzepte || []).slice(0, 3); if (h.sprache) st.out = h.sprache;
  const k = kinder.find((x) => x.id === h.kind_id); if (k) { st.kidId = k.id; st.age = k.alter_jahre || null; $("kname").value = k.name || ""; $("kinfo").value = k.infos || ""; }
  $("success").hidden = true; $("wizard").hidden = false; zeige("neu"); baueAlles(); gehe(k ? 2 : 1);
};

/* ---------- Stimmen anpassen und neu vertonen ---------- */
function sprechRollen(h) { const r = ["ERZÄHLER"]; (h.skript || "").split(/\n/).forEach((z) => { const i = z.indexOf(":"); if (i < 1) return; const w = z.slice(0, i).trim(); if (w !== "GERÄUSCH" && !r.includes(w)) r.push(w); }); return r; }
function stimmeJetzt(r, h) { return HF.vkey((h.stimmen || {})[r]) || KAT.standard[r] || HF.vkey((eigene(r, h.eigene_figuren) || {}).stimme) || KAT.standard["ERZÄHLER"]; }
function zeigeStimmen(h) {
  const sek = $("rvoices"); sek.hidden = !["fertig", "neu_vertonen"].includes(h.audio_status); if (sek.hidden) return;
  const box = $("rvlist"); box.textContent = ""; const ef = h.eigene_figuren;
  sprechRollen(h).forEach((r) => {
    const w = el("div", "vrole"), kopf = el("h4"); if (r !== "ERZÄHLER" && (FIG[r] || eigene(r, ef))) kopf.innerHTML = figSvg(r, null, ef);
    kopf.appendChild(document.createTextNode(rolle(r, ef))); w.appendChild(kopf);
    const cur = stimmeJetzt(r, h), sv = (h.stimm_vorschlaege || {})[r];
    const sugg = Array.isArray(sv) && sv.length ? sv : HF.vorschlag(HF.prefRolle(r, eigene(r, ef)));
    const vb = el("div", "voices");
    HF.stimmWahl(vb, { sel: wunsch[r] || cur, cur, sugg, sprache: h.sprache || "de", msg: $("rvmsg"), onPick: (k) => { if (!k || k === cur) delete wunsch[r]; else wunsch[r] = k; stimmKnopf(h); } });
    w.appendChild(vb); box.appendChild(w);
  });
  stimmKnopf(h);
}
function stimmKnopf(h) {
  const n = Object.keys(wunsch).length, laeuft = h.audio_status === "neu_vertonen";
  $("rvsave").disabled = laeuft || !n || (h.neu_vertonungen || 0) >= 5; $("rvcount").textContent = n && !laeuft ? t("aenderungen", { n }) : "";
  $("rvmsg").textContent = laeuft ? t("neuVertonenLaeuft") + " " + t("neuVertonenText") : h.stimmen_fehler ? t("vertonungFehler") : "";
}
$("rvsave").onclick = async () => {
  const h = aktuell; if (!h) return; HF.stopProbe(); $("rvsave").disabled = true;
  const { error } = await sb.rpc("neu_vertonen", { p_hoerspiel: h.id, p_stimmen: wunsch });
  if (error) { $("rvmsg").textContent = meldung(error); stimmKnopf(h); return; }
  wunsch = {}; await ladeAlles();
};
$("ragain").onclick = () => {
  const h = aktuell; if (!h) return;
  st.fort = null; st.fig = gibt(h.figur) ? h.figur : null; st.comp = (h.begleiter || []).filter(gibt).slice(0, 2); st.voices = {}; st.themes = (h.themen || []).filter((x) => K.themen.some((g) => g.liste.includes(x))).slice(0, 3); st.concepts = (h.konzepte || []).slice(0, 3); if (h.sprache) st.out = h.sprache;
  const k = kinder.find((x) => x.id === h.kind_id); if (k) { st.kidId = k.id; st.age = k.alter_jahre || null; $("kname").value = k.name || ""; $("kinfo").value = k.infos || ""; }
  $("success").hidden = true; $("wizard").hidden = false; zeige("neu"); baueAlles(); gehe(2); $("stepn").textContent = t("uebernommen");
};

/* ---------- Hilfe und Einführung (im Seitenfluss) ---------- */
function baueFaq() { const box = $("faq"); box.textContent = ""; TX.faq.forEach(([q, a]) => { const d = el("details"); d.append(el("summary", null, pick(q)), el("p", null, pick(a))); box.appendChild(d); }); }
const KUNST = [() => ["LOTTA", "FINN", "MIRA", "PIP", "BRUNO"].map((k, i) => figSvg(k, i === 2 ? "big" : "")).join(""), () => figSvg("FINN", "big"), () => figSvg("MIRA", "big"), () => figSvg("PIP", "big"), () => figSvg("BRUNO", "big")];
let folie = 0;
function zeigeFolie() {
  const f = TX.intro[folie]; const box = $("introSlide"); box.textContent = "";
  const art = el("div", "art"); art.innerHTML = KUNST[folie](); box.appendChild(art);
  const h = el("h2", null, pick(f.t)); h.id = "introTitle"; box.append(h, el("p", null, folie === 3 ? t("anhoerenHier") : pick(f.p)));
  if (f.schritte) { const w = el("div", "steps-mini"); f.schritte.forEach((x, i) => { const d = el("div"); d.append(el("b", null, String(i + 1)), document.createTextNode(pick(x))); w.appendChild(d); }); box.appendChild(w); }
  const d = $("introDots"); d.textContent = ""; TX.intro.forEach((_, i) => d.appendChild(el("i", i === folie ? "on" : "")));
  $("introBack").style.visibility = folie ? "visible" : "hidden"; $("introNext").textContent = folie === TX.intro.length - 1 ? t("losGehts") : t("weiter");
}
function einfuehrung() { folie = 0; zeigeFolie(); $("intro").hidden = false; $("tabs").hidden = true; ["neu", "lib", "hilfe", "konto", "read"].forEach((x) => ($("v-" + x).hidden = true)); window.scrollTo(0, 0); }
function einfuehrungZu() { $("intro").hidden = true; merk.set("hw-intro", "1"); zeige("neu"); }
$("introNext").onclick = () => { if (folie < TX.intro.length - 1) { folie++; zeigeFolie(); window.scrollTo(0, 0); } else einfuehrungZu(); };
$("introBack").onclick = () => { if (folie) { folie--; zeigeFolie(); } };
$("introSkip").onclick = einfuehrungZu; $("introAgain").onclick = einfuehrung;

/* ---------- Sprache umschalten ---------- */
function baueUiSprache() { const s = $("uilang"); s.textContent = ""; TX.sprachen.forEach((x) => { const o = el("option", null, x.name); o.value = x.key; o.selected = x.key === LANG; s.appendChild(o); }); }
$("uilang").onchange = (e) => { LANG = e.target.value; merk.set("hw-lang", LANG); neuZeichnen(); };
function neuZeichnen() {
  if (HF) HF.stopProbe(); statisch(); baueAlles(); zeigeSchritt(); baueFaq(); zeigeAuftraege(); zeigeBibliothek(); zeigeStatistik(); zeigeKonto();
  if (!$("intro").hidden) zeigeFolie(); if (aktuell && ansicht === "read") oeffne(aktuell);
}

/* ---------- Laden ---------- */
async function ladeAlles() {
  const [k, a, h, c, f] = await Promise.all([
    sb.from("kinder").select("*").order("erstellt_am"),
    sb.from("auftraege").select("id,figur,themen,thema_frei,status,fehler,erstellt_am,hoerspiel_id,sprache,eigene_figuren").order("erstellt_am", { ascending: false }).limit(30),
    sb.from("hoerspiele").select("*").order("erstellt_am", { ascending: false }),
    sb.rpc("mein_konto"),
    sb.from("figuren").select("*").order("erstellt_am"),
  ]);
  const e = k.error || a.error || h.error || c.error || f.error; if (e) { fehler(meldung(e)); return; }
  fehler(""); kinder = k.data; auftraege = a.data; hoerspiele = h.data; konto = c.data; figuren = f.data;
  if (st.step === 3 && !bearbeite && ansicht === "neu") { baueFiguren(); baueBegleiter(); }
  baueProfile(); zeigeAuftraege(); zeigeBibliothek(); zeigeStatistik(); zeigeKonto(); if (st.step === 5) bestellung();
  if (aktuell) { const neu = hoerspiele.find((x) => x.id === aktuell.id);
    if (neu && ansicht === "read" && (neu.audio_status !== aktuell.audio_status || neu.audio_pfad !== aktuell.audio_pfad || neu.stimmen_fehler !== aktuell.stimmen_fehler)) oeffne(neu); else if (neu) aktuell = neu; }
}
function abonnieren() {
  if (kanal) sb.removeChannel(kanal);
  let tm = null; const neu = () => { clearTimeout(tm); tm = setTimeout(ladeAlles, 400); };
  kanal = sb.channel("meine-daten")
    .on("postgres_changes", { event: "*", schema: "public", table: "auftraege", filter: "user_id=eq." + nutzer.id }, neu)
    .on("postgres_changes", { event: "*", schema: "public", table: "hoerspiele", filter: "user_id=eq." + nutzer.id }, neu)
    .subscribe();
}
async function start() {
  const { data } = await sb.auth.getSession(); nutzer = data.session?.user || null;
  if (!nutzer) { $("stats").textContent = ""; zeige("login"); return; }
  const { data: c, error } = await sb.rpc("mein_konto"); if (error) { fehler(meldung(error)); return; }
  konto = c; if (!konto?.aktiviert) { zeige("invite"); return; }
  if (konto.gesperrt) { zeige("invite"); $("invite-msg").textContent = t("kontoGesperrt"); $("f-invite").hidden = true; return; }
  if (!konto.eingewilligt) { $("einw-lead").textContent = merk.get("hw-einw") ? t("einwNeu") : t("einwText"); zeige("einw"); merk.set("hw-einw", "1"); return; }
  await ladeAlles(); abonnieren();
  if (["login", "invite"].includes(ansicht)) zeige("neu");
  if (!merk.get("hw-intro")) einfuehrung();
}

(async () => {
  try { [K, TX, KAT] = await Promise.all(["katalog.json", "texte.json", "stimmen.json"].map((d) => fetch(d).then((r) => r.json()))); }
  catch (e) { fehler("katalog.json / texte.json / stimmen.json?"); return; }
  const gespeichert = merk.get("hw-lang"); LANG = TX.sprachen.some((s) => s.key === gespeichert) ? gespeichert : "de";
  FIG = Object.fromEntries(K.figuren.map((f) => [f.key, f]));
  HF = window.HWFiguren({ TX, KAT, t, pick, el, btn, lang: () => LANG, festeFiguren: K.figuren.map((f) => f.key) });
  let s = '<path d="M0 60 Q90 22 200 50 T400 44 V96 H0Z" fill="#2E6B5C"/><path d="M0 78 Q120 52 240 74 T400 70 V96 H0Z" fill="#245A4E"/>';
  [[40, 40, "LOTTA"], [112, 30, "FINN"], [200, 38, "MIRA"], [284, 36, "PIP"], [356, 32, "BRUNO"]].forEach(([x, y, k]) => { s += '<g transform="translate(' + (x - 20) + "," + (y - 20) + ') scale(.625)">' + FIG[k].svg + "</g>"; });
  $("hills").innerHTML = s; $("welcomeArt").innerHTML = ["PIP", "MIRA", "BRUNO"].map((k) => figSvg(k)).join("");
  baueUiSprache(); statisch(); baueAlles(); zeigeSchritt(); baueFaq();
  sb.auth.onAuthStateChange((evt) => { if (["SIGNED_IN", "SIGNED_OUT"].includes(evt)) start(); });
  await start();
})();
