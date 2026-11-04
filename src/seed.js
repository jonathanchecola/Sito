'use strict';
// Dati dimostrativi: categorie, professionisti, committenti, ingaggi e recensioni.
const bcrypt = require('bcryptjs');
const M = require('./model');

const CATEGORIES = [
  ['finanza-agevolata', 'Finanza agevolata e bandi', '💶', 'CSR/PSR, PNRR, ISMEA, OCM, crediti d’imposta'],
  ['pratiche-pac', 'Pratiche PAC e fascicolo aziendale', '📋', 'Domanda unica, fascicolo, titoli, ecoschemi'],
  ['giovani-agricoltori', 'Primo insediamento e giovani', '🌱', 'Insediamento giovani, ISMEA, business plan'],
  ['agronomia', 'Consulenza agronomica', '🌾', 'Concimazione, difesa integrata, irrigazione, suolo'],
  ['formazione-obbligatoria', 'Formazione obbligatoria', '🎓', 'Patentino fitosanitari, HACCP, corsi IAP'],
  ['sicurezza-agricola', 'Sicurezza in agricoltura', '🚜', 'D.Lgs. 81/08, abilitazione trattori, DVR'],
  ['biologico-certificazioni', 'Biologico e certificazioni', '✅', 'Bio, DOP/IGP, SQNPI, GlobalG.A.P.'],
  ['multifunzionalita', 'Agriturismo e multifunzionalità', '🏡', 'Agriturismo, fattorie didattiche, vendita diretta'],
  ['marketing-agroalimentare', 'Marketing ed export', '📦', 'Brand, e-commerce, fiere, mercati esteri'],
  ['agricoltura-digitale', 'Agricoltura 4.0 e digitale', '🛰️', 'Precision farming, sensori, droni, perizie 4.0'],
  ['energia-sostenibilita', 'Energia e sostenibilità', '☀️', 'Agrisolare, agrivoltaico, biogas, carbon farming'],
  ['gestione-fiscale', 'Fisco, lavoro e gestione', '🧾', 'Contabilità agricola, IAP/CD, operai agricoli'],
  ['zootecnia', 'Zootecnia e benessere animale', '🐄', 'Alimentazione, biosicurezza, ClassyFarm'],
  ['enologia', 'Viticoltura ed enologia', '🍇', 'Vigneto, cantina, disciplinari DOC/DOCG'],
];

