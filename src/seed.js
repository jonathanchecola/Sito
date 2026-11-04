'use strict';
// Dati dimostrativi: categorie, professionisti, committenti, ingaggi e recensioni.
const bcrypt = require('bcryptjs');
const M = require('./model');

const CATEGORIES = [
  ['formazione-manageriale', 'Formazione manageriale', '🎯', 'Leadership, gestione team, soft skill'],
  ['sicurezza-lavoro', 'Sicurezza sul lavoro', '🦺', 'D.Lgs. 81/08, RSPP, antincendio, primo soccorso'],
  ['digitale-ict', 'Digitale e ICT', '💻', 'Office, cloud, cybersecurity, AI per le aziende'],
  ['marketing-vendite', 'Marketing e vendite', '📈', 'Digital marketing, social, tecniche di vendita'],
  ['consulenza-direzionale', 'Consulenza direzionale', '🧭', 'Strategia, organizzazione, controllo di gestione'],
  ['qualita-iso', 'Qualità e certificazioni ISO', '✅', 'ISO 9001, 14001, 45001, audit'],
  ['finanza-agevolata', 'Finanza agevolata', '💶', 'Bandi, fondi interprofessionali, PNRR'],
  ['lingue', 'Lingue straniere', '🌍', 'Inglese business, tedesco, spagnolo'],
  ['coaching', 'Coaching e sviluppo personale', '🌱', 'Executive e career coaching, public speaking'],
  ['hr-lavoro', 'Risorse umane e lavoro', '🤝', 'Selezione, welfare, diritto del lavoro, paghe'],
  ['privacy-compliance', 'Privacy e compliance', '🔒', 'GDPR, modello 231, whistleblowing'],
  ['sostenibilita', 'Sostenibilità ed ESG', '♻️', 'Bilancio di sostenibilità, CSRD, ESG'],
];

