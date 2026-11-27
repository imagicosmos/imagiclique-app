// Imagiclique – eigene Videos als Quelle (Idee #10, Stufen 1–3).
// Ein Video liegt wie ein Foto im Fotopool ({ kind: 'video', file, clip: Kopfdaten, cv: Standbild, url, id }) und bildet
// allein eine Gruppe mit der Vorlage „clip“. Die Gruppe merkt sich Anfang und Ende (clipA, clipB, Sekunden), die
// Darstellung im Hochformat (clipFit: blur = ganzes Bild mit unscharfem Hintergrund, cover = Zuschnitt, Ausschnitt
// über fx/fy wie bei Fotos) und die Lautstärke des Originaltons (clipVol: 0, 50, 100).
// Beim Senden entsteht daraus ein MP4 (720 × 1280, 30 Bilder je Sekunde); länger als 90 s wird in gleich lange
// Teile aufgeteilt, jeder mit „1/3“ in der Ecke. Das Lesen und Schreiben übernimmt der Baustein „videoschnitt“
// (bausteine/video-schnitt.js): erst die Kopfdaten, dann die Bilder des gewählten Ausschnitts stückweise aus der Datei.
// Stufe 2 (18.11.2026): Titel und Text der Gruppe liegen als Ebene über dem Video (clipCaption, Dauer clipText: die ersten
// 5 s oder das ganze Video; Titel auf jedem Teil, Text nur im ersten), in Farben und Schrift des Stils. Eigene Musik und
// Sprachaufnahme (wie bei der Diashow, mixSound) kommen zum Originalton dazu (tonDazu des Bausteins).
// Stufe 3: „Gute Schnittstellen suchen“ untersucht den Ausschnitt (Bildwechsel, Lautstärke) und teilt an Szenenwechseln
// und Sprechpausen statt genau gleich lang (clipCuts = { a, b, max, teile: [{ a, b, grund }] }, gilt nur für diesen Ausschnitt).
// Schnellweg (18.11.2026, Handy-Test 12.4: Teilen langer Videos dauerte zu lange): clipFast 'on' schneidet das Video nur
// (VS().kopieren, Teile an Schlüsselbildern über VS().schnellTeile) statt jedes Bild neu zu rechnen – in Sekunden fertig, in
// Originalqualität, aber ohne Logo, Nummer, Titel/Text, Musik und Hochformat-Rahmen. In der Web-App nur bis 50 MB je Teil.
// Diese Datei wird vor dem Hauptskript geladen und greift erst zur Laufzeit auf dessen Namen zu (state, ctx, toast …).
'use strict';

const CLIP_MAX_STORE = 400 * 1048576;        // größere Videos werden nicht im Bearbeitungsstand gespeichert
const isClip = () => state.tpl === 'clip';
const clipItem = () => { const p = state.photos[0]; return p && p.kind === 'video' ? p : null; };

// Lesen, Standbild und Umrechnen macht der gemeinsame Baustein „videoschnitt“ (bausteine/video-schnitt.js,
// window.ImagicosmosVideoSchnitt, seit 17.11.2026). Hier bleibt nur, was die App daraus macht.
const VS = () => window.ImagicosmosVideoSchnitt;

// ---------- Kopfdaten lesen: { dauer, rot, breite, hoehe, bildrate, hdr, acfg, … }; die Bilddaten bleiben in der Datei ----------
async function clipHead(file) {
  if (!VS() || !VS().kann()) throw new Error('Dieser Browser kann Videos nicht verarbeiten.');
  return VS().kopf(file);
}

// ---------- Vorschau: ein Bild ins Hochformat zeichnen, als Zuschnitt (mit Ausschnitt fx/fy) oder ganz auf unscharfem Hintergrund ----------
// (nur für das Standbild in der Vorschau; das fertige Video zeichnet der Baustein genauso)
function clipDraw(c, frame, fw, fh, rot, Wd, Hd, cover, fx = .5, fy = .5) {
  const turned = rot % 180 !== 0, w = turned ? fh : fw, h = turned ? fw : fh;
  const s = cover ? Math.max(Wd / w, Hd / h) : Math.min(Wd / w, Hd / h);
  const dx = cover ? (Wd - w * s) * (fx - .5) : 0, dy = cover ? (Hd - h * s) * (fy - .5) : 0;   // fx/fy wie bei cover() im Hauptskript
  c.save(); c.translate(Wd / 2 + dx, Hd / 2 + dy); c.rotate(rot * Math.PI / 180); c.drawImage(frame, -fw * s / 2, -fh * s / 2, fw * s, fh * s); c.restore();
}
let clipSmall = null;
function clipCompose(c, frame, fw, fh, rot, Wd, Hd, fit, fx, fy) {
  if (fit === 'cover') { clipDraw(c, frame, fw, fh, rot, Wd, Hd, true, fx, fy); return; }
  if (!clipSmall) { clipSmall = document.createElement('canvas'); clipSmall.width = 90; clipSmall.height = 160; }
  clipDraw(clipSmall.getContext('2d'), frame, fw, fh, rot, 90, 160, true);          // Hintergrund: stark verkleinert, dann weich vergrößert
  c.save(); c.filter = `blur(${Math.round(Wd / 40)}px) brightness(.7)`; c.drawImage(clipSmall, -Wd * .06, -Hd * .06, Wd * 1.12, Hd * 1.12); c.restore();
  clipDraw(c, frame, fw, fh, rot, Wd, Hd, false);
}

