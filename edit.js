// Imagiclique – Bildbearbeitung: Foto drehen, spiegeln, zuschneiden, automatisch verbessern, Helligkeit,
// Kontrast, Farbsättigung und Filter (Stufe 1); Begradigen, Wärme, Vignette und „auf andere Fotos übertragen“ (Stufe 2, 18.11.2026). Wird vor dem Hauptskript geladen und greift erst zur Laufzeit auf dessen Namen
// zu ($, toast, savePhoto, refreshAll, drawThumbs, openLayer, closeLayer, layer).
// Grundsatz: Das eingelesene Foto bleibt erhalten (p.blob, so liegt es auch im Bearbeitungsstand). Die Bearbeitung
// ist nur eine Einstellung (p.edit); p.cv ist das daraus gerechnete Bild, mit dem alle Vorlagen zeichnen.
// Das Rechnen (Einstellung prüfen, drehen, zuschneiden, verbessern, Filter) macht der gemeinsame Baustein
// bausteine/bild-bearbeitung.js (window.ImagicosmosBildBearbeitung); hier bleibt die Bedienung.
const BB = window.ImagicosmosBildBearbeitung;
const EDIT_FILTERS = BB.FILTER;   // [Kennung, Name, CSS-Filter]
// [Kennung, Beschriftung, Breite : Höhe] – 0 = frei, -1 = wie das Foto
const EDIT_RATIOS = [['free', 'Frei', 0], ['orig', 'Ganzes Foto', -1], ['9:16', '9:16', 9 / 16], ['4:5', '4:5', .8], ['1:1', '1:1', 1], ['4:3', '4:3', 4 / 3], ['16:9', '16:9', 16 / 9]];
// Farbfilter des Zeichenkontexts: fehlt er (ältere Browser), bleiben Regler und Filter ausgeblendet
const EDIT_HAS_FILTER = BB.kannFilter();
let ed = null;      // Foto in Bearbeitung: { p, src (Original), pv (verkleinert für die Vorschau), e, tool, ratio, rw, rh, drag }
let edRaf = 0;

const editClean = e => BB.sauber(e);           // prüft gespeicherte Einstellungen: saubere Kopie oder null
const editIsDefault = e => BB.istStandard(e);
const editBake = (src, e, max) => BB.backen(src, e, max);   // max begrenzt die längere Seite (0 = volle Größe)
// winzige Fassung für den weichen Hintergrund bei „Ganzes Foto“ (wie in toPhoto)
function editBlur(c) {
  const bs = 36 / Math.max(c.width, c.height), b = document.createElement('canvas');
  b.width = Math.max(1, Math.round(c.width * bs)); b.height = Math.max(1, Math.round(c.height * bs));
  const bx = b.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(c, 0, 0, b.width, b.height);
  c.blur = b;
}
// setzt die Bearbeitung um: p.cv (Zeichenfläche für alle Vorlagen) und p.url (Vorschaubildchen)
async function editApply(p, src, e) {
  const def = editIsDefault(e), c = def ? src : editBake(src, e, 0);
  editBlur(c);
  p.cv = c; p.edit = def ? null : e;
  // Vorschaubildchen aus einer kleinen Fassung: das ganze Bild als JPEG zu rechnen dauerte auf dem Handy spürbar (Handy-Test 12.6)
  const b = def ? p.blob : await new Promise(r => BB.verkleinern(c, 480).toBlob(r, 'image/jpeg', .82));
  if (b) { URL.revokeObjectURL(p.url); p.url = URL.createObjectURL(b); }
}
// beim Laden des Bearbeitungsstands: p.cv ist dort noch das Original
async function editRestore(p, saved) {
  const e = editClean(saved); if (!e || editIsDefault(e)) return;
  try { await editApply(p, p.cv, e); } catch (err) {}
}
// das Original eines Fotos als Zeichenfläche
async function editSource(p) {
  if (!p.edit) return p.cv;                       // unbearbeitet: p.cv ist das Original
  return BB.laden(p.blob);
}
// Stift am Vorschaubildchen (Fotopool und Fotos der Gruppe)
function editBadge(d, p) {
  const b = document.createElement('button'); b.className = 'edt' + (p.edit ? ' on' : '');
  b.setAttribute('aria-label', 'Foto bearbeiten');
  b.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M14.5 6l3 3"/></svg>';
  b.onclick = ev => { ev.stopPropagation(); editOpen(p); };
  d.appendChild(b);
}

