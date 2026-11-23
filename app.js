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
function ciornaPentruClaude(text) { sessionStorage.setItem('panou.ciorna', text); location.hash = '#/claude'; }

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
  return { v: parti[0] || 'azi', arg: decodeURIComponent(parti.slice(1).join('/') || '') };
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
  seIncarca(true);
  try {
    if (v === 'azi') await vedereAzi(id, fortat);
    else if (v === 'clienti') await vedereClienti(id, fortat);
    else if (v === 'client') await vedereClient(id, arg, fortat);
    else if (v === 'mesaje') await vedereMesaje(id, fortat);
    else if (v === 'claude') await vedereClaude(id, fortat);
    else if (v === 'fir') await vedereFir(id, arg, fortat);
    else { location.hash = '#/azi'; }
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
  history.replaceState(null, '', location.pathname + '#/azi');
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
      if (q) ciornaPentruClaude('[' + q.client_nume + '] La întrebarea analistului: „' + q.text + '”\n\nRăspunsul meu: ');
    };
  });
  $$('[data-copiaza]').forEach((b) => { b.onclick = () => copiaza(ciorne[Number(b.dataset.copiaza)].mesaj || ''); });
  $$('[data-wa]').forEach((b) => { b.onclick = () => deschideWhatsApp(ciorne[Number(b.dataset.wa)].mesaj || ''); });
  programeaza(() => randeaza(true), 90000);
}

/* ------------------------------------------------------------ CLIENTI */
async function vedereClienti(id, fortat) {
  seteazaTitlu('Clienți');
  if (!S.stare) main().innerHTML = '<div class="incarcare">Se încarcă…</div>';
  const s = await incarcaStare(fortat);
  if (id !== randareId) return;
  seteazaActualizat(s.generat);
  const cl = s.clienti || [];
  let h = '<input class="cauta" id="cauta-client" type="search" placeholder="Caută client" autocomplete="off">';
  h += '<div id="lista-clienti">' + cl.map((c) => '<div class="card apasabil" data-slug="' + esc(c.slug) + '" data-nume="' + esc(c.nume.toLowerCase()) + '"><div class="client-rand"><span class="emoji" aria-hidden="true">' + esc(c.emoji || '•') + '</span><div class="mijloc"><div class="rand"><span class="nume">' + esc(c.nume) + '</span>' +
    (c.de_aprobat ? '<span class="chip rau">' + c.de_aprobat + ' de aprobat</span>' : (c.stare ? '<span class="chip ' + stareClasa(c.stare) + '">' + esc(stareText(c.stare)) + '</span>' : '')) +
    '</div>' + (c.linie ? '<div class="text-2">' + esc(c.linie) + '</div>' : '') + (c.rezumat ? '<div class="mic">' + esc(c.rezumat.length > 170 ? c.rezumat.slice(0, 170) + '…' : c.rezumat) + '</div>' : '') + '</div></div></div>').join('') + '</div>';
  main().innerHTML = h;
  $$('[data-slug]').forEach((el) => { el.onclick = () => { location.hash = '#/client/' + encodeURIComponent(el.dataset.slug); }; });
  $('#cauta-client').oninput = (e) => {
    const t = e.target.value.trim().toLowerCase();
    $$('#lista-clienti [data-slug]').forEach((el) => { el.hidden = !!t && !el.dataset.nume.includes(t); });
  };
  programeaza(() => randeaza(true), 120000);
}