// ---------- Standbild an einer Stelle (für Fotopool und Vorschau) ----------
// Zeichenfläche in Anzeige-Ausrichtung, lange Seite höchstens 1280 px
function clipFrameAt(item, t) { return VS().standbild(item.file, item.clip, t); }
function clipSetPoster(item, c) {
  if (!item.cv) item.cv = document.createElement('canvas');
  item.cv.width = c.width; item.cv.height = c.height; item.cv.getContext('2d').drawImage(c, 0, 0);
  const bs = 36 / Math.max(c.width, c.height), b = document.createElement('canvas');   // winzige Fassung wie bei Fotos (weicher Hintergrund)
  b.width = Math.max(1, Math.round(c.width * bs)); b.height = Math.max(1, Math.round(c.height * bs));
  b.getContext('2d').drawImage(c, 0, 0, b.width, b.height);
  item.cv.blur = b;
}
// macht aus einer Videodatei einen Eintrag für den Fotopool; bei Fehlern null (mit Meldung)
async function toClip(file) {
  try {
    const item = { kind: 'video', file, clip: await clipHead(file), id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), quelle: file._quelle || null };
    // Standbild für den Fotopool: am Schlüsselbild vor einem Drittel bzw. 1 s – dort muss nur ein Bild entschlüsselt werden
    // (vorher bis zu eine Sekunde Bilder; im Emulator ohne Videochip mehrere Sekunden bei großen Videos, 20.11.2026)
    const soll = Math.min(1, item.clip.dauer / 3);
    let bei = soll; try { const z = VS().schluesselbilder(item.clip).filter(x => x <= soll + 1e-6).pop(); if (z != null) bei = z; } catch (e) { /* dann wie bisher */ }
    clipSetPoster(item, await clipFrameAt(item, bei));
    // Vorschaubildchen aus einer kleinen Fassung (480 px wie bei Fotos) als data:-Adresse: toBlob() brauchte in der WebView des
    // Emulators je Aufruf über 4 s (auch klein), toDataURL() 10–130 ms (gemessen 20.11.2026)
    const ks = Math.min(1, 480 / Math.max(item.cv.width, item.cv.height)), klein = document.createElement('canvas');
    klein.width = Math.max(1, Math.round(item.cv.width * ks)); klein.height = Math.max(1, Math.round(item.cv.height * ks));
    klein.getContext('2d').drawImage(item.cv, 0, 0, klein.width, klein.height);
    item.url = klein.toDataURL('image/jpeg', .8);
    return item;
  } catch (e) { toast('Video: ' + (e && e.message || e), 6000); return null; }
}
// Markierung im Fotopool: Abspiel-Zeichen und Länge
function clipBadge(d, p) {
  d.classList.add('vid');
  const b = document.createElement('span'); b.className = 'vidtag'; b.textContent = '▶ ' + clock(p.clip.dauer);
  d.appendChild(b);
}

