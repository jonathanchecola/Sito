'use strict';
const { open } = require('./db');
const { createApp } = require('./app');
const { seed } = require('./seed');

const db = open();
if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) {
  seed(db);
  console.log('Database inizializzato con dati dimostrativi.');
}
const port = Number(process.env.PORT) || 3000;
createApp(db).listen(port, () => console.log(`ProfiliPro in ascolto su http://localhost:${port}`));
