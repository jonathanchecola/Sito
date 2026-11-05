'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const M = require('./model');

const MODES = { presenza: 'In presenza', remoto: 'Da remoto', entrambi: 'Presenza e remoto' };
const STATUS = {
  in_attesa: 'In attesa', accettata: 'Accettata', rifiutata: 'Rifiutata',
  completata: 'Completata', annullata: 'Annullata',
};
const COLORS = ['#2f6b3f', '#8a5a2b', '#3d7f8c', '#6b4f8a', '#a3472f', '#4f6b2a', '#7a6a2b', '#2b5d6b'];

function createApp(db, opts = {}) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');
  // Online il sito sta dietro un proxy HTTPS: serve per i cookie di sessione sicuri.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(session({
    secret: opts.sessionSecret || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 864e5 },
  }));

  // Utente corrente, CSRF e helper per le viste.
  app.use((req, res, next) => {
    if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
    const user = req.session.userId
      ? db.prepare('SELECT id, name, email, role, company FROM users WHERE id = ?').get(req.session.userId)
      : null;
    req.user = user || null;
    Object.assign(res.locals, {
      user: req.user, csrf: req.session.csrf, path: req.path, query: req.query,
      flash: req.session.flash || null, MODES, STATUS, CRITERIA: M.CRITERIA, REGIONS: M.REGIONS,
      SERVICE_TYPES: M.SERVICE_TYPES, SECTORS: M.SECTORS, UNITS: M.UNITS,
      stars, fmtEuro, fmtDate, fmtPrice,
    });
    delete req.session.flash;
    if (req.method === 'POST' && req.body._csrf !== req.session.csrf) {
      return res.status(403).render('error', { title: 'Sessione scaduta', message: 'Token di sicurezza non valido. Ricarica la pagina e riprova.' });
    }
    next();
  });

  const flash = (req, type, text) => { req.session.flash = { type, text }; };
  const requireLogin = (req, res, next) => {
    if (!req.user) return res.redirect(`/accedi?next=${encodeURIComponent(req.originalUrl)}`);
    next();
  };
  const requireRole = (role) => (req, res, next) => {
    if (!req.user) return res.redirect(`/accedi?next=${encodeURIComponent(req.originalUrl)}`);
    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).render('error', { title: 'Accesso negato', message: 'Non hai i permessi per questa pagina.' });
    }
    next();
  };
  const favoritesOf = (u) => u
    ? new Set(db.prepare('SELECT professional_id FROM favorites WHERE user_id = ?').all(u.id).map((r) => r.professional_id))
    : new Set();

  // ---------- Pagine pubbliche ----------
  app.get('/', (req, res) => {
    res.render('home', {
      title: 'Formazione, consulenza e pratiche per le aziende agricole',
      categories: M.categoriesWithCounts(db),
      typeCounts: M.countsBy(db, 'service_types', Object.keys(M.SERVICE_TYPES)),
      sectorCounts: M.countsBy(db, 'sectors', M.SECTORS.map((x) => x.slug)),
      top: M.topRated(db, 6),
      favs: favoritesOf(req.user),
      stats: db.prepare(`SELECT (SELECT COUNT(*) FROM professionals WHERE published=1) AS pros,
                                (SELECT COUNT(*) FROM reviews WHERE hidden=0) AS reviews,
                                (SELECT ROUND(AVG(overall),1) FROM reviews WHERE hidden=0) AS avg`).get(),
    });
  });

  app.get('/cerca', (req, res) => {
    const f = {
      q: str(req.query.q, 100), where: str(req.query.where, 60), category: str(req.query.category, 60),
      type: str(req.query.type, 20), sector: str(req.query.sector, 30),
      mode: str(req.query.mode, 20), minRating: num(req.query.minRating),
      verified: req.query.verified === '1', available: req.query.available === '1',
      sort: str(req.query.sort, 20), page: req.query.page,
    };
    const result = M.search(db, f);
    res.render('search', {
      title: 'Risultati di ricerca', f, ...result,
      categories: M.categoriesWithCounts(db), favs: favoritesOf(req.user),
    });
  });

  app.get('/professionisti/:slug', (req, res) => {
    const p = M.getBySlug(db, req.params.slug);
    const isOwner = req.user && p && p.user_id === req.user.id;
    if (!p || (!p.published && !isOwner && req.user?.role !== 'admin')) {
      return res.status(404).render('error', { title: 'Profilo non trovato', message: 'Il profilo cercato non esiste o non è pubblico.' });
    }
    res.render('profile', {
      title: `${p.name} – ${p.headline}`, p, isOwner,
      reviews: M.reviewsFor(db, p.id), dist: M.ratingDistribution(db, p.id), services: M.servicesFor(db, p.id),
      isFav: favoritesOf(req.user).has(p.id),
    });
  });

  // ---------- Autenticazione ----------
  app.get('/accedi', (req, res) => res.render('login', { title: 'Accedi', next: safeNext(req.query.next), error: null, email: '' }));

  app.post('/accedi', (req, res) => {
    const email = str(req.body.email, 200).toLowerCase();
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash)) {
      return res.status(401).render('login', { title: 'Accedi', next: safeNext(req.body.next), error: 'Email o password non corretti.', email });
    }
    req.session.regenerate(() => {
      req.session.userId = u.id;
      flash(req, 'success', `Bentornato, ${u.name.split(' ')[0]}!`);
      res.redirect(safeNext(req.body.next) || '/area-personale');
    });
  });

  app.get('/registrati', (req, res) => res.render('register', {
    title: 'Registrati', role: req.query.ruolo === 'professionista' ? 'professional' : 'client', error: null, v: {},
  }));

  app.post('/registrati', (req, res) => {
    const v = {
      name: str(req.body.name, 100), email: str(req.body.email, 200).toLowerCase(),
      company: str(req.body.company, 120), role: req.body.role === 'professional' ? 'professional' : 'client',
    };
    const pw = req.body.password || '';
    let error = null;
    if (v.name.length < 2) error = 'Inserisci nome e cognome.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) error = 'Email non valida.';
    else if (pw.length < 8) error = 'La password deve avere almeno 8 caratteri.';
    else if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(v.email)) error = 'Esiste già un account con questa email.';
    if (error) return res.status(400).render('register', { title: 'Registrati', role: v.role, error, v });

    const { lastInsertRowid: userId } = db.prepare(
      'INSERT INTO users (email, password_hash, name, role, company) VALUES (?, ?, ?, ?, ?)',
    ).run(v.email, bcrypt.hashSync(pw, 10), v.name, v.role, v.company || null);
    if (v.role === 'professional') {
      db.prepare(`INSERT INTO professionals (user_id, slug, avatar_color, published) VALUES (?, ?, ?, 0)`)
        .run(userId, M.uniqueSlug(db, v.name), COLORS[Number(userId) % COLORS.length]);
    }
    req.session.regenerate(() => {
      req.session.userId = Number(userId);
      if (v.role === 'professional') {
        flash(req, 'success', 'Account creato! Completa il profilo per comparire nei risultati di ricerca.');
        return res.redirect('/area-personale/profilo');
      }
      flash(req, 'success', 'Account creato! Ora puoi cercare professionisti e inviare richieste.');
      res.redirect('/cerca');
    });
  });

  app.post('/esci', (req, res) => req.session.destroy(() => res.redirect('/')));

  // ---------- Area personale ----------
  app.get('/area-personale', requireLogin, (req, res) => {
    if (req.user.role === 'admin') return res.redirect('/admin');
    if (req.user.role === 'professional') {
      const p = M.getByUserId(db, req.user.id);
      const requests = db.prepare(`
        SELECT r.*, u.name AS client_name, u.company AS client_company, u.email AS client_email
          FROM requests r JOIN users u ON u.id = r.client_id
         WHERE r.professional_id = ? ORDER BY r.created_at DESC`).all(p.id);
      const reviews = M.reviewsFor(db, p.id);
      return res.render('dashboard_pro', { title: 'Area personale', p, requests, reviews });
    }
    const requests = db.prepare(`
      SELECT r.*, u.name AS pro_name, p.slug AS pro_slug, p.headline AS pro_headline,
             (SELECT id FROM reviews WHERE request_id = r.id) AS review_id
        FROM requests r JOIN professionals p ON p.id = r.professional_id JOIN users u ON u.id = p.user_id
       WHERE r.client_id = ? ORDER BY r.created_at DESC`).all(req.user.id);
    const favorites = db.prepare(`SELECT professional_id FROM favorites WHERE user_id = ?`).all(req.user.id)
      .map((f) => M.getBySlug(db, db.prepare('SELECT slug FROM professionals WHERE id = ?').get(f.professional_id).slug));
    res.render('dashboard_client', { title: 'Area personale', requests, favorites });
  });

  app.get('/area-personale/profilo', requireRole('professional'), (req, res) => {
    const p = M.getByUserId(db, req.user.id);
    if (!p) return res.redirect('/area-personale');
    const selected = new Set(db.prepare('SELECT category_id FROM professional_categories WHERE professional_id = ?').all(p.id).map((r) => r.category_id));
    res.render('profile_edit', { title: 'Modifica profilo', p, categories: M.categoriesWithCounts(db), selected, services: M.servicesFor(db, p.id), errors: [] });
  });

  app.post('/area-personale/profilo', requireRole('professional'), (req, res) => {
    const p = M.getByUserId(db, req.user.id);
    const b = req.body;
    const data = {
      headline: str(b.headline, 140), bio: str(b.bio, 4000), city: str(b.city, 80),
      region: M.REGIONS.includes(b.region) ? b.region : '',
      mode: MODES[b.mode] ? b.mode : 'entrambi',
      price_from: int(b.price_from), price_unit: M.UNITS[b.price_unit] ? b.price_unit : 'giornata',
      service_types: [].concat(b.service_types || []).filter((t) => M.SERVICE_TYPES[t]).join(','),
      sectors: [].concat(b.sectors || []).filter((x) => M.SECTOR_BY_SLUG[x]).join(','),
      years_experience: int(b.years_experience) || 0,
      skills: cleanList(b.skills), languages: cleanList(b.languages) || 'Italiano',
      certifications: cleanList(b.certifications), website: url(b.website), linkedin: url(b.linkedin),
      vat_number: str(b.vat_number, 20), available: b.available ? 1 : 0, published: b.published ? 1 : 0,
    };
    const cats = [].concat(b.categories || []).map(Number).filter(Boolean);
    // Listino: righe con nome, prezzo e unità (le righe vuote vengono ignorate).
    const names = [].concat(b.svc_name || []);
    const prices = [].concat(b.svc_price || []);
    const units = [].concat(b.svc_unit || []);
    const services = names.map((n, i) => ({
      name: str(n, 120), price: int(prices[i]), unit: M.UNITS[units[i]] ? units[i] : 'pratica',
    })).filter((x) => x.name).slice(0, 10);
    const errors = [];
    if (data.published) {
      if (!data.service_types) errors.push('Indica se offri formazione, consulenza e/o pratiche.');
      if (data.headline.length < 5) errors.push('Il titolo professionale è obbligatorio per pubblicare il profilo.');
      if (data.bio.length < 40) errors.push('Scrivi una presentazione di almeno 40 caratteri.');
      if (!cats.length) errors.push('Seleziona almeno una categoria.');
      if (!data.city) errors.push('Indica la città.');
    }
    if (errors.length) {
      return res.status(400).render('profile_edit', {
        title: 'Modifica profilo', p: { ...p, ...data }, categories: M.categoriesWithCounts(db), selected: new Set(cats), services, errors,
      });
    }
    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE professionals SET headline=$headline, bio=$bio, city=$city, region=$region, mode=$mode,
                    price_from=$price_from, price_unit=$price_unit, years_experience=$years_experience,
                    service_types=$service_types, sectors=$sectors,
                    skills=$skills, languages=$languages, certifications=$certifications, website=$website,
                    linkedin=$linkedin, vat_number=$vat_number, available=$available, published=$published,
                    updated_at=datetime('now') WHERE id=$id`)
        .run(Object.fromEntries(Object.entries({ ...data, id: p.id }).map(([k, v]) => [`$${k}`, v])));
      db.prepare('DELETE FROM professional_categories WHERE professional_id = ?').run(p.id);
      const ins = db.prepare('INSERT OR IGNORE INTO professional_categories (professional_id, category_id) SELECT ?, id FROM categories WHERE id = ?');
      for (const c of cats) ins.run(p.id, c);
      db.prepare('DELETE FROM services WHERE professional_id = ?').run(p.id);
      const insS = db.prepare('INSERT INTO services (professional_id, position, name, price, unit) VALUES (?, ?, ?, ?, ?)');
      services.forEach((x, i) => insS.run(p.id, i, x.name, x.price, x.unit));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    flash(req, 'success', data.published ? 'Profilo salvato e pubblicato.' : 'Profilo salvato (non ancora pubblico).');
    res.redirect('/area-personale/profilo');
  });

  // ---------- Richieste di ingaggio ----------
  app.post('/professionisti/:slug/richiesta', requireLogin, (req, res) => {
    const p = M.getBySlug(db, req.params.slug);
    if (!p || !p.published) return res.status(404).render('error', { title: 'Non trovato', message: 'Profilo non disponibile.' });
    if (req.user.role !== 'client') {
      flash(req, 'error', 'Solo gli account committente possono inviare richieste di ingaggio.');
      return res.redirect(`/professionisti/${p.slug}`);
    }
    const title = str(req.body.title, 140);
    if (title.length < 3) {
      flash(req, 'error', "Indica l'oggetto della richiesta.");
      return res.redirect(`/professionisti/${p.slug}#richiesta`);
    }
    db.prepare(`INSERT INTO requests (client_id, professional_id, title, description, start_date, days, mode, location, budget)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, p.id, title, str(req.body.description, 3000), date(req.body.start_date),
        int(req.body.days), MODES[req.body.mode] ? req.body.mode : 'entrambi', str(req.body.location, 120), int(req.body.budget));
    flash(req, 'success', `Richiesta inviata a ${p.name}. Riceverai una risposta nella tua area personale.`);
    res.redirect('/area-personale');
  });

  app.post('/richieste/:id/stato', requireLogin, (req, res) => {
    const r = db.prepare(`SELECT r.*, p.user_id AS pro_user_id FROM requests r JOIN professionals p ON p.id = r.professional_id WHERE r.id = ?`).get(req.params.id);
    if (!r) return res.status(404).render('error', { title: 'Non trovato', message: 'Richiesta inesistente.' });
    const isPro = r.pro_user_id === req.user.id;
    const isClient = r.client_id === req.user.id;
    const to = req.body.status;
    // Macchina a stati: chi può portare la richiesta in quale stato.
    const allowed =
      (isPro && r.status === 'in_attesa' && ['accettata', 'rifiutata'].includes(to)) ||
      ((isPro || isClient) && r.status === 'accettata' && to === 'completata') ||
      (isClient && ['in_attesa', 'accettata'].includes(r.status) && to === 'annullata');
    if (!allowed) {
      flash(req, 'error', 'Operazione non consentita.');
      return res.redirect('/area-personale');
    }
    db.prepare(`UPDATE requests SET status = ?, response_note = COALESCE(NULLIF(?, ''), response_note), updated_at = datetime('now') WHERE id = ?`)
      .run(to, str(req.body.note, 1000), r.id);
    flash(req, 'success', `Richiesta aggiornata: ${STATUS[to]}.`);
    res.redirect('/area-personale');
  });

  // ---------- Recensioni (solo dopo ingaggio completato) ----------
  const reviewable = (req) => db.prepare(`
      SELECT r.*, u.name AS pro_name, p.slug AS pro_slug FROM requests r
        JOIN professionals p ON p.id = r.professional_id JOIN users u ON u.id = p.user_id
       WHERE r.id = ? AND r.client_id = ? AND r.status = 'completata'
         AND NOT EXISTS (SELECT 1 FROM reviews WHERE request_id = r.id)`).get(req.params.id, req.user.id);

  app.get('/richieste/:id/recensione', requireRole('client'), (req, res) => {
    const r = reviewable(req);
    if (!r) return res.status(404).render('error', { title: 'Non disponibile', message: 'Puoi recensire solo ingaggi completati e non ancora valutati.' });
    res.render('review_new', { title: 'Lascia una recensione', r, error: null, v: {} });
  });

  app.post('/richieste/:id/recensione', requireRole('client'), (req, res) => {
    const r = reviewable(req);
    if (!r) return res.status(404).render('error', { title: 'Non disponibile', message: 'Puoi recensire solo ingaggi completati e non ancora valutati.' });
    const v = {};
    for (const c of M.CRITERIA) v[c.key] = int(req.body[c.key]);
    v.title = str(req.body.title, 120); v.pros = str(req.body.pros, 2000); v.cons = str(req.body.cons, 2000);
    v.would_rehire = req.body.would_rehire === '0' ? 0 : 1;
    if (M.CRITERIA.some((c) => !(v[c.key] >= 1 && v[c.key] <= 5))) {
      return res.status(400).render('review_new', { title: 'Lascia una recensione', r, error: 'Assegna da 1 a 5 stelle a ogni criterio.', v });
    }
    if (v.pros.length + v.cons.length < 20) {
      return res.status(400).render('review_new', { title: 'Lascia una recensione', r, error: 'Racconta la tua esperienza (almeno 20 caratteri).', v });
    }
    db.prepare(`INSERT INTO reviews (request_id, professional_id, client_id, competenza, comunicazione, puntualita,
                  qualita_prezzo, professionalita, overall, title, pros, cons, would_rehire)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(r.id, r.professional_id, req.user.id, v.competenza, v.comunicazione, v.puntualita, v.qualita_prezzo,
        v.professionalita, M.computeOverall(v), v.title, v.pros, v.cons, v.would_rehire);
    flash(req, 'success', 'Grazie! La tua recensione è stata pubblicata.');
    res.redirect(`/professionisti/${r.pro_slug}#recensioni`);
  });

  app.post('/recensioni/:id/risposta', requireRole('professional'), (req, res) => {
    const rv = db.prepare(`SELECT rv.id, p.slug FROM reviews rv JOIN professionals p ON p.id = rv.professional_id
                            WHERE rv.id = ? AND p.user_id = ?`).get(req.params.id, req.user.id);
    if (!rv) return res.status(404).render('error', { title: 'Non trovato', message: 'Recensione non trovata.' });
    db.prepare('UPDATE reviews SET reply = ? WHERE id = ?').run(str(req.body.reply, 1500), rv.id);
    flash(req, 'success', 'Risposta pubblicata.');
    res.redirect(`/professionisti/${rv.slug}#recensioni`);
  });

  // ---------- Preferiti ----------
  app.post('/preferiti/:id', requireLogin, (req, res) => {
    const id = int(req.params.id);
    const exists = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND professional_id = ?').get(req.user.id, id);
    if (exists) db.prepare('DELETE FROM favorites WHERE user_id = ? AND professional_id = ?').run(req.user.id, id);
    else if (db.prepare('SELECT 1 FROM professionals WHERE id = ?').get(id)) {
      db.prepare('INSERT INTO favorites (user_id, professional_id) VALUES (?, ?)').run(req.user.id, id);
    }
    res.redirect(safeNext(req.body.back) || '/area-personale');
  });

  // ---------- Amministrazione ----------
  app.get('/admin', requireRole('admin'), (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).end();
    res.render('admin', {
      title: 'Amministrazione',
      pros: M.search(db, {}).total,
      professionals: db.prepare(`SELECT p.id, p.slug, p.verified, p.published, p.headline, u.name, u.email, p.created_at
                                   FROM professionals p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC`).all(),
      reviews: db.prepare(`SELECT rv.*, u.name AS client_name, pu.name AS pro_name FROM reviews rv
                             JOIN users u ON u.id = rv.client_id JOIN professionals p ON p.id = rv.professional_id
                             JOIN users pu ON pu.id = p.user_id ORDER BY rv.created_at DESC LIMIT 50`).all(),
    });
  });

  app.post('/admin/professionisti/:id/verifica', requireRole('admin'), (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).end();
    db.prepare('UPDATE professionals SET verified = 1 - verified WHERE id = ?').run(int(req.params.id));
    res.redirect('/admin');
  });

  app.post('/admin/recensioni/:id/visibilita', requireRole('admin'), (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).end();
    db.prepare('UPDATE reviews SET hidden = 1 - hidden WHERE id = ?').run(int(req.params.id));
    res.redirect('/admin');
  });

  app.get('/come-funziona', (req, res) => res.render('how', { title: 'Come funziona' }));

  app.use((req, res) => res.status(404).render('error', { title: 'Pagina non trovata', message: 'La pagina che cerchi non esiste.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', { title: 'Errore', message: 'Si è verificato un errore imprevisto.' });
  });

  return app;
}

// ---------- Helper ----------
function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function int(v) { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; }
function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
function date(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
function url(v) { const s = str(v, 300); return /^https?:\/\/[^\s]+$/i.test(s) ? s : ''; }
function cleanList(v) { return M.splitList(str(v, 1000)).slice(0, 30).join(', '); }
function safeNext(v) { return typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : ''; }
function stars(value) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const full = Math.floor(v);
  const half = v - full >= 0.5 ? 1 : 0;
  return { full, half, empty: 5 - full - half };
}
function fmtEuro(n) { return n == null ? '—' : `€ ${Number(n).toLocaleString('it-IT')}`; }
function fmtPrice(price, unit) {
  if (unit === 'preventivo' || price == null) return 'Su preventivo';
  if (price === 0) return 'Gratuito';
  return `${fmtEuro(price)} / ${M.UNITS[unit] || unit}`;
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : `${s.replace(' ', 'T')}Z`);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

module.exports = { createApp };
