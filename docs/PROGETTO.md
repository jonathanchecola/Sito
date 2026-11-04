# ProfiliPro Agricoltura: documento di progetto

## 1. Obiettivo
Avere un archivio sempre aggiornato di formatori, consulenti e professionisti delle pratiche al servizio delle **aziende agricole** (cantine, cooperative, agriturismi, allevamenti). Ogni profilo si può confrontare con gli altri e ha una reputazione costruita su lavori reali, valutati con le stelle dalle aziende che li hanno commissionati.

## 2. Attori
| Ruolo | Cosa fa |
|---|---|
| **Professionista** (agronomo, formatore, tecnico CAA, commercialista, veterinario, enologo, consulente) | Si iscrive e compila il profilo: tipi di servizio, servizi offerti, filiere seguite, zona, modalità, listino e titoli. Riceve e gestisce le richieste e risponde alle recensioni. |
| **Azienda agricola** (committente) | Cerca, filtra, confronta, salva nei preferiti, chiede un preventivo e recensisce a lavoro concluso. |
| **Amministratore** | Verifica i profili (identità, P.IVA, iscrizione ad albi), modera le recensioni e gestisce le categorie. |

## 3. Come è segmentata l'offerta
La ricerca usa tre livelli, combinabili tra loro.

### 3.1 Tipo di servizio (macro-segmento)
| Tipo | Esempi |
|---|---|
| 🎓 **Formazione** | Patentino fitosanitari, HACCP, abilitazione trattori, corsi per giovani agricoltori, accoglienza in agriturismo |
| 🌿 **Consulenza** | Agronomia, gestione aziendale, export, energia, benessere animale, enologia |
| 📋 **Pratiche e bandi** | Domanda PAC, fascicolo aziendale, CSR/PSR, PNRR, ISMEA, SCIA agrituristica, qualifica IAP |

Un professionista può offrire più tipi di servizio insieme.

### 3.2 Servizi (categorie)
Finanza agevolata e bandi · Pratiche PAC e fascicolo aziendale · Primo insediamento e giovani · Consulenza agronomica · Formazione obbligatoria · Sicurezza in agricoltura · Biologico e certificazioni · Agriturismo e multifunzionalità · Marketing ed export · Agricoltura 4.0 e digitale · Energia e sostenibilità · Fisco, lavoro e gestione · Zootecnia e benessere animale · Viticoltura ed enologia.

Le categorie stanno nel database e si possono aggiungere o rinominare senza modificare il codice.

### 3.3 Filiera
🍇 Vitivinicolo · 🫒 Olivicolo · 🍅 Ortofrutta · 🌾 Cereali e seminativi · 🐄 Zootecnia · 🧀 Lattiero-caseario · 🌷 Florovivaismo · 🐝 Apicoltura · 🏡 Agriturismo.

Così un'azienda vitivinicola trova chi conosce già il suo settore. Le filiere sono definite nel codice (`src/model.js`).

### 3.4 Altri filtri
- Zona (provincia o regione)
- Modalità: in azienda o da remoto
- Valutazione minima
- Solo profili verificati
- Solo professionisti disponibili ora
- Ricerca libera su nome, titolo, competenze e presentazione

## 4. Listino e prezzi
Le pratiche, i corsi e le consulenze non si pagano tutti allo stesso modo. Ogni prezzo ha quindi un'**unità**: a pratica, a giornata, all'ora, al mese, a partecipante, a corso, a ettaro, oppure su preventivo.

- **Prezzo "a partire da"**: compare sulla scheda nei risultati, per esempio "da € 150 / pratica".
- **Listino**: fino a 6 voci nel profilo, ciascuna con nome, prezzo e unità. Esempi: "Domanda unica PAC – € 150 / pratica", "Corso rinnovo patentino – € 120 / partecipante". Con prezzo 0 la voce compare come "Gratuito".
- I prezzi sono indicativi e IVA esclusa. Il prezzo definitivo si concorda con la richiesta di preventivo.

## 5. Flusso principale
```
Ricerca → Profilo → Chiedi un preventivo → Accettata / Rifiutata
                                         ↓
                                    Completata → Recensione verificata (stelle)
```
Il modulo di richiesta raccoglie:
- di cosa ha bisogno l'azienda
- data di inizio ed eventuali giornate
- modalità e luogo dell'azienda
- budget indicativo
- dettagli: ettari, colture o allevamenti, scadenze, numero di partecipanti

La richiesta passa per questi stati:
- `in_attesa` → `accettata` oppure `rifiutata`: decide il professionista.
- `accettata` → `completata`: lo segna una delle due parti, quando la pratica è presentata o il corso è concluso.
- `in_attesa` oppure `accettata` → `annullata`: annulla l'azienda.

I contatti diretti (email) diventano visibili al professionista solo dopo che ha accettato la richiesta.

