# Test delle funzionalità Superset++

## Eseguire le regressioni

Dal checkout con dipendenze installate:

```sh
bun run test:fork
```

Il comando compila prima i cataloghi Lingui, anche su un checkout pulito, poi
esegue separatamente i test desktop, unitari/runtime e di integrazione host.
Ogni gruppo usa un solo processo, un DOM condiviso ripulito tra i test,
il preload che assegna una cartella Superset temporanea e
fixture senza credenziali reali. Al primo fallimento termina con un errore.

Per vedere i file selezionati:

```sh
bun run test:fork --list
```

I nuovi file `*.test.ts` e `*.test.tsx` nei percorsi del fork sono raccolti
automaticamente; le suite ufficiali su cui dipendono le estensioni sono elencate
in `scripts/fork/test.ts`. I nomi/percorso contenenti `fork` sono inclusi senza
dover riscrivere il workflow. Se una suite ufficiale richiesta scompare,
il comando fallisce invece di ometterla. I test vanno collocati accanto al codice.

## Cosa viene verificato

| Area | Test unitari / componenti | Integrazioni |
|---|---|---|
| Account prima dell’avvio | Predefinito dell’host, scelta manuale, cambio modello, reset host/provider/nuova creazione, scelte pendenti obsolete | Profilo/configurazione prima del primo prompt, rifiuto prima di creare un workspace per account mancanti |
| Profili isolati | Identità immutabile, CLI login separato, alias, nome automatico dalla mail, collisioni, retry e rollback del Portachiavi, account disconnessi, corruzione, permessi e limite del registro | Avvio importato con scelta esplicita mentre un altro profilo resta predefinito |
| Quota condivisa | Limiti di sessione/settimana/modello, soglie senza arrotondare, letture vecchie, dati mancanti, API, richieste condivise | Cache e verifica CLI proprietario, `Retry-After`, esclusione di richieste al modello nei controlli d’uso |
| Continuazione Claude | Suggerimento, reset, attivazione dopo il limite, Stop, cambio identità/modello, API escluse, errori e messaggi in coda | Runtime della chat, notifiche del router, preferenze indipendenti, persistenza, scadenza e limite di ritenzione |
| Interfaccia | Chiusura menu prima del dialogo, ripristino focus, caselle salvate subito, rimontaggio, errori, host privi delle procedure | React + React Query + trasporto tRPC simulato; nessuna chiamata a un agente reale |
| Chat in background | Conservazione account, modello e sessione nativa; limite per workspace | Parcheggio, riapertura, isolamento workspace, autenticazione e cancellazione dei dati collegati |
| Trasferimenti e CLI/CHAT | Configurazione/account salvati, contesto esplicito e troncato, provenienza, annullamento, helper e ponte Cursor | Lineage persistita, store selezionati e motore nativo fissato alla release |
| Cancellazione workspace | Provenienza esatta, rinomina/copia dei riferimenti, branch condivisi | Repository Git temporanei: local checkout, file non committati, batch misti, controlli ripetuti dopo l’anteprima, `force` e riferimenti remoti conservati |
| Installazione aggiornamenti | Download/errore/annullamento prima del riavvio, tag e checksum fissati, destinazione del bundle | Script su cartelle temporanee: sostituzione e rollback, mancata uscita, bundle errato e riavvio; comandi macOS e rete simulati in CI |
| Distribuzione | Identità fork/ufficiale, copia dati senza sovrascrivere quelli in uso, release e aggiornamenti rimandati | Compilazione e packaging nel workflow di release |
| Ordine agenti | Priorità iniziali e nuovi agenti senza alterare il catalogo | Configurazioni e ordine salvati nelle impostazioni |

## Motore nativo effettivamente distribuito

La suite aggiuntiva usa il binario `txcript-transfer` fissato in
`scripts/fork/txcript-version.json`. È separata perché il binario distribuito
è per Mac Apple Silicon e non è richiesto per i test veloci Linux.

Con il helper già compilato nel checkout:

```sh
bun run test:fork:native
```

Oppure specifica il helper della release verificata:

```sh
bun run test:fork:native /percorso/al/txcript-transfer
```

Verifica il protocollo e la versione, le 20 direzioni tra Claude, Codex, Cursor,
Grok e OpenCode, il ritorno in un formato leggibile, il percorso di destinazione,
la conservazione della sorgente e il contenuto Unicode oltre 50.000 caratteri.
Controlla inoltre i ruoli dei messaggi, esempi di tag XML, contesto nativo Grok,
riepiloghi e riprese automatiche, immagini, risultati strutturati e abbinamento
tra chiamate e risultati degli strumenti, inclusi gli errori dei comandi.
Quattro prove verificano che sorgenti incomplete, fuori dal deposito, con ID
o cartella del progetto errati non creino una chat di destinazione.
Una regressione controlla che Codex riceva il ragionamento importato come testo
dell'assistente, senza elementi `reasoning` sintetici o stato privato del provider.
Il testo originale resta disponibile alle conversioni successive.
La suite comprende 26 test e usa conversazioni sintetiche e cartelle temporanee. Il motore e i codec sono
reali; soltanto il comando `opencode import` è sostituito da un importatore
SQLite di prova. Non verifica una specifica versione del CLI OpenCode installato.