// ---------- Gruppe ----------
function clipNew(g, item) {
  // ganzes Video; über MAX_PART wird aufgeteilt (vorher endete der Ausschnitt bei 90 s und es wurde nie geteilt – Handy-Test 2.3)
  g.tpl = 'clip'; g.clipA = 0; g.clipB = Math.round(item.clip.dauer * 10) / 10; g.clipFit = 'blur'; g.clipVol = '100';
  g.motion = 'still'; g.title = ''; g.text = ''; g.clipText = '5'; g.clipBg = 'kasten'; g.clipCuts = null; g.clipFast = 'off'; g.clipTempo = '1';
}
// Zeitlupe/Zeitraffer (22.11.2026, Idee #16): Gruppenwert clipTempo; das Video im Status dauert Länge / Tempo. Ausschnitt (clipA/clipB)
// und Teile (a, b) bleiben in Sekunden der Quelle, Längen (secs, total), Ebenen und Musik in Sekunden des Ergebnisses.
const clipTempo = () => Math.max(.25, Math.min(8, +state.clipTempo || 1));
// Anfang und Ende auf das Video begrenzen (mindestens 1 s)
function clipRange() {
  const it = clipItem(), dur = it ? it.clip.dauer : 0;
  let a = Math.max(0, Math.min(+state.clipA || 0, Math.max(0, dur - 1))), b = +state.clipB || dur;
  b = Math.max(a + Math.min(1, dur), Math.min(b, dur));
  return { a, b, len: b - a, dur };
}
// Gefundene Schnittstellen gelten nur, solange Ausschnitt und Höchstlänge (Ziel) dieselben sind
function clipCutsOk() {
  const c = state.clipCuts, r = clipRange();
  if (!c || !Array.isArray(c.teile) || c.teile.length < 2 || c.max !== MAX_PART * clipTempo() || Math.abs(c.a - r.a) > .05 || Math.abs(c.b - r.b) > .05) return null;
  return c.teile.every(t => t.b - t.a <= c.max + .05 && t.b > t.a) ? c : null;
}
// Ablauf: Teile von höchstens 90 s – gleich lang oder an den gefundenen Schnittstellen
const clipFastOn = () => state.clipFast === 'on' && clipTempo() === 1 && !!VS() && !!VS().kopieren;   // Schnell geht nur in Originaltempo
function clipPlan() {
  const { a, b, len } = clipRange(), it = clipItem();
  if (clipFastOn() && it) {                              // Schnellweg: Teile an Schlüsselbildern
    const parts = VS().schnellTeile(a, b, MAX_PART, VS().schluesselbilder(it.clip))
      .map(t => ({ a: t.a, b: t.b, secs: t.b - t.a, from: 0, count: 1, D: t.b - t.a, still: true, mb: VS().groesse(it.clip, t.a, t.b) / 1048576 }));
    const total = b - parts[0].a;
    return { clip: true, list: slidesList(), parts, total, D: Math.max(...parts.map(pt => pt.secs)), mixed: true, cuts: false, fast: true };
  }
  const c = clipCutsOk(), parts = [], tp = clipTempo();
  if (c) c.teile.forEach(t => parts.push({ a: t.a, b: t.b, secs: (t.b - t.a) / tp, from: 0, count: 1, D: (t.b - t.a) / tp, still: true, grund: t.grund }));
  else {
    const n = Math.max(1, Math.ceil((len / tp - .05) / MAX_PART));
    for (let i = 0; i < n; i++) parts.push({ a: a + len * i / n, b: a + len * (i + 1) / n, secs: len / tp / n, from: 0, count: 1, D: len / tp / n, still: true });
  }
  return { clip: true, list: slidesList(), parts, total: len / tp, D: Math.max(...parts.map(pt => pt.secs)), mixed: true, cuts: !!c, tempo: tp };
}
function clipKind() {
  if (!clipItem()) return 'Video fehlt';
  const pl = clipPlan();
  return (pl.parts.length > 1 ? pl.parts.length + ' Videos' : 'Video') + ', ' + secText(pl.total);
}
// Standbild der Gruppe für Vorschau und Vorschaubildchen (nicht das, was gesendet wird)
function clipTemplate(p) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  tplInk = '#ffffff';
  const im = photo(0);
  if (!im) { if (!dry) { font(600, 44); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('Das Video ist nicht mehr da.', W / 2, H / 2 - 30); ctx.fillText('Bitte neu holen.', W / 2, H / 2 + 36); ctx.textAlign = 'left'; } return; }
  if (dry) return;
  if (clipFastOn()) { clipCompose(ctx, im, im.width, im.height, 0, W, H, 'blur'); return; }   // Schnellweg: Video bleibt, wie es ist
  clipCompose(ctx, im, im.width, im.height, 0, W, H, state.clipFit, state.fx / 100, state.fy / 100);
  clipCaption(p, true);                              // so, wie Titel und Text am Anfang des Videos stehen
}

// ---------- Titel und Text über dem Video ----------
// zeichnet in ctx (W × H): oben der Titel, unten der Text, je auf einer Fläche in der Grundfarbe des Stils mit einem
// Streifen in der Akzentfarbe; Titel in der Schrift der Gruppe. Liefert false, wenn es nichts zu zeigen gibt.
function clipLines(text, maxW, max) {
  let l = wrap(text, maxW).filter((x, i, all) => x || (i > 0 && i < all.length - 1));
  if (l.length > max) { l = l.slice(0, max); l[max - 1] = l[max - 1].replace(/[\s.,;:!?–-]*$/, '') + ' …'; }
  return l;
}
function clipCaption(p, withText) {
  const title = (state.title || '').trim(), text = withText ? (state.text || '').trim() : '';
  if (!title && !text) return false;
  if (dry) return true;
  const x = PAD - 30, w = W - 2 * x, pad = 38, inner = w - 2 * pad - 14;
  ctx.save();
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.shadowColor = 'transparent';
  // Hintergrund (Wunsch Mario, Handy-Test Runde 2): Kasten fast deckend (bisher), Leicht halb durchsichtig, Ohne nur die Schrift
  const art = state.clipBg === 'leicht' || state.clipBg === 'ohne' ? state.clipBg : 'kasten';
  const box = (y, h) => {
    if (art === 'ohne') return;
    ctx.globalAlpha = art === 'leicht' ? .45 : .86; ctx.fillStyle = p.bg1; roundRect(x, y, w, h, 30); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = p.acc; roundRect(x + 18, y + 26, 9, h - 52, 4.5); ctx.fill();
  };
  // Ohne Kasten: weiße Schrift mit feinem dunklem Rand und weichem Schatten (wie Untertitel), damit die Schrift auf jedem Video lesbar bleibt
  const schreib = (s, tx, ty) => {
    if (art === 'ohne') {
      ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = Math.max(3, parseInt(ctx.font.match(/(\d+)px/)[1]) * .07);
      ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 16; ctx.strokeText(s, tx, ty); ctx.restore();
      ctx.save(); ctx.fillStyle = '#ffffff'; ctx.fillText(s, tx, ty); ctx.restore(); return;   // weiß wie Untertitel, auf jedem Video lesbar
    }
    ctx.fillText(s, tx, ty);
  };
  if (title) {
    font(800, 72, 'head');
    const size = +(ctx.font.match(/(\d+)px/) || [0, 72])[1], lh = Math.round(size * 1.12), l = clipLines(title, inner, 3);
    const y0 = SAFE_TOP + 10, h = pad * 2 + size * .78 + (l.length - 1) * lh + size * .22;
    box(y0, h); font(800, 72, 'head'); ctx.fillStyle = p.fg;
    l.forEach((s, i) => schreib(s, x + pad + 14, y0 + pad + size * .78 + i * lh));
  }
  if (text) {
    font(500, 44);
    const size = 44, lh = 60, l = clipLines(text, inner, 9);
    const h = pad * 2 + size * .78 + (l.length - 1) * lh + size * .25, y0 = H - SAFE_BOTTOM - 150 - h;
    box(y0, h); font(500, 44); ctx.fillStyle = p.fg;
    l.forEach((s, i) => schreib(s, x + pad + 14, y0 + pad + size * .78 + i * lh));
  }
  ctx.restore();
  return true;
}

