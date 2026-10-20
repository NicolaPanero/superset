# Superset fork — primo ciclo di implementazione

Data: 3 ottobre 2026. Scope: solo l'incarico iniziale del §65 del nuovo piano.

## Esito

Fork GitHub creato: <https://github.com/NicolaPanero/superset>.
Clone locale preparato, remote origin personale e upstream ufficiale.
App baseline compilata e avviata con account di sviluppo locale.
127 test mirati passati. Prove reali Claude → Codex e Codex → Claude con
sessioni native persistenti e resume riusciti. Ownership del processo Codex,
stop e nuovo resume verificati nel runtime Superset reale.

**Il POC è parziale rispetto alla fedeltà richiesta:** txcript 0.14.4 perde
due risultati di strumenti Codex contenuti in array strutturati. Prima di
presentare un native handoff completo nella UI va risolto e ritestato questo
caso, oppure va resa esplicita e accettata la limitazione. Non dichiarare
lossless. In questo ciclo non sono stati sviluppati provider di prodotto,
UI definitiva, lineage o auto-switch.

Il report architetturale completo è in
[`fork-local-architecture.md`](fork-local-architecture.md).

## Repository e istruzioni

- Baseline upstream: `b8c5ad799e1f2f626cc0daab3d970de87bb9b950`.
- Desktop upstream: 1.35.0; Bun richiesto e usato: 1.3.14.
- `origin`: `https://github.com/NicolaPanero/superset.git`.
- `upstream`: `https://github.com/superset-sh/superset.git`.
- `main` non modificato; lavoro preparatorio in
  `feature/txcript-native-handoff`. Non sono state pubblicate PR o issue.
- Letti AGENTS root/desktop/host-service/trpc, istruzioni di sviluppo e
  contributo, setup locale, regole di compatibilità tRPC e verifica CDP.
- Nessuna modifica alle migrazioni server, alle API cloud o al codice UI.

Le istruzioni richiedono Bun, uso dei flussi locali di sviluppo, API additive,
SQLite per dati di entità e verifica nel renderer corretto. Il CLI Superset
non era disponibile inizialmente; è stato usato il clone isolato già pronto.

## Baseline di sviluppo

La prima installazione ha fallito su `@lexical/react@0.41.0`, nonostante la
versione fosse presente nel registry ufficiale. Ripetendo `bun install` con
registry npm ufficiale, `--no-cache` e `--frozen-lockfile`, le dipendenze e i
moduli nativi sono stati installati senza cambiare il lockfile.

Il setup ufficiale ha assegnato 3000–3019, ma 3009 era già occupata da un altro
container. È stata riallocata soltanto questa copia a base 3020. Il database
e gli altri servizi esistenti non sono stati toccati.