const PROS = [
  ['Giulia Ferraro', 'Formatrice in leadership e gestione dei team', 'Milano', 'Lombardia', 'entrambi', 750, 14,
    ['formazione-manageriale', 'coaching'], 'Leadership, Gestione del cambiamento, Feedback, Delega, Team building', 'Italiano, Inglese', 'ICF ACC, Facilitatore LEGO Serious Play'],
  ['Marco Esposito', 'RSPP e formatore sicurezza D.Lgs. 81/08', 'Napoli', 'Campania', 'presenza', 450, 18,
    ['sicurezza-lavoro', 'qualita-iso'], 'RSPP, Antincendio, Primo soccorso, DVR, Lavori in quota', 'Italiano', 'Formatore qualificato DI 6/3/2013, Auditor ISO 45001'],
  ['Sara Lombardi', 'Consulente digital marketing e social media', 'Bologna', 'Emilia-Romagna', 'remoto', 600, 9,
    ['marketing-vendite', 'digitale-ict'], 'Meta Ads, Google Ads, SEO, Content strategy, Analytics', 'Italiano, Inglese, Spagnolo', 'Google Ads Certified, HubSpot Inbound'],
  ['Luca Bianchi', 'Consulente di direzione e controllo di gestione', 'Torino', 'Piemonte', 'entrambi', 900, 22,
    ['consulenza-direzionale', 'finanza-agevolata'], 'Business plan, Budget, KPI, Riorganizzazione, Passaggio generazionale', 'Italiano, Francese', 'CMC – Certified Management Consultant'],
  ['Elena Russo', 'Docente di inglese business e comunicazione internazionale', 'Roma', 'Lazio', 'entrambi', 380, 12,
    ['lingue'], 'Business English, Presentazioni, Negoziazione, Email writing, IELTS', 'Italiano, Inglese', 'CELTA, Cambridge DELTA'],
  ['Andrea Conti', 'Esperto cybersecurity e formazione IT', 'Padova', 'Veneto', 'remoto', 700, 11,
    ['digitale-ict', 'privacy-compliance'], 'Cybersecurity awareness, Phishing, NIS2, Microsoft 365, Intelligenza artificiale', 'Italiano, Inglese', 'CISSP, ISO 27001 Lead Auditor'],
  ['Francesca Gallo', 'Executive coach e trainer di public speaking', 'Firenze', 'Toscana', 'entrambi', 820, 16,
    ['coaching', 'formazione-manageriale'], 'Public speaking, Executive coaching, Intelligenza emotiva, Time management', 'Italiano, Inglese', 'ICF PCC, Master in Psicologia del lavoro'],
  ['Paolo Greco', 'Consulente finanza agevolata e fondi interprofessionali', 'Bari', 'Puglia', 'entrambi', 550, 15,
    ['finanza-agevolata', 'consulenza-direzionale'], 'Fondimpresa, Fondirigenti, Bandi PNRR, Credito d’imposta, Formazione 4.0', 'Italiano', 'Esperto in progettazione europea'],
  ['Chiara Marino', 'HR consultant e formatrice in selezione del personale', 'Verona', 'Veneto', 'entrambi', 520, 10,
    ['hr-lavoro', 'formazione-manageriale'], 'Recruiting, Colloquio di selezione, Employer branding, Welfare aziendale, Onboarding', 'Italiano, Tedesco', 'Psicologa del lavoro, Certificazione DISC'],
  ['Davide Romano', 'DPO e consulente privacy GDPR e modello 231', 'Genova', 'Liguria', 'remoto', 650, 13,
    ['privacy-compliance', 'qualita-iso'], 'GDPR, DPO, Modello 231, Whistleblowing, Audit privacy', 'Italiano, Inglese', 'DPO certificato UNI 11697, Avvocato'],
  ['Valentina Costa', 'Consulente sostenibilità, ESG e bilancio CSRD', 'Milano', 'Lombardia', 'entrambi', 780, 8,
    ['sostenibilita', 'consulenza-direzionale'], 'CSRD, ESRS, Carbon footprint, Bilancio di sostenibilità, Rating ESG', 'Italiano, Inglese', 'GRI Certified Sustainability Professional'],
  ['Roberto Fontana', 'Auditor e consulente sistemi qualità ISO', 'Ancona', 'Marche', 'presenza', 480, 20,
    ['qualita-iso', 'sicurezza-lavoro'], 'ISO 9001, ISO 14001, ISO 45001, Audit interni, Lean', 'Italiano', 'Lead Auditor IRCA 9001/14001/45001'],
  ['Martina De Luca', 'Formatrice Excel, Power BI e produttività digitale', 'Salerno', 'Campania', 'remoto', 420, 7,
    ['digitale-ict'], 'Excel avanzato, Power BI, Microsoft 365, Automazioni, ChatGPT in ufficio', 'Italiano, Inglese', 'Microsoft Certified Trainer'],
  ['Stefano Ricci', 'Sales trainer e consulente commerciale B2B', 'Brescia', 'Lombardia', 'entrambi', 690, 17,
    ['marketing-vendite', 'formazione-manageriale'], 'Vendita consulenziale, Negoziazione, CRM, Key account management', 'Italiano, Inglese', 'Certificazione SPIN Selling'],
  ['Alessia Moretti', 'Consulente del lavoro e formatrice HR', 'Palermo', 'Sicilia', 'entrambi', 400, 9,
    ['hr-lavoro', 'finanza-agevolata'], 'Contratti di lavoro, Paghe, Smart working, Apprendistato, Incentivi assunzioni', 'Italiano', 'Consulente del lavoro iscritta all’Albo'],
];

const CLIENTS = [
  ['Laura Vitale', 'laura@acme-spa.it', 'Acme S.p.A.'],
  ['Giorgio Neri', 'giorgio@metalmeccanica-nord.it', 'Metalmeccanica Nord S.r.l.'],
  ['Federica Sala', 'federica@studiosala.it', 'Studio Sala & Associati'],
  ['Matteo Pace', 'matteo@ente-formazione.it', 'Ente Formazione Futuro'],
  ['Irene Galli', 'irene@retailgroup.it', 'Retail Group Italia'],
];