## 6. Sistema di valutazione
- Ogni recensione dà **da 1 a 5 stelle** su 5 criteri: *Competenza, Comunicazione, Puntualità, Qualità/prezzo, Professionalità*.
- La recensione comprende anche "Cosa ti è piaciuto", "Cosa si potrebbe migliorare" e "Lo richiameresti per un altro lavoro?".
- **Voto della recensione**: media dei 5 criteri. **Voto del profilo**: media dei voti di tutte le sue recensioni.
- Giudizi: da 4,75 Eccezionale · da 4,5 Eccellente · da 4,0 Ottimo · da 3,5 Buono · da 3,0 Discreto. Un profilo senza recensioni compare come "Nuovo".
- L'ordinamento **"Consigliati"** usa una media ponderata: `(n·media + 3·4,0) / (n + 3)`, dove n è il numero di recensioni. Così un profilo con 1 sola recensione da 5 stelle non scavalca chi ne ha 40 con 4,8.
- Indicatore extra: la **% di aziende che lo richiamerebbero**.
- Regole contro gli abusi:
  - si recensisce solo dopo un lavoro completato, una sola volta per lavoro;
  - l'amministratore può nascondere una recensione;
  - il professionista può rispondere pubblicamente.

## 7. Modello dati
| Tabella | Contenuto |
|---|---|
| `users` | Account: email, password cifrata, ruolo, nome dell'azienda |
| `professionals` | Profilo: titolo, presentazione, città e regione, modalità, prezzo da + unità, anni di esperienza, tipi di servizio, filiere, competenze, lingue, titoli, link, P.IVA, disponibile, verificato, pubblicato |
| `services` | Listino: nome del servizio, prezzo, unità, ordine di visualizzazione |
| `categories` + `professional_categories` | Servizi offerti (ogni professionista può averne più di uno) |
| `requests` | Richieste di preventivo: date, giornate, modalità, luogo, budget, stato |
| `reviews` | 5 criteri, voto complessivo, titolo, pro e contro, "lo richiamerei", risposta del professionista, visibilità |
| `favorites` | Preferiti dell'azienda |

Tipi di servizio e filiere sono salvati come elenchi di codici separati da virgola (`consulenza,pratiche`; `vitivinicolo,olivicolo`). In una versione più grande conviene spostarli in tabelle dedicate.

## 8. Grafica
- **Colori**: verde bosco (`#1f4d2e`, `#2c6a40`) come colore principale e giallo grano (`#f2c230`) per gli accenti. Sfondo crema e superfici bianche.
- **Caratteri**: Fraunces (serif) per i titoli, Figtree per i testi.
- **Scelte per distinguersi da Booking**:
  - intestazione chiara invece della fascia scura;
  - riquadro iniziale verde con motivo a solchi e ricerca a schede (Tutto / Formazione / Consulenza / Pratiche e bandi);
  - elenco "Richieste frequenti";
  - risultati in griglia di schede invece della lista verticale;
  - filtri in una barra orizzontale invece della colonna laterale;
  - filtri attivi rimovibili con un clic;
  - valutazioni in una pillola gialla con stella;
  - listino con puntini, come un menù.
- **Telefono**: tutte le pagine funzionano a 390 pixel di larghezza senza scorrimento orizzontale.

## 9. Architettura dell'MVP
- **Node.js + Express**: le pagine sono generate dal server con **EJS**, con pochissimo JavaScript nel browser.
- **SQLite**: tramite il modulo `node:sqlite` incluso in Node, senza database da installare. Se trova un database con lo schema vecchio, l'avvio si ferma e chiede di rigenerarlo con `npm run seed`.
- **Sicurezza**:
  - password cifrate con bcrypt;
  - sessione rigenerata a ogni accesso;
  - cookie protetti (httpOnly, SameSite);
  - token anti-falsificazione (CSRF) su ogni invio di modulo;
  - testi degli utenti mostrati in modo sicuro;
  - controllo dei permessi su ogni azione.
- **Codice**:
  - `src/db.js`: schema del database
  - `src/model.js`: segmenti, filiere, unità, ricerca e punteggi
  - `src/app.js`: rotte
  - `src/seed.js`: dati dimostrativi (16 professionisti, 5 aziende agricole)
  - `views/`: pagine
  - `public/css/style.css`: grafica
  - `test/`: test end-to-end

## 10. Roadmap consigliata
1. **Calendario delle scadenze agricole** (PAC, rinnovo patentini, apertura e chiusura dei bandi) con promemoria alle aziende e suggerimento dei professionisti adatti.
2. **Bacheca bandi**: schede dei bandi aperti collegate ai consulenti che li seguono.
3. **Corsi con date e posti disponibili**: i formatori pubblicano le edizioni dei corsi e le aziende prenotano i posti per i dipendenti.
4. **Notifiche email** su nuova richiesta, risposta e invito a recensire.
5. **Messaggi interni** tra azienda e professionista, con allegati come visure, fascicolo e preventivi.
6. **Foto profilo e documenti** (CV, attestati, iscrizione all'albo) per ottenere il badge "Verificato".
7. **Verifica automatica della P.IVA** tramite il servizio VIES.
8. **Ricerca per distanza** dall'azienda (raggio in km) e per provincia.
9. **Profilo dell'azienda agricola** (ettari, colture, allevamenti), così i professionisti ricevono richieste più complete.
10. **Conformità GDPR**: informativa, consensi, esportazione e cancellazione dei dati, regolamento delle recensioni.
11. **Messa in produzione**: PostgreSQL, sessioni persistenti, HTTPS, backup, limite ai tentativi di accesso.
12. **Monetizzazione** (se serve): profilo "in evidenza" per i professionisti, oppure convenzioni con associazioni di categoria e CAA.
