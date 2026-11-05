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
  const res = await request(app).get('/cerca?q=patentino');
  assert.match(res.text, /Luca Bianchi/);
  assert.doesNotMatch(res.text, /Giulia Ferraro/);
});

test('filtri di ricerca: categoria, modalità, rating minimo, ordinamento', () => {
  const r = M.search(db, { category: 'finanza-agevolata' });
  assert.ok(r.total >= 3);
  const pratiche = M.search(db, { type: 'pratiche' }).results;
  assert.ok(pratiche.length && pratiche.every((p) => p.serviceTypeList.includes('pratiche')));
  const api = M.search(db, { sector: 'apicoltura' }).results;
  assert.ok(api.some((p) => p.name === 'Nicola Ferri'));
  assert.ok(api.every((p) => p.sectorList.some((x) => x.slug === 'apicoltura')));
  assert.ok(M.search(db, { mode: 'remoto' }).results.every((p) => p.mode !== 'presenza'));
  assert.ok(M.search(db, { minRating: 4.5 }).results.every((p) => p.avg_rating >= 4.5));
  const exp = M.search(db, { sort: 'esperienza' }).results;
  assert.ok(exp[0].years_experience >= exp[1].years_experience);
});

test('profilo pubblico con riepilogo valutazioni', async () => {
  const res = await request(app).get('/professionisti/giulia-ferraro');
  assert.equal(res.status, 200);
  assert.match(res.text, /Valutazioni delle aziende/);
  assert.match(res.text, /Puntualità/);
  assert.match(res.text, /Servizi e listino/);
  assert.match(res.text, /Domanda di sostegno CSR/);
  assert.equal((await request(app).get('/professionisti/inesistente')).status, 404);
});

test('POST senza CSRF viene rifiutato', async () => {
  const res = await request(app).post('/accedi').type('form').send({ email: 'x', password: 'y' });
  assert.equal(res.status, 403);
});

