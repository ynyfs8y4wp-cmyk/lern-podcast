/* Hörspielwerkstatt – eigene Figuren und Stimmwahl (Web-App)
 * Avatar aus Form, Farbe und Extra; Stimmenkatalog mit Vorschlägen und Hörproben; Figuren-Editor.
 * Wird von app.js mit HWFiguren({...}) eingerichtet. Die gleiche Logik steckt in der nativen App (app/src/figuren.ts).
 */
"use strict";
window.HWFiguren = function (ctx) {
  const { TX, KAT, t, pick, el, btn, lang, festeFiguren } = ctx;
  const FORMEN = Object.keys(TX.formen), EXTRAS = Object.keys(TX.extras), EIGS = Object.keys(TX.eigenschaften);
  const FARBEN = ["#F2B246", "#DE6830", "#E56B8C", "#9B6FD6", "#4F8FE0", "#3FA58A", "#8DBB45", "#96623E", "#8A8FA8"];
  const gueltigeFarbe = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#9B6FD6");
  const tint = (c) => "color-mix(in srgb," + gueltigeFarbe(c) + " 24%,var(--surface))";

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const m = f < 0 ? 0 : 255, a = Math.abs(f);
    r = Math.round(r + (m - r) * a); g = Math.round(g + (m - g) * a); b = Math.round(b + (m - b) * a);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /** SVG-Inhalt (viewBox 0 0 64 64) einer eigenen Figur */
  function avatar(a) {
    const c = gueltigeFarbe(a.farbe), d = shade(c, -0.3), l = shade(c, 0.55), k = "#1E1E28";
    let s = "", head = c, face = "", ey = 31;
    const eyes = (y) => { ey = y; return '<circle cx="25" cy="' + y + '" r="2.6" fill="' + k + '"/><circle cx="39" cy="' + y + '" r="2.6" fill="' + k + '"/>'; };
    const cheeks = (y) => '<circle cx="19" cy="' + y + '" r="2.6" fill="#F5A0AA" opacity=".7"/><circle cx="45" cy="' + y + '" r="2.6" fill="#F5A0AA" opacity=".7"/>';
    const smile = (y) => '<path d="M27 ' + y + " Q32 " + (y + 4) + " 37 " + y + '" stroke="#3C2828" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
    const muzzle = '<ellipse cx="32" cy="41" rx="10" ry="7.5" fill="' + l + '"/><ellipse cx="32" cy="38.5" rx="3.4" ry="2.6" fill="#3C2828"/>';
    switch (a.form) {
      case "katze": s = '<polygon points="11,26 15,5 29,17" fill="' + c + '"/><polygon points="53,26 49,5 35,17" fill="' + c + '"/><polygon points="15,21 17,11 24,17" fill="' + l + '"/><polygon points="49,21 47,11 40,17" fill="' + l + '"/>';
        face = eyes(31) + muzzle + smile(43) + '<path d="M11 40 L19 41 M11 45 L19 43 M53 40 L45 41 M53 45 L45 43" stroke="' + d + '" stroke-width="1.4" stroke-linecap="round"/>'; break;
      case "hase": s = '<ellipse cx="23" cy="13" rx="6" ry="14" fill="' + c + '"/><ellipse cx="41" cy="13" rx="6" ry="14" fill="' + c + '"/><ellipse cx="23" cy="14" rx="2.8" ry="10" fill="' + l + '"/><ellipse cx="41" cy="14" rx="2.8" ry="10" fill="' + l + '"/>';
        face = eyes(33) + muzzle + cheeks(40); break;
      case "maus": s = '<circle cx="13" cy="20" r="11" fill="' + c + '"/><circle cx="51" cy="20" r="11" fill="' + c + '"/><circle cx="13" cy="20" r="6.5" fill="' + l + '"/><circle cx="51" cy="20" r="6.5" fill="' + l + '"/>';
        face = eyes(33) + '<ellipse cx="32" cy="40" rx="3.2" ry="2.6" fill="#E26A86"/>' + smile(44) + cheeks(40); break;
      case "drache": s = '<polygon points="19,18 22,4 28,15" fill="' + l + '"/><polygon points="45,18 42,4 36,15" fill="' + l + '"/><polygon points="30,14 32,6 34,14" fill="' + d + '"/>';
        face = eyes(31) + '<ellipse cx="32" cy="42" rx="11" ry="7" fill="' + l + '"/><circle cx="28.5" cy="40" r="1.3" fill="' + d + '"/><circle cx="35.5" cy="40" r="1.3" fill="' + d + '"/>' + smile(45); break;
      case "vogel": s = '<path d="M32 15 Q28 4 22 6 Q28 9 30 15Z M32 15 Q36 3 42 6 Q36 9 34 15Z" fill="' + d + '"/>';
        face = '<ellipse cx="32" cy="41" rx="15" ry="12" fill="' + l + '"/>' + eyes(31) + '<polygon points="27,37 37,37 32,45" fill="#F5AA28"/>' + cheeks(39); break;
      case "kind": head = "#F3CBA8"; s = '<circle cx="32" cy="34" r="24" fill="' + d + '"/><circle cx="11" cy="44" r="6" fill="' + d + '"/><circle cx="53" cy="44" r="6" fill="' + d + '"/>';
        face = '<path d="M10 33 Q12 13 32 13 Q52 13 54 33 Q46 22 32 23 Q18 22 10 33Z" fill="' + d + '"/>' + eyes(36) + smile(43) + cheeks(41); break;
      case "roboter": head = ""; s = '<line x1="32" y1="4" x2="32" y2="13" stroke="' + d + '" stroke-width="2.5"/><circle cx="32" cy="5" r="3.2" fill="#F2B53C"/><rect x="5" y="30" width="6" height="12" rx="2" fill="' + d + '"/><rect x="53" y="30" width="6" height="12" rx="2" fill="' + d + '"/><rect x="10" y="13" width="44" height="42" rx="12" fill="' + c + '"/>';
        face = '<rect x="16" y="24" width="32" height="14" rx="7" fill="' + l + '"/>' + eyes(31) + '<rect x="25" y="44" width="14" height="4" rx="2" fill="' + d + '"/>'; break;
      case "monster": s = '<path d="M18 18 Q14 6 22 4 Q20 10 25 15Z M46 18 Q50 6 42 4 Q44 10 39 15Z" fill="' + l + '"/>';
        face = '<circle cx="32" cy="31" r="7.5" fill="#fff"/><circle cx="32" cy="32" r="3.6" fill="' + k + '"/><path d="M24 43 Q32 50 40 43Z" stroke="#3C2828" stroke-width="2" fill="#7A2E3A" stroke-linejoin="round"/><polygon points="29,43.4 31.4,43.4 30.2,46.4" fill="#fff"/>' + cheeks(40); ey = 0; break;
      default: s = '<circle cx="14" cy="16" r="9" fill="' + c + '"/><circle cx="50" cy="16" r="9" fill="' + c + '"/><circle cx="14" cy="16" r="4.5" fill="' + l + '"/><circle cx="50" cy="16" r="4.5" fill="' + l + '"/>';
        face = eyes(31) + muzzle + smile(43);
    }
    if (head) s += '<circle cx="32" cy="35" r="22" fill="' + head + '"/>';
    s += face;
    switch (a.extra) {
      case "krone": s += '<polygon points="21,15 23,4 28,10 32,2 36,10 41,4 43,15" fill="#F2B93B"/><circle cx="32" cy="9" r="1.8" fill="#D9586F"/>'; break;
      case "schleife": s += '<path d="M45 13 L37 8 L37 18Z M45 13 L53 8 L53 18Z" fill="#E56B8C"/><circle cx="45" cy="13" r="2.6" fill="#C2476A"/>'; break;
      case "brille": s += ey ? '<circle cx="25" cy="' + ey + '" r="6" fill="none" stroke="' + k + '" stroke-width="1.8"/><circle cx="39" cy="' + ey + '" r="6" fill="none" stroke="' + k + '" stroke-width="1.8"/><line x1="31" y1="' + ey + '" x2="33" y2="' + ey + '" stroke="' + k + '" stroke-width="1.8"/>'
        : '<circle cx="32" cy="31" r="9" fill="none" stroke="' + k + '" stroke-width="1.8"/>'; break;
      case "blume": s += '<g transform="translate(48,15)"><circle cy="-4" r="3.4" fill="#FFF"/><circle cx="4" r="3.4" fill="#FFF"/><circle cy="4" r="3.4" fill="#FFF"/><circle cx="-4" r="3.4" fill="#FFF"/><circle r="2.6" fill="#F2B53C"/></g>'; break;
      case "stern": s += '<path d="M54 4 L55.6 8.6 L60 10 L55.6 11.4 L54 16 L52.4 11.4 L48 10 L52.4 8.6Z" fill="#FFD25A"/>'; break;
      case "muetze": s += '<path d="M12 24 Q14 6 32 6 Q50 6 52 24Z" fill="#4F8FE0"/><rect x="10" y="21" width="44" height="6" rx="3" fill="#3A6FB8"/><circle cx="32" cy="5" r="4" fill="#fff"/>'; break;
    }
    return s;
  }

  /* ---------- Stimmen ---------- */
  const VOICES = KAT.stimmen, VMAP = Object.fromEntries(VOICES.map((v) => [v.key, v])), VID = Object.fromEntries(VOICES.map((v) => [v.id, v.key]));
  const vkey = (x) => (x && VMAP[x] ? x : (x && VID[x]) || null);
  const EIG_KLANG = { mutig: ["kraeftig", "munter"], schuechtern: ["sanft", "ruhig"], lustig: ["verspielt", "froehlich"], neugierig: ["munter", "quirlig"], ruhig: ["ruhig", "sanft"],
    frech: ["quirlig", "verspielt"], hilfsbereit: ["warm", "froehlich"], vertraeumt: ["sanft", "warm"], stark: ["kraeftig", "tief"], klug: ["klar", "weise"], wild: ["quirlig", "kraeftig"], gemuetlich: ["gemuetlich", "warm"] };
  const ROLLE_PREF = { "ERZÄHLER": { alter: "erwachsen", tags: ["erzaehlend", "warm"] }, MAMA: { g: "w", alter: "erwachsen", tags: ["warm", "sanft"] }, PAPA: { g: "m", alter: "erwachsen", tags: ["warm", "froehlich"] },
    OMA: { g: "w", alter: "erwachsen", tags: ["warm", "froehlich"] }, OPA: { g: "m", alter: "alt", tags: ["weise", "warm"] }, FRAU: { g: "w", alter: "erwachsen", tags: ["klar", "froehlich"] },
    MANN: { g: "m", alter: "erwachsen", tags: ["sanft", "klar"] }, KIND: { alter: "jung", tags: ["munter", "verspielt"] } };
  const PERSON_ROLLE = { "Mama": "MAMA", "Papa": "PAPA", "Oma": "OMA", "Opa": "OPA", "Geschwister": "KIND", "Erzieherin oder Lehrerin": "FRAU", "Freundin oder Freund": "KIND" };
  function prefFigur(f) {
    const tags = []; ((f && f.eigenschaften) || []).forEach((e) => (EIG_KLANG[e] || []).forEach((x) => { if (!tags.includes(x)) tags.push(x); }));
    if (f && f.form === "drache" && !tags.length) tags.push("kraeftig");
    return { alter: f && f.form === "roboter" ? "" : "jung", tags: tags.length ? tags : ["munter", "verspielt"] };
  }
  function prefRolle(rolle, figur) {
    if (ROLLE_PREF[rolle]) return ROLLE_PREF[rolle];
    if (festeFiguren.includes(rolle)) { const v = VMAP[KAT.standard[rolle]]; return { def: v.key, g: v.g, alter: v.alter, tags: v.klang }; }
    return prefFigur(figur);
  }
  function punkte(v, p) { let s = 0; if (p.g) { if (v.g === p.g) s += 3; else if (v.g !== "n") s -= 3; } if (p.alter && v.alter === p.alter) s += 2; (p.tags || []).forEach((x) => { if (v.klang.includes(x)) s += 2; }); if (p.def === v.key) s += 6; return s; }
  const vorschlag = (p, n) => VOICES.map((v, i) => [v, punkte(v, p) - i / 100]).sort((a, b) => b[1] - a[1]).slice(0, n || 3).map((x) => x[0].key);
  const vmeta = (v) => [t("g_" + v.g), t("a_" + v.alter), ...v.klang.slice(0, 2).map((k) => (TX.klang[k] ? pick(TX.klang[k]) : k))].join(" · ");

  const probe = { a: null, key: null, btn: null };
  function stopProbe() { const a = probe.a; probe.a = null; probe.key = null; if (a) { a.onerror = null; try { a.pause(); } catch (e) { /* egal */ } } if (probe.btn) { probe.btn.setAttribute("aria-pressed", "false"); probe.btn.textContent = "▶"; } probe.btn = null; }
  function playProbe(key, sprache, b, msg) {
    if (!VMAP[key]) return; const gleich = probe.key === key && probe.btn === b; stopProbe(); if (gleich) return;
    const fail = () => { stopProbe(); if (msg) msg.textContent = t("probeFehlt"); };
    const a = new Audio("stimmen/proben/" + (["de", "en", "es", "pt"].includes(sprache) ? sprache : "de") + "/" + key + ".mp3");
    probe.a = a; probe.key = key; probe.btn = b; if (b) { b.setAttribute("aria-pressed", "true"); b.textContent = "■"; } if (msg) msg.textContent = "";
    a.onended = stopProbe; a.onerror = fail; const pr = a.play(); if (pr && pr.catch) pr.catch(fail);
  }

  /** Liste mit aktueller Stimme, drei Vorschlägen und auf Wunsch allen Stimmen */
  function stimmWahl(box, o) {
    let alle = false;
    const zeichne = () => {
      box.textContent = ""; const sug = (o.sugg || []).map((x) => (typeof x === "string" ? { stimme: x } : x)).filter((x) => x && VMAP[x.stimme]).slice(0, 3);
      const keys = sug.map((x) => x.stimme), gezeigt = new Set();
      const zeile = (key, grund) => {
        if (gezeigt.has(key)) return; gezeigt.add(key); const v = VMAP[key]; const r = el("div", "vrow"); const b = btn("pickv"); b.setAttribute("aria-pressed", String(o.sel === key));
        b.appendChild(el("span", "vi", v ? v.name.charAt(0) : "✦")); const tx = el("span", "vt"); const nm = el("strong", null, v ? v.name : t("automatisch"));
        if (v && o.cur === key) nm.appendChild(el("span", "vbadge now", t("jetzt"))); else if (keys.includes(key)) nm.appendChild(el("span", "vbadge", t("vorschlag")));
        tx.appendChild(nm); if (v) tx.appendChild(el("small", null, vmeta(v))); if (grund) tx.appendChild(el("em", null, grund)); b.appendChild(tx);
        b.onclick = () => { o.sel = key; o.onPick(key); zeichne(); }; r.appendChild(b);
        if (v) { const p = btn("play", "▶"); p.setAttribute("aria-label", t("probe") + ": " + v.name); p.setAttribute("aria-pressed", "false"); p.onclick = () => playProbe(key, o.sprache, p, o.msg); r.appendChild(p); }
        box.appendChild(r);
      };
      if (o.auto) zeile(""); if (o.cur) zeile(o.cur); sug.forEach((x) => zeile(x.stimme, x.grund)); if (o.sel) zeile(o.sel);
      if (alle) VOICES.forEach((v) => zeile(v.key));
      const tg = btn("ghost", alle ? t("weniger") : t("alleStimmen") + " (" + VOICES.length + ")"); tg.style.alignSelf = "flex-start"; tg.onclick = () => { alle = !alle; zeichne(); }; box.appendChild(tg);
    };
    zeichne();
  }

  /** Figuren-Editor im Seitenfluss. f: vorhandene Figur oder null. */
  function editor(box, f, o) {
    const fe = f ? JSON.parse(JSON.stringify(f)) : { id: null, name: "", art: "", form: "baer", farbe: FARBEN[3], extra: "keins", eigenschaften: [], besonderheit: "", sprechweise: "", stimme: "" };
    if (!Array.isArray(fe.eigenschaften)) fe.eigenschaften = [];
    const zeichne = () => {
      box.hidden = false; box.textContent = "";
      box.appendChild(el("h3", null, fe.id ? t("feBearbeiten") : t("feTitel")));
      const pv = el("div", "preview"), av = el("div", "ava"), pt = el("div"), nm = el("strong", null, fe.name || "…"), ar = el("span", "hint", fe.art || ""); pt.append(nm, ar);
      const bild = () => { av.style.background = tint(fe.farbe); av.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true">' + avatar(fe) + "</svg>"; nm.textContent = fe.name || "…"; ar.textContent = fe.art || ""; };
      bild(); pv.append(av, pt); box.appendChild(pv);
      const feld = (lab, ph, key, max, area) => { const l = el("label", "f"); l.appendChild(el("span", null, t(lab))); const i = el(area ? "textarea" : "input"); i.maxLength = max; i.placeholder = t(ph); i.value = fe[key] || "";
        if (area) i.style.minHeight = "64px"; else i.autocomplete = "off"; i.oninput = () => { fe[key] = i.value; bild(); }; l.appendChild(i); return l; };
      box.append(feld("feName", "feNamePh", "name", 24), feld("feArt", "feArtPh", "art", 80));
      const sek = (lab, extra) => { const w = el("div"); w.style.cssText = "display:flex;flex-direction:column;gap:8px"; const h = el("span", "sub", t(lab)); if (extra) h.appendChild(el("span", "hint", extra)); w.appendChild(h); box.appendChild(w); return w; };
      const fw = sek("feForm"), formen = el("div", "forms");
      FORMEN.forEach((k) => { const b = btn(null); b.setAttribute("aria-pressed", String(fe.form === k)); b.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true">' + avatar(Object.assign({}, fe, { form: k, extra: "keins" })) + "</svg>";
        b.appendChild(el("span", null, pick(TX.formen[k]))); b.onclick = () => { fe.form = k; zeichne(); }; formen.appendChild(b); }); fw.appendChild(formen);
      const cw = sek("feFarbe"), sw = el("div", "swatches");
      FARBEN.forEach((c, i) => { const b = btn(null); b.style.background = c; b.setAttribute("aria-pressed", String(fe.farbe === c)); b.setAttribute("aria-label", t("feFarbe") + " " + (i + 1)); b.onclick = () => { fe.farbe = c; zeichne(); }; sw.appendChild(b); }); cw.appendChild(sw);
      const xw = sek("feExtra"), xs = el("div", "chips");
      EXTRAS.forEach((k) => { const b = btn("chip", pick(TX.extras[k])); b.setAttribute("aria-pressed", String(fe.extra === k)); b.onclick = () => { fe.extra = k; zeichne(); }; xs.appendChild(b); }); xw.appendChild(xs);
      const ew = sek("feEigenschaften", " · " + t("bisDrei")), es = el("div", "chips");
      EIGS.forEach((k) => { const an = fe.eigenschaften.includes(k); const b = btn("chip", pick(TX.eigenschaften[k])); b.setAttribute("aria-pressed", String(an)); b.disabled = !an && fe.eigenschaften.length >= 3;
        b.onclick = () => { fe.eigenschaften = an ? fe.eigenschaften.filter((x) => x !== k) : [...fe.eigenschaften, k]; zeichne(); }; es.appendChild(b); }); ew.appendChild(es);
      box.append(feld("feBesonders", "feBesondersPh", "besonderheit", 160, true), feld("feSprechweise", "feSprechweisePh", "sprechweise", 120, true));
      const vw = sek("feStimme"); vw.appendChild(el("span", "hint", t("feStimmeHint"))); const vb = el("div", "voices"), msg = el("span", "hint"); msg.setAttribute("role", "status");
      stimmWahl(vb, { sel: vkey(fe.stimme) || "", auto: true, sugg: vorschlag(prefFigur(fe)), sprache: o.sprache(), onPick: (k) => { fe.stimme = k; }, msg }); vw.append(vb, msg);
      box.appendChild(el("p", "ki", t("feEigen")));
      const err = el("p", "err"); err.hidden = true; err.setAttribute("role", "alert");
      const act = el("div", "actions"); act.style.justifyContent = "flex-start";
      const sv = btn("cta", t("feSpeichern")); const cc = btn(null, t("abbrechen")); cc.onclick = () => { stopProbe(); o.abbrechen(); }; act.append(sv, cc);
      sv.onclick = async () => {
        const name = (fe.name || "").trim(), art = (fe.art || "").trim(); const fail = (m) => { err.textContent = m; err.hidden = false; };
        if (!name || !art) return fail(t("feFehlt"));
        sv.disabled = true; stopProbe();
        const zeile = { name, art, form: fe.form, farbe: fe.farbe, extra: fe.extra, eigenschaften: fe.eigenschaften.slice(0, 3),
          besonderheit: (fe.besonderheit || "").trim(), sprechweise: (fe.sprechweise || "").trim(), stimme: vkey(fe.stimme) || null };
        const m = await o.speichern(fe.id, zeile); if (m) { sv.disabled = false; fail(m); }
      };
      if (fe.id) { const del = btn("ghost", t("feLoeschen")); del.onclick = () => { del.hidden = true; const q = el("span", "hint", t("feLoeschenFrage")); const y = btn("soft", t("ja")); const n = btn(null, t("abbrechen"));
        y.onclick = async () => { const m = await o.loeschen(fe.id); if (m) { err.textContent = m; err.hidden = false; } }; n.onclick = () => { q.remove(); y.remove(); n.remove(); del.hidden = false; }; act.append(q, y, n); }; act.appendChild(del); }
      box.append(err, act);
    };
    zeichne();
  }

  return { FORMEN, EXTRAS, EIGS, FARBEN, VOICES, VMAP, PERSON_ROLLE, avatar, tint, vkey, vmeta, prefFigur, prefRolle, vorschlag, stimmWahl, playProbe, stopProbe, editor, lang };
};
