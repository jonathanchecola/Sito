# ProfiliPro: documento di progetto

## 1. Obiettivo
Avere un archivio sempre aggiornato di formatori, consulenti e altri professionisti a cui attingere quando serve, con profili confrontabili e una reputazione costruita sugli incarichi reali, sul modello di Booking.

## 2. Attori
| Ruolo | Cosa fa |
|---|---|
| **Professionista** | Si iscrive, compila il profilo (categorie, competenze, tariffe, zona, modalità, certificazioni), riceve e gestisce le richieste, risponde alle recensioni. |
| **Committente** (azienda, ente, o tu) | Cerca, filtra, confronta, salva nei preferiti, invia richieste di ingaggio, recensisce a lavoro concluso. |
| **Amministratore** | Verifica i profili (identità, P.IVA, titoli), modera le recensioni, gestisce le categorie. |

## 3. Flusso principale
```
Ricerca → Profilo → Richiesta di disponibilità → Accettata / Rifiutata
                                              ↓
                                         Completata → Recensione verificata (stelle)
```
Macchina a stati della richiesta:
- `in_attesa` → `accettata` | `rifiutata` (il professionista decide)
- `accettata` → `completata` (lo segna una delle due parti)
- `in_attesa` | `accettata` → `annullata` (il committente annulla)

## 4. Sistema di valutazione
- Ogni recensione dà **da 1 a 5 stelle** su 5 criteri: *Competenza, Comunicazione, Puntualità, Qualità/prezzo, Professionalità*.
- **Voto della recensione** = media dei 5 criteri. **Voto del profilo** = media dei voti delle recensioni.
- Fasce di giudizio (come su Booking): ≥4,75 Eccezionale · ≥4,5 Eccellente · ≥4,0 Ottimo · ≥3,5 Buono · ≥3,0 Discreto.
- **"I nostri consigliati"** usa una media ponderata (bayesiana): `(n·media + 3·4,0) / (n + 3)`. Così chi ha 1 sola recensione da 5 stelle non supera chi ne ha 40 con 4,8.
- Indicatore extra: **% di committenti che lo ingaggerebbero di nuovo**.
- Anti-abuso: si recensisce solo dopo un ingaggio completato, una volta sola; l'admin può nascondere le recensioni; il professionista può rispondere pubblicamente.

## 5. Modello dati
| Tabella | Contenuto |
|---|---|
| `users` | account (email, password hash, ruolo, azienda) |
| `professionals` | profilo: headline, bio, città/regione, modalità, tariffe, anni di esperienza, competenze, lingue, certificazioni, link, P.IVA, disponibile, verificato, pubblicato |
| `categories` + `professional_categories` | categorie (molti-a-molti) |
| `requests` | richieste di ingaggio con date, giornate, modalità, luogo, budget, stato |
| `reviews` | 5 criteri, voto complessivo, titolo, pro/contro, "lo riprenderei", risposta, visibilità |
| `favorites` | preferiti del committente |

## 6. Architettura dell'MVP
- **Node.js + Express**, pagine generate dal server con **EJS**, poco JavaScript lato browser.
- **SQLite** tramite il modulo `node:sqlite` incluso in Node (nessun database da installare).
- Sicurezza: password con bcrypt, sessione rigenerata al login, cookie httpOnly/SameSite, token CSRF su ogni POST, escaping dell'output, controlli di autorizzazione su ogni azione.
- Codice: `src/db.js` (schema), `src/model.js` (ricerca e punteggi), `src/app.js` (rotte), `src/seed.js` (dati demo), `views/` (pagine), `test/` (test end-to-end).

## 7. Roadmap consigliata
1. **Foto profilo e allegati** (CV, brochure, attestati) con archivio S3-compatibile.
2. **Calendario delle disponibilità** del professionista (blocco date come le camere su Booking).
3. **Notifiche email** su nuova richiesta, risposta e invito a recensire.
4. **Messaggistica interna** tra committente e professionista.
5. **Verifica automatica della P.IVA** (servizio VIES) e caricamento dei documenti per il badge "Verificato".
6. **Ricerca full-text** (SQLite FTS5 o Meilisearch) e ricerca geografica per distanza.
7. **Team aziendali**: più utenti per azienda, liste condivise di professionisti preferiti, note interne.
8. **Monetizzazione** (se serve): abbonamento "in evidenza" per i professionisti o commissione sull'ingaggio.
9. **Conformità**: privacy policy GDPR, consenso, export e cancellazione dei dati, termini d'uso sulle recensioni.
10. **Produzione**: PostgreSQL, archivio sessioni persistente (Redis), HTTPS, backup, limitazione delle richieste sul login.