// [nome, titolo, città, regione, modalità, prezzo da, unità, anni, categorie, tipi, filiere, competenze, lingue, titoli, listino]
const PROS = [
  ['Giulia Ferraro', 'Consulente finanza agevolata: CSR, PNRR e ISMEA', 'Benevento', 'Campania', 'entrambi', 900, 'pratica', 14,
    ['finanza-agevolata', 'giovani-agricoltori'], 'consulenza,pratiche', 'vitivinicolo,olivicolo,ortofrutticolo,agriturismo',
    'Bandi CSR, PNRR Parco Agrisolare, ISMEA, Business plan, Rendicontazione', 'Italiano, Inglese', 'Dottore agronomo, Esperta in progettazione europea',
    [['Check-up dei bandi aperti per la tua azienda', 0, 'pratica'], ['Domanda di sostegno CSR – investimenti aziendali', 1500, 'pratica'], ['Business plan per primo insediamento', 900, 'pratica'], ['Rendicontazione e domanda di pagamento', 800, 'pratica']]],
  ['Marco Esposito', 'Tecnico CAA: domanda PAC, fascicolo aziendale ed ecoschemi', 'Caserta', 'Campania', 'presenza', 60, 'pratica', 18,
    ['pratiche-pac', 'gestione-fiscale'], 'pratiche,consulenza', 'cerealicolo,zootecnico,ortofrutticolo,olivicolo',
    'Domanda unica PAC, Fascicolo aziendale, Ecoschemi, Titoli PAC, Condizionalità', 'Italiano', 'Perito agrario, Operatore CAA',
    [['Domanda unica PAC', 150, 'pratica'], ['Aggiornamento fascicolo aziendale', 60, 'pratica'], ['Trasferimento titoli PAC', 120, 'pratica']]],
  ['Sara Lombardi', 'Agronoma: difesa integrata, concimazione e irrigazione', 'Foggia', 'Puglia', 'presenza', 180, 'mese', 9,
    ['agronomia', 'agricoltura-digitale'], 'consulenza,formazione', 'ortofrutticolo,cerealicolo,olivicolo',
    'Difesa integrata, Piani di concimazione, Irrigazione, Analisi del suolo, Quaderno di campagna', 'Italiano, Inglese', 'Dottore agronomo, Consulente fitosanitario abilitato',
    [['Sopralluogo e piano colturale', 350, 'giornata'], ['Piano di concimazione aziendale', 400, 'pratica'], ['Assistenza tecnica stagionale', 180, 'mese']]],
  ['Luca Bianchi', 'Formatore patentino fitosanitari e corsi PAN', 'Verona', 'Veneto', 'entrambi', 120, 'partecipante', 22,
    ['formazione-obbligatoria', 'agronomia'], 'formazione', 'vitivinicolo,ortofrutticolo,cerealicolo',
    'Patentino fitosanitari, Rinnovo abilitazione, Uso sostenibile dei fitofarmaci, Taratura irroratrici', 'Italiano', 'Formatore accreditato regionale, Dottore agronomo',
    [['Corso per il rilascio del patentino (20 ore)', 180, 'partecipante'], ['Corso di rinnovo (12 ore)', 120, 'partecipante'], ['Corso in azienda per i dipendenti', 1200, 'corso']]],
  ['Elena Russo', 'Consulente agriturismo, fattorie didattiche e vendita diretta', 'Grosseto', 'Toscana', 'entrambi', 450, 'giornata', 12,
    ['multifunzionalita', 'marketing-agroalimentare'], 'consulenza,formazione,pratiche', 'agriturismo,vitivinicolo,olivicolo',
    'Avvio agriturismo, SCIA agrituristica, Fattorie didattiche, Vendita diretta, Accoglienza', 'Italiano, Inglese, Tedesco', 'Operatrice di fattoria didattica, Master in turismo rurale',
    [['Studio di fattibilità agriturismo', 1200, 'pratica'], ['Pratica SCIA agrituristica', 600, 'pratica'], ['Corso accoglienza e ospitalità rurale', 450, 'giornata']]],
  ['Andrea Conti', 'Esperto agricoltura 4.0 e agricoltura di precisione', 'Bologna', 'Emilia-Romagna', 'entrambi', 600, 'giornata', 11,
    ['agricoltura-digitale', 'finanza-agevolata'], 'consulenza,formazione,pratiche', 'cerealicolo,ortofrutticolo,vitivinicolo',
    'Agricoltura di precisione, Droni, Sensori IoT, Perizia 4.0, Mappe di prescrizione', 'Italiano, Inglese', 'Perito industriale, Pilota APR certificato',
    [['Perizia tecnica per credito d’imposta 4.0', 900, 'pratica'], ['Mappatura con drone', 25, 'ettaro'], ['Formazione software gestionali di campo', 600, 'giornata']]],
  ['Francesca Gallo', 'Consulente certificazione biologica, SQNPI e GlobalG.A.P.', 'Perugia', 'Umbria', 'entrambi', 700, 'pratica', 16,
    ['biologico-certificazioni', 'formazione-obbligatoria'], 'consulenza,pratiche,formazione', 'olivicolo,vitivinicolo,ortofrutticolo,apicoltura',
    'Conversione al biologico, Notifica bio, SQNPI, GlobalG.A.P., Piano di autocontrollo', 'Italiano, Inglese', 'Auditor GlobalG.A.P., Tecnologa alimentare',
    [['Pratica di conversione al biologico', 700, 'pratica'], ['Preparazione alla visita ispettiva', 400, 'giornata'], ['Consulenza annuale certificazioni', 1500, 'preventivo']]],
  ['Paolo Greco', 'Commercialista specializzato in impresa agricola', 'Bari', 'Puglia', 'entrambi', 90, 'ora', 15,
    ['gestione-fiscale', 'giovani-agricoltori'], 'consulenza,pratiche', 'olivicolo,ortofrutticolo,vitivinicolo,cerealicolo,zootecnico',
    'Regime IVA agricolo, IAP e coltivatore diretto, Società agricole, Passaggio generazionale, Operai agricoli', 'Italiano', 'Dottore commercialista, Revisore legale',
    [['Riconoscimento qualifica IAP', 500, 'pratica'], ['Costituzione società agricola', 1800, 'pratica'], ['Tenuta contabilità agricola', 120, 'mese']]],
  ['Chiara Marino', 'Consulente export e marketing per vino e olio', 'Asti', 'Piemonte', 'entrambi', 650, 'giornata', 10,
    ['marketing-agroalimentare', 'enologia'], 'consulenza,formazione', 'vitivinicolo,olivicolo',
    'Export, Fiere internazionali, E-commerce, Brand e packaging, Enoturismo', 'Italiano, Inglese, Francese', 'WSET Level 3, Master in Export Management',
    [['Piano export per un mercato estero', 2500, 'preventivo'], ['Preparazione partecipazione in fiera', 650, 'giornata'], ['Workshop vendita online dei prodotti', 450, 'giornata']]],
  ['Davide Romano', 'RSPP e formatore sicurezza in agricoltura', 'Cuneo', 'Piemonte', 'presenza', 400, 'giornata', 13,
    ['sicurezza-agricola', 'formazione-obbligatoria'], 'formazione,consulenza', 'cerealicolo,zootecnico,vitivinicolo,ortofrutticolo,florovivaistico',
    'DVR agricolo, Abilitazione trattori, Antincendio, Primo soccorso, Lavori stagionali', 'Italiano', 'Formatore qualificato sicurezza, RSPP',
    [['Corso abilitazione trattori', 220, 'partecipante'], ['Documento di valutazione dei rischi', 600, 'pratica'], ['Incarico RSPP esterno', 900, 'preventivo']]],
  ['Valentina Costa', 'Consulente energia: Agrisolare, agrivoltaico e biogas', 'Mantova', 'Lombardia', 'entrambi', 2500, 'pratica', 8,
    ['energia-sostenibilita', 'finanza-agevolata'], 'consulenza,pratiche', 'zootecnico,cerealicolo,lattiero-caseario',
    'Parco Agrisolare, Agrivoltaico, Biogas e biometano, Comunità energetiche, Carbon farming', 'Italiano, Inglese', 'Ingegnera energetica, EGE certificata',
    [['Domanda Parco Agrisolare', 2500, 'pratica'], ['Studio di fattibilità agrivoltaico', 3500, 'preventivo'], ['Bilancio di CO2 aziendale', 1200, 'pratica']]],
  ['Roberto Fontana', 'Medico veterinario: benessere animale e ClassyFarm', 'Reggio Emilia', 'Emilia-Romagna', 'presenza', 380, 'giornata', 20,
    ['zootecnia', 'biologico-certificazioni'], 'consulenza,formazione', 'zootecnico,lattiero-caseario',
    'Benessere animale, ClassyFarm, Biosicurezza, Alimentazione bovine, Riduzione antibiotici', 'Italiano', 'Medico veterinario, Valutatore ClassyFarm',
    [['Valutazione benessere animale', 380, 'giornata'], ['Piano di biosicurezza', 500, 'pratica'], ['Assistenza zootecnica continuativa', 300, 'mese']]],
  ['Martina De Luca', 'Formatrice HACCP e trasformazione dei prodotti in azienda', 'Salerno', 'Campania', 'entrambi', 90, 'partecipante', 7,
    ['formazione-obbligatoria', 'multifunzionalita'], 'formazione,consulenza', 'ortofrutticolo,lattiero-caseario,apicoltura,agriturismo',
    'HACCP, Laboratorio di trasformazione, Etichettatura, Conserve e confetture, Miele', 'Italiano, Inglese', 'Tecnologa alimentare',
    [['Corso HACCP per operatori', 90, 'partecipante'], ['Manuale di autocontrollo HACCP', 450, 'pratica'], ['Verifica etichette dei prodotti', 60, 'ora']]],
  ['Stefano Ricci', 'Enologo e consulente di cantina', 'Siena', 'Toscana', 'entrambi', 550, 'giornata', 17,
    ['enologia', 'biologico-certificazioni'], 'consulenza,formazione', 'vitivinicolo',
    'Vinificazione, Gestione del vigneto, Disciplinari DOC/DOCG, Analisi sensoriale, Vini biologici', 'Italiano, Inglese', 'Enologo, Dottore in viticoltura ed enologia',
    [['Consulenza vendemmia e vinificazione', 550, 'giornata'], ['Assistenza enologica annuale', 4000, 'preventivo'], ['Corso di degustazione per il personale', 400, 'corso']]],
  ['Alessia Moretti', 'Consulente giovani agricoltori e primo insediamento', 'Palermo', 'Sicilia', 'entrambi', 1200, 'pratica', 9,
    ['giovani-agricoltori', 'finanza-agevolata'], 'consulenza,pratiche,formazione', 'ortofrutticolo,olivicolo,agriturismo,apicoltura',
    'Primo insediamento, ISMEA Generazione Terra, Business plan, Corsi per giovani agricoltori, Subentro', 'Italiano', 'Dottoressa agronoma',
    [['Pratica primo insediamento giovani', 1200, 'pratica'], ['Domanda ISMEA Generazione Terra', 1500, 'pratica'], ['Orientamento gratuito', 0, 'pratica']]],
  ['Nicola Ferri', 'Consulente apicoltura e filiera del miele', 'Macerata', 'Marche', 'entrambi', 300, 'giornata', 12,
    ['zootecnia', 'biologico-certificazioni'], 'consulenza,formazione,pratiche', 'apicoltura',
    'Gestione apiario, Nomadismo, Anagrafe apistica, Miele biologico, Smielatura', 'Italiano', 'Tecnico apistico, Esperto in analisi sensoriale del miele',
    [['Corso base di apicoltura', 150, 'partecipante'], ['Avvio apiario e anagrafe apistica', 300, 'pratica'], ['Visita tecnica in apiario', 300, 'giornata']]],
];

