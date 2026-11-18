'use strict';
// Genera una demo statica navigabile in un unico file HTML (demo/profilipro-demo.html).
// Avvia l'app in memoria con i dati di prova, visita le pagine come visitatore, azienda e
// professionisti, e le impacchetta con un piccolo router: link, ricerche e cambio utente
// funzionano; le azioni che modificano i dati sono solo simulate.
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { open } = require('../src/db');
const { seed } = require('../src/seed');
const { createApp } = require('../src/app');
const M = require('../src/model');

const ROLES = [
  { id: 'visitatore', label: 'Visitatore', email: null, start: '/' },
  { id: 'azienda', label: 'Azienda · Laura', email: 'laura@lequerce.it', start: '/area-personale' },
  { id: 'sara', label: 'Professionista · Sara', email: 'sara.lombardi@esempio.it', start: '/area-personale' },
  { id: 'giulia', label: 'Professionista · Giulia', email: 'giulia.ferraro@esempio.it', start: '/area-personale' },
];

function norm(url) {
  const u = new URL(url, 'http://x');
  const params = [...u.searchParams.entries()].filter(([, v]) => v !== '').sort(([a], [b]) => a.localeCompare(b));
  const q = new URLSearchParams(params).toString();
  return u.pathname + (q ? `?${q}` : '');
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

async function crawl(agent, seeds, accept, limit) {
  const pages = {};
  const queue = seeds.map(norm);
  const seen = new Set(queue);
  let header = '';
  let footer = '';
  while (queue.length && Object.keys(pages).length < limit) {
    const url = queue.shift();
    const res = await agent.get(url);
    if (res.status !== 200 || !/text\/html/.test(res.headers['content-type'] || '')) continue;
    const html = res.text;
    const main = (html.match(/<main>([\s\S]*)<\/main>/) || [])[1];
    if (main == null) continue;
    header ||= (html.match(/<header class="topbar">[\s\S]*?<\/header>/) || [''])[0];
    footer ||= (html.match(/<footer class="footer">[\s\S]*?<\/footer>/) || [''])[0];
    pages[url] = { title: decode((html.match(/<title>(.*?)<\/title>/) || [, 'ProfiliPro'])[1]), main };
    for (const [, href] of main.matchAll(/href="(\/[^"#]*)/g)) {
      const link = norm(decode(href));
      if (link.startsWith('/static') || link.endsWith('.ics') || seen.has(link) || !accept(link)) continue;
      seen.add(link);
      queue.push(link);
    }
    for (const [, href] of header.matchAll(/href="(\/[^"#]*)/g)) {
      const link = norm(decode(href));
      if (!seen.has(link) && accept(link)) { seen.add(link); queue.push(link); }
    }
  }
  return { pages, header, footer };
}

async function login(agent, email) {
  const page = await agent.get('/accedi');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await agent.post('/accedi').type('form').send({ _csrf: csrf, email, password: 'password123' });
}

async function main() {
  const db = open(':memory:');
  seed(db);
  const app = createApp(db, { sessionSecret: 'demo' });

  const types = Object.keys(M.SERVICE_TYPES);
  const sectors = M.SECTORS.map((x) => x.slug);
  const visitorSeeds = ['/', '/cerca', '/come-funziona', '/accedi', '/registrati', '/registrati?ruolo=professionista',
    ...types.map((t) => `/cerca?type=${t}`),
    ...types.flatMap((t) => sectors.map((x) => `/cerca?type=${t}&sector=${x}`)),
    ...sectors.map((x) => `/cerca?sector=${x}`)];

  const data = { roles: [], pages: {}, chrome: {} };
  for (const role of ROLES) {
    const agent = request.agent(app);
    if (role.email) await login(agent, role.email);
    const isVisitor = !role.email;
    // Per gli utenti registrati bastano le pagine personali e i profili; il resto usa la versione del visitatore.
    const accept = isVisitor
      ? (u) => !/^\/(area-personale|richieste|admin|preferiti)/.test(u)
      : (u) => /^\/(area-personale|richieste\/\d+$|professionisti\/)/.test(u) || u === '/';
    const seeds = isVisitor ? visitorSeeds : ['/area-personale', '/', '/area-personale/profilo'];
    const { pages, header, footer } = await crawl(agent, seeds, accept, isVisitor ? 260 : 120);
    data.roles.push({ id: role.id, label: role.label, email: role.email, start: role.start });
    data.pages[role.id] = pages;
    data.chrome[role.id] = { header, footer };
    console.log(`${role.label}: ${Object.keys(pages).length} pagine`);
  }

  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const html = TEMPLATE.replace('/*CSS*/', () => css).replace('/*DATA*/', () => json);
  const outDir = path.join(__dirname, '..', 'demo');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'profilipro-demo.html');
  fs.writeFileSync(out, html);
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '')
    .replace(/<title>.*?<\/title>/, '<title>ProfiliPro Agricoltura</title>');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  fs.writeFileSync(path.join(outDir, 'profilipro-demo-online.html'), `${head.trim()}\n${body.trim()}\n`);
  console.log(`Demo scritta in ${out} (${Math.round(html.length / 1024)} KB)`);
}

const TEMPLATE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ProfiliPro Agricoltura · demo navigabile</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Figtree:wght@400;500;600;700&display=swap">
<style>/*CSS*/
.demo-back { font: inherit; font-weight: 700; background: rgba(255,255,255,.12); color: #fff; border: 0; border-radius: 999px; padding: 4px 12px; cursor: pointer; }
.demo-back:disabled { opacity: .4; cursor: default; }
.demo-bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 50; background: var(--forest); color: #fff; font-size: .85rem; }
.demo-bar .wrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 8px; padding-bottom: 8px; }
.demo-bar strong { color: var(--wheat); }
.demo-roles { display: flex; gap: 6px; flex-wrap: wrap; }
.demo-roles button { font: inherit; font-weight: 600; border: 1px solid rgba(255,255,255,.35); background: transparent; color: #fff; border-radius: 999px; padding: 4px 12px; cursor: pointer; }
.demo-roles button[aria-pressed="true"] { background: var(--wheat); border-color: var(--wheat); color: var(--forest); }
.demo-note { opacity: .8; margin-left: auto; }
.demo-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 12px 18px; border-radius: 12px; max-width: min(520px, calc(100vw - 32px)); box-shadow: 0 8px 30px rgba(0,0,0,.25); z-index: 60; opacity: 0; transition: opacity .2s; pointer-events: none; }
.demo-toast.show { opacity: 1; }
@media (max-width: 720px) { .demo-note { display: none; } }
</style>
</head>
<body>
<div class="demo-bar"><div class="wrap"><button type="button" class="demo-back" id="back" disabled>‹ Indietro</button><strong>Demo navigabile</strong><span>Guarda come:</span><div class="demo-roles" id="roles"></div><span class="demo-note">Le azioni che modificano i dati sono simulate</span></div></div>
<div id="chrome-header"></div>
<main id="page"></main>
<div id="chrome-footer"></div>
<div class="demo-toast" id="toast" role="status"></div>
<script type="application/json" id="data">/*DATA*/</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('data').textContent);
  var role = 'visitatore';
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3800);
  }
  function norm(url) {
    var u = new URL(url, 'http://x');
    var params = Array.from(u.searchParams.entries()).filter(function (p) { return p[1] !== ''; })
      .sort(function (a, b) { return a[0].localeCompare(b[0]); });
    var q = new URLSearchParams(params).toString();
    return u.pathname + (q ? '?' + q : '');
  }
  function findPage(r, url) {
    return D.pages[r][url] || (r !== 'visitatore' && D.pages.visitatore[url]) || null;
  }
  function renderRoles() {
    var box = document.getElementById('roles'); box.innerHTML = '';
    D.roles.forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = r.label;
      b.setAttribute('aria-pressed', String(r.id === role));
      b.onclick = function () { go(r.id, r.start); };
      box.appendChild(b);
    });
  }
  var history = [];
  var current = null;
  function render() {
    var r = D.pages[current.role] ? current.role : 'visitatore';
    var full = current.url || '/';
    var anchor = full.indexOf('#') >= 0 ? full.slice(full.indexOf('#') + 1) : '';
    var url = norm(full.split('#')[0]);
    var page = findPage(r, url);
    if (!page) { toast('Questa pagina non è inclusa nella demo statica.'); page = findPage(r, D.roles.find(function (x) { return x.id === r; }).start); }
    role = r;
    document.getElementById('chrome-header').innerHTML = D.chrome[r].header;
    document.getElementById('chrome-footer').innerHTML = D.chrome[r].footer;
    document.getElementById('page').innerHTML = page.main;
    document.title = page.title + ' · demo';
    renderRoles();
    var target = anchor && document.getElementById(anchor);
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
  }
  function go(r, url) {
    if (current) history.push(current);
    current = { role: r, url: url };
    document.getElementById('back').disabled = !history.length;
    render();
  }
  document.getElementById('back').onclick = function () {
    if (!history.length) return;
    current = history.pop();
    this.disabled = !history.length;
    render();
  };

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (href.charAt(0) === '#') {
      e.preventDefault();
      var el = document.getElementById(href.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (/^mailto:/.test(href)) { e.preventDefault(); toast('Nella demo le email non vengono inviate.'); return; }
    if (href.endsWith('.ics')) { e.preventDefault(); toast('Nel prototipo vero qui scarichi le date per Google Calendar, Outlook o iPhone.'); return; }
    if (href.charAt(0) === '/') { e.preventDefault(); go(role, href); }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    e.preventDefault();
    var action = f.getAttribute('action') || '';
    var method = (f.getAttribute('method') || 'get').toLowerCase();
    var fd = new FormData(f);
    if (method === 'get') {
      var params = new URLSearchParams();
      fd.forEach(function (v, k) { if (v !== '') params.append(k, v); });
      var url = norm(action + (params.toString() ? '?' + params : ''));
      if (findPage(role, url)) return go(role, url);
      var base = new URLSearchParams();
      ['type', 'sector', 'category'].forEach(function (k) { if (params.get(k)) base.set(k, params.get(k)); });
      var fallback = norm('/cerca?' + base);
      if (findPage(role, fallback)) { toast('Nella demo statica alcuni filtri combinati non sono disponibili: ti mostro il risultato più vicino.'); return go(role, fallback); }
      return toast('Combinazione di filtri non inclusa nella demo statica.');
    }
    if (action === '/accedi') {
      var email = String(fd.get('email') || '').toLowerCase().trim();
      var r = D.roles.find(function (x) { return x.email === email; });
      if (r) return go(r.id, r.start);
      return toast('Nella demo puoi accedere come laura@lequerce.it, sara.lombardi@esempio.it o giulia.ferraro@esempio.it (password qualsiasi).');
    }
    if (action === '/esci') return go('visitatore', '/');
    toast('Azione simulata: nel prototipo vero questa operazione viene salvata e l’altra parte la vede nella sua area personale.');
  }, true);

  go('visitatore', '/');
})();
</script>
</body>
</html>
`;

main().catch((e) => { console.error(e); process.exit(1); });
