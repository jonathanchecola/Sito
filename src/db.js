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
      daily_rate       INTEGER,
      hourly_rate      INTEGER,
      years_experience INTEGER NOT NULL DEFAULT 0,
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
      status          TEXT NOT NULL DEFAULT 'in_attesa'
                      CHECK (status IN ('in_attesa','accettata','rifiutata','completata','annullata')),
      response_note   TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
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
  `);
}

module.exports = { open, DB_FILE };