const CLIENTS = [
  ['Laura Vitale', 'laura@lequerce.it', 'Azienda Agricola Le Querce'],
  ['Giorgio Neri', 'giorgio@cantinasanmarco.it', 'Cantina San Marco'],
  ['Federica Sala', 'federica@ilpoggio.it', 'Agriturismo Il Poggio'],
  ['Matteo Pace', 'matteo@terreunite.it', 'Cooperativa Terre Unite'],
  ['Irene Galli', 'irene@oleificiogalli.it', 'Oleificio Galli'],
];

const PROS_TEXT = [
  'Competente e chiaro: ci ha spiegato ogni passaggio della pratica.',
  'Domanda presentata nei tempi e finanziamento ottenuto.',
  'Corso molto pratico, con esempi presi dalla nostra azienda.',
  'Sempre reperibile, anche nei giorni a ridosso delle scadenze.',
  'Ha trovato soluzioni concrete per ridurre i costi in campo.',
  'Ottimo rapporto qualità/prezzo, lo abbiamo consigliato ad altre aziende.',
];
const CONS_TEXT = [
  '', '', 'Documenti richiesti un po’ all’ultimo momento.', 'Avremmo voluto qualche visita in campo in più.',
  '', 'Tempi di risposta via email talvolta lenti.',
];
const TITLES = ['Esperienza eccellente', 'Consigliatissimo', 'Molto professionale', 'Pratica senza pensieri', 'Lo richiameremo', 'Un aiuto prezioso per l’azienda'];

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function seed(db) {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const hash = bcrypt.hashSync('password123', 8);
  const colors = ['#2f6b3f', '#8a5a2b', '#3d7f8c', '#6b4f8a', '#a3472f', '#4f6b2a', '#7a6a2b', '#2b5d6b'];

  db.exec('BEGIN');
  try {
    const insCat = db.prepare('INSERT INTO categories (slug, name, icon, description) VALUES (?, ?, ?, ?)');
    for (const c of CATEGORIES) insCat.run(...c);
    const catId = Object.fromEntries(db.prepare('SELECT id, slug FROM categories').all().map((c) => [c.slug, c.id]));

    const insUser = db.prepare('INSERT INTO users (email, password_hash, name, role, company) VALUES (?, ?, ?, ?, ?)');
    insUser.run('admin@profilipro.it', hash, 'Amministratore', 'admin', null);

    const clientIds = CLIENTS.map(([name, email, company]) => Number(insUser.run(email, hash, name, 'client', company).lastInsertRowid));

    const insPro = db.prepare(`INSERT INTO professionals (user_id, slug, headline, bio, city, region, mode, price_from,
      price_unit, years_experience, service_types, sectors, skills, languages, certifications, available, verified, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insSvc = db.prepare('INSERT INTO services (professional_id, position, name, price, unit) VALUES (?, ?, ?, ?, ?)');
    const insPC = db.prepare('INSERT INTO professional_categories (professional_id, category_id) VALUES (?, ?)');
    const insReq = db.prepare(`INSERT INTO requests (client_id, professional_id, title, description, start_date, days, mode, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insRev = db.prepare(`INSERT INTO reviews (request_id, professional_id, client_id, competenza, comunicazione,
      puntualita, qualita_prezzo, professionalita, overall, title, pros, cons, would_rehire, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    PROS.forEach(([name, headline, city, region, mode, price, unit, years, cats, types, sectors, skills, langs, certs, services], i) => {
      const email = `${M.slugify(name).replace('-', '.')}@esempio.it`;
      const userId = Number(insUser.run(email, hash, name, 'professional', null).lastInsertRowid);
      const bio = `${headline}. Da ${years} anni affianco aziende agricole, cooperative, cantine e agriturismi ` +
        `con servizi costruiti sulla realtà di ogni azienda agricola: sopralluogo, analisi dei bisogni, scadenze sotto controllo ` +
        `e un unico referente dall’inizio alla fine. ` +
        `Lavoro ${mode === 'remoto' ? 'prevalentemente da remoto' : mode === 'presenza' ? 'in presenza presso le sedi dei clienti' : 'sia in aula sia online'}, ` +
        `parlando la lingua di chi lavora in campo e in stalla, non quella degli uffici.`;
      const proId = Number(insPro.run(userId, M.uniqueSlug(db, name), headline, bio, city, region, mode, price,
        unit, years, types, sectors, skills, langs, certs, i % 6 === 5 ? 0 : 1, i % 4 === 3 ? 0 : 1, colors[i % colors.length]).lastInsertRowid);
      for (const c of cats) insPC.run(proId, catId[c]);
      services.forEach(([n, pr, u], k) => insSvc.run(proId, k, n, pr, u));

      // Ingaggi completati con recensione (numero variabile per profilo).
      const nReviews = [12, 14, 6, 15, 4, 7, 11, 9, 5, 8, 3, 10, 6, 9, 0, 4][i];
      const quality = 3.6 + rand() * 1.4; // livello medio del professionista
      for (let k = 0; k < nReviews; k++) {
        const clientId = pick(clientIds);
        const daysAgo = Math.floor(rand() * 600) + 10;
        const when = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 19).replace('T', ' ');
        const reqId = Number(insReq.run(clientId, proId, services[k % services.length][0], 'Ingaggio dimostrativo.',
          when.slice(0, 10), 1 + Math.floor(rand() * 4), mode, 'completata', when).lastInsertRowid);
        const score = () => Math.max(1, Math.min(5, Math.round(quality + (rand() - 0.45) * 1.6)));
        const r = { competenza: score(), comunicazione: score(), puntualita: score(), qualita_prezzo: score(), professionalita: score() };
        const overall = M.computeOverall(r);
        insRev.run(reqId, proId, clientId, r.competenza, r.comunicazione, r.puntualita, r.qualita_prezzo, r.professionalita,
          overall, pick(TITLES), pick(PROS_TEXT), overall < 4 ? pick(CONS_TEXT.filter(Boolean)) : pick(CONS_TEXT), overall >= 3.5 ? 1 : 0, when);
      }
    });

    // Una richiesta in attesa per vedere il flusso nella dashboard del professionista.
    const giulia = db.prepare("SELECT id FROM professionals WHERE slug = 'giulia-ferraro'").get();
    insReq.run(clientIds[0], giulia.id, 'Domanda CSR per trattore e impianto di irrigazione',
      'Azienda di 18 ettari a ortofrutta. Vorremmo capire se rientriamo nel bando investimenti e presentare la domanda.', '2027-02-10', null, 'presenza', 'in_attesa',
      new Date().toISOString().slice(0, 19).replace('T', ' '));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

if (require.main === module) {
  const fs = require('node:fs');
  const { open, DB_FILE } = require('./db');
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
  seed(open());
  console.log('Database ricreato con dati dimostrativi. Password di tutti gli utenti: password123');
}

module.exports = { seed };
