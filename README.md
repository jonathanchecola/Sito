# ProfiliPro

Una piattaforma in stile Booking per **formatori, consulenti e professionisti**: i professionisti si iscrivono e completano il profilo, le aziende li cercano, li confrontano, chiedono la disponibilità e alla fine li **valutano con le stelle**.

## Avvio rapido

Requisiti: Node.js 22.5 o superiore (usa il modulo SQLite incluso in Node, senza database esterni).

```bash
npm install
npm run seed     # crea il database con 15 professionisti e circa 100 recensioni di esempio
npm start        # http://localhost:3000
npm test         # test end-to-end del flusso
```

Account di prova (password `password123`):

| Ruolo | Email |
|---|---|
| Azienda (committente) | `laura@acme-spa.it` |
| Professionista | `giulia.ferraro@esempio.it` |
| Amministratore | `admin@profilipro.it` |

## Funzionalità

- **Ricerca come su Booking**: barra di ricerca (competenza, luogo, modalità), filtri laterali (categoria, valutazione minima, presenza/remoto, tariffa massima, profili verificati, disponibili ora), ordinamenti e paginazione.
- **Schede risultato**: punteggio in evidenza ("4.7 Eccellente"), stelle, numero di recensioni, tariffa giornaliera, % di chi lo ingaggerebbe di nuovo, badge "Verificato".
- **Profilo professionista**: presentazione, competenze, lingue, certificazioni, tariffe, riepilogo delle valutazioni con barre per criterio e distribuzione delle stelle, recensioni con "cosa mi è piaciuto / cosa migliorare" e risposta del professionista.
- **Richiesta di ingaggio** (l'equivalente della prenotazione): in attesa → accettata/rifiutata → completata (oppure annullata). I contatti diretti si scambiano solo dopo l'accettazione.
- **Recensioni verificate**: solo chi ha completato un ingaggio può recensire, una sola volta, con 1–5 stelle su 5 criteri.
- **Preferiti**, **area personale** per azienda e professionista, **pannello admin** per verificare i profili e moderare le recensioni.

Il progetto completo (modello dati, regole di punteggio, roadmap) è in [`docs/PROGETTO.md`](docs/PROGETTO.md).
