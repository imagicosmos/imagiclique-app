// Claude direkt fragen (21.11.2026, Wunsch des Nutzers, Idee #4 „KI für Texte“): Mit einem eigenen API-Schlüssel von Anthropic fragt die
// App Claude direkt – ohne den Umweg über eine KI-App (Frage kopieren oder teilen, Antwort zurückholen). Ohne Schlüssel bleibt alles wie
// bisher. Ein eigener Server ist nicht nötig: Die Anfrage geht vom Gerät an api.anthropic.com (für Seiten im Browser verlangt Anthropic
// dafür den Kopf „anthropic-dangerous-direct-browser-access“). Der Schlüssel liegt nur auf dem Gerät, im Speicher dieser App
// (localStorage unter eigenem Namen); er steht nie im Bearbeitungsstand, in Links, Dateien oder im Repository. Fragen, Auswerten der
// Antwort und alles Übrige bleiben in index.html (aiPrompt/apPrompt, aiUse/apUse) – hier nur Einstellung und Anfrage.
(function () {
  'use strict';
  const LS = 'imagiclique.kidirekt';
  const MODELLE = [
    { id: 'claude-opus-5-5', name: 'Opus 5.5', info: 'beste Texte' },
    { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', info: 'schneller, günstiger' },
    { id: 'claude-haiku-5-5', name: 'Haiku 5.5', info: 'am günstigsten' },
  ];
  const ADRESSE = 'https://api.anthropic.com/v1/messages';

  function lesen() {
    try { const o = JSON.parse(localStorage.getItem(LS) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  }
  const modellVon = e => (MODELLE.some(m => m.id === e.modell) ? e.modell : MODELLE[0].id);
  // ein Schlüssel von Anthropic beginnt mit „sk-ant-“; Leerzeichen und Zeilenumbrüche aus dem Einfügen fallen weg
  const sauber = s => String(s || '').replace(/\s+/g, '');
  const gueltig = s => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(sauber(s));

  function speichern(schluessel, modell) {
    const e = lesen();
    if (schluessel != null && sauber(schluessel)) {
      if (!gueltig(schluessel)) throw new Error('Das sieht nicht nach einem API-Schlüssel von Anthropic aus (er beginnt mit „sk-ant-“).');
      e.schluessel = sauber(schluessel);
    }
    if (modell) e.modell = modell;
    localStorage.setItem(LS, JSON.stringify(e));
  }
  function entfernen() { localStorage.removeItem(LS); }

  const zuB64 = blob => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => no(r.error || new Error('Bild nicht lesbar'));
    r.readAsDataURL(blob);
  });

  // fragt Claude mit einem Text und wahlweise Bildern (JPEG/PNG/WebP als Blob); liefert { text, modell } oder wirft mit deutscher Meldung
  async function fragen(text, bilder = [], optionen = {}) {
    const e = lesen();
    if (!e.schluessel) throw new Error('Es ist noch kein API-Schlüssel eingetragen.');
    const modell = modellVon(e);
    const inhalt = [];
    for (const b of bilder) inhalt.push({ type: 'image', source: { type: 'base64', media_type: b.type || 'image/jpeg', data: await zuB64(b) } });
    inhalt.push({ type: 'text', text: String(text) });
    const body = { model: modell, max_tokens: 16000, messages: [{ role: 'user', content: inhalt }] };
    const kopf = {
      'content-type': 'application/json',
      'x-api-key': e.schluessel,
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    // lehnt die Sicherheitsprüfung eine Anfrage ab, antwortet ein anderes Modell (nur Opus und Sonnet bieten das an)
    if (modell !== 'claude-haiku-5-5') { body.fallbacks = 'default'; kopf['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    let r;
    try { r = await fetch(ADRESSE, { method: 'POST', headers: kopf, body: JSON.stringify(body), signal: optionen.signal }); }
    catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new Error('Keine Verbindung zu Anthropic. Ist das Gerät online?');
    }
    let d = null;
    try { d = await r.json(); } catch (err) { d = null; }
    if (!r.ok) {
      const m = (d && d.error && d.error.message) || '';
      if (r.status === 401) throw new Error('Anthropic nimmt den API-Schlüssel nicht an. Bitte im Menü ⋮ „Claude direkt“ prüfen.');
      if (r.status === 403) throw new Error('Dieser API-Schlüssel darf das nicht' + (m ? ' (' + m + ')' : '') + '.');
      if (/credit|balance|billing/i.test(m)) throw new Error('Das Guthaben bei Anthropic reicht nicht. Unter console.anthropic.com aufladen.');
      if (r.status === 429) throw new Error('Gerade zu viele Anfragen. Bitte in einer Minute noch einmal.');
      if (r.status === 413) throw new Error('Die Anfrage ist zu groß (zu viele oder zu große Bilder).');
      if (r.status >= 500) throw new Error('Anthropic ist gerade überlastet. Bitte gleich noch einmal versuchen.');
      throw new Error('Anthropic hat die Anfrage abgelehnt (' + r.status + (m ? ': ' + m : '') + ').');
    }
    if (!d || !Array.isArray(d.content)) throw new Error('Die Antwort von Anthropic ist unverständlich.');
    if (d.stop_reason === 'refusal') throw new Error('Claude hat die Anfrage abgelehnt.');
    const t = d.content.filter(c => c && c.type === 'text').map(c => c.text).join('\n').trim();
    if (!t) throw new Error(d.stop_reason === 'max_tokens' ? 'Die Antwort wurde zu lang und ist abgebrochen.' : 'Claude hat keinen Text geliefert.');
    return { text: t, modell: d.model || modell };
  }

  window.ImagicliqueKiDirekt = {
    MODELLE,
    an: () => !!lesen().schluessel,
    modell: () => modellVon(lesen()),
    // nur die letzten vier Zeichen, zum Wiedererkennen
    ende: () => { const s = lesen().schluessel; return s ? s.slice(-4) : ''; },
    gueltig, speichern, entfernen, fragen,
  };
})();
