'use strict';
// Gestione della richiesta: proposta con prezzo e giornate, date spostabili da entrambe le parti
// (chi propone una data la propone, l'altra parte la conferma), messaggi, avanzamento, calendario.

const OPEN = ['in_attesa', 'proposta', 'confermata'];
const DATES_EDITABLE = ['proposta', 'confermata'];
const SESSION_STATUS = {
  da_confermare: 'Da confermare', confermata: 'Confermata', svolta: 'Svolta', annullata: 'Annullata',
};
const MAX_SESSIONS = 30;

function time(v) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : ''; }
function today() { return new Date().toISOString().slice(0, 10); }

function load(db, id) {
  return db.prepare(`
    SELECT r.*, p.user_id AS pro_user_id, p.slug AS pro_slug, p.headline AS pro_headline,
           pu.name AS pro_name, pu.email AS pro_email,
           cu.name AS client_name, cu.company AS client_company, cu.email AS client_email,
           (SELECT id FROM reviews WHERE request_id = r.id) AS review_id
      FROM requests r
      JOIN professionals p ON p.id = r.professional_id
      JOIN users pu ON pu.id = p.user_id
      JOIN users cu ON cu.id = r.client_id
     WHERE r.id = ?`).get(id);
}

function sideOf(r, user) {
  if (!r || !user) return null;
  if (r.pro_user_id === user.id) return 'pro';
  if (r.client_id === user.id) return 'client';
  if (user.role === 'admin') return 'admin';
  return null;
}

function sessionsOf(db, requestId) {
  return db.prepare(`SELECT * FROM request_sessions WHERE request_id = ?
                     ORDER BY status = 'annullata', date, start_time, id`).all(requestId);
}

function messagesOf(db, requestId) {
  return db.prepare(`SELECT m.*, u.name AS author FROM request_messages m LEFT JOIN users u ON u.id = m.user_id
                     WHERE m.request_id = ? ORDER BY m.created_at, m.id`).all(requestId);
}

function logEvent(db, requestId, userId, body) {
  db.prepare("INSERT INTO request_messages (request_id, user_id, kind, body) VALUES (?, ?, 'event', ?)").run(requestId, userId, body);
  db.prepare("UPDATE requests SET updated_at = datetime('now') WHERE id = ?").run(requestId);
}

function progress(sessions) {
  const active = sessions.filter((s) => s.status !== 'annullata');
  const done = active.filter((s) => s.status === 'svolta').length;
  const pending = active.filter((s) => s.status === 'da_confermare');
  const next = active.filter((s) => s.status !== 'svolta' && s.date >= today())[0] || null;
  return { total: active.length, done, pending, next, pct: active.length ? Math.round((done / active.length) * 100) : 0 };
}

// Cosa deve fare adesso questa parte? Serve per i promemoria in area personale.
function actionFor(r, side, sessions) {
  const waitingMe = sessions.some((s) => s.status === 'da_confermare' && s.proposed_by !== side);
  if (side === 'pro') {
    if (r.status === 'in_attesa') return 'Invia una proposta';
    if (DATES_EDITABLE.includes(r.status) && waitingMe) return 'Conferma le nuove date';
    if (r.status === 'confermata' && sessions.some((s) => s.status === 'confermata' && s.date < today())) return 'Segna le giornate svolte';
  }
  if (side === 'client') {
    if (r.status === 'proposta') return 'Valuta la proposta';
    if (r.status === 'confermata' && waitingMe) return 'Conferma le nuove date';
    if (r.status === 'completata' && !r.review_id) return 'Lascia una recensione';
  }
  return null;
}

// Riepilogo per le liste in area personale: avanzamento, prossima data, azione richiesta.
// Ordine: prima ciò che aspetta questa parte, poi gli incarichi aperti, poi i chiusi (più recenti prima).
function summarize(db, requests, side) {
  const rank = (r) => (r.action ? 0 : OPEN.includes(r.status) ? 1 : 2);
  return requests.map((r) => {
    const sessions = sessionsOf(db, r.id);
    return { ...r, progress: progress(sessions), action: actionFor(r, side, sessions) };
  }).sort((a, b) => rank(a) - rank(b) || (b.updated_at > a.updated_at ? 1 : b.updated_at < a.updated_at ? -1 : 0));
}

function agendaFor(db, user) {
  const col = user.role === 'professional' ? 'p.user_id' : 'r.client_id';
  return db.prepare(`
    SELECT s.*, r.title, r.id AS request_id, pu.name AS pro_name, cu.name AS client_name, cu.company AS client_company
      FROM request_sessions s JOIN requests r ON r.id = s.request_id
      JOIN professionals p ON p.id = r.professional_id JOIN users pu ON pu.id = p.user_id JOIN users cu ON cu.id = r.client_id
     WHERE ${col} = ? AND r.status IN ('proposta','confermata') AND s.status IN ('da_confermare','confermata') AND s.date >= ?
     ORDER BY s.date, s.start_time LIMIT 8`).all(user.id, today());
}

