// Imagiclique als Android-App (android/…/MainActivity.java): Gegenstück in der Oberfläche.
//
// Läuft die Seite in der App, gibt es das Objekt window.ImagicliqueApp (die „Brücke“). Dann ersetzt diese Datei, was
// eine Seite in der App nicht selbst kann, durch Aufrufe an die App – unter denselben Namen, die die Oberfläche
// ohnehin benutzt (navigator.share, navigator.clipboard). Der übrige Code bleibt damit gleich.
// Im Browser (Web-App) tut diese Datei nichts. Wird vor dem Hauptskript geladen und greift erst zur Laufzeit auf
// dessen Namen zu (toast, addFiles, takeShared, openStyleLink, restoring).
(() => {
  const APP = window.ImagicliqueApp;
  if (!APP) return;
  const N = window.NATIVE = window.ImagicliqueNative = {};   // NATIVE: für die Oberfläche, ImagicliqueNative: so ruft die App
  const say = (t, ms) => { try { toast(t, ms); } catch (e) {} };
  // Ladeanzeige (Baustein design) beim Holen der Auswahl vom Handy, mit Zähler; danach übernimmt addFiles() („Fotos werden vorbereitet“)
  const holen = (i, n) => { if (window.ImagicosmosDesign) ImagicosmosDesign.arbeit(`Die Auswahl wird geholt … ${Math.min(i + 1, n)} von ${n}`, i, n); };
  const holenEnde = () => { if (window.ImagicosmosDesign) ImagicosmosDesign.arbeitEnde(); };

  // ---- Dateien an die App geben: in Stücken als Base64 (eine Seite kann der App keine Datei direkt reichen) ----
  let line = Promise.resolve();                       // immer nur ein Vorgang gleichzeitig
  const queue = fn => { const p = line.then(fn, fn); line = p.catch(() => {}); return p; };
  const STEP = 3 * 262144;                            // durch 3 teilbar: die Stücke lassen sich aneinanderhängen
  const piece = blob => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result.slice(r.result.indexOf(',') + 1)); r.onerror = () => no(r.error);
    r.readAsDataURL(blob);
  });
  async function hand(files) {
    APP.ausgabeBeginnen();
    for (const f of files) {
      // von der App selbst erzeugte Videos (videos/<name>) liegen schon dort: nur dazunehmen, nicht noch einmal herüberschicken
      if (f._nativ && APP.dateiUebernehmen && APP.dateiUebernehmen(f._nativ, f.type || '')) continue;
      if (!APP.dateiBeginnen(f.name || 'datei', f.type || '')) throw new Error('Auf dem Gerät ist kein Platz für die Datei.');
      for (let i = 0; i < f.size; i += STEP) {
        if (!APP.dateiTeil(await piece(f.slice(i, i + STEP)))) throw new Error('Die Datei konnte nicht geschrieben werden (Speicher voll?).');
      }
      if (!APP.dateiEnde()) throw new Error('Die Datei konnte nicht geschrieben werden.');
    }
  }

  // ---- Teilen: das Teilen-Menü von Android, ohne die 50-MB-Grenze des Browsers ----
  let shareNo = 0;
  const waiting = {};
  const share = data => queue(async () => {
    const files = data && data.files ? [...data.files] : [];
    const big = files.reduce((a, f) => a + (f._nativ ? 0 : f.size), 0) > 6e6;
    if (big) say('Wird zum Teilen vorbereitet …', 60000);
    await hand(files);
    if (big) say('', 1);
    const text = [data && data.text, data && data.url].filter(Boolean).join('\n');
    const nr = ++shareNo;
    // status: direkt an den WhatsApp-Status (ohne Teilen-Menü, „Mein Status“ ist schon gewählt); ältere App-Fassungen kennen das nicht
    const direkt = !!(data && data.status && APP.teilenStatus);
    return new Promise((ok, no) => { waiting[nr] = { ok, no }; (direkt ? APP.teilenStatus : APP.teilen).call(APP, nr, text, (data && data.title) || ''); });
  });
  N.teilenFertig = (nr, chosen, err) => {
    const w = waiting[nr]; if (!w) return;
    delete waiting[nr];
    if (chosen) w.ok(); else w.no(new DOMException(err || 'Teilen abgebrochen', err ? 'DataError' : 'AbortError'));
  };
  N.statusDirekt = !!APP.teilenStatus;
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });

  // ---- Speichern: Bilder und Videos in die Galerie (Album „Imagiclique“), anderes nach Download/Imagiclique ----
  N.save = (blob, name) => queue(async () => {
    try {
      await hand([new File([blob], name, { type: blob.type || '' })]);
      const ort = APP.speichern();
      if (!ort) throw 0;
      say(/^(Pictures|Movies)/.test(ort) ? 'Gespeichert – in der Galerie im Album „Imagiclique“.' : 'Gespeichert im Ordner Download/Imagiclique.', 5000);
    } catch (e) { say('Speichern hat nicht geklappt.' + (e && e.message ? ' ' + e.message : ''), 5000); }
  });

  // ---- Zwischenablage ----
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async t => { APP.kopieren(String(t)); },
    readText: async () => APP.einfuegen(),
  } });

  // ---- Diktieren: die Spracheingabe des Geräts (Baustein „textfeld“ startet sie über ImagicliqueApp.diktieren) ----
  // Das Ergebnis geht an den Baustein; die frühere nachgebaute Spracherkennung entfällt (sonst öffnete der Baustein nach jedem
  // Ergebnis die Spracheingabe neu, weil er im Browser nach einer Pause weiter zuhört).
  N.diktat = text => { if (window.ImagicosmosTextfeld) ImagicosmosTextfeld.androidErgebnis(text); };

  // ---- Fotos und Videos: die App öffnet die Auswahl und gibt Fotos im Original heraus (mit Aufnahmeort) ----
  // Gewählte oder geteilte Dateien liegen unter /_wahl/<runde>/<nr> bereit.
  // Videos (seit 20.11.2026, Baustein videoschnitt 1.3.0): Die App legt nur ihre Kopie an (…/kopie → { schluessel, groesse, art }),
  // die Oberfläche bekommt einen Stellvertreter, der die Stücke erst bei Bedarf unter /_quelle/<schluessel> holt. Das ganze Video
  // herüberzuholen dauerte bei großen Videos viele Sekunden (Wunsch Mario: „Videos dauern so lange beim Laden“). null: alter Weg.
  async function videoFern(adresse, name, art) {
    const VS = window.ImagicosmosVideoSchnitt;
    if (!VS || !VS.fernDatei) return null;
    try {
      const r = await fetch(adresse);
      if (!r.ok) return null;
      const k = await r.json();
      if (!k || !k.schluessel || !(k.groesse > 0)) return null;
      const f = VS.fernDatei('/_quelle/' + k.schluessel, { groesse: k.groesse, art: art || k.art || 'video/mp4', name });
      f._quelle = k.schluessel;                       // Kopie bei der App („Mit Gestaltung“, Bearbeitungsstand)
      return f;
    } catch (e) { return null; }
  }
  async function fetched(runde, namen, arten, keep, zeigen) {
    const out = [], alle = namen.map((_, i) => i).filter(keep);
    for (let i = 0; i < namen.length; i++) {
      if (!keep(i)) continue;
      if (zeigen) holen(alle.indexOf(i), alle.length);
      if (/^video\//.test(arten[i] || '')) { const f = await videoFern('/_wahl/' + runde + '/' + i + '/kopie', namen[i], arten[i]); if (f) { out.push(f); continue; } }
      const r = await fetch('/_wahl/' + runde + '/' + i);
      if (!r.ok) throw new Error('„' + namen[i] + '“ ließ sich nicht lesen.');
      const b = await r.blob(), f = new File([b], namen[i], { type: arten[i] || b.type || '' });
      const q = r.headers.get('X-Quelle'); if (q) f._quelle = q;   // Videos: Schlüssel der Kopie bei der App („Mit Gestaltung“)
      out.push(f);
    }
    return out;
  }

  // ---- „Mit Gestaltung“: Videos rechnet die App selbst (VideoGestalten.java: Videochip und Grafikchip, wie WhatsApp) ----
  // auftrag wie bei APP.videoGestalten, aber ebenen[].datei und ton.datei als Nummer in dateien (PNG der Ebenen, Ton als
  // 16-Bit-PCM). Liefert { file (File mit _nativ), ton, bilder, millis, hinweis } oder null (abgebrochen); wirft bei Fehlern.
  if (APP.videoGestalten) {
    let gNr = 0;
    const gWarten = {};
    N.gestalten = (auftrag, dateien, fortschritt, abbrechen) => queue(async () => {
      await hand(dateien);
      const pfad = i => (APP.ausgabeOrt && APP.ausgabeOrt(i)) || 'teilen/' + i + '/' + dateien[i].name;   // seit 20.11.2026 eigener Ordner je Vorgang
      const a = Object.assign({}, auftrag, { ebenen: auftrag.ebenen.map(e => Object.assign({}, e, { datei: pfad(e.datei) })) });
      if (auftrag.ton) a.ton = Object.assign({}, auftrag.ton, { datei: pfad(auftrag.ton.datei) });
      const nr = ++gNr;
      const r = await new Promise((ok, no) => {
        const wache = setInterval(() => { if (abbrechen && abbrechen()) APP.videoAbbrechen(); }, 300);
        gWarten[nr] = { fortschritt, ok: v => { clearInterval(wache); ok(v); }, no: e => { clearInterval(wache); no(e); } };
        APP.videoGestalten(nr, JSON.stringify(a));
      });
      if (!r) return null;
      const antwort = await fetch('/_video/' + r.name);
      if (!antwort.ok) throw new Error('Das Video ließ sich nicht lesen.');
      const f = new File([await antwort.blob()], auftrag.anzeige || r.name, { type: 'video/mp4' });
      f._nativ = r.name;
      return Object.assign({ file: f }, r);
    });
    N.videoStand = (nr, v) => { const w = gWarten[nr]; if (w && w.fortschritt) w.fortschritt(v); };
    N.videoFertig = (nr, r, fehler) => {
      const w = gWarten[nr]; if (!w) return;
      delete gWarten[nr];
      if (r) w.ok(r); else if (fehler === 'abgebrochen') w.ok(null); else w.no(new Error(fehler || 'unbekannter Fehler'));
    };
    N.quelleDa = k => !!k && APP.quelleDa(k);
    N.quelleSichern = file => queue(async () => { await hand([file]); return APP.quelleAusAusgabe() || null; });
    N.quellenBehalten = liste => { try { APP.quellenBehalten(JSON.stringify(liste)); } catch (e) {} };
  }
  const isStyle = (name, art) => /^text\/|json/.test(art) || /\.(imagistil|json|txt)$/i.test(name);
  const locHint = files => {
    if (APP.ortAusFotosErlaubt() || !files.some(f => f.type.startsWith('image/')) || localStorage.getItem('imagiclique.orthinweis')) return;
    localStorage.setItem('imagiclique.orthinweis', '1');
    setTimeout(() => say('Imagiclique darf den Aufnahmeort der Fotos nicht lesen – „Infos zum Ort“ kennt dann den Ort des Fotos nicht. Erlauben: Einstellungen des Handys → Apps → Imagiclique → Berechtigungen → Fotos und Videos → „Alle zulassen“.', 12000), 1500);
  };
  // „Fotos wählen“: Auswahl wie in der Galerie (gemeinsamer Baustein fotoauswahl, bausteine/foto-auswahl.js). Die App
  // liefert die Fotos des Handys unter /_galerie/… – im Original, also mit Aufnahmeort. Videos und Fotos aus anderen
  // Quellen holt der zweite Knopf „Galerie des Handys“ (APP.fotosWaehlen). Eine ältere App ohne galerieOeffnen
  // oder ohne Zugriff auf die Fotos nimmt gleich diesen Weg.
  N.pick = () => APP.galerieOeffnen && window.ImagicosmosFotoAuswahl ? APP.galerieOeffnen() : APP.fotosWaehlen();
  N.galerie = async erlaubt => {
    if (!erlaubt) { APP.fotosWaehlen(); return; }
    try {
      await restoring;
      const frei = MAX_PHOTOS - pool.length;
      if (frei <= 0) { say(`Höchstens ${MAX_PHOTOS} Fotos. Bitte zuerst eines löschen.`); return; }
      const wahl = await ImagicosmosFotoAuswahl.oeffnen({
        quelle: {
          liste: async () => { const r = await fetch('/_galerie/liste'); if (!r.ok) throw new Error('Die Fotos des Handys konnten nicht gelesen werden.'); return r.json(); },
          vorschau: e => '/_galerie/vorschau/' + e.id,
        },
        titel: 'Fotos wählen', knopf: 'Übernehmen', hoechstens: frei,
        weitere: { text: 'Galerie des Handys', aktion: () => APP.fotosWaehlen() },
      });
      if (!wahl || !wahl.length) return;
      const files = [];
      for (const e of wahl) {
        holen(files.length, wahl.length);
        if (e.video) { const f = await videoFern('/_galerie/kopie/' + e.id, e.name || 'video.mp4', ''); if (f) { files.push(f); continue; } }
        const r = await fetch('/_galerie/original/' + e.id);
        if (!r.ok) throw new Error('„' + (e.name || 'Foto') + '“ ließ sich nicht lesen.');
        const b = await r.blob(), f = new File([b], e.name || (e.video ? 'video.mp4' : 'foto.jpg'), { type: b.type || (e.video ? 'video/mp4' : 'image/jpeg') });
        const q = r.headers.get('X-Quelle'); if (q) f._quelle = q;   // Videos (seit fotoauswahl 1.2.0 auch hier): Kopie bei der App für „Mit Gestaltung“
        files.push(f);
      }
      locHint(files);
      await addFiles(files);
    } catch (e) { say(e.message || 'Die Auswahl konnte nicht gelesen werden.', 5000); }
    finally { holenEnde(); }
  };
  N.auswahl = async (runde, namen, arten) => {
    try {
      const files = await fetched(runde, namen, arten, () => true, true);
      locHint(files);
      await addFiles(files);
    } catch (e) { say(e.message || 'Die Auswahl konnte nicht gelesen werden.', 5000); }
    finally { holenEnde(); }
  };
  // an Imagiclique geteilt oder mit Imagiclique geöffnet: Fotos, Videos, Stil-Dateien, Text
  N.geteilt = async (runde, namen, arten, text) => {
    try {
      const files = await fetched(runde, namen, arten, i => !isStyle(namen[i], arten[i]), true);
      const stile = [];
      for (const f of await fetched(runde, namen, arten, i => isStyle(namen[i], arten[i]))) stile.push(await f.text());
      holenEnde();                                    // vor einer möglichen Rückfrage („Dazunehmen“ oder „Neu beginnen“)
      locHint(files);
      // Text ohne Fotos geht nur an die KI-Hilfe (geteilte Antwort aus einer KI-App, kiGeteilt), sonst wie bisher nirgends hin
      await takeShared(files, stile, files.length ? text : '', !files.length && !stile.length && text ? { text } : null);
    } catch (e) { say('Die geteilten Dateien konnten nicht übernommen werden.', 5000); }
    finally { holenEnde(); }
  };
  // Link auf einen Stil oder ein Layout (…/imagiclique-app/?stil=… oder #stil=… / #layout=…)
  N.link = (q, h) => {
    history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + (h ? '#' + h : ''));
    openStyleLink();
  };
  N.meldung = t => say(String(t), 5000);
  // Zurück-Taste des Handys: Die Oberfläche führt offene Seiten und die Ansichten Bearbeiten/Senden im Verlauf
  // (layer, deep im Hauptskript). false = nichts mehr offen, die App darf in den Hintergrund.
  N.zurueck = () => {
    const frage = document.querySelector('#ds-frage[open]');          // offene Rückfrage (Baustein design): Zurück heißt Abbrechen
    if (frage) { frage.close(); return true; }
    if (window.ImagicosmosDesign && ImagicosmosDesign.arbeitLaeuft()) return true;   // während der Ladeanzeige nichts tun
    const wahl = document.querySelector('dialog.fa-fenster[open]');   // offene Fotoauswahl: Zurück heißt Abbrechen
    if (wahl) { wahl.close(); return true; }
    try { if (layer || deep) { history.back(); return true; } } catch (e) {}
    return false;
  };

  // ---- Leisten von Android in der Farbe der Oberfläche (hell/dunkel) ----
  const bars = () => {
    const m = document.querySelector('meta[name=theme-color]');
    if (m) APP.design(m.content, document.documentElement.dataset.theme === 'light');
  };
  document.addEventListener('DOMContentLoaded', () => {
    const m = document.querySelector('meta[name=theme-color]');
    if (m) new MutationObserver(bars).observe(m, { attributes: true });
    bars();
  });

  // Die Oberfläche steht und der Bearbeitungsstand ist geladen: Jetzt darf die App Geteiltes zustellen.
  window.addEventListener('load', () => {
    let p = null; try { p = restoring; } catch (e) {}
    Promise.resolve(p).catch(() => {}).then(() => APP.bereit());
  });
})();