async function vedereClient(id, slug, fortat) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) { location.hash = '#/clienti'; return; }
  if (!S.clienti[slug] || fortat) {
    if (!S.clienti[slug]) main().innerHTML = '<div class="incarcare">Se încarcă…</div>';
    S.clienti[slug] = await api('/api/client?slug=' + encodeURIComponent(slug));
  }
  if (id !== randareId) return;
  const c = S.clienti[slug];
  seteazaTitlu(c.nume);
  let h = '<div class="card"><div class="rand"><div class="rand-st"><span class="emoji">' + esc(c.emoji || '') + '</span><b>' + esc(c.linie || '') + '</b></div>' + (c.stare ? '<span class="chip ' + stareClasa(c.stare) + '">' + esc(stareText(c.stare)) + '</span>' : '') + '</div>' +
    '<div class="mic">mod ' + esc(c.mod || '—') + ' · ' + esc(c.tip || '') + ' · analiza din ' + esc(c.analiza_zi || '—') + '</div>' +
    (c.rezumat ? '<p class="pre">' + esc(c.rezumat) + '</p>' : '') + '</div>';
  const deAprobat = (c.propuneri || []).filter((p) => p.status === 'ASTEAPTA_DA' || p.status === 'AMANAT');
  if (deAprobat.length) h += '<div class="sectiune"><h2>De aprobat</h2></div>' + deAprobat.map((p) => cardPropunere(p)).join('');
  if ((c.intrebari || []).length) h += '<div class="sectiune"><h2>Întrebări</h2></div><div class="card">' + c.intrebari.map((q, i) => '<div class="intrebare"><div class="pre">' + esc(q) + '</div><div class="butoane"><button class="buton mic-b" data-q="' + i + '">Răspunde</button></div></div>').join('') + '</div>';
  if ((c.diagnostic || []).length) h += '<div class="sectiune"><h2>Diagnostic</h2></div><div class="card"><ul class="lista">' + c.diagnostic.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  if ((c.actiuni || []).length) h += '<div class="sectiune"><h2>Ce a propus azi</h2></div><div class="card"><ul class="lista">' + c.actiuni.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  if ((c.de_facut || []).length) h += '<div class="sectiune"><h2>De făcut</h2></div><div class="card"><ul class="lista">' + c.de_facut.map((d) => (typeof d === 'object' && d) ? ('<li>' + (d.cine ? '<span class="chip">' + esc(d.cine) + '</span> ' : '') + esc(d.ce) + (d.de_ce ? '<div class="mic">' + esc(d.de_ce) + '</div>' : '') + (d.mesaj_ciorna ? '<div class="ciorna">' + esc(d.mesaj_ciorna) + '</div>' : '') + '</li>') : ('<li>' + esc(d) + '</li>')).join('') + '</ul></div>';
  if ((c.verdicte || []).length) h += '<details><summary>Verdictele verificatorului (' + c.verdicte.length + ')</summary><div class="card"><ul class="lista">' + c.verdicte.map((v) => '<li><span class="chip ' + verdictClasa(v.verdict) + '">' + esc(v.verdict) + '</span> ' + esc(v.id) + ' · ' + esc(v.actiune) + '</li>').join('') + '</ul></div></details>';
  if ((c.evaluari || []).length) h += '<details><summary>Ce a mers și ce nu (' + c.evaluari.length + ')</summary><div class="card"><ul class="lista">' + c.evaluari.map((e) => (typeof e === 'object' && e) ? ('<li><b>' + esc(e.verdict) + '</b> · ' + esc(e.ref) + '<div class="mic">' + esc(e.cifre) + '</div></li>') : ('<li>' + esc(e) + '</li>')).join('') + '</ul></div></details>';
  if ((c.idei || []).length) h += '<details><summary>Idei (' + c.idei.length + ')</summary><div class="card"><ul class="lista">' + c.idei.map((d) => (typeof d === 'object' && d) ? ('<li>' + esc(d.idee) + (d.cifra ? '<div class="mic">' + esc(d.cifra) + '</div>' : '') + '</li>') : ('<li>' + esc(d) + '</li>')).join('') + '</ul></div></details>';
  const istoric = (c.propuneri || []).filter((p) => p.status !== 'ASTEAPTA_DA' && p.status !== 'AMANAT');
  if (istoric.length) h += '<details><summary>Propunerile din ultimele 10 zile (' + istoric.length + ')</summary><div class="card"><ul class="lista">' + istoric.map((p) => '<li><span class="chip ' + (p.status === 'APLICAT' ? 'bine' : (p.status === 'RESPINS' || p.status === 'BLOCAT' || String(p.status).startsWith('ESUAT')) ? 'rau' : '') + '">' + esc(p.status) + '</span> ' + esc(p.id) + ' · ' + esc(p.scurt || p.nume || tip(p.tip)) + (p.de_la !== null && p.de_la !== undefined ? ' · ' + num(p.de_la) + ' → ' + num(p.la) + ' ' + unitate(p.unitate) : '') + '</li>').join('') + '</ul></div></details>';
  h += '<div class="butoane"><button class="buton principal" id="intreaba">Scrie-i lui Claude despre ' + esc(c.nume) + '</button></div>';
  main().innerHTML = h;
  legaButoanePropuneri(main(), deAprobat);
  $$('[data-q]').forEach((b) => { b.onclick = () => ciornaPentruClaude('[' + c.nume + '] La întrebarea analistului: „' + c.intrebari[Number(b.dataset.q)] + '”\n\nRăspunsul meu: '); });
  $('#intreaba').onclick = () => ciornaPentruClaude('[' + c.nume + '] ');
  window.scrollTo(0, 0);
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

