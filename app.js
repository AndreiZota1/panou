/* Panou Safe Ads: aplicatia de pe telefon (23.11.2026).
   Totul vine de la serverul de pe Mac, prin tunel; aici nu exista date, chei sau adrese scrise in cod.
   Adresa serverului si cheia dispozitivului se primesc o singura data, din linkul de imperechere. */
'use strict';

const CHEIE_CFG = 'panou.cfg.v1';
const CHEIE_VAZUT = 'panou.vazut.v1';
const API_PERMIS = /^(https:\/\/[a-z0-9-]+\.ngrok-free\.(app|dev)|https:\/\/[a-z0-9-]+\.ngrok\.(app|dev)|http:\/\/127\.0\.0\.1:8095)$/;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cfg = null;
try { cfg = JSON.parse(localStorage.getItem(CHEIE_CFG) || 'null'); } catch (e) { cfg = null; }
let vazut = {};
try { vazut = JSON.parse(localStorage.getItem(CHEIE_VAZUT) || '{}') || {}; } catch (e) { vazut = {}; }

const S = { stare: null, stareLa: 0, fire: null, fireLa: 0, clienti: {}, mesaje: null, mesajeLa: 0, cauta: '' };
let temporizator = null;
let randareId = 0;

class EroareAuth extends Error {}

/* ------------------------------------------------------------ retea */
async function api(cale, opt = {}) {
  if (!cfg) throw new EroareAuth('neimperecheat');
  let r;
  try {
    r = await fetch(cfg.api + cale, {
      method: opt.method || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + cfg.cheie, 'ngrok-skip-browser-warning': '1' },
        opt.body ? { 'Content-Type': 'application/json' } : {}),
      body: opt.body ? JSON.stringify(opt.body) : undefined,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    throw new Error('Nu ajung la Mac. Verifică internetul; dacă merge, Mac-ul sau tunelul e oprit.');
  }
  if (r.status === 401) throw new EroareAuth('neautorizat');
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch (e) { j = null; }
  if (!j) {
    if (/ngrok/i.test(t)) throw new Error('Tunelul spre Mac nu răspunde (Mac-ul e oprit sau tunelul a căzut).');
    throw new Error('Răspuns neașteptat de la Mac (' + r.status + ').');
  }
  if (!r.ok) throw new Error(j.eroare || ('Eroare ' + r.status));
  return j;
}

/* ------------------------------------------------------------ formatare */
const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });
function num(x) { return (x === null || x === undefined || x === '') ? '—' : (typeof x === 'number' ? nf.format(x) : esc(x)); }
function unitate(u) { return u ? esc(String(u).replace(/^RON\/zi$/i, 'lei/zi').replace(/^RON$/i, 'lei')) : ''; }
function ora(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return esc(ts);
  const azi = new Date();
  const ieri = new Date(Date.now() - 86400000);
  const hm = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === azi.toDateString()) return 'azi, ' + hm;
  if (d.toDateString() === ieri.toDateString()) return 'ieri, ' + hm;
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' }) + ', ' + hm;
}
function ziua(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const azi = new Date();
  if (d.toDateString() === azi.toDateString()) return 'Azi';
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Ieri';
  return d.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
}
function verdictClasa(v) {
  const s = String(v || '').toUpperCase();
  if (s.startsWith('TRECE')) return 'bine';
  if (s.startsWith('RESPING')) return 'rau';
  if (s) return 'atentie';
  return '';
}
function stareClasa(s) { return s === 'ROSU' ? 'rau' : s === 'GALBEN' ? 'atentie' : s === 'VERDE' ? 'bine' : ''; }
function stareText(s) { return s === 'ROSU' ? 'roșu' : s === 'GALBEN' ? 'galben' : s === 'VERDE' ? 'verde' : (s || ''); }
function platforma(p) { return p === 'meta' ? 'Meta' : p === 'google' ? 'Google' : p === 'tiktok' ? 'TikTok' : esc(p || ''); }
const TIPURI = { buget: 'buget', tcpa: 'tCPA', troas: 'tROAS', negative: 'negative', pauza_campanie: 'pauză campanie', activare_campanie: 'pornire campanie', pauza_adset: 'pauză ad set', activare_adset: 'pornire ad set', pauza_ad: 'pauză reclamă', activare_ad: 'pornire reclamă', duplicare_ad: 'copiere reclamă', nota: 'notă' };
function tip(t) { return esc(TIPURI[t] || String(t || '').replace(/_/g, ' ')); }

/* ------------------------------------------------------------ ui comun */
function toast(text, rau) {
  const el = $('#toast');
  el.textContent = text;
  el.className = 'toast' + (rau ? ' rau' : '');
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, rau ? 6000 : 3500);
}
function strat(html, la_montare) {
  const s = $('#strat');
  s.innerHTML = '<div class="foaie-jos" role="dialog" aria-modal="true">' + html + '</div>';
  s.hidden = false;
  s.onclick = (e) => { if (e.target === s) inchideStrat(); };
  if (la_montare) la_montare(s);
}
function inchideStrat() { const s = $('#strat'); s.hidden = true; s.innerHTML = ''; }
function seteazaTitlu(t) { $('#titlu').textContent = t; document.title = t === 'Panou' ? 'Panou Safe Ads' : t + ' · Panou'; }
function seteazaActualizat(ts) { $('#actualizat').textContent = ts ? ('actualizat ' + new Date(ts).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })) : ''; }
function seIncarca(da) { $('#reimprospateaza').classList.toggle('roteste', !!da); }
function main() { return $('#main'); }
function copiaza(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => toast('Copiat.'), () => copiazaVechi(text));
  }
  copiazaVechi(text);
  return Promise.resolve();
}
function copiazaVechi(text) {
  const t = document.createElement('textarea');
  t.value = text; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); toast('Copiat.'); } catch (e) { toast('Nu am putut copia.', true); }
  t.remove();
}
function deschideWhatsApp(text) {
  // doar aplicatia WhatsApp (schema whatsapp://), niciodata o pagina web
  window.location.href = 'whatsapp://send?text=' + encodeURIComponent(text);
}
function ciornaPentruClaude(text, slug) {
  if (slug) {
    sessionStorage.setItem('panou.ciorna.c.' + slug, text);
    location.hash = '#/client/' + encodeURIComponent(slug) + '/claude';
    return;
  }
  sessionStorage.setItem('panou.ciorna', text);
  location.hash = '#/claude';
}

/* ------------------------------------------------------------ date */
async function incarcaStare(fortat) {
  if (!fortat && S.stare && Date.now() - S.stareLa < 20000) return S.stare;
  S.stare = await api('/api/stare');
  S.stareLa = Date.now();
  actualizeazaInsigne();
  return S.stare;
}
async function incarcaFire(fortat) {
  if (!fortat && S.fire && Date.now() - S.fireLa < 4000) return S.fire;
  S.fire = (await api('/api/fire')).fire || [];
  S.fireLa = Date.now();
  actualizeazaInsigne();
  return S.fire;
}
function actualizeazaInsigne() {
  const a = $('#ins-azi');
  const n = S.stare ? (S.stare.de_aprobat || []).length : 0;
  a.textContent = n ? String(n) : '';
  const c = $('#ins-claude');
  c.className = 'insigna';
  c.textContent = '';
  if (S.fire) {
    const lucreaza = S.fire.filter((f) => f.stare === 'lucreaza').length;
    const necitite = S.fire.filter((f) => f.ultim_de === 'claude' && (!vazut[f.id] || vazut[f.id] < f.actualizat)).length;
    if (necitite) c.textContent = String(necitite);
    else if (lucreaza) { c.classList.add('punct'); c.textContent = ' '; }
  }
}

