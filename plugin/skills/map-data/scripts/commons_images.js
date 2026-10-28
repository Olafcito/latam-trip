// Run in a tab on https://commons.wikimedia.org (same origin, so the API is reachable from the page).
// window.__img = null; findImages([{id:'ANT', q:'Antigua Guatemala'}, ...]).then(v => window.__img = v)
// Returns JSON lines: {"kind":"profile_image","id":..,"image":{url,page,credit,license,w,h}} or image null.
window.findImages = async function (items) {
  const strip = s => (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const it of items) {
    let pick = null;
    for (const q of [it.q + ' panorama', it.q + ' view', it.q]) {
      const u = '/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=' +
        encodeURIComponent(q + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280';
      try {
        const r = await (await fetch(u)).json();
        const pages = Object.values((r.query || {}).pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
        for (const p of pages) {
          const ii = (p.imageinfo || [])[0]; if (!ii) continue;
          const m = ii.extmetadata || {};
          const lic = strip((m.LicenseShortName || {}).value);
          const cat = strip((m.Categories || {}).value).toLowerCase();
          if (!lic || /fair use|non-free/i.test(lic)) continue;
          if (ii.width < 1000 || ii.width <= ii.height) continue;              // landscape, big enough
          if (/people|portrait|women|men|children|person/.test(cat)) continue;  // avoid photos of people
          pick = { url: ii.thumburl || ii.url, page: ii.descriptionurl, credit: strip((m.Artist || {}).value).slice(0, 120),
                   license: lic, w: ii.width, h: ii.height, title: p.title };
          break;
        }
      } catch (e) { }
      if (pick) break;
    }
    out.push(JSON.stringify({ kind: 'profile_image', id: it.id, image: pick }));
  }
  return out.join('\n');
};
