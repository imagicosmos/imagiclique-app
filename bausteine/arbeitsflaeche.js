// Baustein „arbeitsflaeche“ – Rahmen der Arbeitsansicht: Kopf, Bild, EIN Werkzeugfeld, Themenleiste (am PC auch eine Liste links).
// Alle Teile liegen im normalen Layout nebeneinander bzw. untereinander, nichts liegt über dem Bild. Das Bild bekommt den Restplatz.
// Die Anordnung richtet sich nach der Breite des Behälters: unter 600 Handy, 600–839 Tablet (Feld seitlich), ab 840 PC (alle Themen offen).
// Umgeschaltet wird nur über Klassen und CSS: Die Elemente der App werden einmal eingesetzt und danach nie verschoben oder neu gebaut,
// Eingaben, Fokus und Auswahl bleiben also beim Drehen stehen.
// Quelle: Repo imagicosmos/bausteine, arbeitsflaeche/arbeitsflaeche.js. In den Apps eine Kopie: NICHT VON HAND ÄNDERN. Ohne fremden Code.
//
// const f = ImagicosmosArbeitsflaeche.aufbauen(behaelter, {   // behaelter braucht eine feste Höhe (z. B. 100dvh)
//   kopf: Element,                           // z. B. die Leiste des Bausteins menue
//   bild: Element,                           // Zeichenfläche oder Kasten; die Größe bestimmt der Baustein
//   verhaeltnis: 9 / 16,                     // Breite / Höhe des Bildes
//   leiste: Element,                         // darin z. B. die Leiste des Bausteins vorschau (weglassen = keine)
//   blaettern: { zurueck: () => …, weiter: () => … },   // „Bild x von n ‹ ›“, gezeigt ab seite(x, n) mit n > 1 (weglassen = keines)
//   liste: Element,                          // nur am PC links (weglassen = keine)
//   themen: { nichts: [{ id, name, symbol, element }], foto: […] },   // je Zustand; symbol: SVG-Element (wird kopiert) oder Pfad „M…“ im 24er-Feld
//   zustand: "nichts", thema: "vorlage",     // Anfang (Vorgabe: erster Zustand, dessen erstes Thema)
//   zu: false,                               // am Handy zugeklappt beginnen
//   wechsel: ({ zustand, thema, zu, stufe, quer, tastatur }) => …,    // Thema, Zustand oder Zuklappen hat sich geändert
//   anordnung: ({ … }) => …,                 // andere Anordnung (stufe „handy“ | „tablet“ | „pc“) oder Tastatur auf/zu
//   texte: { … },                            // eigene Texte (siehe TEXTE)
// });
// f.zustand(name?, themaId?)  lesen bzw. setzen; mit themaId wird dieses Thema geöffnet
// f.thema(id?)  lesen bzw. öffnen · f.zu(wert?)  lesen bzw. setzen · f.themen(name, liste)  Satz eines Zustands ersetzen
// f.seite(x, n) · f.verhaeltnis(zahl) · f.stand() · f.messen() · f.loesen() · f.teile { wurzel, kopf, liste, buehne, feld, leiste }
// ab 1.2.0: f.liste(an?)  Liste am PC zeigen oder verbergen (z. B. erst ab zwei Einträgen); Tablet und PC: das Bild bekommt nur so viel
//   Breite, wie es bei voller Höhe braucht (--af-bildspalte), den Rest das Feld (bis 40rem)
(function (wurzel) {
  "use strict";
  var VERSION = "1.2.0";
  var TABLET = 600, PC = 840;          // Breite des Behälters
  var QUER_AB = 400;                   // schmaler haben Bild, Feld und Leiste nebeneinander keinen Platz
  var NIEDRIG = 480;                   // darunter (und breiter als hoch): Themenleiste an die Seite, damit das Bild Höhe behält
  var TASTATUR = 120;                  // um so viel muss das Fenster niedriger werden, damit es als Bildschirmtastatur gilt
  var RAND = 44;                       // Breite des Hinweises „hier geht es weiter“ an den Enden der Leiste (auch in der CSS)
  var VERDECKT = 8;                    // erst ab so vielen verdeckten Punkten gibt es den Hinweis
  var BILD_AB = 360;                   // mit Tastatur: ab dieser Resthöhe bleibt das Bild am Handy sichtbar
  var TEXTE = { werkzeuge: "Werkzeuge", feld: "Werkzeugfeld", liste: "Liste", blaettern: "Bilder", zurueck: "Vorheriges Bild", weiter: "Nächstes Bild",
    seite: function (x, n) { return "Bild " + x + " von " + n; } };
  var KOPIE = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant", "lineHeight", "letterSpacing", "wordSpacing", "textTransform", "textIndent",
    "textAlign", "tabSize", "direction", "wordBreak", "overflowWrap", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
  var zaehler = 0;

  // ---------- Rechenteile (auch in Node testbar) ----------
  function anordnung(breite, hoehe) {
    var stufe = breite >= PC ? "pc" : breite >= TABLET ? "tablet" : "handy";
    return { stufe: stufe, quer: stufe !== "pc" && hoehe < NIEDRIG && breite > hoehe && breite >= QUER_AB };
  }

  /** Bildschirmtastatur. m: { tippt, hoehe, grundhoehe, unten (Unterkante des Behälters), sichtbarUnten, zoom } → { offen, verdeckt }.
      Browser: nur der sichtbare Ausschnitt wird kleiner (verdeckt > 0). WebView: das Fenster selbst schrumpft (verdeckt = 0). */
  function tastatur(m) {
    if (!m.tippt) return { offen: false, verdeckt: 0 };
    var verdeckt = m.zoom > 1.05 ? 0 : Math.max(0, Math.round(m.unten - m.sichtbarUnten));
    if (verdeckt < 80) verdeckt = 0;
    return { offen: verdeckt > 0 || (m.grundhoehe > 0 && m.hoehe < m.grundhoehe - TASTATUR), verdeckt: verdeckt };
  }

  /** Welches Thema gilt: das gewünschte, sonst das zuletzt benutzte dieses Zustands, sonst das bisherige, sonst das erste. */
  function themaWaehlen(satz, wunsch, zuletzt, bisher) {
    var ids = satz.map(function (t) { return t.id; });
    return [wunsch, zuletzt, bisher].filter(function (id) { return id != null && ids.indexOf(id) >= 0; })[0] || ids[0] || null;
  }

  /** Antippen eines Themas: das aktive noch einmal klappt am Handy zu (oder wieder auf). */
  function tippen(stand, id, klappbar) {
    return { thema: id, zu: klappbar && id === stand.thema ? !stand.zu : false };
  }

  /** Pfeiltasten in der Themenleiste: neuer Platz oder -1 */
  function pfeil(taste, i, n) {
    if (taste === "ArrowRight" || taste === "ArrowDown") return (i + 1) % n;
    if (taste === "ArrowLeft" || taste === "ArrowUp") return (i + n - 1) % n;
    return taste === "Home" ? 0 : taste === "End" ? n - 1 : -1;
  }

  /** Themenleiste: Was ist verdeckt? Rollstand, sichtbare und ganze Länge → { davor, danach } */
  function mehr(stand, sichtbar, ganz) {
    return { davor: sichtbar > 0 && stand > VERDECKT, danach: sichtbar > 0 && ganz - sichtbar - stand > VERDECKT };
  }

  function tipptIn(a) {
    if (!a) return false;
    if (a.isContentEditable || a.tagName === "TEXTAREA") return true;
    return a.tagName === "INPUT" && !/^(range|color|file|checkbox|radio|button|submit|reset|image|date)$/.test(a.type || "text");
  }

  // ---------- Oberfläche ----------
  function aufbauen(behaelter, o) {
    if (!behaelter || !o || !o.bild || !o.themen) throw new Error("arbeitsflaeche: behaelter, bild und themen fehlen");
    var doc = behaelter.ownerDocument, win = doc.defaultView, nr = ++zaehler;
    var texte = Object.assign({}, TEXTE, o.texte);
    var saetze = Object.assign({}, o.themen), zuletzt = {};
    var zustand = saetze[o.zustand] ? o.zustand : Object.keys(saetze)[0];
    var thema = themaWaehlen(saetze[zustand] || [], o.thema), zu = !!o.zu;
    var jetzt = null, offen = false, verdeckt = 0, grund = { b: 0, h: 0 }, uhr = 0, weg = false, nutzHoehe = 0;
    var felder = new Map();          // Element der App → sein Abschnitt (einmal gebaut, nie verschoben)
    var knoepfe = {};                // Themenknöpfe nach id

    function neu(art, klasse, eltern, wie) {
      var e = doc.createElement(art); e.className = klasse;
      for (var k in wie || {}) e.setAttribute(k, wie[k]);
      if (eltern) eltern.appendChild(e);
      return e;
    }
    var w = neu("div", "af", null);
    var kopf = neu("div", "af-kopf", w);
    var liste = neu("aside", "af-liste", w, { "aria-label": texte.liste });
    var buehne = neu("div", "af-buehne", w);
    var feld = neu("div", "af-feld", w, { role: "region", "aria-label": texte.feld, tabindex: "-1" });
    var zeile = neu("div", "af-zeile", feld);
    var inhalt = neu("div", "af-inhalt", feld);
    var leiste = neu("div", "af-leiste", w, { role: "toolbar", "aria-label": texte.werkzeuge });
    w.classList.toggle("af-ohne-kopf", !o.kopf);
    w.classList.toggle("af-mit-liste", !!o.liste);
    if (o.kopf) kopf.appendChild(o.kopf);
    if (o.liste) liste.appendChild(o.liste);
    o.bild.classList.add("af-bild"); buehne.appendChild(o.bild);

    var blatt = null;
    if (o.blaettern) {
      blatt = neu("div", "af-blaettern", zeile, { role: "group", "aria-label": texte.blaettern });
      blatt.hidden = true;
      var blattKnopf = function (zeichen, name, tun) {
        var b = neu("button", "af-knopf", blatt, { type: "button", "aria-label": name });
        b.textContent = zeichen;
        // aria-disabled statt disabled: am Ende der Reihe bleibt der Fokus auf dem Knopf
        b.addEventListener("click", function () { if (b.getAttribute("aria-disabled") !== "true") tun(); });
        return b;
      };
      var vor = blattKnopf("‹", texte.zurueck, function () { o.blaettern.zurueck(); });
      var blattText = neu("span", "af-seite", blatt, { "aria-live": "polite" });
      var nach = blattKnopf("›", texte.weiter, function () { o.blaettern.weiter(); });
    }
    if (o.leiste) zeile.appendChild(o.leiste);

    var leisteRo = new win.ResizeObserver(mehrZeigen);
    function satz() { return saetze[zustand] || []; }
    function abschnitt(t) {
      var a = felder.get(t.element);
      if (!a) {
        a = neu("section", "af-thema", inhalt, { id: "af-" + nr + "-" + (felder.size + 1) });
        neu("h2", "af-titel", a);
        a.appendChild(t.element);
        felder.set(t.element, a);
      }
      return a;
    }
    function symbol(s) {
      if (s && s.nodeType) { var k = s.cloneNode(true); k.setAttribute("aria-hidden", "true"); return k; }
      var ns = "http://www.w3.org/2000/svg", svg = doc.createElementNS(ns, "svg"), p = doc.createElementNS(ns, "path");
      svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); p.setAttribute("d", s || ""); svg.appendChild(p);
      return svg;
    }
    function klappbar() { return !!jetzt && jetzt.stufe === "handy" && !jetzt.quer; }
    function stand() { return { zustand: zustand, thema: thema, zu: zu, stufe: jetzt ? jetzt.stufe : null, quer: !!jetzt && jetzt.quer, tastatur: offen }; }
    function melden(vorher) {
      if (o.wechsel && (vorher.zustand !== zustand || vorher.thema !== thema || vorher.zu !== zu)) o.wechsel(stand());
    }

    /** Themenknöpfe des Zustands; vorhandene Knöpfe (gleiche id) bleiben dieselben Elemente. */
    function leisteBauen() {
      var fokus = leiste.contains(doc.activeElement), alt = knoepfe; knoepfe = {};
      var reihe = satz().map(function (t) {
        var b = alt[t.id] || neu("button", "af-themenknopf", null, { type: "button", "data-thema": t.id });
        b.textContent = ""; b.appendChild(symbol(t.symbol)); neu("span", "", b).textContent = t.name;
        b.setAttribute("aria-controls", abschnitt(t).id);
        return (knoepfe[t.id] = b);
      });
      if (reihe.length !== leiste.children.length || reihe.some(function (b, i) { return b !== leiste.children[i]; })) {
        leiste.textContent = "";
        reihe.forEach(function (b) { leiste.appendChild(b); });
        if (fokus && knoepfe[thema]) knoepfe[thema].focus({ preventScroll: true });
      }
      leisteRo.disconnect(); leisteRo.observe(leiste); reihe.forEach(function (b) { leisteRo.observe(b); });   // auch bei anderer Schriftgröße
    }
    function zeigen() {
      var alle = !!jetzt && jetzt.stufe === "pc", da = new Map();
      satz().forEach(function (t) { if (!da.has(abschnitt(t)) || t.id === thema) da.set(abschnitt(t), t); });
      felder.forEach(function (a) {
        var t = da.get(a);
        a.hidden = !t || !(alle || t.id === thema);
        if (t && a.firstChild.textContent !== t.name) { a.firstChild.textContent = t.name; a.setAttribute("aria-label", t.name); }
      });
      w.classList.toggle("af-zu", zu && klappbar());
      satz().forEach(function (t) {
        var b = knoepfe[t.id], an = t.id === thema;
        b.setAttribute("aria-expanded", String(an && !(zu && klappbar())));
        b.tabIndex = an ? 0 : -1;
      });
    }
    function knopfZeigen() {     // nur die Leiste selbst rollen, nie die Seite
      var b = knoepfe[thema]; if (!b) return;
      var l = leiste.getBoundingClientRect(), r = b.getBoundingClientRect(), q = jetzt && jetzt.quer;
      var dx = q ? 0 : RAND, dy = q ? RAND : 0;          // neben dem Hinweis, nicht darunter; am Ende der Leiste begrenzt der Browser
      if (r.left < l.left + dx) leiste.scrollLeft -= l.left + dx - r.left; else if (r.right > l.right - dx) leiste.scrollLeft += r.right - l.right + dx;
      if (r.top < l.top + dy) leiste.scrollTop -= l.top + dy - r.top; else if (r.bottom > l.bottom - dy) leiste.scrollTop += r.bottom - l.bottom + dy;
      mehrZeigen();
    }
    function mehrStand() {
      return jetzt && jetzt.quer ? mehr(leiste.scrollTop, leiste.clientHeight, leiste.scrollHeight) : mehr(leiste.scrollLeft, leiste.clientWidth, leiste.scrollWidth);
    }
    function mehrZeigen() {      // Hinweis, dass die Leiste weitergeht (Zeichnung: ::before und ::after in der CSS)
      var m = mehrStand();
      w.classList.toggle("af-mehr-davor", m.davor); w.classList.toggle("af-mehr-danach", m.danach);
    }
    /** Tipp auf einen Hinweis: rollt die Leiste weiter. Der Hinweis fängt selbst nichts ab, damit man auch dort wischen kann. */
    function weiterRollen(e) {
      if (!e.detail) return false;        // Taste oder Aufruf der App: meint den Knopf
      var l = leiste.getBoundingClientRect(), m = mehrStand(), q = jetzt && jetzt.quer;
      var p = q ? e.clientY - l.top : e.clientX - l.left, lang = q ? l.height : l.width;
      var r = m.davor && p < RAND ? -1 : m.danach && p > lang - RAND ? 1 : 0;
      if (r) leiste[q ? "scrollTop" : "scrollLeft"] += r * Math.max(RAND, lang - 2 * RAND);
      return !!r;
    }
    function setzen(z, t, klapp) {
      var vorher = stand(), anderer = z !== zustand, fokus = fokusImFeld();
      zustand = z; thema = t; zu = klapp;
      if (thema != null) zuletzt[zustand] = thema;
      if (anderer) leisteBauen();
      zeigen();
      if (anderer || thema !== vorher.thema) {
        if (jetzt && jetzt.stufe === "pc" && !anderer) zumAbschnitt(); else feld.scrollTop = 0;
        knopfZeigen();
      }
      fokusRetten(fokus);
      melden(vorher);
    }
    function abschnittVon(el) {
      var r = null;
      satz().forEach(function (t) { if (felder.get(t.element).contains(el) && r !== thema) r = t.id; });
      return r;
    }
    function zumAbschnitt() {
      var t = satz().filter(function (x) { return x.id === thema; })[0];
      if (t) feld.scrollTop += felder.get(t.element).getBoundingClientRect().top - feld.getBoundingClientRect().top;
    }
    /** Höhe der Schreibstelle auf dem Bildschirm { o, u }: in mehrzeiligen Feldern die Zeile der Schreibmarke (unsichtbare Messkopie), sonst das Feld. */
    function schreibstelle(a) {
      var r = a.getBoundingClientRect(); if (a.tagName !== "TEXTAREA") return { o: r.top, u: r.bottom };
      var st = win.getComputedStyle(a), m = neu("div", "", doc.body, { "aria-hidden": "true" }), s = m.style;
      KOPIE.forEach(function (k) { s[k] = st[k]; });
      s.position = "fixed"; s.left = "-9999px"; s.top = "0"; s.visibility = "hidden"; s.whiteSpace = "pre-wrap"; s.boxSizing = "border-box"; s.width = a.clientWidth + "px";
      m.textContent = a.value.slice(0, a.selectionDirection === "backward" ? a.selectionStart : a.selectionEnd);
      var marke = neu("span", "", m); marke.textContent = "​";
      var q = marke.getBoundingClientRect(), o = r.top + a.clientTop + q.top - m.getBoundingClientRect().top - a.scrollTop, h = q.height;
      m.remove();
      o = Math.max(r.top, Math.min(o, r.bottom - h));      // im Textfeld selbst weggerollt
      return { o: o, u: o + h };
    }
    function schreibt() { var a = doc.activeElement; return tipptIn(a) && feld.contains(a) ? a : null; }
    /** Schreibstelle sichtbar halten; ganz: das ganze Eingabefeld, falls es passt. Rollt nur so weit wie nötig und nur das Werkzeugfeld. */
    function feldZeigen(ganz) {
      var a = schreibt(); if (!a) return;
      var f = feld.getBoundingClientRect(), r = a.getBoundingClientRect();
      var z = ganz && r.height <= f.height - 16 ? { o: r.top, u: r.bottom } : schreibstelle(a);
      if (z.u > f.bottom - 8) feld.scrollTop += Math.ceil(Math.min(z.u - f.bottom + 8, z.o - f.top - 2));
      else if (z.o < f.top + 2) feld.scrollTop -= Math.ceil(f.top + 2 - z.o);
    }
    function beiRollen() {       // hat der Nutzer von der Schreibstelle weggerollt, wird er nicht zurückgeholt
      var a = schreibt(); if (!a) { weg = false; return; }
      var f = feld.getBoundingClientRect(), z = schreibstelle(a);
      weg = z.u > f.bottom + 1 || z.o < f.top - 1;
    }
    function beiEingabe() { weg = false; }

    function fokusRetten(a) {    // a hatte den Fokus und ist jetzt ausgeblendet: zur Leiste (oder zum Feld) statt auf die Seite
      if (!a || a === feld || a.getClientRects().length) return;
      var ziel = leiste.getClientRects().length && knoepfe[thema] || feld;
      ziel.focus({ preventScroll: true });
    }
    function fokusImFeld() { return feld.contains(doc.activeElement) ? doc.activeElement : null; }

    // ab 1.2.0: Breite, die das Bild bei voller Höhe der Bühne braucht (samt Rand); die CSS gibt den Rest dem Feld
    var bildspalte = 0, rv = 9 / 16;
    function spalteMessen() {
      var h = buehne.clientHeight; if (!h) return;
      var st = win.getComputedStyle(buehne), pv = parseFloat(st.paddingTop) + parseFloat(st.paddingBottom), ph = parseFloat(st.paddingLeft) + parseFloat(st.paddingRight);
      var b = Math.ceil(Math.max(0, h - pv) * rv + ph);
      if (b !== bildspalte) { bildspalte = b; w.style.setProperty("--af-bildspalte", b + "px"); }
    }
    function messen() {
      var r = w.getBoundingClientRect(); if (!r.width || !r.height) return;      // ausgeblendet: später
      var a = doc.activeElement, vv = win.visualViewport, tippt = tipptIn(a) && w.contains(a);
      if (!tippt) grund = { b: r.width, h: r.height };
      else if (r.width !== grund.b) grund = { b: r.width, h: offen && !verdeckt ? r.height + TASTATUR + 1 : r.height };   // beim Tippen gedreht: Tastatur bleibt offen
      var k = tastatur({ tippt: tippt, hoehe: r.height, grundhoehe: grund.h, unten: r.bottom,
        sichtbarUnten: vv ? vv.offsetTop + vv.height : r.bottom, zoom: vv ? vv.scale : 1 });
      var n = anordnung(r.width, k.offen ? Math.max(r.height, grund.h) : r.height);   // die Tastatur allein ändert die Anordnung nicht
      var gleich = jetzt && jetzt.stufe === n.stufe && jetzt.quer === n.quer, tastaturGleich = offen === k.offen;
      offen = k.offen;
      if (verdeckt !== k.verdeckt) { verdeckt = k.verdeckt; w.style.setProperty("--af-tastatur", verdeckt + "px"); }
      w.classList.toggle("af-tastatur", offen);
      w.classList.toggle("af-ohne-bild", offen && r.height - verdeckt < BILD_AB && !buehne.contains(a));
      if (!gleich) {
        jetzt = n;
        ["handy", "tablet", "pc"].forEach(function (s) { w.classList.toggle("af-" + s, n.stufe === s); });
        w.classList.toggle("af-quer", n.quer);
        var t = w.contains(a) ? abschnittVon(a) : null, vorher = stand();
        if (t) { thema = t; zu = false; zuletzt[zustand] = t; }        // wo gerade gearbeitet wird, bleibt offen
        zeigen();
        if (w.contains(a)) fokusRetten(a);       // Liste oder Leiste gibt es hier nicht: Fokus nicht verlieren
        knopfZeigen();
        melden(vorher);
      }
      // nur wenn sich die nutzbare Höhe ändert; beim Öffnen der Tastatur und beim Drehen immer, sonst nicht gegen den Nutzer
      var auf = offen && !tastaturGleich, hoehe = r.height - verdeckt;
      if (auf || !gleich || (hoehe !== nutzHoehe && !weg)) feldZeigen(auf);
      nutzHoehe = hoehe;
      if ((!gleich || !tastaturGleich) && o.anordnung) o.anordnung(stand());
    }
    function spaeter() { win.clearTimeout(uhr); uhr = win.setTimeout(messen, 350); }   // erst umbauen, wenn ein Tipp auf einen Knopf angekommen ist

    function beiKlick(e) {
      if (weiterRollen(e)) return;
      var b = e.target.closest(".af-themenknopf"); if (!b) return;
      var n = tippen({ thema: thema, zu: zu }, b.getAttribute("data-thema"), klappbar());
      setzen(zustand, n.thema, n.zu);
    }
    function beiTaste(e) {
      var b = e.target.closest(".af-themenknopf"); if (!b || e.ctrlKey || e.altKey || e.metaKey) return;
      var reihe = [].slice.call(leiste.children), i = pfeil(e.key, reihe.indexOf(b), reihe.length);
      if (i < 0) return;
      e.preventDefault();
      reihe.forEach(function (x, j) { x.tabIndex = j === i ? 0 : -1; });
      reihe[i].focus();
    }
    function beiFokus(e) {       // am PC sind alle Themen offen: aktiv ist das, in dem man arbeitet
      var t = jetzt && jetzt.stufe === "pc" ? abschnittVon(e.target) : null;
      if (t && t !== thema) { var vorher = stand(); thema = t; zuletzt[zustand] = t; zeigen(); melden(vorher); }
      weg = false;
      if (tipptIn(e.target)) spaeter();
    }
    leiste.addEventListener("click", beiKlick); leiste.addEventListener("keydown", beiTaste); leiste.addEventListener("scroll", mehrZeigen);
    feld.addEventListener("focusin", beiFokus); feld.addEventListener("input", beiEingabe); feld.addEventListener("scroll", beiRollen); w.addEventListener("focusout", spaeter);
    var sicht = win.visualViewport;
    if (sicht) { sicht.addEventListener("resize", messen); sicht.addEventListener("scroll", messen); }
    var ro = new win.ResizeObserver(messen); ro.observe(w);
    var spalteRo = new win.ResizeObserver(spalteMessen); spalteRo.observe(buehne);

    function verhaeltnis(v) { if (v > 0) { rv = v; w.style.setProperty("--af-verhaeltnis", String(v)); spalteMessen(); } }
    verhaeltnis(o.verhaeltnis || 9 / 16);
    Object.keys(saetze).forEach(function (z) { saetze[z].forEach(abschnitt); });   // alle Elemente gleich einsetzen
    behaelter.appendChild(w);
    if (thema != null) zuletzt[zustand] = thema;
    leisteBauen(); zeigen(); messen();

    return {
      zustand: function (z, t) {
        if (z === undefined) return zustand;
        if (!saetze[z]) throw new Error("arbeitsflaeche: unbekannter Zustand " + z);
        var ziel = themaWaehlen(saetze[z], t, z === zustand ? thema : zuletzt[z], thema);
        setzen(z, ziel, t != null && ziel === t ? false : zu);
      },
      thema: function (id) {
        if (id === undefined) return thema;
        if (satz().some(function (t) { return t.id === id; })) setzen(zustand, id, false);
      },
      zu: function (an) { if (an === undefined) return zu; setzen(zustand, thema, !!an); },
      themen: function (z, neue) {
        saetze[z] = neue; neue.forEach(abschnitt);
        if (zustand === undefined) zustand = z;        // bisher gab es keinen
        if (z !== zustand) return;
        var vorher = stand(), fokus = fokusImFeld();
        thema = themaWaehlen(neue, null, thema); zuletzt[z] = thema;
        leisteBauen(); zeigen(); knopfZeigen(); fokusRetten(fokus); melden(vorher);
      },
      seite: function (x, n) {
        if (!blatt) return;
        blatt.hidden = !(n > 1);
        var text = texte.seite(x, n); if (blattText.textContent !== text) blattText.textContent = text;
        vor.setAttribute("aria-disabled", String(x <= 1)); nach.setAttribute("aria-disabled", String(x >= n));
      },
      verhaeltnis: verhaeltnis, stand: stand, messen: messen,
      liste: function (an) { if (an === undefined) return w.classList.contains("af-mit-liste"); w.classList.toggle("af-mit-liste", !!an && !!o.liste); },
      teile: { wurzel: w, kopf: kopf, liste: liste, buehne: buehne, feld: feld, leiste: leiste },
      loesen: function () {      // hört auf, gibt die Elemente der App dem Behälter zurück und nimmt die eigene Hülle weg
        ro.disconnect(); leisteRo.disconnect(); spalteRo.disconnect(); leiste.removeEventListener("scroll", mehrZeigen); win.clearTimeout(uhr);
        if (sicht) { sicht.removeEventListener("resize", messen); sicht.removeEventListener("scroll", messen); }
        leiste.removeEventListener("click", beiKlick); leiste.removeEventListener("keydown", beiTaste);
        feld.removeEventListener("focusin", beiFokus); w.removeEventListener("focusout", spaeter);
        feld.removeEventListener("input", beiEingabe); feld.removeEventListener("scroll", beiRollen);
        if (!w.parentNode) return;
        o.bild.classList.remove("af-bild");
        [o.kopf, o.liste, o.bild, o.leiste].concat(Array.from(felder.keys())).forEach(function (e) { if (e && w.contains(e)) w.parentNode.insertBefore(e, w); });
        w.remove();
      }
    };
  }

  var api = { VERSION: VERSION, aufbauen: aufbauen, anordnung: anordnung, tastatur: tastatur, themaWaehlen: themaWaehlen, tippen: tippen, pfeil: pfeil, mehr: mehr,
    tipptIn: tipptIn, TEXTE: TEXTE, TABLET: TABLET, PC: PC, NIEDRIG: NIEDRIG };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  wurzel.ImagicosmosArbeitsflaeche = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