/* ------------------------------------------------------------ CLAUDE */
async function vedereClaude(id, fortat) {
  seteazaTitlu('Claude');
  if (!S.fire) main().innerHTML = '<div class="incarcare">Se încarcă…</div>';
  const fire = await incarcaFire(fortat);
  if (id !== randareId) return;
  const ciorna = sessionStorage.getItem('panou.ciorna') || '';
  let h = '<div class="card compunere"><label class="mic" for="text-nou">Mesaj nou către Claude (o sesiune nouă pe Mac)</label>' +
    '<textarea id="text-nou" placeholder="Ex.: Urcă bugetul la Mobila Luna SALES la 910 dacă ROAS-ul de ieri ține." >' + esc(ciorna) + '</textarea>' +
    '<div class="rand"><span class="mic">Răspunsul apare aici, în fir.</span><button class="buton principal" id="trimite">Trimite</button></div></div>';
  h += '<div class="sectiune"><h2>Fire</h2><span class="mic">' + fire.length + '</span></div>';
  h += fire.length ? fire.map((f) => {
    const nou = f.ultim_de === 'claude' && (!vazut[f.id] || vazut[f.id] < f.actualizat);
    const chip = f.stare === 'lucreaza' ? '<span class="chip atentie">lucrează</span>' : f.stare === 'eroare' ? '<span class="chip rau">eroare</span>' : nou ? '<span class="chip bine">răspuns nou</span>' : '<span class="chip">gata</span>';
    return '<div class="card apasabil" data-fir="' + esc(f.id) + '"><div class="rand"><b class="titlu-card">' + esc(f.titlu) + '</b>' + chip + '</div>' +
      '<div class="mic">' + ora(f.actualizat) + ' · ' + f.nr + ' mesaje</div>' +
      (f.stare === 'lucreaza' && f.pas ? '<div class="lucreaza"><span class="punct-anim"></span>' + esc(f.pas) + '</div>' : '<div class="text-2">' + esc((f.ultim || '').slice(0, 180)) + '</div>') + '</div>';
  }).join('') : '<div class="gol">Niciun fir încă.</div>';
  main().innerHTML = h;
  const ta = $('#text-nou');
  ta.oninput = () => sessionStorage.setItem('panou.ciorna', ta.value);
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
  seteazaTitlu(f.titlu || fid);
  vazut[fid] = f.actualizat;
  try { localStorage.setItem(CHEIE_VAZUT, JSON.stringify(vazut)); } catch (e) { /* ignor */ }
  const eraJos = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 80);
  const ciornaVeche = $('#text-urmare') ? $('#text-urmare').value : (sessionStorage.getItem('panou.urmare.' + fid) || '');
  let h = '<div class="fir-bule">' + (f.mesaje || []).map((m) => '<div class="bula ' + esc(m.de) + '">' + esc(m.text) + '<span class="ora">' + (m.de === 'claude' ? 'Claude · ' : m.de === 'sistem' ? '' : 'Tu · ') + ora(m.ts) + '</span></div>').join('') + '</div>';
  if (f.stare === 'lucreaza') h += '<div class="lucreaza"><span class="punct-anim"></span>' + esc(f.pas || 'lucrează…') + '</div>';
  h += '<div class="compunere-fixa"><div class="rand"><textarea id="text-urmare" placeholder="' + (f.stare === 'lucreaza' ? 'Aștept să termine…' : 'Răspunde în același fir') + '"></textarea><button class="buton principal" id="trimite-urmare"' + (f.stare === 'lucreaza' ? ' disabled' : '') + '>Trimite</button></div></div>';
  main().innerHTML = h;
  const ta = $('#text-urmare');
  ta.value = ciornaVeche;
  ta.oninput = () => sessionStorage.setItem('panou.urmare.' + fid, ta.value);
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

/* ------------------------------------------------------------ pornire */
async function porneste() {
  $('#reimprospateaza').onclick = () => { S.stareLa = 0; S.fireLa = 0; S.clienti = {}; randeaza(true); };
  window.addEventListener('hashchange', () => randeaza(false));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cfg) randeaza(true); });
  const p = citestePerechea();
  if (p) {
    const ok = await imperecheaza(p);
    if (!ok) return;
  }
  if (cfg && !location.hash) location.hash = '#/azi';
  randeaza(false);
  if (cfg) incarcaFire(false).catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

porneste();