Il Compose upstream usa PostgreSQL 17. La migrazione
`packages/db/drizzle/0122_webhook_events_swap_to_short_retention.sql` tenta di
rinominare constraint NOT NULL che il 17 non registra con quei nomi. È fallita
con `42704`. PostgreSQL 18 registra questi constraint in `pg_constraint`,
come indicato nelle [release notes ufficiali](https://www.postgresql.org/docs/18/release-18.html).

Per completare la baseline è stato usato un override locale, fuori dal codice
del fork, con PostgreSQL 18 e volume nuovo montato secondo il
[layout dell'immagine ufficiale](https://github.com/docker-library/docs/blob/master/postgres/README.md).
Le migrazioni upstream sono passate. Il proxy Neon locale è stato ricreato
dopo il cambio di database; poi il seed dell'utente fittizio è riuscito.
I servizi esterni configurati con chiavi fake possono emettere warning; ciò
non equivale a configurarli per l'uso personale.

La compilazione Electron/Vite è riuscita. Il primo packaging ha richiesto un
download Electron impedito dalla rete del sandbox. Il secondo è stato
interrotto da una rigenerazione concorrente di `dist` durante l'avvio dev.
Il packaging finale, eseguito con il dev fermo, è riuscito; anche gli archivi
ZIP e DMG hanno superato la verifica di integrità. I dettagli sono registrati
nella sezione “Verifica finale”.

L'app di sviluppo è stata osservata sul renderer `http://localhost:3025`,
API `http://localhost:3021`, CDP 9442 e dati in `superset-dev-data` del clone.
La sessione locale è risultata autenticata con organizzazione attiva. È stata
catturata una schermata baseline. Nessun pacchetto è stato pubblicato o
installato in Applications. Il nome e l'identità “Superset fork” appartengono
alla futura fase packaging; la baseline conserva quelli upstream.

### CLI disponibili

| CLI | Versione osservata | Stato nel ciclo |
| --- | --- | --- |
| Claude Code | 2.1.285 | Login esistente, sessione reale, tool, resume |
| Codex | 0.159.0 | Login esistente, sessione reale, tool, resume e ownership Superset |
| Cursor Agent | 2026.10.01-e373342 | Eseguibile e versione verificati; lifecycle non certificato |
| Grok Build | 1.0.46 | Eseguibile e versione verificati; lifecycle non certificato |
| OpenCode | 1.18.34 | Eseguibile e versione verificati; lifecycle non certificato |
| txcript | 0.14.4 | Conversione locale e no-resume verificati |

`agent` sul PATH di questa macchina punta a Grok. Per Cursor usare la
risoluzione di `cursor-agent`, evitando di identificare il provider dal nome
generico `agent`. I cinque preset già esistono nel runtime; Cursor non ha
forkArgs configurati. Non sono stati installati o aggiornati automaticamente
i cinque agenti o txcript.

Non attribuire un PASS a launch/resume/fork/stop/restart di tutti e cinque:
questa matrice completa resta lavoro successivo. Per ogni coppia distinguere
adapter dichiarato, CLI presente, conversione provata e resume provato.

## Implementazioni attuali e punto di integrazione

L'attuale Continue è un nuovo prompt con contesto recente; il fork è una
funzione del medesimo CLI. Il menu e il launcher renderer da estendere sono
elencati nel report architetturale. Il runtime `agents.run` accetta già
`resumeSessionId`, ma il callback renderer di handoff non lo espone.

Il punto consigliato è un servizio `session-transfer` nel host-service,
invocato da una procedura locale additiva. Riutilizzare poi `agents.run` per
il lancio; txcript deve aver terminato prima. Lo storage delle conversazioni
native continua a essere letto/scritto dal motore txcript e dai CLI stessi.
Superset conserva solo metadata del transfer e lineage.

Gli account locali si gestiscono tramite `usage` e pointer host-wide, non
tramite l'attuale pagina “Agent Accounts” che configura workspace cloud.
Le quote hanno cache di cinque minuti, fetchedAt e status espliciti. L'auto
fallback deve usarli e rispettare i profili configurati per l'agente.

## Audit della versione txcript installata

I comandi reali sono:

```text
txcript continue <source-id> --from claude_code --with codex --no-resume
txcript continue <source-id> --from codex --with claude_code --no-resume
```

`--no-resume` scrive la sessione e non avvia il CLI. Non esistono nel comando
installato gli illustrativi `--no-launch` e `--format json`. Il target ID è
presente in stdout nella riga `resume with: ...`. Il POC ha usato quella riga.
Il titolo o un match ambiguo non devono sostituire l'ID preciso del binding.

`--out` è export: mantiene ID e timestamp della sorgente e non rappresenta
il comportamento desiderato per creare una nuova sessione viva nel profilo
target. Senza `--out`, con la home target fissata, txcript genera un nuovo ID.
Lo spike offline ha verificato entrambi i comportamenti con fixture isolate
e tripwire che avrebbero rilevato un avvio involontario del CLI.

La library Rust espone conversione/store e il risultato di salvataggio con
ID/reference. L'adapter di Superset dovrebbe preferire un output strutturato
ufficiale o un piccolo helper basato sulla library ufficiale. Serve anche il
mint di identità nuova: usare soltanto convert non implica creare un nuovo ID.
Un parser della stdout human-readable va confinato in un adapter versionato,
validato e coperto da test, come ponte temporaneo.

Gli adapter dichiarati includono tutti e cinque quelli del piano:
`claude_code`, `codex`, `cursor`, `grok`, `opencode`. La presenza nel CLI non
dimostra che siano leggibili gli store aggiornati o che ogni direzione sia
resumable con le versioni installate.

### Capacità mancanti o ancora da verificare

- Output JSON stabile con targetSessionId, reference, warning e stadi reali.
- Warning espliciti per perdita di risultati, reasoning o metadata.
- Compatibilità con output Codex strutturato: bug riprodotto qui sotto.
- Compatibilità del naming delle directory Claude su percorsi complessi.
- Avvio/resume reale delle altre 18 direzioni e interazioni con profili diversi.
- Coerenza di snapshot per sessioni attive, tool incompleti, compaction e log
  compressi; gestione di cancellazione, scritture parziali e retry.

Il report non promette trasferimento di system prompt effettivo, configurazioni
MCP, permessi, credenziali, checkpoint, stato dei tool o reasoning cifrato.

## POC reale

È stato creato un Git repo di prova con un solo `note.txt`. Sono state usate
conversazioni dedicate, non conversazioni personali pregresse. Per txcript
la sorgente è stata copiata byte per byte in uno store scratch, senza copiarvi
credenziali; il profilo target autenticato è stato scelto prima del save.
Non è stato cambiato il default account dell'utente.

### Claude → Codex

- Sorgente Claude: `493c788c-e068-4f20-a7e3-b0be8f00f1da`.
- Nuova sessione Codex: `01a1020f-a287-73b0-89fe-bc2658382ad4`.
- Claude ha letto ed editato note.txt e lanciato pwd: tre tool call e tre
  risultati registrati nel file sorgente.
- Codex ha eseguito `exec resume` sul nuovo ID e ricordato il marker
  `HANDOFF-CEDAR-731`, senza che fosse ripetuto nel prompt di verifica.
- Codex ha eseguito pwd/lettura e modifica del file, aggiungendo
  `codex-turn: done` e un secondo marker nella conversazione.
- La sorgente Claude è rimasta identica secondo SHA-256.

### Codex → Claude

- Sorgente: la conversazione sopra, dopo il vero turno Codex.
- Nuova sessione Claude: `ce189938-d87d-4538-82fb-c5d2dcf5dff3`.
- `claude --resume` è riuscito mantenendo l'ID target.
- Claude, senza tool disponibili, ha ricordato entrambi i marker, il file,
  lo stato Codex, la linea aggiunta e la working directory.
- Il rollout sorgente Codex è rimasto identico secondo SHA-256.
- Il cwd è preservato. I due CLI hanno lavorato nello stesso Git root.
  Non sono stati certificati branch/commit metadata attraverso la conversione.

### Bug di fedeltà riprodotto

Nel rollout nativo della versione Codex installata, due
`response_item.custom_tool_call_output.output` sono array di blocchi
`input_text`, con contenuto effettivo non vuoto. `txcript export` sulla sorgente
li converte in due `tool_result.content: ""`. Gli stessi risultati vuoti
compaiono nella sessione Claude target.

Il codice della release txcript 0.14.4, in `src/harness/codex.rs`, ramo
`custom_tool_call_output`, legge `output` tramite `Value::as_str()` e usa il
default stringa vuota per un array. Questo riproduce la perdita già in fase
di lettura canonical, prima del writer Claude. Anche la copia di main
precedentemente audita mantiene quella lettura string-only.

**Correzione proposta:** patch nel codec ufficiale txcript per accettare i
blocchi strutturati reali, conservare l'output e segnalare i blocchi non
rappresentabili. Aggiungere fixture/regressione ricavate dalla sessione di
prova e rieseguire i due resume reali. Non compensare scrivendo un secondo
parser/writer proprietario dentro Superset.

Le fixture sintetiche precedenti passavano perché rappresentavano gli output
come stringhe. Restano valide per quel formato, ma non coprono il formato
reale incontrato qui. Questo è il motivo per cui il POC complessivo non è
etichettato come conservazione completa della cronologia.

### Superset owns PROCESS

Una conversione separata ha creato Codex
`01a10250-7d09-7012-983c-b482675f459c`, lasciando intatti i POC precedenti.
Il vero host-service della build ha eseguito `agents.run` con resumeSessionId
e un config locale read-only, senza prompt nuovo al modello.

Sono stati osservati:

1. Un terminale Superset e binding con il corretto ID nativo.
2. TUI Codex con la conversazione Claude importata e il marker originale.
3. Processo Codex PID 74259 sotto wrapper, shell PTY PID 73753 e daemon
   Superset PID 63910, appartenenti alla copia di sviluppo verificata.
4. Stop tramite `terminal.killSession`; nuovo terminale tramite `agents.run`
   con lo stesso ID nativo; cronologia visibile anche dopo il restart.
5. Stop finale confermato dall'assenza del terminale nella lista viva del daemon.

Il launcher txcript era già terminato. Non era antenato del processo Codex.
La prova è un'integrazione del runtime via API locali/CDP, non un percorso
utente della futura UI Native Handoff. I PID sono evidenza del run, non
valori da usare nei futuri script.

## Correzioni da applicare al piano

### Scelta del profilo prima della scrittura — §41

La sequenza affidabile è:

```text
risolvere la sorgente e il suo profilo effettivo
→ selezionare/fissare il profilo target e il config di lancio
→ convertire e salvare in quello store target con txcript, senza launch
→ ottenere e validare targetSessionId/reference
→ avviare tramite Superset con lo stesso profilo e resumeSessionId
→ verificare il binding del processo e registrare la lineage
```

Se la policy cambia profilo dopo il save, il CLI può non trovare la sessione.
Il default globale può cambiare mentre la conversione è in corso: trasportare
la selezione immutabile fino al lancio, senza rileggerla implicitamente.

### Resume passando a un altro profilo — §42

Stesso provider non implica stesso store. Un profilo Backup con un'altra
CLAUDE_CONFIG_DIR può non vedere la sessione Personal. Provare realmente il
cambio; se serve una copia/migrazione, usare il motore ufficiale e aggiornare
ID/reference/lineage. Non promettere mantenimento dello stesso ID nativo
quando viene creata una nuova sessione in un'altra home.

### ContextTransferProvider — §§10–11

Un trasferimento di contesto prepara un prompt e avvia una conversazione nuova.
Prima dell'avvio non possiede un targetSessionId nativo. Il tipo di risultato
deve essere discriminato fra native e context, con ID opzionale/registrato
in seguito per il context. Non inventare un ID per far combaciare l'interfaccia.

### Account fallback e default — §§37–39

Separare selezione per il singolo lancio e modifica del default host-wide.
La prima è più prevedibile con lanci concorrenti e profili pinned. Se si
mantiene il cambio default richiesto dal piano, fissare comunque la selezione
del lancio, definire l'ordine fra writer concorrenti e rendere Undo condizionato
alla selezione ancora corrente. Non annullare un cambio successivo dell'utente.

Definire esattamente il bordo della soglia: “remaining < threshold” e
“candidate remaining > threshold” hanno semantiche diverse alla parità.
Specificare e testare separatamente account corrente e candidati. Un dato
mancante, scaduto, API-billed senza quota o token_stale non autorizza una
scelta automatica. Lo snapshot account del processo va conservato distinto
dal default mostrato in UI. I processi già in esecuzione non cambiano profilo.

### Ordine e matrice

Il §64 colloca il mapping dopo la UI, mentre il §12 lo richiede per il provider.
Creare il registry come prerequisito del provider; completare la matrice reale
in seguito. I cinque agenti restano peer nella UI, con capabilities esplicite
e verificabili, senza spunte che inventino supporto.

Applicando il gate del §64, la perdita di output è un criterio di qualità non
ancora soddisfatto. La prossima attività è risolvere questo caso nel motore e
ritestare; la UI definitiva resta successiva al gate.

## Proposta dei primi branch

1. `feature/session-transfer-provider`: contratto discriminato, registry,
   capability report, context adapter dell'attuale comportamento, API locale
   additiva e unit test dei contratti/errori.
2. `feature/txcript-native-handoff`: esecuzione conversione-only, profili
   sorgente/target fissati, output strutturato o parser versionato, validazione
   del risultato, lancio Superset e prove reali. Dipende dalla correzione di
   fedeltà nel motore; nessun secondo codec proprietario.
3. Piccolo collegamento a launcher/menu con scelta Native/Context, conferma,
   stadi reali e fallback manuale. Solo dopo POC di qualità riuscito.

Per native, il risultato deve includere almeno mode, target agent/config,
targetSessionId, reference, cwd, profilo target e warning osservati. Per context
deve includere mode, prompt e warning di truncation/provenienza. Il lancio
produce un ID terminale distinto e la rilevazione del CLI conferma l'ID nativo.

Prevedere timeout/cancel, idempotenza per transferId, errore di conversione
separato da errore di launch e recupero della sessione già salvata. Non mostrare
successo solo perché è uscita una riga resume. Il backend custom non partecipa.

In seguito: lineage in SQLite locale con più archi per sessione, agent/account
UI, manual switching verificato e AccountSelectionPolicy. Fallback Claude
opt-in con candidate abilitati/autenticati e quota fresca. Codex solo dopo
prova della semantica; nessun multi-account simulato per gli altri provider.

## Conflitti upstream e rischi concreti

| Punto | Rischio e contenimento |
| --- | --- |
| Launcher e menu v2 | Area UI profonda e in evoluzione; hook piccoli, provider isolati |
| ACP vs terminal | Un resume convertito non deve finire in una nuova chat ACP |
| Router host-service | Compatibilità fra versioni; procedure/input additivi e capability guard |
| Binding e wrapper | Eventi tardivi e child process; rispettare launchId e attribuzione account |
| Default account | Stato host-wide condiviso fra org e shell; profile pin prima del save/launch |
| Store nativi | Versioni CLI, cwd encoding e output strutturato; fixture reali e versioni registrate |
| Quota | Endpoint e finestre disponibili, cache, OAuth stale; nessun refresh aggressivo o quota inventata |
| Persistenza | Lineage e audit bounded, cancellazione workspace/profilo, SQLite locale |
| Packaging | Identità app/dati/update feed distinti solo nella fase dedicata; non aggiornare il fork con release ufficiali per errore |

## Evidenze e riproduzione

Gli artefatti del run restano nella cartella di lavoro della chat:

```text
work/real-handoff-poc/evidence/report.json
work/real-handoff-poc/evidence/*.simple.json
work/real-handoff-poc/evidence/superset-owned-*.json
work/real-handoff-poc/evidence/owned-processes.json
work/local-handoff-spike/report.json
work/setup-local*.log
work/db-pg18-migrate.log
work/db-seed-retry.log
work/desktop-build-packaged.log
work/baseline-tests-{host,wrappers,shared}.log
work/local-pg18-override.yml
outputs/superset-baseline.png
```

I path work/outputs sono relativi alla cartella della chat, non al clone.
Gli output dei CLI contengono soltanto la conversazione di prova; non sono
stati pubblicati nel fork. Per rerun reali creare sessioni nuove: i vecchi
marker e ID sono evidenza del run, non input da riutilizzare alla cieca.

Per riavviare la baseline, mettere il Bun locale sul PATH, avviare il Compose
del clone insieme a `work/local-pg18-override.yml` con progetto
`superset-nicola-local-poc`, poi `bun run dev:desktop`. Non rieseguire il setup
stock senza l'override: tenterebbe di ripristinare PostgreSQL 17 sul volume
stock. Non eseguire teardown con `-v` per riprendere questa baseline.

### Test baseline eseguiti

| Ambito | Esito |
| --- | --- |
| Host: comando launch/resume/fork, store/binding, harness ref, default account, session account | 101 pass, 0 fail |
| Wrapper: default account resolver e report di lancio | 14 pass, 0 fail |
| Context handoff: cap, sanitizzazione e prompt | 12 pass, 0 fail |
| Spike offline txcript | 4 casi pass; formato sintetico con risultati stringa |
| Runtime Claude ↔ Codex | Resume pass; fedeltà output strutturati parziale |
| Runtime Superset | Native resume, ownership, stop, restart e stop finale pass |

Non sono stati eseguiti lint/typecheck/suite completa della monorepo: nessun
codice applicativo è cambiato. La build baseline e i test mirati sono evidenze
distinte dai check CI richiesti per i futuri branch di implementazione.

## Verifica finale

`bun run build` è terminato con exit code 0: due task riusciti, uno da cache,
durata 16m42s. Sono stati generati `Superset.app`, ZIP e DMG per macOS arm64
in `apps/desktop/release/`.

- `unzip -tq release/Superset-1.35.0-arm64-mac.zip`: exit 0, nessun errore.
- `hdiutil verify release/Superset-1.35.0-arm64.dmg`: exit 0, checksum valido.
- Firma ad-hoc; notarizzazione saltata dal builder perché non configurata.
- Il pacchetto non è stato installato né avviato: la prova di avvio e ownership
  riguarda l'app di sviluppo, con lo stesso checkout baseline.
- La working tree contiene soltanto i tre report nuovi in `plans/`; nessun
  file applicativo tracciato o lockfile è cambiato.
- L'app dev e i processi agent del POC sono stati fermati. I servizi Docker
  locali e i dati di sviluppo sono stati conservati per riprendere il lavoro.

Il primo ciclo richiesto dal §65 è concluso. Il gate di fedeltà del native
handoff resta parziale: il difetto txcript deve essere corretto e verificato
prima di procedere con provider e UI definitive.
