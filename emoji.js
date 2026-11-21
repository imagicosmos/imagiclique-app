// Imagiclique – Emoji (19.11.2026, Wunsch des Nutzers)
//  - Auswahl an Titel und Text: fügt das Emoji an der Schreibmarke ein (emojiPick, Knöpfe [data-emo]).
//  - Emoji-Sticker auf dem Bild: Gruppenwert stickers = [{ e, x, y, s, r, k }] – e Emoji, x/y Mitte in Anteilen der Bildfläche,
//    s Größe in Anteilen der Bildbreite, r Drehung in Grad, k Nummer des Bilds in der Gruppe (slidesList().key).
//    Gezeichnet in paint() über der Vorlage (stickersDraw), im eigenen Video in der Ebene (clipOverlay). Verschieben durch
//    Ziehen in der Vorschau (stickerHit), Größe und Drehung mit Reglern im Reiter Text. Die Liste wird nie verändert,
//    sondern immer ersetzt (die Vorgabe [] in DEFAULTS teilen sich die Gruppen).
// Diese Datei wird vor dem Hauptskript geladen und greift erst zur Laufzeit auf dessen Namen zu.
const EMOJI = [
  ['Smileys', '😀 😃 😄 😁 😆 🥹 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😌 😴 🤔 🤗 🤭 😮 😲 🥺 😢 😭 😤 😡 🤯 😱 🙄 😬 🤠 🫠 😺'],
  ['Herzen', '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💖 💗 💓 💞 💕 💘 💝 ❣️ 💔 ♥️ 💋 💌 🫶'],
  ['Feiern', '🎉 🎊 🥳 🎂 🍰 🧁 🎁 🎈 🎀 🪅 🍾 🥂 🍻 🎆 🎇 ✨ 🌟 ⭐ 🏆 🥇 🎓 💍 👰 🤵 👶 🍼 🎄 🎅 🐣 🐰 🎃 👻 🕯️'],
  ['Natur', '☀️ 🌤️ ⛅ 🌧️ ⛈️ ❄️ ☃️ 🌈 🌊 💧 🔥 🌸 🌺 🌻 🌷 🌹 💐 🍀 🌿 🍁 🍂 🌲 🌴 🌵 🌙 🌍 🏔️ 🏖️ 🏝️'],
  ['Essen', '🍕 🍔 🍟 🌭 🥨 🥐 🍝 🍣 🍜 🥗 🍓 🍒 🍉 🍋 🍎 🥑 🍦 🍨 🍩 🍪 🍫 ☕ 🍵 🍺 🍷 🍹 🥤'],
  ['Reisen', '✈️ 🚗 🚲 🚂 🚢 ⛵ 🏕️ 🗺️ 🧳 📍 🏰 🗼 🗽 ⛪ 🏛️ 🎡 🎢 🏠 🏡 🚀 ⛰️ 🌅 🌄 🌃'],
  ['Freizeit', '⚽ 🏀 🎾 🏐 🏓 ⛳ 🚴 🏊 🏃 🧘 🎿 🏂 🎣 🎸 🎹 🎤 🎧 🎬 📸 🎨 📚 🎮 🧩 🎲 🛍️'],
  ['Tiere', '🐶 🐱 🐭 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦉 🐴 🦄 🐝 🦋 🐞 🐢 🐬 🐳 🐠'],
  ['Zeichen', '👍 👎 👏 🙌 👋 🤝 🙏 💪 ✌️ 🤞 🤟 👌 🤙 👉 👆 ☝️ ✋ 💯 ✅ ❌ ❗ ❓ 💤 💬 💭 🔔 📣 🎯 💡'],
].map(([name, liste]) => ({ name, liste: liste.split(' ') }));
const EMOJI_ZULETZT = 'imagiclique.emoji';
const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol",sans-serif';
let paintKey = 0;          // Nummer des Bilds, das paint() gerade zeichnet (setzt drawSlide)
let stSel = -1;            // gewählter Sticker (Index in state.stickers)