const PROS_TEXT = [
  'Preparazione eccellente e grande capacità di coinvolgere l’aula.',
  'Materiali chiari e molto pratici, i partecipanti sono rimasti entusiasti.',
  'Ha adattato il percorso alle nostre esigenze specifiche con grande flessibilità.',
  'Puntuale, organizzato e sempre disponibile nel follow-up.',
  'Competenza tecnica altissima, ha risposto a tutte le domande del gruppo.',
  'Ottimo rapporto qualità/prezzo, risultati misurabili già dopo poche settimane.',
];
const CONS_TEXT = [
  '', '', 'Qualche slide un po’ densa, ma nulla di grave.', 'Avremmo voluto un’ulteriore giornata di approfondimento.',
  '', 'Tempi di risposta via email talvolta lenti.',
];
const TITLES = ['Esperienza eccellente', 'Consigliatissimo', 'Molto professionale', 'Ottimo percorso', 'Lo richiameremo', 'Valore aggiunto per il team'];

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function seed(db) {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const hash = bcrypt.hashSync('password123', 8);
  const colors = ['#1a5fb4', '#c64600', '#26a269', '#813d9c', '#a51d2d', '#0b7285', '#986a44', '#5e5c64'];

  db.exec('BEGIN');
  try {
    const insCat = db.prepare('INSERT INTO categories (slug, name, icon, description) VALUES (?, ?, ?, ?)');
    for (const c of CATEGORIES) insCat.run(...c);
    const catId = Object.fromEntries(db.prepare('SELECT id, slug FROM categories').all().map((c) => [c.slug, c.id]));

    const insUser = db.prepare('INSERT INTO users (email, password_hash, name, role, company) VALUES (?, ?, ?, ?, ?)');
    insUser.run('admin@profilipro.it', hash, 'Amministratore', 'admin', null);

    const clientIds = CLIENTS.map(([name, email, company]) => Number(insUser.run(email, hash, name, 'client', company).lastInsertRowid));

    const insPro = db.prepare(`INSERT INTO professionals (user_id, slug, headline, bio, city, region, mode, daily_rate,
      hourly_rate, years_experience, skills, languages, certifications, available, verified, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insPC = db.prepare('INSERT INTO professional_categories (professional_id, category_id) VALUES (?, ?)');
    const insReq = db.prepare(`INSERT INTO requests (client_id, professional_id, title, description, start_date, days, mode, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insRev = db.prepare(`INSERT INTO reviews (request_id, professional_id, client_id, competenza, comunicazione,
      puntualita, qualita_prezzo, professionalita, overall, title, pros, cons, would_rehire, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    PROS.forEach(([name, headline, city, region, mode, rate, years, cats, skills, langs, certs], i) => {
      const email = `${M.slugify(name).replace('-', '.')}@esempio.it`;
      const userId = Number(insUser.run(email, hash, name, 'professional', null).lastInsertRowid);
      const bio = `${headline}. Da ${years} anni affianco aziende, enti di formazione e pubbliche amministrazioni ` +
        `con percorsi su misura, progettati a partire dall’analisi dei fabbisogni e chiusi con una verifica dei risultati. ` +
        `Lavoro ${mode === 'remoto' ? 'prevalentemente da remoto' : mode === 'presenza' ? 'in presenza presso le sedi dei clienti' : 'sia in aula sia online'}, ` +
        `con metodologie attive: casi reali, esercitazioni, role play e strumenti pronti da usare il giorno dopo.`;
      const proId = Number(insPro.run(userId, M.uniqueSlug(db, name), headline, bio, city, region, mode, rate,
        Math.round(rate / 7), years, skills, langs, certs, i % 6 === 5 ? 0 : 1, i % 4 === 3 ? 0 : 1, colors[i % colors.length]).lastInsertRowid);
      for (const c of cats) insPC.run(proId, catId[c]);

      // Ingaggi completati con recensione (numero variabile per profilo).
      const nReviews = [12, 9, 6, 15, 4, 7, 11, 3, 5, 8, 2, 10, 6, 9, 0][i];
      const quality = 3.6 + rand() * 1.4; // livello medio del professionista
      for (let k = 0; k < nReviews; k++) {
        const clientId = pick(clientIds);
        const daysAgo = Math.floor(rand() * 600) + 10;
        const when = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 19).replace('T', ' ');
        const reqId = Number(insReq.run(clientId, proId, `Percorso: ${skills.split(',')[k % 3].trim()}`, 'Ingaggio dimostrativo.',
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
    insReq.run(clientIds[0], giulia.id, 'Corso leadership per 12 responsabili di reparto',
      'Vorremmo un percorso di 3 giornate in presenza a Milano, tra febbraio e marzo.', '2027-02-10', 3, 'presenza', 'in_attesa',
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