// ---------- Bedienung im Thema Vorlage ----------
let clipPosterTimer = 0, clipPosterRun = 0;
function clipPosterSoon() {
  clearTimeout(clipPosterTimer);
  clipPosterTimer = setTimeout(async () => {
    const it = clipItem(); if (!it) return;
    const run = ++clipPosterRun, t = clipRange().a;
    try {
      const c = await clipFrameAt(it, t);
      if (run !== clipPosterRun || clipItem() !== it) return;
      clipSetPoster(it, c); thumbCache.clear(); render();
    } catch (e) {}
  }, 350);
}
const clipTime = v => { const m = Math.floor(v / 60), s = v - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ','); };
function clipUI() {
  if (!isClip() || !$('clipbox')) return;
  const it = clipItem(), { a, b, len, dur } = clipRange();
  $('clipmiss').hidden = !!it; $('clipctl').hidden = !it;
  if (!it) return;
  for (const [id, v] of [['clipa', a], ['clipb', b]]) { $(id).max = dur.toFixed(1); $(id).value = v; }
  $('clipalbl').textContent = 'Anfang ' + clipTime(a); $('clipblbl').textContent = 'Ende ' + clipTime(b);
  const pl = clipPlan(), n = pl.parts.length;
  const tp = clipTempo();
  $('clipinfo').textContent = `Länge ${secText(len)} von ${secText(dur)}.` + (tp !== 1 ? ` Im Status ${secText(pl.total)} (${tp < 1 ? 'Zeitlupe' : 'Zeitraffer'}).` : '')
    + (n > 1 ? ` Länger als ${MAX_PART} s: Es entstehen ${n} Videos` + (pl.cuts ? ', geteilt an den gefundenen Stellen' : ` zu je ${secText(pl.total / n)}`) + `, mit „1/${n}“ in der Ecke.` : '')
    + (it.clip.acfg ? '' : ' Dieses Video hat keinen lesbaren Ton.') + (it.clip.hdr ? ' HDR-Video: Die Farben können im Status etwas anders wirken.' : '');
  $('clipvolbox').hidden = !it.clip.acfg || tp !== 1;
  const fps = it.clip.bildrate || 30, mal = Math.round(30 / (fps * tp));
  $('cliptempohint').textContent = tp === 1 ? 'Langsamer (Zeitlupe) oder schneller (Zeitraffer). Eigene Musik läuft dabei normal.'
    : (tp < 1 ? `Zeitlupe: ${tp === .5 ? 'halb' : 'viertel'} so schnell.` + (mal >= 2 ? ` Dein Video hat ${Math.round(fps)} Bilder je Sekunde, deshalb steht jedes Bild ${mal}× hintereinander – es ruckelt etwas. Flüssig wird Zeitlupe mit Videos in 60 oder 120 Bildern je Sekunde.` : ' Dein Video hat genug Bilder je Sekunde für eine flüssige Zeitlupe.')
      : `Zeitraffer: ${tp}× so schnell.`) + (tp !== 1 ? ' Der Ton des Videos entfällt, eigene Musik läuft normal.' : '');
  const fast = !!pl.fast, mb = fast ? Math.max(...pl.parts.map(pt => pt.mb)) : 0, zuGross = fast && !window.NATIVE && mb > 48;
  $('clipdesign').hidden = fast;
  $('clipfasthint').textContent = fast
    ? `Schnell: Das Video wird nur zerschnitten, nicht neu gerechnet – in Sekunden fertig, in Originalqualität. Logo, „1/2“, Titel und Text, Musik und Hochformat-Rahmen entfallen; jeder Teil beginnt an einem Schlüsselbild (bis etwa 1 s früher). Größe: etwa ${Math.round(mb)} MB${pl.parts.length > 1 ? ' je Teil' : ''}.`
      + (zuGross ? ' Zu groß zum Teilen aus der Web-App (höchstens 50 MB) – nimm die Android-App oder „Mit Gestaltung“.' : '')
    : '„Mit Gestaltung“ rechnet jedes Bild neu: Hochformat, Logo, Titel und Text, Musik. Das dauert bei langen Videos eine Weile. „Schnell“ zerschneidet das Video nur.';
  $('clipcutbox').hidden = n < 2 || fast;
  if (n > 1) {
    const why = { 'szene+pause': 'Szenenwechsel in einer Sprechpause', pause: 'Sprechpause', szene: 'Szenenwechsel', gleich: 'gleichmäßig, keine bessere Stelle' };
    $('clipcuts').textContent = pl.cuts
      ? pl.parts.map((pt, i) => `Teil ${i + 1}: ${clipTime(pt.a)}–${clipTime(pt.b)}` + (pt.grund ? ` (Schnitt: ${why[pt.grund] || pt.grund})` : '')).join(' · ')
      : 'Statt genau gleich lang kann die App an Szenenwechseln und Sprechpausen teilen. Dafür liest sie das Video einmal ganz durch.';
    if (!clipScanning) $('clipscan').textContent = pl.cuts ? 'Neu suchen' : 'Gute Schnittstellen suchen';
    $('clipeven').hidden = !pl.cuts;
  }
}
// Stufe 3: Ausschnitt untersuchen (Bildwechsel und Lautstärke) und die Schnittstellen wählen lassen (Baustein „videoschnitt“)
let clipScanRun = 0, clipScanning = false;
async function clipScan() {
  const it = clipItem(); if (!it || recording || clipScanning) return;
  const { a, b } = clipRange(), max = MAX_PART * clipTempo(), run = ++clipScanRun, btn = $('clipscan');   // Höchstlänge in Sekunden der Quelle
  const same = () => { const r = clipRange(); return run === clipScanRun && clipItem() === it && Math.abs(r.a - a) < .01 && Math.abs(r.b - b) < .01 && MAX_PART * clipTempo() === max; };
  clipScanning = true; btn.disabled = true; btn.textContent = 'Video wird untersucht …';
  try {
    const an = await VS().untersuchen(it.file, it.clip, a, b, {
      fortschritt: v => { if (run === clipScanRun) btn.textContent = `Video wird untersucht … ${Math.round(v * 100)} %`; },
      abbrechen: () => !same(),
    });
    if (!an || !same()) return;
    const teile = VS().schnitte(a, b, max, an).map(t => ({ a: Math.round(t.a * 100) / 100, b: Math.round(t.b * 100) / 100, grund: t.grund }));
    state.clipCuts = { a, b, max, teile };
    persist(); render();
    const gut = teile.filter(t => t.grund && t.grund !== 'gleich').length;
    toast(gut ? `${gut === teile.length - 1 ? 'Alle' : gut + ' von ' + (teile.length - 1)} Schnittstellen liegen an einer guten Stelle.`
              : 'Keine bessere Stelle gefunden – die Teile bleiben etwa gleich lang.', 6000);
  } catch (e) { toast('Untersuchen ging nicht: ' + (e && e.message || e), 6000); }
  finally { clipScanning = false; btn.disabled = false; clipUI(); }
}
function clipSet(key, v) {
  const dur = clipRange().dur;
  state.clipCuts = null;                               // gefundene Schnittstellen gelten nur für den alten Ausschnitt
  if (key === 'clipA') { state.clipA = Math.min(v, dur - 1); if (state.clipB < state.clipA + 1) state.clipB = Math.min(dur, state.clipA + 1); clipPosterSoon(); }
  else { state.clipB = Math.max(v, 1); if (state.clipA > state.clipB - 1) { state.clipA = Math.max(0, state.clipB - 1); clipPosterSoon(); } }
  clipUI(); persist(); render();
}
function clipInit() {
  TPL_NAMES.clip = 'Video';
  $('clipa').addEventListener('input', e => clipSet('clipA', +e.target.value));
  $('clipb').addEventListener('input', e => clipSet('clipB', +e.target.value));
  seg('clipfit', 'clipFit', clipUI);
  seg('clipvol', 'clipVol');
  seg('cliptext', 'clipText');
  seg('clipbg', 'clipBg');
  // „Schnell“ zerschneidet nur und kann kein Tempo: das eine stellt das andere zurück
  seg('clipfast', 'clipFast', () => { if (state.clipFast === 'on' && clipTempo() !== 1) { state.clipTempo = '1'; segMarks.cliptempo(); toast('„Schnell“ geht nur im Originaltempo – das Tempo steht wieder auf 1×.', 4500); } clipUI(); });
  seg('cliptempo', 'clipTempo', () => { state.clipCuts = null; if (clipTempo() !== 1 && state.clipFast === 'on') { state.clipFast = 'off'; segMarks.clipfast(); toast('Zeitlupe und Zeitraffer gehen nur „Mit Gestaltung“.', 4500); } clipUI(); });
  $('clipscan').onclick = clipScan;
  $('clipeven').onclick = () => { clipScanRun++; state.clipCuts = null; persist(); render(); clipUI(); };
  $('clipplay').onclick = () => clipPreview(false);
  $('fullvid').addEventListener('timeupdate', () => {            // die Vorschau spielt nur den gewählten Ausschnitt, in Schleife
    const v = $('fullvid'); if (!v.dataset.clip || layer !== 'full') return;
    const { a, b } = clipRange(); if (v.currentTime >= b || v.currentTime < a - .5) v.currentTime = a;
  });
}
// Vorschau: das fertige Video, sonst der Ausschnitt direkt aus der Quelle (ohne Hochformat-Rahmen)
function clipPreview(finished = true) {
  if (recording) { toast('Das Video wird gerade erstellt.'); return; }
  const it = clipItem(); if (!it) { toast('Das Video ist nicht mehr da – bitte neu holen.'); return; }
  if (finished && videoReady()) { delete $('fullvid').dataset.clip; showVideo(); return; }
  stopSound(); stopLive();
  if (!it.srcUrl) it.srcUrl = it.file.adresse || URL.createObjectURL(it.file);   // Stellvertreter (Android-App): direkt von der App abspielen
  const v = $('fullvid');
  $('fullimg').hidden = $('fullcv').hidden = $('fullbar').hidden = true; v.hidden = false;
  v.dataset.clip = '1'; v.src = it.srcUrl; v.muted = state.clipVol === '0' || clipTempo() !== 1; v.volume = state.clipVol === '50' ? .5 : 1;
  v.playbackRate = clipTempo();                          // Zeitlupe/Zeitraffer wie im fertigen Video (ohne Ton)
  v.currentTime = clipRange().a;
  openLayer('full');
  v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
}