function emojiZuletzt() { try { const a = JSON.parse(localStorage.getItem(EMOJI_ZULETZT) || '[]'); return Array.isArray(a) ? a.filter(e => typeof e === 'string' && e.length <= 16).slice(0, 16) : []; } catch (e) { return []; } }
// Auswahl als Blatt: „Zuletzt“ und Gruppen; wahl(emoji) nach dem Antippen
function emojiPick(titel, wahl) {
  const z = emojiZuletzt(), gruppen = (z.length ? [{ name: 'Zuletzt', liste: z }] : []).concat(EMOJI);
  sheet(`<h3>${titel}</h3><div class="emotabs"></div><div class="emogrid"></div><div class="row"><button class="btn" data-a="zu">Schließen</button></div>`, box => {
    const tabs = box.querySelector('.emotabs'), grid = box.querySelector('.emogrid');
    const zeige = gi => {
      [...tabs.children].forEach((t, i) => t.classList.toggle('on', i === gi));
      grid.innerHTML = '';
      gruppen[gi].liste.forEach(e => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e; b.setAttribute('aria-label', e);
        b.onclick = () => { closeSheet(); try { localStorage.setItem(EMOJI_ZULETZT, JSON.stringify([e, ...emojiZuletzt().filter(x => x !== e)].slice(0, 16))); } catch (x) {} wahl(e); };
        grid.appendChild(b); });
    };
    gruppen.forEach((g, i) => { const t = document.createElement('button'); t.type = 'button'; t.className = 'btn'; t.textContent = g.name; t.onclick = () => zeige(i); tabs.appendChild(t); });
    box.querySelector('[data-a="zu"]').onclick = closeSheet;
    zeige(0);
  });
}
// an der Schreibmarke eines Felds einfügen; das Feld meldet die Änderung wie beim Tippen (input)
function emojiInsert(feld, e) {
  const f = $(feld); if (!f) return;
  const a = f.selectionStart ?? f.value.length, b = f.selectionEnd ?? a;
  f.value = f.value.slice(0, a) + e + f.value.slice(b);
  f.selectionStart = f.selectionEnd = a + e.length;
  f.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---- Sticker ----
const stickersOf = k => (state.stickers || []).map((s, i) => ({ s, i })).filter(o => (o.s.k || 0) === k);
function stickersDraw(key) {
  if (dry) return;
  const list = (state.stickers || []).filter(s => (s.k || 0) === key);
  list.forEach(s => {
    const size = Math.max(20, s.s * W);
    ctx.save(); ctx.translate(s.x * W, s.y * H); ctx.rotate((s.r || 0) * Math.PI / 180);
    ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = size * .06; ctx.shadowOffsetY = size * .02;
    ctx.fillText(s.e, 0, size * .04); ctx.restore();
  });
}
function stickersSet(list) { state.stickers = list; stUI(); persist(); render(); }
function stickerAdd(e) {
  const k = isClip() ? 0 : viewIdx, n = stickersOf(k).length;
  const neu = { e, x: .5 + ((n % 3) - 1) * .18, y: .42 + Math.floor(n / 3) % 3 * .1, s: .2, r: 0, k };
  stSel = (state.stickers || []).length;
  stickersSet([...(state.stickers || []), neu]);
  toast('Sticker gesetzt – in der Vorschau an die richtige Stelle ziehen.', 3500);
}
function stickerChange(i, werte) { const l = (state.stickers || []).slice(); if (!l[i]) return; l[i] = Object.assign({}, l[i], werte); state.stickers = l; }
// Treffer in der Vorschau: Index des obersten Stickers des gezeigten Bilds unter dem Punkt (Anteile der Fläche) oder -1
function stickerHit(fx, fy) {
  const k = isClip() ? 0 : viewIdx, list = stickersOf(k);
  for (let j = list.length - 1; j >= 0; j--) {
    const s = list[j].s, rx = s.s / 2 * 1.1, ry = rx * W / H;
    if (Math.abs(fx - s.x) <= rx && Math.abs(fy - s.y) <= ry) return list[j].i;
  }
  return -1;
}
function stUI() {
  const box = $('stklist'); if (!box) return;   // Sticker-Liste (nicht #stlist: das ist die Liste der Stile)
  const k = isClip() ? 0 : viewIdx, list = stickersOf(k);
  if (!list.some(o => o.i === stSel)) stSel = list.length ? list[list.length - 1].i : -1;
  box.innerHTML = '';
  list.forEach(({ s, i }) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (i === stSel ? ' on' : ''); b.textContent = s.e;
    b.setAttribute('aria-label', 'Sticker ' + s.e + ' wählen'); b.onclick = () => { stSel = i; stUI(); }; box.appendChild(b); });
  $('stkedit').hidden = stSel < 0;
  $('stinfo').textContent = list.length ? (isClip() || slidesList().length < 2 ? '' : `Sticker auf Bild ${k + 1}.`) : 'Noch kein Sticker auf diesem Bild.';
  if (stSel >= 0) { const s = state.stickers[stSel]; $('stsize').value = Math.round(s.s * 100); $('strot').value = Math.round(s.r || 0);
    $('stsizel').textContent = 'Größe ' + Math.round(s.s * 100) + ' %'; $('strotl').textContent = 'Drehung ' + Math.round(s.r || 0) + '°'; }
}
function emojiInit() {
  document.querySelectorAll('[data-emo]').forEach(b => { b.onclick = () => emojiPick('Emoji einfügen', e => emojiInsert(b.dataset.emo, e)); });
  $('stadd').onclick = () => emojiPick('Emoji als Sticker', stickerAdd);
  $('stsize').oninput = () => { if (stSel < 0) return; stickerChange(stSel, { s: +$('stsize').value / 100 }); stUI(); render(); };
  $('strot').oninput = () => { if (stSel < 0) return; stickerChange(stSel, { r: +$('strot').value }); stUI(); render(); };
  $('stsize').onchange = $('strot').onchange = () => persist();
  $('stdel').onclick = () => { if (stSel < 0) return; const l = state.stickers.filter((_, i) => i !== stSel); stSel = -1; stickersSet(l); };
  stUI();
}