/* ------------------------------------------------------------ router */
function ruta() {
  const h = location.hash.replace(/^#\/?/, '');
  const parti = h.split('/');
  return { v: parti[0] || 'clienti', arg: decodeURIComponent(parti.slice(1).join('/') || '') };
}
function marcheazaTab(v) {
  const tab = ({ client: 'clienti', fir: 'claude' })[v] || v;
  $$('#tabbar a').forEach((a) => a.classList.toggle('activ', a.dataset.tab === tab));
}

async function randeaza(fortat) {
  clearTimeout(temporizator);
  const id = ++randareId;
  if (!cfg) return ecranImperechere();
  const { v, arg } = ruta();
  marcheazaTab(v);
  main().classList.toggle('lat', v === 'clienti' || v === 'client');
  seIncarca(true);
  try {
    if (v === 'azi') await vedereAzi(id, fortat);
    else if (v === 'clienti') await vedereClienti(id, fortat);
    else if (v === 'client') await vedereClient(id, arg, fortat);
    else if (v === 'mesaje') await vedereMesaje(id, fortat);
    else if (v === 'claude') await vedereClaude(id, fortat);
    else if (v === 'fir') await vedereFir(id, arg, fortat);
    else { location.hash = '#/clienti'; }
  } catch (e) {
    if (id !== randareId) return;
    if (e instanceof EroareAuth) return ecranNeautorizat();
    main().innerHTML = '<div class="eroare">' + esc(e.message || e) + '</div><div class="butoane"><button class="buton" id="incearca">Încearcă din nou</button></div>';
    $('#incearca').onclick = () => randeaza(true);
  } finally {
    if (id === randareId) seIncarca(false);
  }
}

/* ------------------------------------------------------------ imperechere */
function citestePerechea() {
  const m = location.hash.match(/[#&]p=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const j = JSON.parse(atob(b));
    if (!j || typeof j.u !== 'string' || typeof j.c !== 'string') return null;
    return { u: j.u.replace(/\/+$/, ''), c: j.c };
  } catch (e) { return null; }
}

async function imperecheaza(p) {
  history.replaceState(null, '', location.pathname + '#/clienti');
  if (!API_PERMIS.test(p.u)) {
    main().innerHTML = '<div class="imperechere"><h2>Link greșit</h2><p class="text-2">Adresa din link nu e una pe care aplicația o acceptă. Cere un link nou de la Claude, de pe Mac.</p></div>';
    return false;
  }
  seteazaTitlu('Împerechere');
  main().innerHTML = '<div class="imperechere"><h2>Leg telefonul de Mac…</h2><p class="text-2">O singură dată.</p></div>';
  try {
    const r = await fetch(p.u + '/api/imperechere', {
      method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify({ cod: p.c, nume: (navigator.userAgentData && navigator.userAgentData.platform) || 'telefon' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.cheie) throw new Error(j.eroare || ('Eroare ' + r.status));
    cfg = { api: p.u, cheie: j.cheie, dispozitiv: j.dispozitiv, din: new Date().toISOString() };
    localStorage.setItem(CHEIE_CFG, JSON.stringify(cfg));
    toast('Gata, telefonul e legat de Mac.');
    return true;
  } catch (e) {
    if (cfg) {
      // browserul e deja legat de Mac (de la o deschidere anterioara a linkului): linkul folosit nu mai conteaza
      toast('Browserul ăsta e deja legat de Mac; linkul nu mai trebuie.');
      return true;
    }
    main().innerHTML = '<div class="imperechere"><h2>Nu s-a putut lega</h2><p class="text-2">' + esc(e.message) + '</p><p class="text-2">Un link se poate folosi o singură dată și e valabil 7 zile. Cere unul nou de la Claude, de pe Mac.</p></div>';
    return false;
  }
}

function ecranImperechere() {
  seteazaTitlu('Panou');
  marcheazaTab('');
  main().innerHTML = '<div class="imperechere"><h2>Aplicația nu e legată încă</h2><p class="text-2">Deschide pe telefon linkul de împerechere primit de la Claude. Linkul leagă telefonul ăsta de Mac-ul tău și merge o singură dată.</p></div>';
}
function ecranNeautorizat() {
  seteazaTitlu('Panou');
  main().innerHTML = '<div class="imperechere"><h2>Telefonul nu mai e autorizat</h2><p class="text-2">Mac-ul nu mai recunoaște cheia acestui telefon (a fost scoasă sau schimbată). Cere de la Claude un link nou de împerechere.</p><div class="butoane"><button class="buton" id="uita">Șterge legătura veche</button></div></div>';
  $('#uita').onclick = () => { localStorage.removeItem(CHEIE_CFG); cfg = null; ecranImperechere(); };
}

/* ------------------------------------------------------------ AZI */
function cardPropunere(p, compact) {
  const v = p.verificator;
  const vc = v ? verdictClasa(v.verdict) : '';
  const schimbare = (p.de_la !== null && p.de_la !== undefined) || (p.la !== null && p.la !== undefined)
    ? '<div class="valoare">' + num(p.de_la) + '<span class="sageata">→</span>' + num(p.la) + '<span class="unit">' + unitate(p.unitate) + '</span></div>' : '';
  const intreb = (p.de_ce_intreb || []).length ? '<div class="mic">De ce te întreb:</div><ul class="lista">' + p.de_ce_intreb.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
  const avert = (p.avertismente || []).length ? '<details><summary>Avertismentele gărzii (' + p.avertismente.length + ')</summary><ul class="lista">' + p.avertismente.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' : '';
  const motiv = p.motiv ? '<details><summary>Motivul complet</summary><p class="pre text-2">' + esc(p.motiv) + '</p></details>' : '';
  const verif = v ? '<div class="verificator ' + vc + '"><b>Verificatorul: ' + esc(v.verdict) + '</b>' + (v.motiv ? '<details><summary>de ce</summary><p class="pre">' + esc(v.motiv) + '</p></details>' : '') + '</div>' : '';
  const exp = p.expira ? '<span class="mic">expiră ' + ora(p.expira) + '</span>' : '';
  return '<div class="card" data-id="' + esc(p.id) + '">' +
    '<div class="rand"><div class="rand-st"><span class="chip">' + esc(p.client_nume) + '</span><span class="eticheta">' + platforma(p.platforma) + ' · ' + tip(p.tip) + '</span></div><span class="mic">' + esc(p.id) + '</span></div>' +
    (p.nume ? '<div class="titlu-card">' + esc(p.nume) + '</div>' : '') +
    schimbare +
    (p.scurt ? '<div class="text-2">' + esc(p.scurt) + '</div>' : '') +
    (p.text ? '<div class="ciorna">' + esc(p.text) + '</div>' : '') +
    (p.nota ? '<div class="ciorna">' + esc(p.nota) + '</div>' : '') +
    verif + (compact ? '' : intreb + avert + motiv) +
    (exp ? '<div class="rand"><span></span>' + exp + '</div>' : '') +
    '<div class="butoane"><button class="buton pericol" data-act="nu">Nu</button><button class="buton principal" data-act="da">Da, aplică</button></div>' +
    '</div>';
}

function legaButoanePropuneri(radacina, lista) {
  $$('.card[data-id] [data-act]', radacina).forEach((b) => {
    b.onclick = () => {
      const card = b.closest('.card');
      const p = lista.find((x) => x.id === card.dataset.id);
      if (p) confirmaDecizie(p, b.dataset.act === 'da');
    };
  });
}

function descriereSchimbare(p) {
  const s = [];
  s.push(esc(p.client_nume) + ' · ' + platforma(p.platforma) + ' · ' + tip(p.tip));
  if (p.nume) s.push('<b>' + esc(p.nume) + '</b>');
  if (p.de_la !== null && p.de_la !== undefined) s.push(num(p.de_la) + ' → ' + num(p.la) + ' ' + unitate(p.unitate));
  return s.join('<br>');
}

function confirmaDecizie(p, da) {
  const v = p.verificator;
  const avertV = da && v && verdictClasa(v.verdict) !== 'bine'
    ? '<div class="eroare">Verificatorul a spus <b>' + esc(v.verdict) + '</b>' + (v.motiv ? ': ' + esc(v.motiv.slice(0, 400)) + (v.motiv.length > 400 ? '…' : '') : '') + '</div>' : '';
  strat('<h2>' + (da ? 'Aplic acum în cont?' : 'Respingi propunerea?') + '</h2>' +
    '<p>' + descriereSchimbare(p) + '</p>' + avertV +
    '<p class="mic">' + (da ? 'Garda pilotului verifică din nou valoarea live înainte de scriere și o recitește după.' : 'Propunerea se închide ca RESPINSĂ și nu se mai face.') + ' (' + esc(p.id) + ')</p>' +
    '<div class="butoane"><button class="buton" id="renunt">Renunț</button><button class="buton ' + (da ? 'principal' : 'pericol') + '" id="confirm">' + (da ? 'Da, confirm' : 'Nu, respinge') + '</button></div>',
  () => {
    $('#renunt').onclick = inchideStrat;
    $('#confirm').onclick = async () => {
      $('#confirm').disabled = true; $('#renunt').disabled = true;
      $('#confirm').textContent = da ? 'Aplic…' : 'Respingi…';
      try {
        const r = await api('/api/decizie', { method: 'POST', body: { id: p.id, raspuns: da ? 'da' : 'nu' } });
        inchideStrat();
        arataRezultatDecizie(p, da, r);
        S.stareLa = 0;
        randeaza(true);
      } catch (e) {
        inchideStrat();
        if (e instanceof EroareAuth) return ecranNeautorizat();
        toast(e.message, true);
      }
    };
  });
}

function arataRezultatDecizie(p, da, r) {
  if (!da) {
    toast(r.ok === false ? ('Nu s-a putut: ' + (r.eroare || '')) : (p.id + ' respinsă.'), r.ok === false);
    return;
  }
  const st = r.status || (r.ok === false ? 'EROARE' : '');
  const ok = st === 'APLICAT';
  const det = (r.de_la !== undefined && r.la !== undefined && r.de_la !== null) ? (num(r.de_la) + ' → ' + num(r.la) + ' ' + unitate(r.unitate)) : '';
  const rb = r.readback ? (r.readback.ok ? 'Recitit live: ' + num(r.readback.valoare_citita) : 'Recitirea a picat') : '';
  const bloc = r.decizie && (r.decizie.blocat || []).length ? '<ul class="lista">' + r.decizie.blocat.map((x) => '<li>' + esc(typeof x === 'string' ? x : JSON.stringify(x)) + '</li>').join('') + '</ul>' : '';
  strat('<h2>' + (ok ? 'Aplicat' : 'Nu s-a aplicat') + '</h2>' +
    '<p>' + esc(p.client_nume) + (p.nume ? ' · ' + esc(p.nume) : '') + '<br>' + det + '</p>' +
    (ok ? '<div class="verificator bine">' + esc(rb || 'Scris în cont.') + '</div>' : '<div class="eroare">' + esc(st) + (r.eroare ? ': ' + esc(r.eroare) : '') + bloc + '</div>') +
    '<div class="butoane"><button class="buton principal" id="ok">OK</button></div>',
  () => { $('#ok').onclick = inchideStrat; });
}

function confirmaToateTrece(lista) {
  strat('<h2>DA la toate cele cu TRECE?</h2><p class="text-2">Le aplic pe rând, fiecare cu garda ei:</p><ul class="lista">' +
    lista.map((p) => '<li>' + esc(p.id) + ' · ' + esc(p.client_nume) + (p.nume ? ' · ' + esc(p.nume) : '') + (p.de_la !== null && p.de_la !== undefined ? ' · ' + num(p.de_la) + ' → ' + num(p.la) + ' ' + unitate(p.unitate) : '') + '</li>').join('') +
    '</ul><div class="butoane"><button class="buton" id="renunt">Renunț</button><button class="buton principal" id="confirm">Da, confirm (' + lista.length + ')</button></div>',
  () => {
    $('#renunt').onclick = inchideStrat;
    $('#confirm').onclick = async () => {
      $('#confirm').disabled = true; $('#renunt').disabled = true;
      const rez = [];
      for (const p of lista) {
        $('#confirm').textContent = 'Aplic ' + p.id + '…';
        try {
          const r = await api('/api/decizie', { method: 'POST', body: { id: p.id, raspuns: 'da' } });
          rez.push([p, r.status || (r.ok === false ? ('eroare: ' + (r.eroare || '')) : 'gata')]);
        } catch (e) {
          if (e instanceof EroareAuth) { inchideStrat(); return ecranNeautorizat(); }
          rez.push([p, 'eroare: ' + e.message]);
        }
      }
      strat('<h2>Rezultat</h2><ul class="lista">' + rez.map(([p, s]) => '<li>' + esc(p.id) + ' · ' + esc(p.client_nume) + ': <b>' + esc(s) + '</b></li>').join('') + '</ul><div class="butoane"><button class="buton principal" id="ok">OK</button></div>',
        () => { $('#ok').onclick = inchideStrat; });
      S.stareLa = 0;
      randeaza(true);
    };
  });
}

function grupeaza(lista, cheie) {
  const m = new Map();
  lista.forEach((x) => { const k = x[cheie]; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return m;
}

async function vedereAzi(id, fortat) {
  seteazaTitlu('Azi');
  if (!S.stare) main().innerHTML = '<div class="incarcare">Se încarcă…</div>';
  const s = await incarcaStare(fortat);
  if (id !== randareId) return;
  seteazaActualizat(s.generat);
  const aziIso = new Date().toLocaleDateString('sv-SE');
  let h = '';
  if (s.zi && s.zi !== aziIso) h += '<div class="avert">Pilotul n-a terminat încă rularea de azi. Analizele sunt din ' + esc(s.zi) + '; aprobările de mai jos sunt cele de acum.</div>';
  if (s.kill_switch && s.kill_switch.stare && s.kill_switch.stare !== 'ON') h += '<div class="eroare">Comutatorul pilotului e pe <b>' + esc(s.kill_switch.stare) + '</b>' + (s.kill_switch.motiv ? ': ' + esc(s.kill_switch.motiv) : '') + '</div>';
  (s.erori || []).forEach((e) => { h += '<div class="eroare">' + esc(e) + '</div>'; });
  const rosii = (s.clienti || []).filter((c) => c.stare === 'ROSU').length;
  h += '<div class="rezumat-zi">' +
    '<div class="cifra"><b>' + (s.de_aprobat || []).length + '</b><span>de aprobat</span></div>' +
    '<div class="cifra"><b>' + (s.aplicat_azi || []).length + '</b><span>aplicate azi</span></div>' +
    '<div class="cifra"><b>' + rosii + '</b><span>clienți pe roșu</span></div>' +
    '</div>';
  h += '<div class="mic">Pilotul: ' + (s.pilot_actualizat ? ora(s.pilot_actualizat) : '—') + (s.kill_switch && s.kill_switch.stare ? ' · comutator ' + esc(s.kill_switch.stare) : '') + '</div>';

  const lista = s.de_aprobat || [];
  const trece = lista.filter((p) => p.verificator && verdictClasa(p.verificator.verdict) === 'bine');
  h += '<div class="sectiune"><h2>De aprobat</h2><span class="mic">' + lista.length + '</span></div>';
  if (trece.length >= 2) h += '<button class="buton mic-b" id="toate-trece">DA la cele ' + trece.length + ' cu TRECE de la verificator</button>';
  h += lista.length ? lista.map((p) => cardPropunere(p)).join('') : '<div class="gol">Nimic de aprobat acum.</div>';
  if ((s.amanate || []).length) {
    h += '<details><summary>Amânate de gardă (' + s.amanate.length + '), se pot aproba și ele</summary><div id="amanate">' + s.amanate.map((p) => cardPropunere(p, true)).join('') + '</div></details>';
  }

  const intrebari = s.intrebari || [];
  h += '<div class="sectiune"><h2>Întrebările analiștilor</h2><span class="mic">' + intrebari.length + '</span></div>';
  if (intrebari.length) {
    h += '<div class="card">';
    grupeaza(intrebari, 'client_nume').forEach((qs, nume) => {
      h += '<div class="grup-client">' + esc(nume) + '</div>';
      qs.forEach((q, i) => {
        h += '<div class="intrebare"><div class="pre">' + esc(q.text) + '</div><div class="butoane"><button class="buton mic-b" data-raspunde="' + esc(q.client) + '|' + i + '">Răspunde</button></div></div>';
      });
    });
    h += '</div>';
  } else h += '<div class="gol">Nicio întrebare.</div>';

  const ciorne = s.ciorne || [];
  h += '<div class="sectiune"><h2>Mesaje gata de trimis</h2><span class="mic">' + ciorne.length + '</span></div>';
  h += ciorne.length ? ciorne.map((c, i) => '<div class="card"><div class="rand"><div class="rand-st"><span class="chip">' + esc(c.client_nume) + '</span><span class="eticheta">către ' + esc(c.destinatar || '—') + '</span></div>' + (c.urgenta ? '<span class="chip' + (c.urgenta === 'azi' ? ' atentie' : '') + '">' + esc(c.urgenta) + '</span>' : '') + '</div>' +
    (c.ce ? '<div class="text-2" >' + esc(c.ce) + '</div>' : '') +
    '<div class="ciorna">' + esc(c.mesaj) + '</div>' +
    '<div class="butoane"><button class="buton mic-b" data-copiaza="' + i + '">Copiază</button><button class="buton mic-b principal" data-wa="' + i + '">Deschide WhatsApp</button></div></div>').join('')
    : '<div class="gol">Nicio ciornă.</div>';

  const aplicate = s.aplicat_azi || [];
  h += '<div class="sectiune"><h2>Aplicat azi</h2><span class="mic">' + aplicate.length + '</span></div>';
  h += aplicate.length ? '<div class="card"><ul class="lista">' + aplicate.map((p) => '<li><b>' + esc(p.client_nume) + '</b> · ' + esc(p.nume || tip(p.tip)) + (p.de_la !== null && p.de_la !== undefined ? ' · ' + num(p.de_la) + ' → ' + num(p.la) + ' ' + unitate(p.unitate) : '') + ' <span class="mic">' + esc(p.id) + ', ' + ora(p.aplicat) + '</span></li>').join('') + '</ul></div>' : '<div class="gol">Nimic aplicat azi.</div>';

  const facut = (s.de_facut || []);
  const pentruAndrei = facut.filter((d) => /andrei/i.test(d.cine || ''));
  const restul = facut.filter((d) => !/andrei/i.test(d.cine || ''));
  h += '<div class="sectiune"><h2>De făcut</h2><span class="mic">' + facut.length + '</span></div>';
  const randFacut = (d) => '<li><b>' + esc(d.client_nume) + '</b>' + (d.urgenta ? ' <span class="chip' + (d.urgenta === 'azi' ? ' atentie' : '') + '">' + esc(d.urgenta) + '</span>' : '') + '<div>' + esc(d.ce) + '</div>' + (d.castig ? '<div class="mic">câștig: ' + esc(d.castig) + '</div>' : '') + '</li>';
  if (pentruAndrei.length) h += '<div class="card"><div class="grup-client">Pentru tine (' + pentruAndrei.length + ')</div><ul class="lista">' + pentruAndrei.map(randFacut).join('') + '</ul></div>';
  if (restul.length) h += '<details><summary>Pentru Claude și restul (' + restul.length + ')</summary><div class="card"><ul class="lista">' + restul.map(randFacut).join('') + '</ul></div></details>';

  const idei = s.idei || [];
  if (idei.length) h += '<details><summary>Idei (' + idei.length + ')</summary><div class="card"><ul class="lista">' + idei.map((d) => '<li><b>' + esc(d.client_nume) + '</b>: ' + esc(d.idee) + (d.cifra ? '<div class="mic">' + esc(d.cifra) + '</div>' : '') + '</li>').join('') + '</ul></div></details>';
  if (s.mesaj_zi) h += '<details><summary>Mesajul zilei, întreg</summary><div class="card pre mesaj-feed">' + esc(s.mesaj_zi) + '</div></details>';

  main().innerHTML = h;
  legaButoanePropuneri(main(), lista.concat(s.amanate || []));
  const bt = $('#toate-trece');
  if (bt) bt.onclick = () => confirmaToateTrece(trece);
  $$('[data-raspunde]').forEach((b) => {
    b.onclick = () => {
      const [cl, i] = b.dataset.raspunde.split('|');
      const q = intrebari.filter((x) => x.client === cl)[Number(i)];
      if (q) ciornaPentruClaude('La întrebarea analistului: „' + q.text + '”\n\nRăspunsul meu: ', q.client);
    };
  });
  $$('[data-copiaza]').forEach((b) => { b.onclick = () => copiaza(ciorne[Number(b.dataset.copiaza)].mesaj || ''); });
  $$('[data-wa]').forEach((b) => { b.onclick = () => deschideWhatsApp(ciorne[Number(b.dataset.wa)].mesaj || ''); });
  programeaza(() => randeaza(true), 90000);
}

/* ------------------------------------------------------------ CLIENTI */
const nf0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const gol = (x) => x === null || x === undefined || (typeof x === 'number' && isNaN(x));
function n0(x) { return gol(x) ? '—' : nf0.format(Math.round(x)); }
function n2(x) { return gol(x) ? '—' : nf.format(x); }
function pct(x) { return gol(x) ? '—' : Math.round(x * 100) + '%'; }
function scurt(x) {
  if (gol(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e6) return nf.format(Math.round(x / 1e4) / 100) + ' mil.';
  if (a >= 1e4) return nf0.format(Math.round(x / 1e3)) + 'k';
  return nf0.format(Math.round(x));
}
function ziScurt(z) { const m = String(z || '').match(/^(\d{2})-(\d{2})$/); return m ? m[2] + '.' + m[1] : esc(z); }
const RITM = { PESTE_RITM: ['peste ritm', 'bine'], PE_RITM: ['pe ritm', 'bine'], SUB_RITM: ['sub ritm', 'atentie'], SUB_PODEA: ['sub prag', 'rau'] };
function chipRitm(s) {
  if (!s) return '';
  const r = RITM[s] || [String(s).toLowerCase().replace(/_/g, ' '), ''];
  return '<span class="chip ' + r[1] + '">' + esc(r[0]) + '</span>';
}
function et(k) {
  const lead = !!(k && k.lead);
  return {
    lead,
    volum: lead ? 'Leaduri luna asta' : 'Vânzări reale luna asta',
    val: (x) => lead ? n0(x) : n0(x) + ' lei',
    valScurt: (x) => lead ? n0(x) : scurt(x) + ' lei',
    ef: lead ? 'Cost pe lead, 7 zile' : 'ROAS real, 7 zile',
    efScurt: lead ? 'Cost/lead 7z' : 'ROAS 7z',
    efVal: (x) => lead ? n2(x) + ' lei' : n2(x),
    prag: (p) => gol(p) ? '' : (lead ? 'maxim ' + n2(p) + ' lei' : 'minim ' + n2(p)),
    efOk: (x, p) => (gol(x) || gol(p)) ? null : (lead ? x <= p : x >= p),
    unit: lead ? 'leaduri' : 'vânzări',
  };
}
function barProgres(k) {
  if (!k || !k.luna_tinta) return '';
  const f = Math.max(0, Math.min(1, (k.luna_facut || 0) / k.luna_tinta));
  const a = gol(k.asteptat_azi) ? null : Math.max(0, Math.min(1, k.asteptat_azi / k.luna_tinta));
  return '<div class="progres" role="img" aria-label="' + pct(f) + ' din țintă' + (a !== null ? ', așteptat până azi ' + pct(a) : '') + '">' +
    '<span class="p-umplere" data-w="' + (f * 100).toFixed(1) + '"></span>' +
    (a !== null ? '<span class="p-reper" data-l="' + (a * 100).toFixed(1) + '" title="unde ar trebui să fie azi"></span>' : '') + '</div>';
}
function aplicaLatimi(rad) {
  $$('[data-w]', rad).forEach((el) => { el.style.width = el.dataset.w + '%'; });
  $$('[data-l]', rad).forEach((el) => { el.style.left = el.dataset.l + '%'; });
}
function caleBara(x, y, w, h, r) {
  if (!(h > 0)) return '';
  r = Math.max(0, Math.min(r, w / 2, h));
  const b = y + h;
  const f = (v) => v.toFixed(2);
  return 'M' + f(x) + ',' + f(b) + 'V' + f(y + r) + 'Q' + f(x) + ',' + f(y) + ' ' + f(x + r) + ',' + f(y) + 'H' + f(x + w - r) +
    'Q' + f(x + w) + ',' + f(y) + ' ' + f(x + w) + ',' + f(y + r) + 'V' + f(b) + 'Z';
}
function maxRotund(m) {
  if (!(m > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  for (const k of [1, 2, 2.5, 5, 10]) if (m <= k * p) return k * p;
  return 10 * p;
}
function sparkline(serie, k) {
  const s = (serie || []).slice(-14);
  if (!s.length) return '';
  const W = 140, H = 30, n = s.length, slot = W / n, bw = Math.max(2, slot - 2);
  const max = Math.max(1, ...s.map((d) => d.kpi || 0));
  const e = et(k);
  let h = '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(e.unit) + ' pe zi, ultimele ' + n + ' zile">';
  s.forEach((d, i) => {
    if (gol(d.kpi)) return;
    const bh = Math.max(d.kpi > 0 ? 1.5 : 0, (H - 2) * d.kpi / max);
    h += '<path class="g-bara" d="' + caleBara(i * slot + (slot - bw) / 2, H - bh, bw, bh, 2) + '"><title>' + ziScurt(d.zi) + ': ' + (e.lead ? n0(d.kpi) + ' leaduri' : n0(d.kpi) + ' lei') + '</title></path>';
  });
  return h + '</svg>';
}

/* grafic pe zile: o singura serie, o singura axa, tooltip la fiecare bara */
let graficeActive = [];
function graficZile(serie, cheie, k, titlu, clasa) {
  const lat = (main().clientWidth || 360) - (window.innerWidth >= 1040 ? 292 : 34);
  const W = Math.max(280, Math.min(720, lat)), H = W < 500 ? 180 : 210, pL = 46, pR = 8, pT = 14, pB = 28;
  const n = serie.length;
  if (!n) return '';
  const vals = serie.map((d) => d[cheie]).filter((v) => !gol(v));
  const max = maxRotund(Math.max(1, ...vals));
  const slot = (W - pL - pR) / n, bw = Math.max(2, slot - 2);
  const y = (v) => pT + (H - pT - pB) * (1 - v / max);
  const e = et(k);
  const lead = e.lead && cheie === 'kpi';
  let s = '<svg class="grafic" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(titlu) + '">';
  [0, 0.5, 1].forEach((f) => {
    const v = max * f, yy = y(v);
    s += '<line class="g-grila" x1="' + pL + '" x2="' + (W - pR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>';
    s += '<text class="g-ax" x="' + (pL - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + (lead ? n0(v) : scurt(v)) + '</text>';
  });
  serie.forEach((d, i) => {
    const v = d[cheie];
    if (gol(v)) return;
    const yy = y(v), bh = (H - pB) - yy;
    s += '<path class="' + clasa + '" data-i="' + i + '" d="' + caleBara(pL + i * slot + (slot - bw) / 2, yy, bw, Math.max(v > 0 ? 1.5 : 0, bh), 4) + '"/>';
  });
  const pas = Math.max(1, Math.ceil(n / 7));
  serie.forEach((d, i) => {
    if ((n - 1 - i) % pas !== 0) return;
    s += '<text class="g-ax" x="' + (pL + i * slot + slot / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + ziScurt(d.zi) + '</text>';
  });
  serie.forEach((d, i) => {
    s += '<rect class="g-hit" data-i="' + i + '" x="' + (pL + i * slot).toFixed(1) + '" y="' + pT + '" width="' + slot.toFixed(1) + '" height="' + (H - pT - pB + 6) + '"/>';
  });
  s += '</svg>';
  const id = 'g' + graficeActive.length;
  graficeActive.push({ id, serie, k, W, pL, slot });
  return '<div class="grafic-cutie" data-grafic="' + id + '">' + s + '<div class="g-tip" hidden></div></div>';
}
function textTip(d, k) {
  const e = et(k);
  const l = [];
  l.push('<b>' + ziScurt(d.zi) + '</b>');
  if (e.lead) {
    l.push(n0(d.kpi) + ' leaduri');
    l.push('cost ' + n0(d.cost) + ' lei');
    if (d.kpi > 0 && !gol(d.cost)) l.push(n2(d.cost / d.kpi) + ' lei/lead');
  } else {
    l.push('vânzări ' + n0(d.kpi) + ' lei');
    l.push('cost ' + n0(d.cost) + ' lei');
    if (d.cost > 0 && !gol(d.kpi)) l.push('ROAS ' + n2(d.kpi / d.cost));
  }
  return l.join('<br>');
}
function legaGrafice(rad) {
  graficeActive.forEach((g) => {
    const cutie = $('[data-grafic="' + g.id + '"]', rad);
    if (!cutie) return;
    const tip = $('.g-tip', cutie);
    const arata = (ev) => {
      const t = ev.target.closest('[data-i]');
      if (!t) return;
      const i = Number(t.dataset.i);
      const d = g.serie[i];
      if (!d) return;
      $$('.activ', cutie).forEach((x) => x.classList.remove('activ'));
      $$('path[data-i="' + i + '"]', cutie).forEach((x) => x.classList.add('activ'));
      tip.innerHTML = textTip(d, g.k);
      tip.hidden = false;
      const lat = cutie.clientWidth;
      const cx = ((g.pL + (i + 0.5) * g.slot) / g.W) * lat;
      tip.style.left = Math.max(4, Math.min(lat - tip.offsetWidth - 4, cx - tip.offsetWidth / 2)) + 'px';
    };
    cutie.addEventListener('pointermove', arata);
    cutie.addEventListener('pointerdown', arata);
    cutie.addEventListener('pointerleave', () => { tip.hidden = true; $$('.activ', cutie).forEach((x) => x.classList.remove('activ')); });
  });
}
function tabelZile(serie, k) {
  const e = et(k);
  const rows = serie.slice().reverse().map((d) => {
    const ef = e.lead ? (d.kpi > 0 && !gol(d.cost) ? n2(d.cost / d.kpi) : '—') : (d.cost > 0 && !gol(d.kpi) ? n2(d.kpi / d.cost) : '—');
    return '<tr><td>' + ziScurt(d.zi) + '</td><td>' + (e.lead ? n0(d.kpi) : n0(d.kpi)) + '</td><td>' + n0(d.cost) + '</td><td>' + ef + '</td></tr>';
  }).join('');
  return '<details><summary>Cifrele pe zile, ca tabel</summary><div class="tabel-cutie"><table class="tabel"><thead><tr><th>Ziua</th><th>' + (e.lead ? 'Leaduri' : 'Vânzări (lei)') + '</th><th>Cost (lei)</th><th>' + (e.lead ? 'Lei/lead' : 'ROAS') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>';
}

function cardClient(c) {
  const k = c.kpi;
  const e = et(k);
  let h = '<a class="card card-client" href="#/client/' + encodeURIComponent(c.slug) + '/status">';
  h += '<div class="rand"><div class="rand-st"><span class="emoji" aria-hidden="true">' + esc(c.emoji || '•') + '</span><span class="nume">' + esc(c.nume) + '</span></div>' +
    (c.urgente ? '<span class="chip rau">' + c.urgente + (c.urgente === 1 ? ' urgență' : ' urgențe') + '</span>' : '') + '</div>';
  h += '<div class="rand-st sub-rand">' + (c.stare ? '<span class="chip ' + stareClasa(c.stare) + '">' + esc(stareText(c.stare)) + '</span>' : '') + (k ? chipRitm(k.stare_ritm) : '') +
    (c.alerte_24h ? '<span class="chip">' + c.alerte_24h + (c.alerte_24h === 1 ? ' alertă' : ' alerte') + ' 24h</span>' : '') + '</div>';
  if (k) {
    h += '<div class="kpi-mare"><span class="eticheta">' + esc(e.volum) + '</span><div class="rand"><b>' + e.val(k.luna_facut) + '</b>' +
      (k.luna_tinta ? '<span class="mic">din ' + e.val(k.luna_tinta) + ' · ' + pct(k.luna_facut / k.luna_tinta) + '</span>' : '<span class="mic">fără țintă de volum</span>') + '</div></div>';
    h += barProgres(k);
    const ok = e.efOk(k.eficienta_7z, k.podea);
    h += '<div class="kpi-mici">' +
      '<span>' + esc(e.efScurt) + ' <b class="' + (ok === false ? 'txt-rau' : '') + '">' + e.efVal(k.eficienta_7z) + '</b>' + (gol(k.podea) ? '' : ' <span class="mic">' + esc(e.prag(k.podea)) + '</span>') + '</span>' +
      '<span>Ieri <b>' + e.valScurt(k.ieri && k.ieri.kpi) + '</b></span>' +
      (gol(k.fata_de_drum) ? '' : '<span>' + pct(k.fata_de_drum) + ' din drum</span>') +
      '</div>';
    h += sparkline(k.serie, k);
  } else if (c.linie) {
    h += '<div class="text-2">' + esc(c.linie) + '</div>';
  }
  return h + '</a>';
}

async function vedereClienti(id, fortat) {
  seteazaTitlu('Clienți');
  main().classList.add('lat');
  if (!S.stare) main().innerHTML = '<div class="incarcare">Se încarcă…</div>';
  const s = await incarcaStare(fortat);
  if (id !== randareId) return;
  seteazaActualizat(s.generat);
  const cl = s.clienti || [];
  const nr = (st) => cl.filter((c) => c.stare === st).length;
  const urg = cl.reduce((a, c) => a + (c.urgente || 0), 0);
  const filtru = S.filtruClienti || 'toti';
  let h = '<div class="rezumat-zi patru">' +
    '<div class="cifra"><b>' + nr('ROSU') + '</b><span>pe roșu</span></div>' +
    '<div class="cifra"><b>' + nr('GALBEN') + '</b><span>pe galben</span></div>' +
    '<div class="cifra"><b>' + nr('VERDE') + '</b><span>pe verde</span></div>' +
    '<div class="cifra"><b>' + urg + '</b><span>urgențe</span></div></div>';
  h += '<div class="bara-filtre"><input class="cauta" id="cauta-client" type="search" placeholder="Caută client" autocomplete="off">' +
    '<div class="filtre">' + [['toti', 'Toți'], ['rosu', 'Pe roșu'], ['urgent', 'Cu urgențe']].map(([v, t]) => '<button class="filtru' + (filtru === v ? ' activ' : '') + '" data-filtru="' + v + '">' + t + '</button>').join('') + '</div></div>';
  h += '<div class="grila-clienti" id="lista-clienti">' + cl.map((c) => '<div class="celula" data-nume="' + esc(c.nume.toLowerCase()) + '" data-stare="' + esc(c.stare || '') + '" data-urgente="' + (c.urgente || 0) + '">' + cardClient(c) + '</div>').join('') + '</div>';
  h += '<p class="mic">Vânzările sunt cele reale, din foaia de tracking a fiecărui client, până ieri. Bara arată cât s-a făcut din ținta lunii; liniuța e unde ar trebui să fie azi.</p>';
  main().innerHTML = h;
  aplicaLatimi(main());
  const aplicaFiltre = () => {
    const t = ($('#cauta-client').value || '').trim().toLowerCase();
    const f = S.filtruClienti || 'toti';
    $$('#lista-clienti .celula').forEach((el) => {
      let ok = !t || el.dataset.nume.includes(t);
      if (f === 'rosu') ok = ok && el.dataset.stare === 'ROSU';
      if (f === 'urgent') ok = ok && Number(el.dataset.urgente) > 0;
      el.hidden = !ok;
    });
  };
  $('#cauta-client').oninput = aplicaFiltre;
  $$('[data-filtru]').forEach((b) => {
    b.onclick = () => {
      S.filtruClienti = b.dataset.filtru;
      $$('[data-filtru]').forEach((x) => x.classList.toggle('activ', x === b));
      aplicaFiltre();
    };
  });
  aplicaFiltre();
  programeaza(() => randeaza(true), 120000);
}

const SUBTABURI = [['status', 'Status'], ['urgent', 'Urgent'], ['facut', 'De făcut'], ['imbunatatit', 'De îmbunătățit'], ['claude', 'Claude']];

function meniuClienti(slugActiv, sub) {
  const cl = (S.stare && S.stare.clienti) || [];
  return '<nav class="meniu-clienti" aria-label="Clienți"><a class="mc-toti" href="#/clienti">Toți clienții</a>' + cl.map((c) =>
    '<a class="mc' + (c.slug === slugActiv ? ' activ' : '') + '" href="#/client/' + encodeURIComponent(c.slug) + '/' + sub + '"' + (c.slug === slugActiv ? ' aria-current="page"' : '') + '>' +
    '<span class="emoji" aria-hidden="true">' + esc(c.emoji || '•') + '</span><span class="mc-nume">' + esc(c.nume) + '</span>' +
    (c.urgente ? '<b class="mc-nr" aria-label="' + c.urgente + ' urgențe">' + c.urgente + '</b>' : '') + '</a>').join('') + '</nav>';
}

function deFacutAzi(c) { return (c.de_facut || []).filter((d) => d && typeof d === 'object' && /azi/i.test(String(d.urgenta || ''))); }

function itemDeFacut(d, i, slug) {
  if (!d || typeof d !== 'object') return '<li>' + esc(d) + '</li>';
  return '<li class="item-facut">' +
    '<div class="rand-st">' + (d.cine ? '<span class="chip">' + esc(d.cine) + '</span>' : '') + (d.urgenta ? '<span class="chip' + (/azi/i.test(d.urgenta) ? ' atentie' : '') + '">' + esc(d.urgenta) + '</span>' : '') + '</div>' +
    '<div class="ce">' + esc(d.ce) + '</div>' +
    (d.de_ce ? '<div class="mic">' + esc(d.de_ce) + '</div>' : '') +
    (d.castig_estimat ? '<div class="mic">câștig estimat: ' + esc(d.castig_estimat) + '</div>' : '') +
    (d.mesaj_ciorna ? '<div class="mic">către ' + esc(d.destinatar || '—') + '</div><div class="ciorna">' + esc(d.mesaj_ciorna) + '</div>' +
      '<div class="butoane"><button class="buton mic-b" data-copiaza-c="' + i + '">Copiază</button><button class="buton mic-b" data-wa-c="' + i + '">Deschide WhatsApp</button></div>' : '') +
    '<div class="butoane"><button class="buton mic-b" data-claude-facut="' + i + '">' + (/claude/i.test(d.cine || '') ? 'Cere-i lui Claude să o facă' : 'Discută cu Claude') + '</button></div>' +
    '</li>';
}

async function vedereClient(id, arg, fortat) {
  const [slug, subBrut] = String(arg || '').split('/');
  const sub = SUBTABURI.some(([v]) => v === subBrut) ? subBrut : 'status';
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) { location.hash = '#/clienti'; return; }
  main().classList.add('lat');
  if (!S.stare) { try { await incarcaStare(false); } catch (e) { /* se vede mai jos */ } }
  if (!S.clienti[slug] || fortat || Date.now() - (S.clienti[slug]._la || 0) > 60000) {
    if (!S.clienti[slug]) main().innerHTML = meniuClienti(slug, sub) + '<div class="incarcare">Se încarcă…</div>';
    const d = await api('/api/client?slug=' + encodeURIComponent(slug));
    d._la = Date.now();
    S.clienti[slug] = d;
  }
  if (id !== randareId) return;
  const c = S.clienti[slug];
  const k = c.kpi;
  const e = et(k);
  seteazaTitlu(c.nume);
  graficeActive = [];
  const deAprobat = (c.propuneri || []).filter((p) => p.status === 'ASTEAPTA_DA' || p.status === 'AMANAT');
  const azi = deFacutAzi(c);
  const nrUrgent = deAprobat.length + azi.length;
  const nrImb = (c.idei || []).length + (c.evaluari || []).filter((x) => x && /nu a mers|par[tț]ial/i.test(x.verdict || '')).length;
  const nrFire = (c.fire || []).length;
  const numar = { urgent: nrUrgent, facut: (c.de_facut || []).length, imbunatatit: nrImb, claude: nrFire };

  let h = '<div class="pagina-client">' + meniuClienti(slug, sub) + '<section class="continut-client">';
  h += '<div class="antet-client"><div class="rand"><div class="rand-st"><span class="emoji">' + esc(c.emoji || '') + '</span><h2>' + esc(c.nume) + '</h2></div>' +
    '<div class="rand-st">' + (c.stare ? '<span class="chip ' + stareClasa(c.stare) + '">' + esc(stareText(c.stare)) + '</span>' : '') + (k ? chipRitm(k.stare_ritm) : '') + '</div></div>' +
    '<div class="mic">' + (c.linie ? esc(c.linie) + ' · ' : '') + 'mod ' + esc(c.mod || '—') + ' · ' + (e.lead ? 'leaduri' : 'magazin') + ' · analiza din ' + esc(c.analiza_zi || '—') + (k ? ' · cifrele până ieri' : '') + '</div></div>';
  h += '<nav class="subtaburi" aria-label="Secțiuni client">' + SUBTABURI.map(([v, t]) => '<a href="#/client/' + encodeURIComponent(slug) + '/' + v + '" class="' + (v === sub ? 'activ' : '') + '"' + (v === sub ? ' aria-current="page"' : '') + '>' + t + (numar[v] ? ' <b class="nr' + (v === 'urgent' ? ' rau' : '') + '">' + numar[v] + '</b>' : '') + '</a>').join('') + '</nav>';

  if (sub === 'status') h += sectiuneStatus(c, k, e);
  else if (sub === 'urgent') h += sectiuneUrgent(c, deAprobat, azi);
  else if (sub === 'facut') h += sectiuneFacut(c);
  else if (sub === 'imbunatatit') h += sectiuneImbunatatit(c);
  else if (sub === 'claude') h += sectiuneClaude(c);
  h += '</section></div>';
  main().innerHTML = h;
  aplicaLatimi(main());
  legaGrafice(main());
  legaButoanePropuneri(main(), deAprobat);
  const lista = c.de_facut || [];
  $$('[data-copiaza-c]').forEach((b) => { b.onclick = () => copiaza((lista[Number(b.dataset.copiazaC)] || {}).mesaj_ciorna || ''); });
  $$('[data-wa-c]').forEach((b) => { b.onclick = () => deschideWhatsApp((lista[Number(b.dataset.waC)] || {}).mesaj_ciorna || ''); });
  $$('[data-claude-facut]').forEach((b) => {
    b.onclick = () => {
      const d = lista[Number(b.dataset.claudeFacut)] || {};
      const fa = /claude/i.test(d.cine || '');
      ciornaPentruClaude((fa ? 'Fă asta de pe lista de azi: ' : 'Vreau să discutăm asta de pe lista de azi: ') + '„' + (d.ce || '') + '”\n\n', slug);
    };
  });
  $$('[data-q]').forEach((b) => { b.onclick = () => ciornaPentruClaude('La întrebarea analistului: „' + (c.intrebari || [])[Number(b.dataset.q)] + '”\n\nRăspunsul meu: ', slug); });
  $$('[data-idee]').forEach((b) => { b.onclick = () => { const d = (c.idei || [])[Number(b.dataset.idee)] || {}; ciornaPentruClaude('Despre ideea: „' + (typeof d === 'object' ? d.idee : d) + '”\n\n', slug); }; });
  if (sub === 'claude') legaCompunereClient(c);
  const activ = $('.meniu-clienti .mc.activ');
  if (activ && activ.scrollIntoView) activ.scrollIntoView({ block: 'nearest', inline: 'center' });
  if (!fortat) window.scrollTo(0, 0);
  programeaza(() => randeaza(true), 120000);
}

function dala(eticheta, valoare, sub, extra) {
  return '<div class="dala"><span class="eticheta">' + esc(eticheta) + '</span><b>' + valoare + '</b>' + (sub ? '<span class="mic">' + sub + '</span>' : '') + (extra || '') + '</div>';
}

function sectiuneStatus(c, k, e) {
  let h = '';
  if (k) {
    const ok = e.efOk(k.eficienta_7z, k.podea);
    const okAnt = e.efOk(k.z7_anterior && k.z7_anterior.roas, k.podea);
    h += '<div class="dale">';
    h += dala(e.volum, e.val(k.luna_facut), k.luna_tinta ? 'din ' + e.val(k.luna_tinta) + ' · ' + pct(k.luna_facut / k.luna_tinta) + (gol(k.asteptat_azi) ? '' : ' · așteptat azi ' + e.valScurt(k.asteptat_azi)) : 'fără țintă de volum pe lună', barProgres(k));
    h += dala('Ritmul', gol(k.fata_de_drum) ? '—' : pct(k.fata_de_drum) + ' din drum',
      (gol(k.proiectie) ? '' : 'proiecție la ritmul de 7 zile: ' + e.val(k.proiectie)) + (gol(k.necesar_pe_zi) ? '' : '<br>necesar ' + e.val(k.necesar_pe_zi) + '/zi, ritm ' + e.val(k.ritm_7z_pe_zi) + '/zi'));
    h += dala(e.ef, '<span class="' + (ok === false ? 'txt-rau' : ok ? 'txt-bine' : '') + '">' + e.efVal(k.eficienta_7z) + '</span>',
      [e.prag(k.podea), e.lead ? '' : (gol(k.z7_anterior && k.z7_anterior.roas) ? '' : 'săpt. trecută ' + n2(k.z7_anterior.roas)), gol(k.eficienta_luna) ? '' : 'luna: ' + e.efVal(k.eficienta_luna)].filter(Boolean).join(' · '));
    h += dala('Cost reclame luna asta', n0(k.cost_luna) + ' lei', (gol(k.cost_plan) ? '' : 'plan ' + n0(k.cost_plan) + ' lei') + (gol(k.buget_mediu_ramas_pe_zi) ? '' : ' · rămas ~' + n0(k.buget_mediu_ramas_pe_zi) + '/zi'));
    const ie = k.ieri || {};
    h += dala('Ieri' + (ie.zi ? ', ' + ziScurt(String(ie.zi).slice(5)) : ''), e.lead ? n0(ie.kpi) + ' leaduri' : n0(ie.kpi) + ' lei',
      'cost ' + n0(ie.cost) + ' lei' + (e.lead ? (ie.kpi > 0 ? ' · ' + n2(ie.cost / ie.kpi) + ' lei/lead' : '') : (ie.cost > 0 ? ' · ROAS ' + n2(ie.kpi / ie.cost) : '')));
    h += dala('Zile rămase în lună', n0(k.zile_ramase), (k.z7 && !gol(k.z7.kpi)) ? 'ultimele 7 zile: ' + e.val(k.z7.kpi) + ' la ' + n0(k.z7.cost) + ' lei cost' : '');
    h += '</div>';
    void okAnt;
    if (k.alte) h += '<div class="avert">' + esc(k.alte) + '</div>';
    if ((k.lipsa_7z || []).length) h += '<div class="avert">Zile fără date în foaie în ultima săptămână: ' + esc(k.lipsa_7z.join(', ')) + '</div>';
    if ((k.serie || []).length) {
      h += '<div class="card"><div class="rand"><h3>' + (e.lead ? 'Leaduri pe zi' : 'Vânzări reale pe zi (lei)') + '</h3><span class="mic">ultimele ' + k.serie.length + ' de zile</span></div>' +
        graficZile(k.serie, 'kpi', k, e.lead ? 'Leaduri pe zi' : 'Vânzări reale pe zi', 'g-bara') + '</div>';
      h += '<div class="card"><div class="rand"><h3>Cost reclame pe zi (lei)</h3><span class="mic">Meta + Google, fără TVA</span></div>' +
        graficZile(k.serie, 'cost', k, 'Cost reclame pe zi', 'g-bara-cost') + tabelZile(k.serie, k) + '</div>';
    }
  } else {
    h += '<div class="avert">Pentru clientul ăsta n-am găsit cifrele de tracking în dosarul de azi.</div>';
  }
  if (c.rezumat) h += '<div class="sectiune"><h2>Ce spune analistul</h2><span class="mic">' + esc(c.analiza_zi || '') + '</span></div><div class="card pre">' + esc(c.rezumat) + '</div>';
  if ((c.diagnostic || []).length) h += '<div class="sectiune"><h2>Diagnostic</h2></div><div class="card"><ul class="lista">' + c.diagnostic.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  if ((c.actiuni || []).length) h += '<div class="sectiune"><h2>Ce a propus azi</h2></div><div class="card"><ul class="lista">' + c.actiuni.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  return h;
}

function sectiuneUrgent(c, deAprobat, azi) {
  let h = '';
  h += '<div class="sectiune"><h2>Așteaptă DA-ul tău</h2><span class="mic">' + deAprobat.length + '</span></div>';
  h += deAprobat.length ? deAprobat.map((p) => cardPropunere(p)).join('') : '<div class="gol">Nimic de aprobat la clientul ăsta.</div>';
  const lista = c.de_facut || [];
  h += '<div class="sectiune"><h2>De făcut azi</h2><span class="mic">' + azi.length + '</span></div>';
  h += azi.length ? '<div class="card"><ul class="lista-facut">' + azi.map((d) => itemDeFacut(d, lista.indexOf(d), c.slug)).join('') + '</ul></div>' : '<div class="gol">Nimic marcat pentru azi.</div>';
  const q = c.intrebari || [];
  h += '<div class="sectiune"><h2>Întrebări pentru tine</h2><span class="mic">' + q.length + '</span></div>';
  h += q.length ? '<div class="card">' + q.map((x, i) => '<div class="intrebare"><div class="pre">' + esc(x) + '</div><div class="butoane"><button class="buton mic-b" data-q="' + i + '">Răspunde</button></div></div>').join('') + '</div>' : '<div class="gol">Nicio întrebare.</div>';
  const al = c.alerte || [];
  h += '<div class="sectiune"><h2>Alertele automatizărilor</h2><span class="mic">ultimele 3 zile · ' + al.length + '</span></div>';
  h += al.length ? al.map((m) => '<div class="card mesaj-feed"><div class="mic">' + ora(m.ts) + '</div><div class="pre">' + esc(String(m.text || '').replace(/^🤖\s*/, '')) + '</div></div>').join('') : '<div class="gol">Nicio alertă în ultimele 3 zile.</div>';
  return h;
}

function sectiuneFacut(c) {
  const lista = c.de_facut || [];
  const andrei = lista.filter((d) => d && typeof d === 'object' && /andrei/i.test(d.cine || ''));
  const restul = lista.filter((d) => !(d && typeof d === 'object' && /andrei/i.test(d.cine || '')));
  let h = '';
  h += '<div class="sectiune"><h2>Pentru tine</h2><span class="mic">' + andrei.length + '</span></div>';
  h += andrei.length ? '<div class="card"><ul class="lista-facut">' + andrei.map((d) => itemDeFacut(d, lista.indexOf(d), c.slug)).join('') + '</ul></div>' : '<div class="gol">Nimic pentru tine.</div>';
  h += '<div class="sectiune"><h2>Pentru Claude și pilot</h2><span class="mic">' + restul.length + '</span></div>';
  h += restul.length ? '<div class="card"><ul class="lista-facut">' + restul.map((d) => itemDeFacut(d, lista.indexOf(d), c.slug)).join('') + '</ul></div>' : '<div class="gol">Nimic.</div>';
  return h;
}

function sectiuneImbunatatit(c) {
  let h = '';
  const idei = c.idei || [];
  h += '<div class="sectiune"><h2>Idei de creștere</h2><span class="mic">' + idei.length + '</span></div>';
  h += idei.length ? idei.map((d, i) => '<div class="card">' + (typeof d === 'object' && d ? '<div class="titlu-card">' + esc(d.idee) + '</div>' + (d.cifra ? '<div class="text-2">' + esc(d.cifra) + '</div>' : '') + (d.pas_urmator ? '<div class="mic">pasul următor: ' + esc(d.pas_urmator) + '</div>' : '') : '<div>' + esc(d) + '</div>') +
    '<div class="butoane"><button class="buton mic-b" data-idee="' + i + '">Discută cu Claude</button></div></div>').join('') : '<div class="gol">Nicio idee azi.</div>';
  const ev = (c.evaluari || []).filter((x) => x && typeof x === 'object');
  const nuAMers = ev.filter((x) => /nu a mers|par[tț]ial/i.test(x.verdict || ''));
  const aMers = ev.filter((x) => !/nu a mers|par[tț]ial/i.test(x.verdict || ''));
  h += '<div class="sectiune"><h2>Ce n-a mers</h2><span class="mic">' + nuAMers.length + '</span></div>';
  h += nuAMers.length ? '<div class="card"><ul class="lista">' + nuAMers.map((x) => '<li><span class="chip rau">' + esc(x.verdict) + '</span> ' + esc(x.ref) + '<div class="mic">' + esc(x.cifre) + '</div></li>').join('') + '</ul></div>' : '<div class="gol">Nimic ratat în evaluările de azi.</div>';
  if (aMers.length) h += '<details><summary>Ce a mers (' + aMers.length + ')</summary><div class="card"><ul class="lista">' + aMers.map((x) => '<li><span class="chip bine">' + esc(x.verdict) + '</span> ' + esc(x.ref) + '<div class="mic">' + esc(x.cifre) + '</div></li>').join('') + '</ul></div></details>';
  if ((c.verdicte || []).length) h += '<details><summary>Verdictele verificatorului azi (' + c.verdicte.length + ')</summary><div class="card"><ul class="lista">' + c.verdicte.map((v) => '<li><span class="chip ' + verdictClasa(v.verdict) + '">' + esc(v.verdict) + '</span> ' + esc(v.id) + ' · ' + esc(v.actiune) + '</li>').join('') + '</ul></div></details>';
  const istoric = (c.propuneri || []).filter((p) => p.status !== 'ASTEAPTA_DA' && p.status !== 'AMANAT');
  if (istoric.length) h += '<details><summary>Schimbările din ultimele 10 zile (' + istoric.length + ')</summary><div class="card"><ul class="lista">' + istoric.map((p) => '<li><span class="chip ' + (p.status === 'APLICAT' ? 'bine' : (p.status === 'RESPINS' || p.status === 'BLOCAT' || String(p.status).startsWith('ESUAT')) ? 'rau' : '') + '">' + esc(p.status) + '</span> ' + esc(p.id) + ' · ' + esc(p.scurt || p.nume || tip(p.tip)) + (gol(p.de_la) ? '' : ' · ' + num(p.de_la) + ' → ' + num(p.la) + ' ' + unitate(p.unitate)) + '</li>').join('') + '</ul></div></details>';
  return h;
}

const INTREBARI_RAPIDE = [
  'Ce e cel mai important de făcut azi la clientul ăsta?',
  'De ce e pe roșu și ce schimbăm ca să iasă?',
  'Cum stăm față de ținta lunii și ce trebuie să se întâmple până la final?',
  'Ce idei de creștere ai pentru săptămâna asta?',
];

function sectiuneClaude(c) {
  const ciorna = sessionStorage.getItem('panou.ciorna.c.' + c.slug) || '';
  let h = '<div class="card compunere"><label class="mic" for="text-client">Mesaj către Claude despre ' + esc(c.nume) + ' (o sesiune nouă pe Mac, care știe de ce client e vorba)</label>' +
    '<textarea id="text-client" placeholder="Ce vrei să afli sau să se facă la ' + esc(c.nume) + '?">' + esc(ciorna) + '</textarea>' +
    '<div class="rapide">' + INTREBARI_RAPIDE.map((q, i) => '<button class="filtru" data-rapid="' + i + '">' + esc(q) + '</button>').join('') + '</div>' +
    '<div class="rand"><span class="mic">Răspunsul apare în fir, aici și la Claude.</span><button class="buton principal" id="trimite-client">Trimite</button></div></div>';
  const fire = c.fire || [];
  h += '<div class="sectiune"><h2>Conversațiile despre ' + esc(c.nume) + '</h2><span class="mic">' + fire.length + '</span></div>';
  h += fire.length ? fire.map((f) => cardFir(f)).join('') : '<div class="gol">Nicio conversație încă.</div>';
  return h;
}

function legaCompunereClient(c) {
  const ta = $('#text-client');
  if (!ta) return;
  const cheie = 'panou.ciorna.c.' + c.slug;
  ta.oninput = () => sessionStorage.setItem(cheie, ta.value);
  legaMicrofon(ta, $('#trimite-client'));
  if (ta.value) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  $$('[data-rapid]').forEach((b) => { b.onclick = () => { ta.value = INTREBARI_RAPIDE[Number(b.dataset.rapid)]; sessionStorage.setItem(cheie, ta.value); ta.focus(); }; });
  $$('[data-fir]').forEach((el) => { el.onclick = () => { location.hash = '#/fir/' + el.dataset.fir; }; });
  $('#trimite-client').onclick = async () => {
    const text = ta.value.trim();
    if (!text) { toast('Scrie întâi mesajul.', true); return; }
    $('#trimite-client').disabled = true;
    try {
      const r = await api('/api/comanda', { method: 'POST', body: { text, client: c.slug } });
      if (r.ok === false) throw new Error(r.eroare || 'nu s-a trimis');
      sessionStorage.removeItem(cheie);
      S.fireLa = 0;
      delete S.clienti[c.slug];
      location.hash = '#/fir/' + r.fir;
    } catch (e) {
      if (e instanceof EroareAuth) return ecranNeautorizat();
      toast(e.message, true);
      $('#trimite-client').disabled = false;
    }
  };
}

/* ------------------------------------------------------------ MESAJE */
async function vedereMesaje(id, fortat) {
  seteazaTitlu('Mesaje');
  if (!S.mesaje || fortat || Date.now() - S.mesajeLa > 30000) {
    if (!S.mesaje) main().innerHTML = '<div class="incarcare">Se încarcă…</div>';
    S.mesaje = (await api('/api/mesaje')).mesaje || [];
    S.mesajeLa = Date.now();
  }
  if (id !== randareId) return;
  seteazaActualizat(new Date(S.mesajeLa).toISOString());
  let h = '<input class="cauta" id="cauta-mesaj" type="search" placeholder="Caută în mesaje (client, cuvânt)" autocomplete="off" value="' + esc(S.cauta) + '">';
  h += '<p class="mic">Ce ți-au trimis automatizările pe WhatsApp, cele mai noi primele.</p><div id="feed"></div>';
  main().innerHTML = h;
  const deseneaza = () => {
    const t = S.cauta.trim().toLowerCase();
    const lista = S.mesaje.filter((m) => !t || (m.text || '').toLowerCase().includes(t)).slice(0, 150);
    let out = '';
    let ziCurenta = '';
    lista.forEach((m) => {
      const z = ziua(m.ts);
      if (z !== ziCurenta) { out += '<div class="zi-feed">' + esc(z) + '</div>'; ziCurenta = z; }
      out += '<div class="card mesaj-feed"><div class="mic">' + ora(m.ts) + '</div><div class="pre">' + esc(String(m.text || '').replace(/^🤖\s*/, '')) + '</div></div>';
    });
    $('#feed').innerHTML = out || '<div class="gol">Niciun mesaj.</div>';
  };
  deseneaza();
  $('#cauta-mesaj').oninput = (e) => { S.cauta = e.target.value; deseneaza(); };
  programeaza(() => randeaza(true), 120000);
}


/* text din raspunsurile lui Claude: intai escape, apoi doar **ingrosat**, `cod`, titluri si liniute (sigur, fara HTML din afara) */
function textBogat(t) {
  return String(t == null ? '' : t).split('\n').map((l) => {
    let x = esc(l);
    x = x.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    if (/^#{1,4}\s+/.test(l)) return '<b>' + x.replace(/^#{1,4}\s+/, '') + '</b>';
    if (/^\s*[-*]\s+/.test(l)) return x.replace(/^\s*[-*]\s+/, '• ');
    return x;
  }).join('\n');
}
/* ------------------------------------------------------------ CLAUDE */
function cardFir(f, cuClient) {
  const nou = f.ultim_de === 'claude' && (!vazut[f.id] || vazut[f.id] < f.actualizat);
  const chip = f.stare === 'lucreaza' ? '<span class="chip atentie">lucrează</span>' : f.stare === 'eroare' ? '<span class="chip rau">eroare</span>' : nou ? '<span class="chip bine">răspuns nou</span>' : '<span class="chip">gata</span>';
  return '<div class="card apasabil" data-fir="' + esc(f.id) + '"><div class="rand"><b class="titlu-card">' + esc(f.titlu) + '</b>' + chip + '</div>' +
    '<div class="mic">' + (cuClient && f.client_nume ? esc(f.client_nume) + ' · ' : '') + ora(f.actualizat) + ' · ' + f.nr + ' mesaje</div>' +
    (f.stare === 'lucreaza' && f.pas ? '<div class="lucreaza"><span class="punct-anim"></span>' + esc(f.pas) + '</div>' : '<div class="text-2">' + esc((f.ultim || '').slice(0, 180)) + '</div>') + '</div>';
}

async function vedereClaude(id, fortat) {
  seteazaTitlu('Claude');
  if (!S.fire) main().innerHTML = '<div class="incarcare">Se încarcă…</div>';
  const fire = await incarcaFire(fortat);
  if (id !== randareId) return;
  const ciorna = sessionStorage.getItem('panou.ciorna') || '';
  let h = '<div class="card compunere"><label class="mic" for="text-nou">Mesaj nou către Claude (o sesiune nouă pe Mac)</label>' +
    '<textarea id="text-nou" placeholder="Ex.: Urcă bugetul la Mobila Luna SALES la 910 dacă ROAS-ul de ieri ține." >' + esc(ciorna) + '</textarea>' +
    '<div class="rand"><span class="mic">Răspunsul apare aici, în fir.</span><button class="buton principal" id="trimite">Trimite</button></div></div>';
  h += '<div class="sectiune"><h2>Conversații</h2><span class="mic">' + fire.length + '</span></div>';
  h += fire.length ? fire.map((f) => cardFir(f, true)).join('') : '<div class="gol">Nicio conversație încă.</div>';
  main().innerHTML = h;
  const ta = $('#text-nou');
  ta.oninput = () => sessionStorage.setItem('panou.ciorna', ta.value);
  legaMicrofon(ta, $('#trimite'));
  if (ciorna) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  $('#trimite').onclick = async () => {
    const text = ta.value.trim();
    if (!text) { toast('Scrie întâi mesajul.', true); return; }
    $('#trimite').disabled = true;
    try {
      const r = await api('/api/comanda', { method: 'POST', body: { text } });
      if (r.ok === false) throw new Error(r.eroare || 'nu s-a trimis');
      sessionStorage.removeItem('panou.ciorna');
      S.fireLa = 0;
      location.hash = '#/fir/' + r.fir;
    } catch (e) {
      if (e instanceof EroareAuth) return ecranNeautorizat();
      toast(e.message, true);
      $('#trimite').disabled = false;
    }
  };
  $$('[data-fir]').forEach((el) => { el.onclick = () => { location.hash = '#/fir/' + el.dataset.fir; }; });
  if (fire.some((f) => f.stare === 'lucreaza')) programeaza(() => randeaza(true), 5000);
  else programeaza(() => randeaza(true), 60000);
}

async function vedereFir(id, fid, fortat) {
  if (!/^F-\d{1,6}$/.test(fid)) { location.hash = '#/claude'; return; }
  const f = await api('/api/fir?id=' + encodeURIComponent(fid));
  if (id !== randareId) return;
  seteazaTitlu(f.client_nume || f.titlu || fid);
  vazut[fid] = f.actualizat;
  try { localStorage.setItem(CHEIE_VAZUT, JSON.stringify(vazut)); } catch (e) { /* ignor */ }
  const eraJos = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 80);
  const ciornaVeche = $('#text-urmare') ? $('#text-urmare').value : (sessionStorage.getItem('panou.urmare.' + fid) || '');
  let h = (f.client ? '<div class="rand-st inapoi"><a class="buton mic-b" href="#/client/' + encodeURIComponent(f.client) + '/claude">← ' + esc(f.client_nume || f.client) + '</a><span class="mic">' + esc(f.titlu || '') + '</span></div>' : '') +
    '<div class="fir-bule">' + (f.mesaje || []).map((m, i) => '<div class="bula ' + esc(m.de) + '">' + (m.de === 'claude' ? textBogat(m.text) : esc(m.text)) + '<span class="ora">' + (m.de === 'claude' ? 'Claude · ' : m.de === 'sistem' ? '' : 'Tu · ') + ora(m.ts) + '</span>' + (m.de === 'claude' ? '<button class="buton-asculta" data-asculta="' + i + '">▶ Ascultă</button>' : '') + '</div>').join('') + '</div>';
  if (f.stare === 'lucreaza') h += '<div class="lucreaza"><span class="punct-anim"></span>' + esc(f.pas || 'lucrează…') + '</div>';
  h += '<div class="compunere-fixa"><div class="rand"><textarea id="text-urmare" placeholder="' + (f.stare === 'lucreaza' ? 'Aștept să termine…' : 'Răspunde în același fir') + '"></textarea><button class="buton principal" id="trimite-urmare"' + (f.stare === 'lucreaza' ? ' disabled' : '') + '>Trimite</button></div></div>';
  main().innerHTML = h;
  const ta = $('#text-urmare');
  ta.value = ciornaVeche;
  ta.oninput = () => sessionStorage.setItem('panou.urmare.' + fid, ta.value);
  legaMicrofon(ta, $('#trimite-urmare'));
  $$('[data-asculta]').forEach((b) => { b.onclick = () => asculta(b, (f.mesaje || [])[Number(b.dataset.asculta)].text || ''); });
  $('#trimite-urmare').onclick = async () => {
    const text = ta.value.trim();
    if (!text) return;
    $('#trimite-urmare').disabled = true;
    try {
      const r = await api('/api/comanda', { method: 'POST', body: { text, fir: fid } });
      if (r.ok === false) throw new Error(r.eroare || 'nu s-a trimis');
      sessionStorage.removeItem('panou.urmare.' + fid);
      ta.value = '';
      S.fireLa = 0;
      randeaza(true);
    } catch (e) {
      if (e instanceof EroareAuth) return ecranNeautorizat();
      toast(e.message, true);
      $('#trimite-urmare').disabled = false;
    }
  };
  if (eraJos || !fortat) window.scrollTo(0, document.body.scrollHeight);
  if (f.stare === 'lucreaza') programeaza(() => randeaza(true), 3000);
  S.fireLa = 0;
  incarcaFire(true).catch(() => {});
}

function programeaza(fn, ms) {
  clearTimeout(temporizator);
  temporizator = setTimeout(() => { if (document.visibilityState === 'visible' && $('#strat').hidden) fn(); else programeaza(fn, ms); }, ms);
}


/* ------------------------------------------------------------ VOCE: dictare, comenzi vocale, ascultare */
async function apiSunet(blob) {
  let r;
  try {
    r = await fetch(cfg.api + '/api/voce', {
      method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer', body: blob,
      headers: { Authorization: 'Bearer ' + cfg.cheie, 'ngrok-skip-browser-warning': '1', 'Content-Type': blob.type || 'audio/webm' },
    });
  } catch (e) { throw new Error('Nu ajung la Mac ca să transcriu.'); }
  if (r.status === 401) throw new EroareAuth('neautorizat');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.eroare || ('Eroare ' + r.status));
  return j.text || '';
}
async function apiCiteste(text) {
  let r;
  try {
    r = await fetch(cfg.api + '/api/citeste', {
      method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer', body: JSON.stringify({ text }),
      headers: { Authorization: 'Bearer ' + cfg.cheie, 'ngrok-skip-browser-warning': '1', 'Content-Type': 'application/json' },
    });
  } catch (e) { throw new Error('Nu ajung la Mac.'); }
  if (r.status === 401) throw new EroareAuth('neautorizat');
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.eroare || ('Eroare ' + r.status)); }
  return r.blob();
}

const Mic = {
  rec: null, flux: null, bucati: [], start: 0, oprireAuto: null,
  activ() { return !!this.rec; },
  async porneste() {
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error('Browserul ăsta nu poate înregistra.');
    this.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const tip = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.flux, tip ? { mimeType: tip } : undefined);
    this.bucati = [];
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.bucati.push(e.data); };
    this.rec.start(250);
    this.start = Date.now();
    this.oprireAuto = setTimeout(() => { if (this.rec && this.laOprireAuto) this.laOprireAuto(); }, 180000);
  },
  opreste() {
    clearTimeout(this.oprireAuto);
    return new Promise((res) => {
      const rec = this.rec;
      if (!rec) return res(null);
      rec.onstop = () => {
        const blob = new Blob(this.bucati, { type: (rec.mimeType || 'audio/webm').split(';')[0] });
        this.inchide();
        res(blob.size > 800 ? blob : null);
      };
      try { rec.stop(); } catch (e) { this.inchide(); res(null); }
    });
  },
  inchide() {
    if (this.flux) this.flux.getTracks().forEach((t) => t.stop());
    this.flux = null; this.rec = null; this.bucati = [];
  },
  secunde() { return Math.floor((Date.now() - this.start) / 1000); },
};
function durataText(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

const ICON_MIC = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* butonul de dictare de langa „Trimite”: textul vorbit intra in caseta, il verifici, apoi trimiti */
function legaMicrofon(ta, butonTrimite) {
  if (!ta || !butonTrimite || !window.MediaRecorder) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'buton buton-mic';
  b.setAttribute('aria-label', 'Dictează');
  b.innerHTML = ICON_MIC + '<span class="mic-text">Dictează</span>';
  butonTrimite.parentNode.insertBefore(b, butonTrimite);
  let ceas = null;
  const gata = () => { clearInterval(ceas); b.classList.remove('inregistreaza'); b.disabled = false; b.querySelector('.mic-text').textContent = 'Dictează'; };
  const opreste = async () => {
    clearInterval(ceas);
    b.disabled = true;
    b.classList.remove('inregistreaza');
    b.querySelector('.mic-text').textContent = 'Transcriu…';
    try {
      const blob = await Mic.opreste();
      if (!blob) { toast('N-am prins nimic.', true); return gata(); }
      const text = await apiSunet(blob);
      if (!text) { toast('N-am înțeles nimic din înregistrare.', true); return gata(); }
      ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + ' ' : '') + text;
      ta.dispatchEvent(new Event('input'));
      ta.focus();
      gata();
      if (localStorage.getItem('panou.voce.auto') === '1') butonTrimite.click();
    } catch (e) {
      gata();
      if (e instanceof EroareAuth) return ecranNeautorizat();
      toast(e.message, true);
    }
  };
  b.onclick = async () => {
    if (b.classList.contains('inregistreaza')) return opreste();
    if (Mic.activ()) return;
    try {
      await Mic.porneste();
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? 'Microfonul e blocat: dă voie din setările browserului.' : (e.message || 'Microfonul nu pornește.'), true);
      return;
    }
    Mic.laOprireAuto = opreste;
    b.classList.add('inregistreaza');
    b.querySelector('.mic-text').textContent = '0:00 · Stop';
    ceas = setInterval(() => { b.querySelector('.mic-text').textContent = durataText(Mic.secunde()) + ' · Stop'; }, 500);
  };
}

/* comanda vocala din orice pagina (butonul rotund): vorbesti, vezi ce am inteles, apoi o trimiti lui Claude */
function clientDinPagina() {
  const r = ruta();
  if (r.v === 'client') return String(r.arg || '').split('/')[0] || null;
  return null;
}
function gasesteClient(text) {
  const cl = (S.stare && S.stare.clienti) || [];
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let best = null;
  cl.forEach((c) => {
    const n = c.nume.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const scurt = n.replace(/\.(ro|eu|com)$/, '').split(/\s+/)[0];
    if (t.includes(n) || (scurt.length >= 4 && t.includes(scurt))) {
      if (!best || n.length > best.n.length) best = { c, n };
    }
  });
  return best ? best.c : null;
}
async function comandaVocala() {
  if (Mic.activ()) return;
  try {
    await Mic.porneste();
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Microfonul e blocat: dă voie din setările browserului.' : (e.message || 'Microfonul nu pornește.'), true);
    return;
  }
  const slug = clientDinPagina();
  const cl = slug && S.stare ? (S.stare.clienti || []).find((c) => c.slug === slug) : null;
  let ceas = null;
  const opreste = async () => {
    clearInterval(ceas);
    $('#voce-stare').textContent = 'Transcriu…';
    $('#voce-stop').disabled = true;
    try {
      const blob = await Mic.opreste();
      if (!blob) { inchideStrat(); toast('N-am prins nimic.', true); return; }
      const text = await apiSunet(blob);
      if (!text) { inchideStrat(); toast('N-am înțeles nimic.', true); return; }
      arataComandaVocala(text, cl);
    } catch (e) {
      inchideStrat();
      if (e instanceof EroareAuth) return ecranNeautorizat();
      toast(e.message, true);
    }
  };
  Mic.laOprireAuto = opreste;
  strat('<h2>Te ascult…</h2><p class="text-2">' + (cl ? 'Comandă despre <b>' + esc(cl.nume) + '</b>. ' : '') + 'Spune ce vrei, apoi apasă Gata. Poți spune și „deschide NAESIA”.</p>' +
    '<div class="voce-unda"><span></span><span></span><span></span><span></span><span></span></div><p class="mic" id="voce-stare">0:00</p>' +
    '<div class="butoane"><button class="buton" id="voce-renunt">Renunț</button><button class="buton principal" id="voce-stop">Gata</button></div>',
  () => {
    $('#voce-stop').onclick = opreste;
    $('#voce-renunt').onclick = async () => { clearInterval(ceas); await Mic.opreste(); inchideStrat(); };
    ceas = setInterval(() => { const el = $('#voce-stare'); if (el) el.textContent = durataText(Mic.secunde()); }, 500);
  });
}
function arataComandaVocala(text, clientPagina) {
  const nav = text.match(/^\s*(deschide|arat[aă](-mi)?|du-m[aă] la|mergi la|intr[aă] (pe|la))\s+(.+)$/i);
  if (nav) {
    const c = gasesteClient(nav[5] || nav[4] || text);
    const sub = /urgen/i.test(text) ? 'urgent' : /de f[aă]cut/i.test(text) ? 'facut' : /[iî]mbun[aă]t[aă][tț]/i.test(text) ? 'imbunatatit' : /claude|conversa/i.test(text) ? 'claude' : 'status';
    if (c) { inchideStrat(); location.hash = '#/client/' + encodeURIComponent(c.slug) + '/' + sub; toast('Deschid ' + c.nume + '.'); return; }
    if (/urgen/i.test(text)) { inchideStrat(); S.filtruClienti = 'urgent'; location.hash = '#/clienti'; return; }
    if (/aprob|azi/i.test(text)) { inchideStrat(); location.hash = '#/azi'; return; }
  }
  const mentionat = gasesteClient(text);
  const tinta = clientPagina || mentionat;
  strat('<h2>Am înțeles</h2><textarea id="voce-text" class="voce-text">' + esc(text) + '</textarea>' +
    '<p class="mic">' + (tinta ? 'Pleacă la Claude ca mesaj despre <b>' + esc(tinta.nume) + '</b>.' : 'Pleacă la Claude ca mesaj nou.') + ' Poți corecta textul înainte.</p>' +
    '<div class="butoane"><button class="buton" id="voce-renunt">Renunț</button><button class="buton principal" id="voce-trimite">Trimite lui Claude</button></div>',
  () => {
    $('#voce-renunt').onclick = inchideStrat;
    $('#voce-trimite').onclick = async () => {
      const t = $('#voce-text').value.trim();
      if (!t) return;
      $('#voce-trimite').disabled = true;
      try {
        const r = await api('/api/comanda', { method: 'POST', body: tinta ? { text: t, client: tinta.slug } : { text: t } });
        if (r.ok === false) throw new Error(r.eroare || 'nu s-a trimis');
        inchideStrat();
        S.fireLa = 0;
        if (tinta) delete S.clienti[tinta.slug];
        location.hash = '#/fir/' + r.fir;
      } catch (e) {
        inchideStrat();
        if (e instanceof EroareAuth) return ecranNeautorizat();
        toast(e.message, true);
      }
    };
  });
}

/* „Asculta” la raspunsurile lui Claude: pornesti tu, nimic nu se citeste singur */
const Redare = { audio: null, buton: null };
function opresteRedarea() {
  if (Redare.audio) { Redare.audio.pause(); URL.revokeObjectURL(Redare.audio.src); }
  if (Redare.buton) Redare.buton.textContent = '▶ Ascultă';
  Redare.audio = null; Redare.buton = null;
}
async function asculta(buton, text) {
  if (Redare.buton === buton) { opresteRedarea(); return; }
  opresteRedarea();
  Redare.buton = buton;
  buton.textContent = 'Se pregătește…';
  try {
    const blob = await apiCiteste(text);
    if (Redare.buton !== buton) return;
    const a = new Audio(URL.createObjectURL(blob));
    Redare.audio = a;
    a.onended = opresteRedarea;
    buton.textContent = '■ Oprește';
    await a.play();
  } catch (e) {
    opresteRedarea();
    if (e instanceof EroareAuth) return ecranNeautorizat();
    toast(e.message || 'Nu pot reda.', true);
  }
}

/* ------------------------------------------------------------ pornire */
async function porneste() {
  const fab = $('#voce-fab');
  if (fab) { if (window.MediaRecorder) fab.onclick = comandaVocala; else fab.hidden = true; }
  $('#reimprospateaza').onclick = () => { S.stareLa = 0; S.fireLa = 0; S.clienti = {}; randeaza(true); };
  window.addEventListener('hashchange', () => { opresteRedarea(); randeaza(false); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cfg) randeaza(true); });
  const p = citestePerechea();
  if (p) {
    const ok = await imperecheaza(p);
    if (!ok) return;
  }
  if (cfg && !location.hash) location.hash = '#/clienti';
  randeaza(false);
  if (cfg) incarcaFire(false).catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

porneste();