test('flusso completo: richiesta → proposta → date spostate e confermate → completamento → recensione', async () => {
  const client = await agentLoggedAs('laura@lequerce.it');
  let res = await client.agent.post('/professionisti/martina-de-luca/richiesta').type('form')
    .send({ _csrf: client.csrf, title: 'Corso HACCP per 3 dipendenti', days: '2', mode: 'remoto' });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/richieste\/\d+$/);
  const reqRow = db.prepare("SELECT id, status FROM requests WHERE title = 'Corso HACCP per 3 dipendenti'").get();
  assert.equal(reqRow.status, 'in_attesa');

  const st = () => db.prepare('SELECT status FROM requests WHERE id = ?').get(reqRow.id).status;
  const sessions = () => db.prepare('SELECT * FROM request_sessions WHERE request_id = ? ORDER BY id').all(reqRow.id);
  const url = `/richieste/${reqRow.id}`;

  // La pagina della richiesta è visibile solo alle due parti.
  assert.equal((await client.agent.get(url)).status, 200);
  const other = await agentLoggedAs('giorgio@cantinasanmarco.it');
  assert.equal((await other.agent.get(url)).status, 404);
  await other.agent.post(`${url}/messaggi`).type('form').send({ _csrf: other.csrf, body: 'intruso' });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM request_messages WHERE body = 'intruso'").get().n, 0);

  // L'azienda non può inviare la proposta al posto del professionista, né recensire prima della fine.
  await client.agent.post(`${url}/proposta`).type('form').send({ _csrf: client.csrf, proposal_price: '1' });
  assert.equal(st(), 'in_attesa');
  assert.equal((await client.agent.get(`${url}/recensione`)).status, 404);

  // Il professionista propone prezzo e 2 giornate.
  const pro = await agentLoggedAs('martina.de-luca@esempio.it');
  await pro.agent.post(`${url}/proposta`).type('form').send({
    _csrf: pro.csrf, proposal_price: '90', proposal_unit: 'partecipante', proposal_note: 'Corso con attestato',
    sess_date: ['2025-03-04', '2025-03-05', ''], sess_start: ['09:00', '09:00', ''], sess_end: ['13:00', '13:00', ''], sess_location: ['Online', 'Online', ''],
  });
  assert.equal(st(), 'proposta');
  assert.equal(sessions().length, 2);
  assert.ok(sessions().every((x) => x.status === 'da_confermare' && x.proposed_by === 'pro'));

  // L'azienda accetta: incarico confermato, giornate confermate.
  await client.agent.post(`${url}/accetta`).type('form').send({ _csrf: client.csrf });
  assert.equal(st(), 'confermata');
  assert.ok(sessions().every((x) => x.status === 'confermata'));

  // L'azienda sposta la seconda giornata: torna da confermare e non può confermarla da sola.
  const second = sessions()[1];
  await client.agent.post(`${url}/giornate/${second.id}/sposta`).type('form')
    .send({ _csrf: client.csrf, sess_date: '2025-03-07', sess_start: '14:00', sess_end: '18:00' });
  let moved = sessions()[1];
  assert.deepEqual([moved.date, moved.start_time, moved.status, moved.proposed_by, moved.location], ['2025-03-07', '14:00', 'da_confermare', 'client', 'Online']);
  await client.agent.post(`${url}/giornate/${second.id}/conferma`).type('form').send({ _csrf: client.csrf });
  assert.equal(sessions()[1].status, 'da_confermare');

  // Non si può chiudere con giornate aperte.
  await pro.agent.post(`${url}/completa`).type('form').send({ _csrf: pro.csrf });
  assert.equal(st(), 'confermata');

  // Il professionista conferma la nuova data e segna le giornate svolte; l'azienda non può segnarle.
  await pro.agent.post(`${url}/giornate/${second.id}/conferma`).type('form').send({ _csrf: pro.csrf });
  assert.equal(sessions()[1].status, 'confermata');
  await client.agent.post(`${url}/giornate/${second.id}/svolta`).type('form').send({ _csrf: client.csrf });
  assert.equal(sessions()[1].status, 'confermata');
  for (const x of sessions()) await pro.agent.post(`${url}/giornate/${x.id}/svolta`).type('form').send({ _csrf: pro.csrf });
  assert.ok(sessions().every((x) => x.status === 'svolta'));

  // Una giornata futura non si può segnare come svolta.
  await pro.agent.post(`${url}/giornate`).type('form').send({ _csrf: pro.csrf, sess_date: '2099-01-10' });
  const future = sessions().at(-1);
  await client.agent.post(`${url}/giornate/${future.id}/conferma`).type('form').send({ _csrf: client.csrf });
  await pro.agent.post(`${url}/giornate/${future.id}/svolta`).type('form').send({ _csrf: pro.csrf });
  assert.equal(sessions().at(-1).status, 'confermata');
  await client.agent.post(`${url}/giornate/${future.id}/annulla`).type('form').send({ _csrf: client.csrf });
  assert.equal(sessions().at(-1).status, 'annullata');

  // Calendario esportabile e conversazione con messaggi ed eventi.
  const ics = await client.agent.get(`${url}/calendario.ics`);
  assert.match(ics.headers['content-type'], /text\/calendar/);
  await client.agent.post(`${url}/messaggi`).type('form').send({ _csrf: client.csrf, body: 'Grazie, tutto chiaro!' });
  const page = await pro.agent.get(url);
  assert.match(page.text, /Grazie, tutto chiaro!/);
  assert.match(page.text, /propone di spostare la giornata/);

  await pro.agent.post(`${url}/completa`).type('form').send({ _csrf: pro.csrf });
  assert.equal(st(), 'completata');

  const before = M.getBySlug(db, 'martina-de-luca').review_count;
  res = await client.agent.post(`/richieste/${reqRow.id}/recensione`).type('form').send({
    _csrf: client.csrf, competenza: '5', comunicazione: '5', puntualita: '4', qualita_prezzo: '5', professionalita: '5',
    title: 'Top', pros: 'Corso pratico e molto chiaro per tutto il laboratorio', cons: '', would_rehire: '1',
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

test('il professionista salva tipi di servizio, filiere e listino', async () => {
  const pro = await agentLoggedAs('nicola.ferri@esempio.it');
  const res = await pro.agent.post('/area-personale/profilo').type('form').send({
    _csrf: pro.csrf, headline: 'Consulente apicoltura e filiera del miele', city: 'Macerata', region: 'Marche',
    bio: 'Seguo apicoltori professionisti e hobbisti in tutte le fasi, dall’apiario alla vendita del miele.',
    categories: String(db.prepare("SELECT id FROM categories WHERE slug = 'zootecnia'").get().id),
    service_types: ['consulenza', 'formazione', 'inventato'], sectors: ['apicoltura', 'agriturismo'],
    price_from: '200', price_unit: 'giornata', published: '1',
    svc_name: ['Corso base', '', 'Visita in apiario'], svc_price: ['150', '', '200'], svc_unit: ['partecipante', 'pratica', 'giornata'],
  });
  assert.equal(res.status, 302);
  const p = M.getBySlug(db, 'nicola-ferri');
  assert.deepEqual(p.serviceTypeList, ['consulenza', 'formazione']);
  assert.deepEqual(p.sectorList.map((x) => x.slug), ['apicoltura', 'agriturismo']);
  assert.deepEqual(M.servicesFor(db, p.id).map((s) => [s.name, s.price, s.unit]),
    [['Corso base', 150, 'partecipante'], ['Visita in apiario', 200, 'giornata']]);
});

test('la proposta suggerisce giorni feriali consecutivi dalla data richiesta', () => {
  const R = require('../src/requests');
  // venerdì 6 marzo 2026 → ven, lun, mar
  assert.deepEqual(R.suggestDates('2026-03-06', 3), ['2026-03-06', '2026-03-09', '2026-03-10']);
  assert.deepEqual(R.suggestDates(null, 3), []);
});

test('area personale: promemoria delle azioni da fare', async () => {
  const pro = await agentLoggedAs('sara.lombardi@esempio.it');
  const dash = await pro.agent.get('/area-personale');
  assert.match(dash.text, /Conferma le nuove date/);
  assert.match(dash.text, /Prossime giornate/);
  const client = await agentLoggedAs('laura@lequerce.it');
  assert.match((await client.agent.get('/area-personale')).text, /Valuta la proposta/);
});
