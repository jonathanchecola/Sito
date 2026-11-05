'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'profilipro.sqlite');

function open(file = DB_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db) {
  const cols = db.prepare("SELECT name FROM pragma_table_info('professionals')").all().map((c) => c.name);
  const reqCols = db.prepare("SELECT name FROM pragma_table_info('requests')").all().map((c) => c.name);
  if ((cols.length && !cols.includes('price_from')) || (reqCols.length && !reqCols.includes('proposal_price'))) {
    throw new Error('Il database usa uno schema precedente: rigeneralo con "npm run seed".');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('professional','client','admin')),
      company       TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id    INTEGER PRIMARY KEY,
      slug  TEXT NOT NULL UNIQUE,
      name  TEXT NOT NULL,
      icon  TEXT NOT NULL DEFAULT '•',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS professionals (
      id               INTEGER PRIMARY KEY,
      user_id          INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      slug             TEXT NOT NULL UNIQUE,
      headline         TEXT NOT NULL DEFAULT '',
      bio              TEXT NOT NULL DEFAULT '',
      city             TEXT NOT NULL DEFAULT '',
      region           TEXT NOT NULL DEFAULT '',
      mode             TEXT NOT NULL DEFAULT 'entrambi' CHECK (mode IN ('presenza','remoto','entrambi')),
      -- Prezzo "a partire da" e unità: le pratiche si pagano a pratica, i corsi a partecipante, ecc.
      price_from       INTEGER,
      price_unit       TEXT NOT NULL DEFAULT 'giornata',
      years_experience INTEGER NOT NULL DEFAULT 0,
      -- Liste di slug separati da virgola: tipi di servizio (formazione, consulenza, pratiche) e filiere.
      service_types    TEXT NOT NULL DEFAULT '',
      sectors          TEXT NOT NULL DEFAULT '',
      skills           TEXT NOT NULL DEFAULT '',
      languages        TEXT NOT NULL DEFAULT 'Italiano',
      certifications   TEXT NOT NULL DEFAULT '',
      website          TEXT NOT NULL DEFAULT '',
      linkedin         TEXT NOT NULL DEFAULT '',
      vat_number       TEXT NOT NULL DEFAULT '',
      available        INTEGER NOT NULL DEFAULT 1,
      verified         INTEGER NOT NULL DEFAULT 0,
      published        INTEGER NOT NULL DEFAULT 1,
      avatar_color     TEXT NOT NULL DEFAULT '#1a5fb4',
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS professional_categories (
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (professional_id, category_id)
    );

    -- Listino: i singoli servizi offerti con prezzo indicativo.
    CREATE TABLE IF NOT EXISTS services (
      id              INTEGER PRIMARY KEY,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      position        INTEGER NOT NULL DEFAULT 0,
      name            TEXT NOT NULL,
      price           INTEGER,
      unit            TEXT NOT NULL DEFAULT 'pratica'
    );

    -- Richiesta di ingaggio: l'equivalente della "prenotazione" di Booking.
    CREATE TABLE IF NOT EXISTS requests (
      id              INTEGER PRIMARY KEY,
      client_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      start_date      TEXT,
      days            INTEGER,
      mode            TEXT NOT NULL DEFAULT 'entrambi',
      location        TEXT NOT NULL DEFAULT '',
      budget          INTEGER,
      -- in_attesa: nuova richiesta · proposta: il professionista ha inviato prezzo e date
      -- confermata: l'azienda ha accettato · completata / rifiutata / annullata: chiusa
      status          TEXT NOT NULL DEFAULT 'in_attesa'
                      CHECK (status IN ('in_attesa','proposta','confermata','rifiutata','completata','annullata')),
      response_note   TEXT NOT NULL DEFAULT '',
      proposal_price  INTEGER,
      proposal_unit   TEXT NOT NULL DEFAULT 'preventivo',
      proposal_note   TEXT NOT NULL DEFAULT '',
      proposal_at     TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Giornate/appuntamenti di un incarico. Chi sposta o aggiunge una data la propone,
    -- l'altra parte la conferma.
    CREATE TABLE IF NOT EXISTS request_sessions (
      id          INTEGER PRIMARY KEY,
      request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,
      start_time  TEXT NOT NULL DEFAULT '',
      end_time    TEXT NOT NULL DEFAULT '',
      location    TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'da_confermare'
                  CHECK (status IN ('da_confermare','confermata','svolta','annullata')),
      proposed_by TEXT NOT NULL DEFAULT 'pro' CHECK (proposed_by IN ('pro','client')),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Conversazione della richiesta: messaggi scritti e eventi automatici (kind = 'event').
    CREATE TABLE IF NOT EXISTS request_messages (
      id          INTEGER PRIMARY KEY,
      request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind        TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message','event')),
      body        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Recensione verificata: solo una per ingaggio completato.
    CREATE TABLE IF NOT EXISTS reviews (
      id              INTEGER PRIMARY KEY,
      request_id      INTEGER UNIQUE REFERENCES requests(id) ON DELETE SET NULL,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      client_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      competenza      INTEGER NOT NULL CHECK (competenza BETWEEN 1 AND 5),
      comunicazione   INTEGER NOT NULL CHECK (comunicazione BETWEEN 1 AND 5),
      puntualita      INTEGER NOT NULL CHECK (puntualita BETWEEN 1 AND 5),
      qualita_prezzo  INTEGER NOT NULL CHECK (qualita_prezzo BETWEEN 1 AND 5),
      professionalita INTEGER NOT NULL CHECK (professionalita BETWEEN 1 AND 5),
      overall         REAL NOT NULL,
      title           TEXT NOT NULL DEFAULT '',
      pros            TEXT NOT NULL DEFAULT '',
      cons            TEXT NOT NULL DEFAULT '',
      would_rehire    INTEGER NOT NULL DEFAULT 1,
      reply           TEXT NOT NULL DEFAULT '',
      hidden          INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, professional_id)
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_prof ON reviews(professional_id);
    CREATE INDEX IF NOT EXISTS idx_requests_prof ON requests(professional_id);
    CREATE INDEX IF NOT EXISTS idx_requests_client ON requests(client_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_request ON request_sessions(request_id, date);
    CREATE INDEX IF NOT EXISTS idx_messages_request ON request_messages(request_id, created_at);
  `);
}

module.exports = { open, DB_FILE };