## CI e release

- **Fork - regression tests** esegue gli stessi controlli di `scripts/fork/validate.sh` sulle pull
  request verso `fork/main` e avvio manuale. Richiede solo lettura del repository.
- **Fork - build release** attende un minuto dopo un push, così quelli ravvicinati
  vengono raggruppati prima di occupare il runner Mac. Annulla le esecuzioni superate da un nuovo push e
  impedisce la pubblicazione di un commit che non è più l’ultimo di `fork/main`.
  I test del workflow verificano entrambi i casi senza chiamare GitHub.
  Controlli e pacchetti già verificati possono essere riusati sullo stesso
  commit; una modifica al codice invalida la cache.
  Esegue lo stesso comando prima del packaging e la
  suite nativa dopo il download del helper verificato. Un errore ferma la build.
- Windows non è ancora supportato: la build e le prove native Windows sono state
  tolte dai workflow. Il codice di installazione e aggiornamento per Windows
  (`scripts/fork/install-windows.ps1`, `windows-smoke.ps1`, `fork-windows-builder.ts`)
  resta nel repository ma non viene compilato né pubblicato.
- **Fork - sync with upstream** propone solo release stabili pubblicate tramite
  pull request. Se trova conflitti apre una bozza; non aggiorna `fork/main` e
  non avvia build. Le prove coprono proposta riuscita, conflitti, rilancio senza
  duplicati, recupero senza sovrascrivere correzioni manuali e release già integrata.
  Il token del sync deve avere permessi di scrittura anche sulle pull request.

Le suite non richiedono login, abbonamenti o richieste al modello. I test dei
reset usano orologi o attese simulate; le cancellazioni interessano solo fixture.

## Limiti e manutenzione

I test dei componenti usano un DOM di prova, non una finestra Electron
confezionata. Non dimostrano notarizzazione, login OAuth reale, comportamento dei
CLI aggiornati indipendentemente dal fork o tutti i casi di focus del sistema
operativo. Per questi restano utili prove sulla build confezionata, separate
senza interferire con le sessioni personali in uso.

Quando un nuovo caso viene trovato nell’uso reale, aggiungere una regressione
sul comportamento osservato e verificare che fallisca prima della correzione.
Non aumentare attese o retry per far passare un test instabile. Se cambia il
motore fissato, la suite nativa va eseguita prima di pubblicare.

Free-reset regression coverage includes account/host scoping, shared discovery, unsupported hosts, explicit confirmation and cancel, stale identity rejection, expired credits, uncertain-response retries and host restarts, target-only quota invalidation, preserved 429 backoff, and a real fake-CLI subprocess that verifies profile isolation, hooks/MCP disabled, no model turns, timeout and temporary-directory cleanup. Tests never redeem provider resets or use real account credentials.

### Configurazione guidata Grok/Cursor

La suite include riconoscimento del provider (anche quando `agent` è Grok),
versioni calendar di Cursor, login scaduti, override nativi e privacy delle
risposte. Un CLI simulato riceve soltanto `initialize` e verifica che la cartella
temporanea sia rimossa. Le procedure reali operano su SQLite in memoria e
verificano modifiche concorrenti, applicazione API esplicita e autenticazione.
I test UI coprono il riepilogo compatto, host precedenti, scelta API, pulizia
della chiave dal form, isolamento dell’host e popup di login stabile. Nessun test
installa un CLI o usa chiavi, login o prompt reali.

### Visibilità CLI e profili per le chat

La suite del fork verifica il flag locale (nascosto per default), l'idratazione
rigorosa di un singolo booleano, la comparsa e scomparsa dell'account esterno senza
rimuovere i profili e la conservazione della preferenza ACP avanzata. I test di
creazione verificano che Codex con il solo login CLI richieda Aggiungi account,
che le scelte isolate siano conservate e che gli override API restino utilizzabili.
La policy di continuazione automatica esclude il login esterno anche quando ha
la quota migliore. Questi test vengono eseguiti prima della build tramite
`bun run test:fork`; non effettuano login reali.

### Avvisi di aggiornamento

I test dell’aggiornatore coprono il controllo dopo un minuto e ogni 15 minuti,
il ritorno in primo piano e il risveglio senza cicli di focus, la pulizia di
listener e timer, le risposte GitHub 304/403/429 e i tentativi dopo errori.
Una prova collega il checker, lo stato di notifica e il presenter della UI:
controllo automatico, avviso, Later, nuova release e verifica manuale.
Sono verificati anche la consegna ritardata al renderer, più finestre, i pulsanti
accessibili e il tentativo di installazione dopo annullamento. Non viene eseguita
alcuna installazione o richiesta a GitHub nei test.