// ---------- Erzeugen ----------
// Wasserzeichen und Nummer als durchsichtige Ebene (einmal je Teil gezeichnet, über jedes Bild gelegt)
function clipOverlay(label, caption = null, onlyCaption = false) {
  const big = document.createElement('canvas'); big.width = W; big.height = H;
  const keep = ctx, keepInk = tplInk; ctx = big.getContext('2d');
  try {
    ctx.textBaseline = 'alphabetic'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12;
    tplInk = '#ffffff'; if (!onlyCaption) { stickersDraw(0); watermark(PALETTES[state.pal]); }   // Emoji-Sticker (emoji.js) gehören zum Grund
    if (caption) { ctx.save(); ctx.shadowColor = 'transparent'; clipCaption(PALETTES[state.pal], caption === 'text'); ctx.restore(); }
    if (label && !onlyCaption) { ctx.font = `700 46px ${fam('body')}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.globalAlpha = .92; ctx.fillText(label, W - PAD, SAFE_TOP + 40); }
  } finally { ctx = keep; tplInk = keepInk; }
  const o = document.createElement('canvas'); o.width = VID_W; o.height = VID_H;
  const oc = o.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(big, 0, 0, VID_W, VID_H);
  return o;
}
// Ebene eines Teils als Funktion der Zeit: Titel (und im ersten Teil der Text) die ersten 5 s mit Ausblenden
// oder das ganze Video; Wasserzeichen und Nummer immer. Während des Ausblendens wird eine Zeichenfläche neu gemischt.
const CLIP_TEXT_SECS = 5, CLIP_FADE = .5;
function clipLayer(label, first) {
  const base = clipOverlay(label), what = first ? 'text' : 'title';
  if (!(state.title || '').trim() && !(first && (state.text || '').trim())) return base;
  const full = clipOverlay(label, what);
  if (state.clipText === 'all') return full;
  const mix = document.createElement('canvas'); mix.width = VID_W; mix.height = VID_H;
  const mc = mix.getContext('2d'); let shown = -1;
  return t => {
    if (t < CLIP_TEXT_SECS - CLIP_FADE) return full;
    if (t >= CLIP_TEXT_SECS) return base;
    const al = Math.round((CLIP_TEXT_SECS - t) / CLIP_FADE * 20) / 20;
    if (al !== shown) { mc.clearRect(0, 0, VID_W, VID_H); mc.globalAlpha = al; mc.drawImage(full, 0, 0); mc.globalAlpha = 1 - al; mc.drawImage(base, 0, 0); mc.globalAlpha = 1; shown = al; }
    return mix;
  };
}
// Dieselben Ebenen für die Android-App (clipNative): getrennt als Bilder – Grund (Logo, Nummer) immer, Titel/Text darüber,
// entweder die ersten CLIP_TEXT_SECS Sekunden mit Ausblenden oder das ganze Video. Das Mischen beim Ausblenden macht die App.
function clipLayerParts(label, first) {
  const base = clipOverlay(label), what = first ? 'text' : 'title';
  if (!(state.title || '').trim() && !(first && (state.text || '').trim())) return { base, text: null };
  return { base, text: clipOverlay(label, what, true), all: state.clipText === 'all' };
}
// Musik und Sprachaufnahme für das ganze Video (wie bei der Diashow), je Teil als Ausschnitt
function clipSoundPart(mix, a0, a, b) {
  if (!mix) return null;
  const r = mix.sampleRate, s0 = Math.max(0, Math.round((a - a0) * r)), s1 = Math.min(mix.length, Math.round((b - a0) * r));
  if (s1 <= s0) return null;
  return { abtastrate: r, kanaele: [mix.getChannelData(0).subarray(s0, s1), mix.getChannelData(mix.numberOfChannels > 1 ? 1 : 0).subarray(s0, s1)] };
}
// ein Teil [a, b) als MP4 im Hochformat VID_W × VID_H; progress(0…1), stale() → true bricht ab (liefert dann null)
async function clipEncode(item, a, b, opt) {
  const r = await VS().umrechnen(item.file, item.clip, a, b, {
    breite: VID_W, hoehe: VID_H, darstellung: opt.fit === 'cover' ? 'fuellen' : 'unscharf', fx: opt.fx, fy: opt.fy,
    lautstaerke: opt.vol / 100, ebene: opt.overlay, tonDazu: opt.sound || null, bitrate: vidRate((b - a) / opt.tempo),   // bleibt unter der Teilen-Grenze von 50 MB
    tempo: opt.tempo,
    maxDauer: 0, fortschritt: opt.progress, abbrechen: opt.stale,              // aufgeteilt wird schon in clipPlan()
  });
  return r && { blob: r.blob, sound: r.ton, frames: r.bilder };
}
// „Mit Gestaltung“ in der Android-App (19.11.2026, Handy-Test 12.4): Die App rechnet mit Videochip und Grafikchip
// (VideoGestalten.java), die Oberfläche liefert nur die Ebenen als PNG und den gemischten Ton. Das Quellvideo liegt bei der
// App (Schlüssel it.quelle, beim Holen abgelegt); fehlt es (älterer Stand), wird es einmal herübergegeben.
const clipNativeOn = () => !!(window.NATIVE && NATIVE.gestalten);
// Ebene als rohe Bildpunkte (RGBA, nicht vormultipliziert), nur die Streifen mit Inhalt (Titel oben, Text und Logo unten).
// Nicht als PNG: toBlob('image/png') brauchte in der WebView des Emulators 4–13 s je Ebene.
function layerBands(c, name) {
  const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, voll = new Uint8Array(h);
  for (let y = 0; y < h; y++) { const o = y * w * 4; for (let x = 3; x < w * 4; x += 16) if (d[o + x]) { voll[y] = 1; break; } }
  const out = [];
  for (let y = 0; y < h;) {
    if (!voll[y]) { y++; continue; }
    let e = y; while (e < h && (voll[e] || voll.subarray(e, Math.min(h, e + 24)).some(Boolean))) e++;   // Lücken unter 24 Zeilen zusammen
    const y0 = Math.max(0, y - 2), y1 = Math.min(h, e + 2);
    out.push({ file: new File([d.slice(y0 * w * 4, y1 * w * 4)], `${name}_${out.length}.rgba`, { type: 'application/octet-stream' }), y: y0, h: y1 - y0, w });
    y = y1;
  }
  return out;
}
function soundPcm(s) {
  const L = s.kanaele[0], R = s.kanaele[1] || L, n = L.length, a = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) { a[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; a[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
  return new File([a.buffer], 'ton.pcm', { type: 'application/octet-stream' });   // Int16Array: Byte-Reihenfolge des Geräts (Android: Little Endian)
}
async function clipNative(it, a, b, opt) {
  if (!NATIVE.quelleDa(it.quelle)) {
    $('share').textContent = 'Video wird an die App übergeben …';
    it.quelle = await NATIVE.quelleSichern(it.file);
    if (!it.quelle) throw new Error('Das Video ließ sich nicht an die App übergeben.');
    savePhoto(it);
  }
  const lay = clipLayerParts(opt.label, opt.first), files = [], ebenen = [];
  const dazu = (c, name, zeit) => layerBands(c, name).forEach(s => { ebenen.push(Object.assign({ datei: files.length, y: s.y, h: s.h, w: s.w }, zeit)); files.push(s.file); });
  dazu(lay.base, 'ebene0', { von: 0, bis: 1e9, aus: 0 });
  if (lay.text) dazu(lay.text, 'ebene1', { von: 0, bis: lay.all ? 1e9 : CLIP_TEXT_SECS, aus: lay.all ? 0 : CLIP_FADE });
  let ton = null;
  if (opt.sound) { files.push(soundPcm(opt.sound)); ton = { datei: files.length - 1, abtastrate: opt.sound.abtastrate }; }
  const name = opt.name.replace(/[^A-Za-z0-9_.-]/g, '-').replace(/\.mp4$/, '') + '_' + Math.random().toString(36).slice(2, 7) + '.mp4';
  const r = await NATIVE.gestalten({
    quelle: it.quelle, a, b, tempo: opt.tempo, breite: VID_W, hoehe: VID_H, fps: FPS, bitrate: vidRate((b - a) / opt.tempo), art: opt.fit === 'cover' ? 'fuellen' : 'unscharf',
    fx: opt.fx, fy: opt.fy, lautstaerke: opt.vol / 100, name, anzeige: opt.name, ebenen, ton,
  }, files, opt.progress, opt.stale);
  return r && { file: r.file, sound: r.ton, frames: r.bilder, hint: r.hinweis };
}
// erzeugt die Videos der Gruppe; Ablauf und Meldungen wie makeVideo() im Hauptskript
// Das erzeugte Video bleibt aufgehoben (keepVideo() im Hauptskript), solange Ausschnitt und Einstellungen dieselben sind (clipSig).
function clipSig() {
  const it = clipItem(); if (!it) return '';
  const r = clipRange();
  const m = ownMusic(), v = sound.voice;
  return JSON.stringify([it.id, r.a, r.b, state.clipFast, clipTempo(), state.clipFit, state.fx, state.fy, state.clipVol, markOn(), state.target, state.clipCuts,
    state.title, state.text, state.clipText, state.clipBg, state.pal, state.font, state.stickers, m && [m.name, m.buf.duration, m.start, state.musicVol], v && v.buf.duration]);
}
async function makeClip() {
  const it = clipItem();
  if (!it) { toast('Das Video ist nicht mehr da – bitte neu holen.'); return; }
  if (recording) return;
  stopSound();
  const rev = shotRev, plan = clipPlan(), np = plan.parts.length, t0 = performance.now();
  const stale = () => shotRev !== rev;
  recording = true; dropVideo();
  $('share').disabled = true; $('save').disabled = true;
  try {
    $('share').textContent = 'Wird vorbereitet …';
    const files = []; let sound = false;
    if (plan.fast) {                                          // Schnellweg: nur zerschneiden
      if (!window.NATIVE && plan.parts.some(pt => pt.mb > 48)) { toast('Zu groß zum Teilen aus der Web-App (höchstens 50 MB je Teil). Nimm die Android-App oder „Mit Gestaltung“.', 7000); return; }
      for (const [pi, part] of plan.parts.entries()) {
        const res = await VS().kopieren(it.file, it.clip, part.a, part.b, {
          abbrechen: stale, fortschritt: v => { $('share').textContent = `Video wird geschnitten … ${Math.round((pi + v) / np * 100)} %`; },
        });
        if (!res || stale()) { toast('Abgebrochen, weil etwas geändert wurde.'); return; }
        sound = sound || res.ton;
        files.push(new File([res.blob], fileName('mp4', np > 1 ? `_${pi + 1}von${np}` : '').replace(/^imagi_status/, 'imagi_video'), { type: 'video/mp4' }));
      }
    }
    const mix = plan.fast ? null : await mixSound(plan.total);                   // eigene Musik und Sprachaufnahme über die ganze Länge (oder null)
    if (stale()) { toast('Abgebrochen, weil etwas geändert wurde.'); return; }
    let native = clipNativeOn();
    if (!plan.fast) for (const [pi, part] of plan.parts.entries()) {
      const label = np > 1 ? `${pi + 1}/${np}` : '', name = fileName('mp4', np > 1 ? `_${pi + 1}von${np}` : '').replace(/^imagi_status/, 'imagi_video');
      const opt = {
        fit: state.clipFit, fx: state.fx / 100, fy: state.fy / 100, vol: plan.tempo !== 1 ? 0 : +state.clipVol, label, first: pi === 0, name, tempo: plan.tempo,
        sound: clipSoundPart(mix, 0, (part.a - plan.parts[0].a) / plan.tempo, (part.b - plan.parts[0].a) / plan.tempo), stale,   // Musik in Zeit des Ergebnisses
        progress: v => { $('share').textContent = `Video wird erstellt … ${Math.round((pi + v) / np * 100)} %`; },
      };
      let res = null;
      if (native) {
        try { res = await clipNative(it, part.a, part.b, opt); }
        catch (e) {                                                   // dann wie bisher in der Oberfläche
          if (stale()) { toast('Abgebrochen, weil etwas geändert wurde.'); return; }
          native = false;
          toast('Die App konnte das Video nicht selbst rechnen (' + (e && e.message || e) + '). Es wird auf dem langsameren Weg gerechnet.', 7000);
        }
      }
      if (!native) res = await clipEncode(it, part.a, part.b, Object.assign({ overlay: clipLayer(label, pi === 0) }, opt));
      if (!res || stale()) { toast('Abgebrochen, weil etwas geändert wurde.'); return; }
      sound = sound || res.sound;
      files.push(res.file || new File([res.blob], name, { type: 'video/mp4' }));
    }
    video = { rev, files, urls: files.map(f => URL.createObjectURL(f)), secs: plan.total, mixed: false };
    keepVideo(files, plan.total, false);
    const mb = (files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1).replace('.', ',');
    toast((np > 1 ? `${np} Videos fertig (zusammen ${secText(plan.total)}, ${mb} MB)` : `Video fertig (${secText(plan.total)}, ${mb} MB)`)
      + ` in ${secText((performance.now() - t0) / 1000)}.` + ((it.clip.acfg && +state.clipVol > 0 && plan.tempo === 1 || mix) && !sound ? ' Ohne Ton: Dieser Browser kann den Ton nicht schreiben.' : '') + ' Jetzt unten teilen.', 7000);
    delete $('fullvid').dataset.clip; showVideo();
  } catch (e) {
    toast('Video konnte nicht erstellt werden: ' + (e && e.message || e), 6000);
  } finally {
    recording = false;
    drawStill(); syncButtons();
  }
}
