'use strict';
// Query di dominio: ricerca, profili, rating aggregati.

const CRITERIA = [
  { key: 'competenza', label: 'Competenza' },
  { key: 'comunicazione', label: 'Comunicazione' },
  { key: 'puntualita', label: 'Puntualità' },
  { key: 'qualita_prezzo', label: 'Qualità/prezzo' },
  { key: 'professionalita', label: 'Professionalità' },
];

const REGIONS = [
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia',
  'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna',
  'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
];

// Media "bayesiana": evita che 1 recensione da 5 stelle superi 40 recensioni da 4,8.
const PRIOR_MEAN = 4.0;
const PRIOR_WEIGHT = 3;

function ratingLabel(avg) {
  if (avg == null) return 'Nuovo';
  if (avg >= 4.75) return 'Eccezionale';
  if (avg >= 4.5) return 'Eccellente';
  if (avg >= 4.0) return 'Ottimo';
  if (avg >= 3.5) return 'Buono';
  if (avg >= 3.0) return 'Discreto';
  return 'Sufficiente';
}

const STATS_SQL = `
  SELECT professional_id,
         COUNT(*)                AS review_count,
         AVG(overall)            AS avg_rating,
         AVG(competenza)         AS avg_competenza,
         AVG(comunicazione)      AS avg_comunicazione,
         AVG(puntualita)         AS avg_puntualita,
         AVG(qualita_prezzo)     AS avg_qualita_prezzo,
         AVG(professionalita)    AS avg_professionalita,
         AVG(would_rehire) * 100 AS rehire_pct
    FROM reviews WHERE hidden = 0 GROUP BY professional_id`;

const BASE_SELECT = `
  SELECT p.*, u.name, u.email,
         COALESCE(s.review_count, 0) AS review_count,
         s.avg_rating, s.rehire_pct,
         s.avg_competenza, s.avg_comunicazione, s.avg_puntualita,
         s.avg_qualita_prezzo, s.avg_professionalita,
         (COALESCE(s.review_count,0) * COALESCE(s.avg_rating,0) + ${PRIOR_WEIGHT} * ${PRIOR_MEAN})
           / (COALESCE(s.review_count,0) + ${PRIOR_WEIGHT}) AS score,
         (SELECT GROUP_CONCAT(c.name, '|') FROM professional_categories pc
            JOIN categories c ON c.id = pc.category_id WHERE pc.professional_id = p.id) AS category_names
    FROM professionals p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (${STATS_SQL}) s ON s.professional_id = p.id`;

function decorate(p) {
  if (!p) return p;
  const out = { ...p };
  out.categories = out.category_names ? out.category_names.split('|') : [];
  out.skillList = splitList(out.skills);
  out.languageList = splitList(out.languages);
  out.certificationList = splitList(out.certifications);
  out.rating = out.avg_rating == null ? null : Math.round(out.avg_rating * 10) / 10;
  out.ratingLabel = ratingLabel(out.rating);
  out.initials = initials(out.name);
  return out;
}

function splitList(s) {
  return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

const SORTS = {
  consigliati: 'score DESC, review_count DESC',
  valutazione: 'COALESCE(avg_rating,0) DESC, review_count DESC',
  recensioni: 'review_count DESC, score DESC',
  prezzo_asc: 'daily_rate IS NULL, daily_rate ASC',
  prezzo_desc: 'daily_rate DESC',
  esperienza: 'years_experience DESC',
};

function search(db, f = {}) {
  const where = ['p.published = 1'];
  const params = {};
  if (f.q) {
    where.push(`(u.name LIKE $q OR p.headline LIKE $q OR p.skills LIKE $q OR p.bio LIKE $q OR p.certifications LIKE $q)`);
    params.$q = `%${f.q}%`;
  }
  if (f.category) {
    where.push(`EXISTS (SELECT 1 FROM professional_categories pc JOIN categories c ON c.id = pc.category_id
                         WHERE pc.professional_id = p.id AND c.slug = $category)`);
    params.$category = f.category;
  }
  if (f.where) {
    where.push('(p.city LIKE $where OR p.region LIKE $where)');
    params.$where = `%${f.where}%`;
  }
  if (f.mode === 'remoto') where.push(`p.mode IN ('remoto','entrambi')`);
  if (f.mode === 'presenza') where.push(`p.mode IN ('presenza','entrambi')`);
  if (f.maxRate) { where.push('p.daily_rate <= $maxRate'); params.$maxRate = Number(f.maxRate); }
  if (f.minRating) { where.push('s.avg_rating >= $minRating'); params.$minRating = Number(f.minRating); }
  if (f.verified) where.push('p.verified = 1');
  if (f.available) where.push('p.available = 1');

  const sql = `${BASE_SELECT} WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM (${sql})`).get(params).n;
  const order = SORTS[f.sort] || SORTS.consigliati;
  const perPage = 10;
  const page = Math.max(1, parseInt(f.page, 10) || 1);
  const rows = db.prepare(`SELECT * FROM (${sql}) ORDER BY ${order} LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`).all(params);
  return { total, page, pages: Math.max(1, Math.ceil(total / perPage)), results: rows.map(decorate) };
}

function getBySlug(db, slug) {
  return decorate(db.prepare(`${BASE_SELECT} WHERE p.slug = ?`).get(slug));
}

function getByUserId(db, userId) {
  return decorate(db.prepare(`${BASE_SELECT} WHERE p.user_id = ?`).get(userId));
}

function topRated(db, limit = 6) {
  return db.prepare(`${BASE_SELECT} WHERE p.published = 1 AND COALESCE(s.review_count,0) > 0
                     ORDER BY score DESC LIMIT ?`).all(limit).map(decorate);
}

function reviewsFor(db, professionalId) {
  return db.prepare(`
    SELECT r.*, u.name AS client_name, u.company AS client_company, rq.title AS request_title
      FROM reviews r JOIN users u ON u.id = r.client_id
      LEFT JOIN requests rq ON rq.id = r.request_id
     WHERE r.professional_id = ? AND r.hidden = 0
     ORDER BY r.created_at DESC`).all(professionalId);
}

function ratingDistribution(db, professionalId) {
  const rows = db.prepare(`SELECT CAST(ROUND(overall) AS INTEGER) AS star, COUNT(*) AS n
                             FROM reviews WHERE professional_id = ? AND hidden = 0 GROUP BY star`).all(professionalId);
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of rows) dist[r.star] = r.n;
  return dist;
}

function categoriesWithCounts(db) {
  return db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM professional_categories pc JOIN professionals p ON p.id = pc.professional_id
                  WHERE pc.category_id = c.id AND p.published = 1) AS count
      FROM categories c ORDER BY c.name`).all();
}

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'profilo';
}

function uniqueSlug(db, base) {
  let slug = slugify(base);
  let i = 1;
  while (db.prepare('SELECT 1 FROM professionals WHERE slug = ?').get(slug)) slug = `${slugify(base)}-${++i}`;
  return slug;
}

function computeOverall(r) {
  const sum = CRITERIA.reduce((acc, c) => acc + Number(r[c.key]), 0);
  return Math.round((sum / CRITERIA.length) * 100) / 100;
}

module.exports = {
  CRITERIA, REGIONS, SORTS, ratingLabel, search, getBySlug, getByUserId, topRated, reviewsFor,
  ratingDistribution, categoriesWithCounts, slugify, uniqueSlug, computeOverall, splitList, initials,
};