function describeSession(s, fmtDay) {
  const t = s.start_time ? ` ${s.start_time}${s.end_time ? '–' + s.end_time : ''}` : '';
  return `${fmtDay(s.date)}${t}`;
}

function readSessionRows(body, h) {
  const arr = (k) => [].concat(body[k] ?? []);
  const dates = arr('sess_date'); const starts = arr('sess_start'); const ends = arr('sess_end'); const locs = arr('sess_location');
  return dates.map((d, i) => ({ date: h.date(d), start_time: time(starts[i]), end_time: time(ends[i]), location: h.str(locs[i], 120) }))
    .filter((s) => s.date).slice(0, MAX_SESSIONS);
}

// Suggerisce N giorni feriali consecutivi a partire dalla data richiesta.
function suggestDates(start, n) {
  const out = [];
  if (!start || !n) return out;
  const d = new Date(`${start}T12:00:00Z`);
  while (out.length < Math.min(n, MAX_SESSIONS)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function icsEscape(s) { return String(s || '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n'); }

function register(app, db, h) {
  const { requireLogin, flash, str, int, UNITS, fmtDay } = h;
  const back = (r) => `/richieste/${r.id}`;
  const deny = (res) => res.status(404).render('error', { title: 'Richiesta non trovata', message: 'La richiesta non esiste o non è tua.' });

  // Carica la richiesta e verifica che l'utente sia una delle due parti.
  const withRequest = (sides) => (req, res, next) => {
    const r = load(db, req.params.id);
    const side = sideOf(r, req.user);
    if (!r || !side || (sides && !sides.includes(side))) return deny(res);
    req.r = r; req.side = side;
    next();
  };
  const fail = (req, res, text) => { flash(req, 'error', text); res.redirect(back(req.r)); };
  const ok = (req, res, text, hash = '') => { flash(req, 'success', text); res.redirect(back(req.r) + hash); };
  const me = (req) => req.user.name.split(' ')[0];

  app.get('/richieste/:id', requireLogin, withRequest(), (req, res) => {
    const { r, side } = req;
    const sessions = sessionsOf(db, r.id);
    const prog = progress(sessions);
    const draftDates = sessions.length ? [] : suggestDates(r.start_date, r.days);
    res.render('request', {
      title: r.title, r, side, sessions, prog, messages: messagesOf(db, r.id), SESSION_STATUS,
      action: actionFor(r, side, sessions), draftDates, canEditDates: DATES_EDITABLE.includes(r.status),
      canComplete: r.status === 'confermata' && !sessions.some((s) => ['da_confermare', 'confermata'].includes(s.status)),
    });
  });

  // Proposta del professionista: prezzo, nota e calendario delle giornate.
  app.post('/richieste/:id/proposta', requireLogin, withRequest(['pro']), (req, res) => {
    const { r } = req;
    if (!['in_attesa', 'proposta'].includes(r.status)) return fail(req, res, 'La proposta non si può più modificare.');
    const rows = readSessionRows(req.body, h);
    const unit = UNITS[req.body.proposal_unit] ? req.body.proposal_unit : 'preventivo';
    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE requests SET status = 'proposta', proposal_price = ?, proposal_unit = ?, proposal_note = ?,
                    proposal_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
        .run(int(req.body.proposal_price), unit, str(req.body.proposal_note, 2000), r.id);
      db.prepare('DELETE FROM request_sessions WHERE request_id = ?').run(r.id);
      const ins = db.prepare(`INSERT INTO request_sessions (request_id, date, start_time, end_time, location, status, proposed_by)
                              VALUES (?, ?, ?, ?, ?, 'da_confermare', 'pro')`);
      for (const s of rows) ins.run(r.id, s.date, s.start_time, s.end_time, s.location);
      logEvent(db, r.id, req.user.id, `${me(req)} ha ${r.status === 'proposta' ? 'aggiornato' : 'inviato'} la proposta` +
        (rows.length ? ` con ${rows.length} giornat${rows.length === 1 ? 'a' : 'e'}` : '') + '.');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    ok(req, res, "Proposta inviata: l'azienda la troverà nella sua area personale.");
  });

  app.post('/richieste/:id/accetta', requireLogin, withRequest(['client']), (req, res) => {
    const { r } = req;
    if (r.status !== 'proposta') return fail(req, res, 'Non c’è una proposta da accettare.');
    db.prepare("UPDATE requests SET status = 'confermata', updated_at = datetime('now') WHERE id = ?").run(r.id);
    db.prepare(`UPDATE request_sessions SET status = 'confermata', updated_at = datetime('now')
                 WHERE request_id = ? AND status = 'da_confermare' AND proposed_by = 'pro'`).run(r.id);
    logEvent(db, r.id, req.user.id, `${me(req)} ha accettato la proposta. Incarico confermato.`);
    ok(req, res, 'Proposta accettata: l’incarico è confermato.');
  });

  app.post('/richieste/:id/rifiuta', requireLogin, withRequest(['pro']), (req, res) => {
    const { r } = req;
    if (!['in_attesa', 'proposta'].includes(r.status)) return fail(req, res, 'La richiesta non si può più rifiutare.');
    const note = str(req.body.note, 1000);
    db.prepare("UPDATE requests SET status = 'rifiutata', response_note = ?, updated_at = datetime('now') WHERE id = ?").run(note, r.id);
    logEvent(db, r.id, req.user.id, `${me(req)} non può accettare l’incarico.${note ? ' Motivo: ' + note : ''}`);
    ok(req, res, 'Richiesta rifiutata.');
  });

  app.post('/richieste/:id/annulla', requireLogin, withRequest(['pro', 'client']), (req, res) => {
    const { r, side } = req;
    const allowed = side === 'client' ? OPEN.includes(r.status) : r.status === 'confermata';
    if (!allowed) return fail(req, res, 'La richiesta non si può annullare in questo stato.');
    const note = str(req.body.note, 1000);
    db.prepare("UPDATE requests SET status = 'annullata', response_note = ?, updated_at = datetime('now') WHERE id = ?").run(note, r.id);
    db.prepare("UPDATE request_sessions SET status = 'annullata' WHERE request_id = ? AND status IN ('da_confermare','confermata')").run(r.id);
    logEvent(db, r.id, req.user.id, `${me(req)} ha annullato l’incarico.${note ? ' Motivo: ' + note : ''}`);
    ok(req, res, 'Incarico annullato.');
  });

  app.post('/richieste/:id/completa', requireLogin, withRequest(['pro', 'client']), (req, res) => {
    const { r } = req;
    const open = sessionsOf(db, r.id).filter((s) => ['da_confermare', 'confermata'].includes(s.status));
    if (r.status !== 'confermata') return fail(req, res, 'Solo un incarico confermato può essere completato.');
    if (open.length) return fail(req, res, `Ci sono ancora ${open.length} giornat${open.length === 1 ? 'a' : 'e'} da svolgere: segnale come svolte o annullale.`);
    db.prepare("UPDATE requests SET status = 'completata', updated_at = datetime('now') WHERE id = ?").run(r.id);
    logEvent(db, r.id, req.user.id, `${me(req)} ha segnato l’incarico come completato.`);
    ok(req, res, req.side === 'client' ? 'Incarico completato. Ora puoi lasciare una recensione.' : 'Incarico completato.');
  });

  app.post('/richieste/:id/messaggi', requireLogin, withRequest(['pro', 'client']), (req, res) => {
    const body = str(req.body.body, 2000);
    if (!body) return fail(req, res, 'Il messaggio è vuoto.');
    db.prepare("INSERT INTO request_messages (request_id, user_id, kind, body) VALUES (?, ?, 'message', ?)").run(req.r.id, req.user.id, body);
    db.prepare("UPDATE requests SET updated_at = datetime('now') WHERE id = ?").run(req.r.id);
    res.redirect(`${back(req.r)}#conversazione`);
  });

  // ---- Giornate ----
  const withSession = (req, res, next) => {
    const s = db.prepare('SELECT * FROM request_sessions WHERE id = ? AND request_id = ?').get(req.params.sid, req.r.id);
    if (!s) return deny(res);
    req.s = s;
    next();
  };
  const editable = (req, res, next) => {
    if (!DATES_EDITABLE.includes(req.r.status)) return fail(req, res, 'Le date non si possono più modificare.');
    next();
  };

  app.post('/richieste/:id/giornate', requireLogin, withRequest(['pro', 'client']), editable, (req, res) => {
    const [s] = readSessionRows(req.body, h);
    if (!s) return fail(req, res, 'Indica la data della nuova giornata.');
    if (db.prepare("SELECT COUNT(*) AS n FROM request_sessions WHERE request_id = ? AND status != 'annullata'").get(req.r.id).n >= MAX_SESSIONS) {
      return fail(req, res, `Puoi pianificare al massimo ${MAX_SESSIONS} giornate.`);
    }
    db.prepare(`INSERT INTO request_sessions (request_id, date, start_time, end_time, location, status, proposed_by)
                VALUES (?, ?, ?, ?, ?, 'da_confermare', ?)`).run(req.r.id, s.date, s.start_time, s.end_time, s.location, req.side);
    logEvent(db, req.r.id, req.user.id, `${me(req)} ha proposto una nuova giornata: ${describeSession(s, fmtDay)}.`);
    ok(req, res, 'Giornata proposta: serve la conferma dell’altra parte.', '#giornate');
  });

  app.post('/richieste/:id/giornate/:sid/sposta', requireLogin, withRequest(['pro', 'client']), editable, withSession, (req, res) => {
    const { s } = req;
    if (!['da_confermare', 'confermata'].includes(s.status)) return fail(req, res, 'Questa giornata non si può spostare.');
    const [n] = readSessionRows(req.body, h);
    if (!n) return fail(req, res, 'Indica la nuova data.');
    db.prepare(`UPDATE request_sessions SET date = ?, start_time = ?, end_time = ?, location = ?, status = 'da_confermare',
                  proposed_by = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(n.date, n.start_time, n.end_time, n.location || s.location, req.side, s.id);
    logEvent(db, req.r.id, req.user.id, `${me(req)} propone di spostare la giornata del ${describeSession(s, fmtDay)} al ${describeSession(n, fmtDay)}.`);
    ok(req, res, 'Nuova data proposta: serve la conferma dell’altra parte.', '#giornate');
  });

  app.post('/richieste/:id/giornate/:sid/conferma', requireLogin, withRequest(['pro', 'client']), editable, withSession, (req, res) => {
    const { s } = req;
    if (s.status !== 'da_confermare') return fail(req, res, 'La giornata è già confermata.');
    if (s.proposed_by === req.side) return fail(req, res, 'Questa data l’hai proposta tu: deve confermarla l’altra parte.');
    db.prepare("UPDATE request_sessions SET status = 'confermata', updated_at = datetime('now') WHERE id = ?").run(s.id);
    logEvent(db, req.r.id, req.user.id, `${me(req)} ha confermato la giornata del ${describeSession(s, fmtDay)}.`);
    ok(req, res, 'Giornata confermata.', '#giornate');
  });

  app.post('/richieste/:id/giornate/:sid/annulla', requireLogin, withRequest(['pro', 'client']), editable, withSession, (req, res) => {
    const { s } = req;
    if (!['da_confermare', 'confermata'].includes(s.status)) return fail(req, res, 'Questa giornata non si può annullare.');
    db.prepare("UPDATE request_sessions SET status = 'annullata', updated_at = datetime('now') WHERE id = ?").run(s.id);
    logEvent(db, req.r.id, req.user.id, `${me(req)} ha annullato la giornata del ${describeSession(s, fmtDay)}.`);
    ok(req, res, 'Giornata annullata.', '#giornate');
  });

  app.post('/richieste/:id/giornate/:sid/svolta', requireLogin, withRequest(['pro']), withSession, (req, res) => {
    const { r, s } = req;
    if (r.status !== 'confermata' || s.status !== 'confermata') return fail(req, res, 'Si possono segnare come svolte solo le giornate confermate.');
    if (s.date > today()) return fail(req, res, 'Questa giornata non è ancora arrivata: potrai segnarla come svolta dal giorno stesso.');
    db.prepare("UPDATE request_sessions SET status = 'svolta', updated_at = datetime('now') WHERE id = ?").run(s.id);
    logEvent(db, r.id, req.user.id, `${me(req)} ha segnato come svolta la giornata del ${describeSession(s, fmtDay)}.`);
    ok(req, res, 'Giornata segnata come svolta.', '#giornate');
  });

  // Esporta le giornate in un file di calendario (Google Calendar, Outlook, iPhone).
  app.get('/richieste/:id/calendario.ics', requireLogin, withRequest(['pro', 'client']), (req, res) => {
    const { r } = req;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProfiliPro//Agricoltura//IT', 'CALSCALE:GREGORIAN'];
    for (const s of sessionsOf(db, r.id).filter((x) => ['da_confermare', 'confermata'].includes(x.status))) {
      const d = s.date.replace(/-/g, '');
      const when = s.start_time
        ? [`DTSTART:${d}T${s.start_time.replace(':', '')}00`, `DTEND:${d}T${(s.end_time || s.start_time).replace(':', '')}00`]
        : [`DTSTART;VALUE=DATE:${d}`];
      lines.push('BEGIN:VEVENT', `UID:profilipro-sessione-${s.id}`, `DTSTAMP:${stamp}`, ...when,
        `SUMMARY:${icsEscape(r.title)}${s.status === 'da_confermare' ? ' (da confermare)' : ''}`,
        `DESCRIPTION:${icsEscape(`Incarico con ${req.side === 'pro' ? r.client_company || r.client_name : r.pro_name}`)}`,
        ...(s.location ? [`LOCATION:${icsEscape(s.location)}`] : []), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    res.type('text/calendar; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="incarico-${r.id}.ics"`)
      .send(lines.join('\r\n') + '\r\n');
  });
}

module.exports = { today, register, summarize, agendaFor, sessionsOf, progress, actionFor, suggestDates, SESSION_STATUS, OPEN };
