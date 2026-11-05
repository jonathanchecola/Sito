# ProfiliPro

Una piattaforma per trovare **formatori, consulenti e professionisti delle pratiche per le aziende agricole**: i professionisti si iscrivono e completano il profilo, le aziende li cercano, li confrontano, chiedono la disponibilità e alla fine li **valutano con le stelle**.

## Avvio rapido

Requisiti: Node.js 22.5 o superiore (usa il modulo SQLite incluso in Node, senza database esterni).

```bash
npm install
npm run seed     # crea il database con 16 professionisti del settore agricolo e oltre 120 recensioni
npm start        # http://localhost:3000
npm test         # test end-to-end del flusso
```

Account di prova (password `password123`):

| Ruolo | Email |
|---|---|
| Azienda agricola | `laura@lequerce.it` |
| Professionista | `giulia.ferraro@esempio.it` |
| Amministratore | `admin@profilipro.it` |

## Funzionalità

- **Ricerca come su Booking**: barra di ricerca (competenza, luogo, modalità), filtri laterali (categoria, valutazione minima, presenza/remoto, tariffa massima, profili verificati, disponibili ora), ordinamenti e paginazione.
- **Schede risultato**: punteggio in evidenza ("4.7 Eccellente"), stelle, numero di recensioni, tariffa giornaliera, % di chi lo ingaggerebbe di nuovo, badge "Verificato".
- **Profilo professionista**: presentazione, competenze, lingue, certificazioni, tariffe, riepilogo delle valutazioni con barre per criterio e distribuzione delle stelle, recensioni con "cosa mi è piaciuto / cosa migliorare" e risposta del professionista.
- **Gestione della richiesta**: il professionista invia una proposta con prezzo e calendario delle giornate; entrambi possono spostare o aggiungere date, che l’altra parte conferma; messaggi, avanzamento delle giornate svolte, agenda ed esportazione nel calendario.
- **Recensioni verificate**: solo chi ha completato un ingaggio può recensire, una sola volta, con 1–5 stelle su 5 criteri.
- **Preferiti**, **area personale** per azienda e professionista, **pannello admin** per verificare i profili e moderare le recensioni.

Il progetto completo (modello dati, regole di punteggio, roadmap) è in [`docs/PROGETTO.md`](docs/PROGETTO.md).

## Pubblicare online per farlo vedere ad altri (Render, gratuito)

1. Crea un account su https://render.com accedendo con GitHub.
2. Premi **New → Blueprint** e scegli il repository `Sito`. Render legge il file `render.yaml` e configura tutto da solo.
3. Premi **Apply** e attendi qualche minuto: Render ti dà un indirizzo del tipo `https://profilipro-agricoltura.onrender.com` da condividere.

Note sul piano gratuito:
- il sito va in pausa dopo circa 15 minuti senza visite: la prima apertura successiva impiega 30–60 secondi;
- a ogni riavvio i dati tornano quelli di prova (richieste e recensioni aggiunte durante la prova si perdono).