// ---------- Seite „Foto bearbeiten“ ----------
// Die Seite öffnet sofort mit „Foto wird geladen …“; das Original wird erst danach eingelesen (18.11.2026: vorher öffnete
// sie erst nach dem Einlesen, auf dem Handy schien der Tipp auf den Stift nicht zu wirken).
let edWait = null;  // Foto, dessen Seite gerade geöffnet wird
function editLoading(on) {
  $('photoedit').classList.toggle('laden', on);
  $('peload').hidden = !on; $('pewrap').hidden = on; $('pesave').disabled = on;
}
async function editOpen(p) {
  if (!p || p.kind === 'video' || ed || edWait) return;
  edWait = p;
  editLoading(true); openLayer('photoedit'); $('photoedit').querySelector('.body').scrollTop = 0;
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));   // erst die Seite zeigen, dann rechnen
  let src = null;
  try { if (!p.blob) await savePhoto(p); if (p.blob) src = await editSource(p); } catch (e) {}
  const offen = edWait === p && layer === 'photoedit'; edWait = null;
  if (!offen) { editLoading(false); return; }        // inzwischen mit Zurück verlassen
  if (!src) { editLoading(false); closeLayer(); toast('Dieses Foto lässt sich gerade nicht bearbeiten.'); return; }
  const pv = BB.verkleinern(src, 900);
  ed = { p, src, pv, e: editClean(p.edit) || BB.standard(), tool: 'crop', ratio: 'free', rw: 1, rh: 1, drag: null };
  $('pe-colors').hidden = !EDIT_HAS_FILTER;
  [...$('petool').children].forEach(b => { b.hidden = !EDIT_HAS_FILTER && b.dataset.v === 'filter'; });   // Wärme und Vignette gehen auch ohne Farbfilter
  editLoading(false); editSync();
}
function editDims() { const g = BB.gedreht(ed.pv.width, ed.pv.height, ed.e.rot); ed.rw = g.breite; ed.rh = g.hoehe; }
const editRatio = () => { const r = (EDIT_RATIOS.find(x => x[0] === ed.ratio) || [])[2] || 0; return r < 0 ? ed.rw / ed.rh : r; };
function editSync() {
  if (!ed) return;
  editDims();
  const e = ed.e, sign = v => (v > 0 ? '+' : '') + v;
  [...$('petool').children].forEach(b => b.classList.toggle('on', b.dataset.v === ed.tool));
  $('pe-crop').hidden = ed.tool !== 'crop'; $('pe-light').hidden = ed.tool !== 'light'; $('pe-filter').hidden = ed.tool !== 'filter';
  [...$('peratio').children].forEach(b => b.classList.toggle('on', b.dataset.v === ed.ratio));
  $('peauto').classList.toggle('on', e.auto);
  $('pebri').value = e.bri; $('pecon').value = e.con; $('pesat').value = e.sat;
  $('pebril').textContent = 'Helligkeit ' + sign(e.bri); $('peconl').textContent = 'Kontrast ' + sign(e.con); $('pesatl').textContent = 'Farbe ' + sign(e.sat);
  $('pestr').value = e.str; $('pewrm').value = e.wrm; $('pevig').value = e.vig; editLabels();
  $('pecopy').disabled = !pool.some(x => x !== ed.p && x.kind !== 'video');
  $('pereset').disabled = editIsDefault(e);
  if (ed.tool === 'filter') editFilterTiles();
  editDraw();
}
function editDraw() {
  if (!ed) return;
  const crop = ed.tool === 'crop', c = editBake(ed.pv, crop ? { ...ed.e, crop: [0, 0, 1, 1] } : ed.e, 720), cv = $('pecv');
  cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0);
  editBoxUI();
}
const editDrawSoon = () => { cancelAnimationFrame(edRaf); edRaf = requestAnimationFrame(editDraw); };
function editLabels() {
  const e = ed.e, sign = v => (v > 0 ? '+' : '') + String(v).replace('.', ',');
  $('pestrl').textContent = 'Begradigen ' + sign(e.str) + '°'; $('pewrml').textContent = 'Wärme ' + sign(e.wrm); $('pevigl').textContent = 'Vignette ' + e.vig;
}
function editBoxUI() {
  const b = $('pebox'), [x, y, w, h] = ed.e.crop;
  b.hidden = ed.tool !== 'crop';
  b.style.left = x * 100 + '%'; b.style.top = y * 100 + '%'; b.style.width = w * 100 + '%'; b.style.height = h * 100 + '%';
  const pw = Math.round(w * (ed.e.rot % 180 ? ed.src.height : ed.src.width)), ph = Math.round(h * (ed.e.rot % 180 ? ed.src.width : ed.src.height));
  $('pesize').textContent = `Ausschnitt ${pw} × ${ph} Bildpunkte`;
}
// kleine Vorschauen der Filter mit dem eigenen Foto
function editFilterTiles() {
  const box = $('pefil'); box.innerHTML = '';
  EDIT_FILTERS.forEach(([id, name]) => {
    const b = document.createElement('button'); b.className = 'btn pef' + (ed.e.fil === id ? ' on' : '');
    const c = editBake(ed.pv, { ...ed.e, fil: id }, 132), s = document.createElement('span'); s.textContent = name;
    b.append(c, s); b.onclick = () => { ed.e.fil = id; editSync(); };
    box.appendChild(b);
  });
}
// Drehen und Spiegeln nehmen den Ausschnitt mit; q = Vierteldrehungen im Uhrzeigersinn
function editTurn(q) { ed.e = BB.drehen(ed.e, q); ed.ratio = 'free'; editSync(); }
function editMirror() { ed.e = BB.spiegeln(ed.e); editSync(); }   // waagerecht spiegeln, so wie das Bild gerade zu sehen ist
function editSetRatio(id) {
  ed.ratio = id; editDims();
  const r = editRatio();
  if (r) ed.e.crop = BB.formatAusschnitt(r, ed.rw, ed.rh);
  editSync();
}
// Ausschnitt mit dem Finger: Rahmen verschieben oder an einer Ecke ziehen
function editDragStart(ev) {
  if (!ed || ed.tool !== 'crop') return;
  const h = ev.target.dataset.h || (ev.target.id === 'pebox' ? 'move' : ''); if (!h) return;
  ev.preventDefault();
  const r = $('pewrap').getBoundingClientRect();
  ed.drag = { h, x0: ev.clientX, y0: ev.clientY, c: ed.e.crop.slice(), W: r.width, H: r.height };
  try { $('pewrap').setPointerCapture(ev.pointerId); } catch (e) {}
}
function editDragMove(ev) {
  const d = ed && ed.drag; if (!d) return;
  ed.e.crop = BB.ziehen(d.c, d.h, (ev.clientX - d.x0) / d.W, (ev.clientY - d.y0) / d.H, editRatio(), ed.rw, ed.rh); editBoxUI(); $('pereset').disabled = editIsDefault(ed.e);
}
function editDragEnd() { if (ed) ed.drag = null; }
async function editSave() {
  if (!ed) return;
  const { p, src } = ed, e = editClean(ed.e);
  $('pesave').disabled = true;
  try {
    await editApply(p, src, e);
    closeLayer();                                   // gleich zurück; gespeichert wird danach im Hintergrund
    if (typeof flowCache !== 'undefined') flowCache = null;
    refreshAll(); drawThumbs();
    toast(p.edit ? 'Bearbeitung übernommen.' : 'Das Foto ist wieder im Original.');
    savePhoto(p).catch(() => toast('Die Bearbeitung ist da, ließ sich aber nicht für später speichern.', 5000));
  } catch (err) { toast('Die Bearbeitung konnte nicht übernommen werden.'); }
  $('pesave').disabled = false;
}
// Farben und Filter auf andere Fotos übertragen (Zuschnitt, Drehen, Begradigen bleiben bei jedem Foto): erst das
// aktuelle Foto übernehmen, dann die anderen nacheinander aus ihrem Original neu rechnen (BB.uebertragen)
function editCopyAsk() {
  if (!ed) return;
  const p = ed.p, inGroup = state.photos.includes(p);
  const grp = inGroup ? state.photos.filter(x => x !== p && x.kind !== 'video') : [], all = pool.filter(x => x !== p && x.kind !== 'video');
  sheet(`<h3>Farben und Filter übertragen</h3>
    <div class="hint">Übertragen werden „Auto“, Helligkeit, Kontrast, Farbe, Wärme, Vignette und der Filter. Zuschnitt, Drehen und Begradigen bleiben bei jedem Foto, wie sie sind.</div>
    ${grp.length ? `<div class="row"><button class="btn" data-a="grp">Auf die anderen Fotos der Gruppe (${grp.length})</button></div>` : ''}
    <div class="row"><button class="btn" data-a="all">Auf alle anderen Fotos im Fotopool (${all.length})</button></div>
    <div class="row"><button class="btn" data-a="no">Abbrechen</button></div>`, box => {
    box.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => { closeSheet(); if (b.dataset.a !== 'no') editCopyTo(b.dataset.a === 'grp' ? grp : all); }; });
  });
}
async function editCopyTo(list) {
  if (!ed || !list.length) return;
  const look = editClean(ed.e);
  await editSave();
  let n = 0;
  for (const t of list) {
    try {
      if (!t.blob) await savePhoto(t);
      if (!t.blob) continue;
      const src = await editSource(t);
      await editApply(t, src, BB.uebertragen(look, t.edit)); await savePhoto(t);
      n++; ImagicosmosDesign.arbeit(`Übertragen: ${n} von ${list.length} Fotos …`, n, list.length);   // Ladeanzeige (Baustein design)
    } catch (e) {}
  }
  ImagicosmosDesign.arbeitEnde();
  if (typeof flowCache !== 'undefined') flowCache = null;
  refreshAll(); drawThumbs();
  toast(n === list.length ? `Farben und Filter auf ${n} ${n === 1 ? 'Foto' : 'Fotos'} übertragen.` : `Auf ${n} von ${list.length} Fotos übertragen; die übrigen ließen sich nicht lesen.`, 5000);
}
function editInit() {
  const box = $('peratio');
  EDIT_RATIOS.forEach(([id, name]) => { const b = document.createElement('button'); b.className = 'btn'; b.dataset.v = id; b.textContent = name; b.onclick = () => editSetRatio(id); box.appendChild(b); });
  $('petool').onclick = ev => { const b = ev.target.closest('button'); if (b && ed) { ed.tool = b.dataset.v; editSync(); } };
  $('peleft').onclick = () => ed && editTurn(3);
  $('peright').onclick = () => ed && editTurn(1);
  $('pemirror').onclick = () => ed && editMirror();
  $('peauto').onclick = () => { if (ed) { ed.e.auto = !ed.e.auto; editSync(); } };
  [['pebri', 'bri'], ['pecon', 'con'], ['pesat', 'sat']].forEach(([id, key]) => {
    $(id).oninput = () => { if (!ed) return; ed.e[key] = +$(id).value; const l = { bri: 'Helligkeit ', con: 'Kontrast ', sat: 'Farbe ' }[key];
      $(id + 'l').textContent = l + (ed.e[key] > 0 ? '+' : '') + ed.e[key]; $('pereset').disabled = editIsDefault(ed.e); editDrawSoon(); };
  });
  [['pestr', 'str'], ['pewrm', 'wrm'], ['pevig', 'vig']].forEach(([id, key]) => {
    $(id).oninput = () => { if (!ed) return; ed.e[key] = +$(id).value; editLabels(); $('pereset').disabled = editIsDefault(ed.e); editDrawSoon(); };
  });
  $('pecopy').onclick = editCopyAsk;
  $('pereset').onclick = () => { if (ed) { ed.e = BB.standard(); ed.ratio = 'free'; editSync(); } };
  $('pesave').onclick = editSave;
  const w = $('pewrap');
  w.addEventListener('pointerdown', editDragStart); w.addEventListener('pointermove', editDragMove);
  w.addEventListener('pointerup', editDragEnd); w.addEventListener('pointercancel', editDragEnd);
  // Seite geschlossen (Zurück, Übernehmen): Arbeitsdaten freigeben
  new MutationObserver(() => { if (ed && !$('photoedit').classList.contains('on')) ed = null; }).observe($('photoedit'), { attributes: true, attributeFilter: ['class'] });
}
