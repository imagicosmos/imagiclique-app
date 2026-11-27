// Service Worker für Imagiclique: Offline-Betrieb und Annahme geteilter Fotos (Web Share Target).
const VERSION = 'v37';
const SHELL_CACHE = 'imagiclique-shell-' + VERSION;
const CDN_CACHE = 'imagiclique-cdn';
const SHARED_CACHE = 'imagiclique-shared';   // muss zu index.html passen
const SHELL = ['./', 'index.html', 'native.js', 'clip.js', 'edit.js', 'emoji.js', 'sticker-anim.js', 'bausteine/sticker.js', 'bausteine/foto-auswahl.js', 'bausteine/foto-auswahl.css', 'bausteine/foto-daten.js', 'bausteine/video-schnitt.js', 'bausteine/bild-bearbeitung.js', 'bausteine/orts-info.js', 'bausteine/ki-kern.js', 'ki-direkt.js', 'bausteine/design.css', 'bausteine/design.js', 'bausteine/vorlagen.js', 'bausteine/vorschau.js', 'bausteine/vorschau.css', 'bausteine/verlauf.js', 'bausteine/arbeitsflaeche.js', 'bausteine/arbeitsflaeche.css', 'bausteine/josefin-sans-latin-700-normal.woff2', 'bausteine/textfeld.js', 'bausteine/textfeld.css', 'bausteine/ueber.js', 'bausteine/ueber.css', 'bausteine/menue.js', 'bausteine/menue.css', 'bausteine/zauberstab.js', 'icons/icon.svg', 'bausteine/aktualisieren.js', 'bausteine/aktualisieren.css', 'bausteine/bausteine.json', 'bausteine/mp4box.all.min.js', 'bausteine/mp4-muxer.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'vendor/mp4-muxer.min.js', 'vendor/mp4box.all.min.js', 'marke/zauber-auf-dunkel.png', 'marke/zauber-auf-hell.png', 'bausteine/inter-latin-400-normal.woff2', 'bausteine/inter-latin-600-normal.woff2', 'bausteine/inter-latin-800-normal.woff2', 'bausteine/playfair-display-latin-600-normal.woff2', 'bausteine/playfair-display-latin-800-normal.woff2', 'bausteine/cormorant-garamond-latin-700-normal.woff2', 'bausteine/caveat-latin-700-normal.woff2', 'bausteine/dancing-script-latin-700-normal.woff2', 'bausteine/great-vibes-latin-400-normal.woff2', 'bausteine/bebas-neue-latin-400-normal.woff2', 'bausteine/oswald-latin-600-normal.woff2', 'bausteine/fredoka-latin-600-normal.woff2', 'bausteine/comfortaa-latin-700-normal.woff2', 'bausteine/pacifico-latin-400-normal.woff2', 'bausteine/lobster-latin-400-normal.woff2', 'bausteine/special-elite-latin-400-normal.woff2', 'bausteine/permanent-marker-latin-400-normal.woff2', 'bausteine/stile/katalog.json', 'neuigkeiten.json'];
const CDN_HOSTS = ['cdn.jsdelivr.net'];   // Google Fonts seit 18.11.2026 nicht mehr: alle Schriften liegen im Baustein vorlagen (bausteine/*.woff2)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('imagiclique-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

// Android „Teilen → Imagiclique“: Fotos zwischenspeichern, dann die App öffnen.
async function receiveShare(request) {
  try {
    const form = await request.formData();
    await caches.delete(SHARED_CACHE);
    const cache = await caches.open(SHARED_CACHE);
    let i = 0, k = 0;
    for (const f of form.getAll('photos')) {
      if (!(f instanceof File)) continue;
      // Stil-Datei (*.imagistil, auch als .txt verschickt): getrennt ablegen, die App fragt dann, ob sie den Stil hinzufügen soll
      if (/\.(imagistil|txt|json)$/i.test(f.name) || /^text\/|json/.test(f.type)) {
        if (f.size <= 6000000) await cache.put(`shared/stil${k++}`, new Response(f, { headers: { 'Content-Type': 'text/plain' } }));
        continue;
      }
      await cache.put(`shared/${i++}`, new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
    }
    const text = [form.get('title'), form.get('text')].filter(v => typeof v === 'string' && v.trim()).join('\n');
    // Titel, Text und Link zusätzlich einzeln: Die App erkennt daran eine geteilte Antwort aus einer KI-App (Baustein ki)
    const feld = n => (typeof form.get(n) === 'string' ? form.get(n) : '');
    const ki = { title: feld('title'), text: feld('text'), url: feld('url') };
    if (text || ki.url) await cache.put('shared/meta', new Response(JSON.stringify({ text, ki }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (err) { /* App trotzdem öffnen */ }
  return Response.redirect('./?shared=1', 303);
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);

  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;

  // Eigene Dateien: erst Netz (immer aktueller Stand), ohne Netz aus dem Cache.
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // Schriften: erst Cache, sonst Netz.
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CDN_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })());
  }
});
