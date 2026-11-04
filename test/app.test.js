'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { open } = require('../src/db');
const { seed } = require('../src/seed');
const { createApp } = require('../src/app');
const M = require('../src/model');

let db; let app;
before(() => { db = open(':memory:'); seed(db); app = createApp(db, { sessionSecret: 'test' }); });

// Agente con sessione + token CSRF letto dalla pagina.
async function agentLoggedAs(email) {
  const agent = request.agent(app);
  const page = await agent.get('/accedi');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const res = await agent.post('/accedi').type('form').send({ _csrf: csrf, email, password: 'password123' });
  assert.equal(res.status, 302);
  // La sessione viene rigenerata al login: serve il nuovo token.
  const after = await agent.get('/area-personale');
  return { agent, csrf: after.text.match(/name="_csrf" value="([^"]+)"/)[1] };
}

test('home e ricerca rispondono con i professionisti', async () => {
  const home = await request(app).get('/');
  assert.equal(home.status, 200);
  assert.match(home.text, /I più apprezzati/);
  const res = await request(app).get('/cerca?q=GDPR');
  assert.match(res.text, /Davide Romano/);
  assert.doesNotMatch(res.text, /Giulia Ferraro/);
});

test('filtri di ricerca: categoria, modalità, rating minimo, ordinamento', () => {
  const r = M.search(db, { category: 'sicurezza-lavoro' });
  assert.ok(r.total >= 2);
  assert.ok(M.search(db, { mode: 'remoto' }).results.every((p) => p.mode !== 'presenza'));
  assert.ok(M.search(db, { minRating: 4.5 }).results.every((p) => p.avg_rating >= 4.5));
  const cheap = M.search(db, { sort: 'prezzo_asc' }).results;
  assert.ok(cheap[0].daily_rate <= cheap[1].daily_rate);
});

test('profilo pubblico con riepilogo valutazioni', async () => {
  const res = await request(app).get('/professionisti/giulia-ferraro');
  assert.equal(res.status, 200);
  assert.match(res.text, /Valutazioni dei committenti/);
  assert.match(res.text, /Puntualità/);
  assert.equal((await request(app).get('/professionisti/inesistente')).status, 404);
});

test('POST senza CSRF viene rifiutato', async () => {
  const res = await request(app).post('/accedi').type('form').send({ email: 'x', password: 'y' });
  assert.equal(res.status, 403);
});

test('flusso completo: richiesta → accettazione → completamento → recensione', async () => {
  const client = await agentLoggedAs('laura@acme-spa.it');
  let res = await client.agent.post('/professionisti/martina-de-luca/richiesta').type('form')
    .send({ _csrf: client.csrf, title: 'Corso Excel avanzato', days: '2', mode: 'remoto' });
  assert.equal(res.status, 302);
  const reqRow = db.prepare("SELECT id, status FROM requests WHERE title = 'Corso Excel avanzato'").get();
  assert.equal(reqRow.status, 'in_attesa');

  // Il committente non può accettare la propria richiesta.
  await client.agent.post(`/richieste/${reqRow.id}/stato`).type('form').send({ _csrf: client.csrf, status: 'accettata' });
  assert.equal(db.prepare('SELECT status FROM requests WHERE id = ?').get(reqRow.id).status, 'in_attesa');

  // Recensione non ancora possibile.
  res = await client.agent.get(`/richieste/${reqRow.id}/recensione`);
  assert.equal(res.status, 404);

  const pro = await agentLoggedAs('martina.de-luca@esempio.it');
  await pro.agent.post(`/richieste/${reqRow.id}/stato`).type('form').send({ _csrf: pro.csrf, status: 'accettata' });
  await pro.agent.post(`/richieste/${reqRow.id}/stato`).type('form').send({ _csrf: pro.csrf, status: 'completata' });
  assert.equal(db.prepare('SELECT status FROM requests WHERE id = ?').get(reqRow.id).status, 'completata');

  const before = M.getBySlug(db, 'martina-de-luca').review_count;
  res = await client.agent.post(`/richieste/${reqRow.id}/recensione`).type('form').send({
    _csrf: client.csrf, competenza: '5', comunicazione: '5', puntualita: '4', qualita_prezzo: '5', professionalita: '5',
    title: 'Top', pros: 'Corso pratico e molto chiaro per tutto il team', cons: '', would_rehire: '1',
  });
  assert.equal(res.status, 302);
  const after = M.getBySlug(db, 'martina-de-luca');
  assert.equal(after.review_count, before + 1);
  const rv = db.prepare('SELECT overall FROM reviews WHERE request_id = ?').get(reqRow.id);
  assert.equal(rv.overall, 4.8);

  // Seconda recensione sullo stesso ingaggio non consentita.
  res = await client.agent.post(`/richieste/${reqRow.id}/recensione`).type('form').send({
    _csrf: client.csrf, competenza: '1', comunicazione: '1', puntualita: '1', qualita_prezzo: '1', professionalita: '1', pros: 'xxxxxxxxxxxxxxxxxxxxxxxx',
  });
  assert.equal(res.status, 404);
});

test('registrazione professionista crea profilo in bozza non visibile', async () => {
  const agent = request.agent(app);
  const page = await agent.get('/registrati');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const res = await agent.post('/registrati').type('form')
    .send({ _csrf: csrf, name: 'Nuovo Formatore', email: 'nuovo@esempio.it', password: 'segretissima', role: 'professional' });
  assert.equal(res.headers.location, '/area-personale/profilo');
  assert.equal(M.search(db, { q: 'Nuovo Formatore' }).total, 0);
  const edit = await agent.get('/area-personale/profilo');
  assert.equal(edit.status, 200);
});

test('media bayesiana nel ranking "consigliati"', () => {
  const [first] = M.search(db, { sort: 'consigliati' }).results;
  assert.ok(first.review_count >= 3);
});
