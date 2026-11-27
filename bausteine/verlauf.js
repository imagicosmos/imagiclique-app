// Baustein „verlauf“ – Rückgängig und Wiederholen für eine App: merkt sich Stände, fasst schnelle Änderungen zu einem Schritt zusammen.
// Quelle: Repo imagicosmos/bausteine, verlauf/verlauf.js. In den Apps eine Kopie: NICHT VON HAND ÄNDERN.
//
// Die App sagt, wie ein Stand gelesen und gesetzt wird (lesen/schreiben, beliebige Daten, die sich als JSON schreiben lassen),
// und ruft nach jeder Änderung merken() auf. Änderungen, die schneller als „ruhe“ Millisekunden aufeinander folgen
// (Tippen eines Worts, Ziehen eines Stickers), werden ein Schritt. Ohne Oberfläche: Die Knöpfe baut die App, aenderung()
// sagt ihr, wann sie sie grau machen muss. Läuft auch unter Node.js (Tests). Ohne fremden Code.
//
//   var v = ImagicosmosVerlauf.erstellen({
//     lesen: () => ({ … }),                 // jetziger Stand
//     schreiben: stand => { … },            // Stand setzen und anzeigen (bekommt eine eigene Kopie)
//     aenderung: ({ zurueck, vor }) => …,   // ob es etwas zum Zurücknehmen bzw. Wiederholen gibt
//     max: 50, ruhe: 1000,                  // höchstens so viele Schritte; Pause in ms, ab der ein neuer Schritt beginnt
//   });
//   v.merken()        nach einer Änderung (gleicher Stand: nichts)   v.merken({ neu: true })   eigener Schritt, auch wenn schnell
//   v.zurueck()       einen Schritt zurück (true, wenn es ging)      v.vor()   einen Schritt wieder vor
//   v.kannZurueck(), v.kannVor()                                     v.neu()   von vorn: der jetzige Stand ist der erste
//   v.tasten(element) Strg+Z / Strg+Y / Strg+Umschalt+Z, außer beim Schreiben in Textfeldern (dort gilt das Rückgängig des Felds)
//   ImagicosmosVerlauf.tasten(element, () => verlauf)   dasselbe für mehrere Verläufe (z. B. je Gruppe): der gerade gültige oder null
(function (wurzel) {
  "use strict";

  var VERSION = "1.0.0";

  function erstellen(o) {
    o = o || {};
    if (typeof o.lesen !== "function" || typeof o.schreiben !== "function") throw new Error("verlauf: lesen und schreiben fehlen");
    var max = Math.max(1, Math.floor(o.max || 50)), ruhe = o.ruhe == null ? 1000 : o.ruhe;
    var jetzt = o.jetzt || function () { return Date.now(); };
    var liste = [], pos = -1, zuletzt = -Infinity, offen = false, gemeldet = null;

    function text() { return JSON.stringify(o.lesen()); }
    function melden() {
      var z = { zurueck: pos > 0, vor: pos < liste.length - 1 }, k = z.zurueck + "," + z.vor;
      if (k === gemeldet) return;
      gemeldet = k;
      if (o.aenderung) o.aenderung(z);
    }
    function neu() { liste = [text()]; pos = 0; offen = false; zuletzt = -Infinity; melden(); }
    function merken(m) {
      if (pos < 0) { neu(); return false; }
      var s = text(), t = jetzt();
      if (s === liste[pos]) return false;
      // offen: der letzte Schritt ist eben erst entstanden und darf noch wachsen
      if (offen && !(m && m.neu) && t - zuletzt < ruhe && pos === liste.length - 1) liste[pos] = s;
      else {
        liste.length = pos + 1; liste.push(s); pos++;
        if (liste.length > max + 1) { liste.shift(); pos--; }
        offen = true;
      }
      zuletzt = t;
      melden();
      return true;
    }
    function gehe(d) {
      if (pos < 0) return false;
      var s = text();
      if (s !== liste[pos]) { merken({ neu: true }); }   // noch nicht gemerkte Änderung zuerst sichern, sonst ginge sie verloren
      var ziel = pos + d;
      if (ziel < 0 || ziel >= liste.length) { melden(); return false; }
      pos = ziel; offen = false;
      o.schreiben(JSON.parse(liste[pos]));
      liste[pos] = text();                                // was die App beim Setzen ergänzt, gilt als dieser Stand
      melden();
      return true;
    }
    var v = {
      merken: merken, neu: neu,
      tasten: function (el) { tasten(el, function () { return v; }); },
      zurueck: function () { return gehe(-1); },
      vor: function () { return gehe(1); },
      kannZurueck: function () { return pos > 0; },
      kannVor: function () { return pos >= 0 && pos < liste.length - 1; },
      schritte: function () { return { pos: pos, anzahl: liste.length }; },
    };
    return v;
  }

  // Strg+Z / Strg+Y / Strg+Umschalt+Z; holen() liefert den gerade gültigen Verlauf (oder null)
  function tasten(el, holen) {
    if (!el || !el.addEventListener) return;
    el.addEventListener("keydown", function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      var t = e.target, schreibt = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));
      var v = holen && holen();
      if (schreibt || !v) return;
      var k = String(e.key || "").toLowerCase();
      if (k === "z" && !e.shiftKey) { if (v.zurueck()) e.preventDefault(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { if (v.vor()) e.preventDefault(); }
    });
  }

  var M = { VERSION: VERSION, erstellen: erstellen, tasten: tasten };
  if (typeof module === "object" && module.exports) module.exports = M;
  else wurzel.ImagicosmosVerlauf = M;
})(typeof window !== "undefined" ? window : this);
