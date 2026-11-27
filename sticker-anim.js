// Imagiclique – bewegte Sticker (22.11.2026, Wunsch des Nutzers, Idee #17, Stufe 1: Katalog „Weihnachten“)
//  - Ein bewegter Sticker steht wie ein Emoji-Sticker in state.stickers, aber mit a (Kennung aus STICKER_ANIM) statt e:
//    { a, x, y, s, r, k }. Gezeichnet über stickersDraw (emoji.js) mit stickerAnimZeichnen().
//  - Jeder Sticker ist eine eigene Zeichnung aus Formen mit der Zeit t in Sekunden (Baustein „sticker“, siehe dessen LIESMICH.md).
//  - Zeit: stickerT (Sekunden) setzt showFrame() für Diashow und Video; sonst null → die Ruhe-Stellung (ruhe) des Stickers,
//    z. B. im Standbild (JPEG), im Vollbild und über eigenen Videos (deren Ebene ist ein Standbild).
//  - Vorschau im Bearbeiten: animVorschau() bewegt die Sticker des gezeigten Bilds (Grund einmal gezeichnet, darüber je Bild
//    nur Sticker und Wasserzeichen, etwa 20 Bilder je Sekunde).
//  - Ein Einzelbild mit bewegtem Sticker wird bei „Bilder einzeln“ als Video von STILL_SECS geteilt (mixedPlan, bewegt: true).
// Diese Datei wird vor dem Hauptskript geladen und greift erst zur Laufzeit auf dessen Namen zu.
let stickerT = null;
// Die Zeichnungen und der Katalog kommen seit 22.11.2026 aus dem Baustein „sticker“ (bausteine/sticker.js, vor dieser Datei geladen).
const STK = window.ImagicosmosSticker;
const STICKER_ANIM = STK.ANIM, STICKER_KATALOG = STK.KATALOG;
// zeichnet einen bewegten Sticker in der Mitte (0, 0) des Zeichenkontexts c, size = Breite in Bildpunkten, t = null → Ruhe-Stellung
const stickerAnimZeichnen = (c, a, size, t) => STK.zeichnen(c, a, size, t);
// „Bewegte Sticker“ der Gruppe (stickerMove, Vorgabe bewegt): bei „Still (Bild)“ stehen sie überall in der Ruhe-Stellung, Bilder bleiben Bilder
const stickerBewegt = () => state.stickerMove !== 'off';
const animAuf = key => stickerBewegt() && (state.stickers || []).some(s => s.a && STICKER_ANIM[s.a] && (s.k || 0) === key);
// „Bilder einzeln“: ein Bild mit bewegtem Sticker wird ein kurzes Video (nicht bei eigenen Videos, deren Ebene steht still)
const hatBewegtBild = () => state.motion !== 'video' && !isClip() && slidesList().some(sl => !sl.show && animAuf(sl.key));

// Vorschaubild im Auswahl-Blatt: bewegt sich, solange das Blatt offen ist
const stickerKachel = a => STK.kachel(a, { klasse: 'stanim', px: 56 });

// ---- bewegte Vorschau im Bearbeiten ----
let animLauf = null;   // { raf, t0, rev, idx, grund, ink, last }
function animAktiv() {
  return !document.hidden && document.body.classList.contains('v-edit') && !recording && !live && !isClip()
    && !layer && slidesList().length && animAuf(slidesList()[Math.max(0, Math.min(viewIdx, slidesList().length - 1))].key);
}
function animVorschau() {
  if (animLauf && !animAktiv()) { cancelAnimationFrame(animLauf.raf); animLauf = null; return; }   // sofort anhalten, nicht erst beim nächsten Bild
  if (animLauf || !animAktiv()) return;
  animLauf = { raf: 0, t0: performance.now(), rev: -1, idx: -1, grund: null, ink: null, last: 0 };
  animLauf.raf = requestAnimationFrame(animTick);
}
function animTick(now) {
  const L = animLauf; if (!L) return;
  if (!animAktiv()) { animLauf = null; if (!recording && !live) drawStill(); return; }
  L.raf = requestAnimationFrame(animTick);
  if (now - L.last < 48) return;
  L.last = now;
  const list = slidesList(), sl = list[Math.max(0, Math.min(viewIdx, list.length - 1))];
  if (L.rev !== shotRev || L.idx !== viewIdx || !L.grund) {          // Grund (Vorlage, Rahmen) einmal ohne Sticker und Wasserzeichen
    if (!L.grund) { L.grund = document.createElement('canvas'); L.grund.width = W; L.grund.height = H; }
    animOhneOben = true;
    try { drawSlide(sl); } finally { animOhneOben = false; }
    L.ink = tplInk; L.grund.getContext('2d').clearRect(0, 0, W, H); L.grund.getContext('2d').drawImage(cv, 0, 0);
    L.rev = shotRev; L.idx = viewIdx;
  }
  const keep = [ctx, tplInk, paintKey];
  ctx = mainCtx; tplInk = L.ink; paintKey = sl.key; stickerT = (now - L.t0) / 1000;
  try { ctx.clearRect(0, 0, W, H); ctx.drawImage(L.grund, 0, 0); stickersDraw(sl.key); watermark(PALETTES[state.pal]); vsRahmen(); }
  finally { stickerT = null; [ctx, tplInk, paintKey] = keep; }
}
let animOhneOben = false;   // paint() hört nach dem Rahmen auf (Grund für die bewegte Vorschau)
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(animVorschau, 100); });
