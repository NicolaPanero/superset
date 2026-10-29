# Paradev++ local-first: Jira affidabile, worklog e automazioni locali

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: questo piano segue `AGENTS.md` (root), `apps/desktop/AGENTS.md`, `packages/trpc/AGENTS.md` e la sezione "Paradev++ fork rules". Nasce dall'audit `docs/fork-product-audit-2026-10-30.html`.


## Purpose / Big Picture

Paradev++ è il fork personale di Superset/Paradev (repo `NicolaPanero/superset`). L'obiettivo di questo piano è che il lavoro quotidiano — prendere un task Jira, farlo lavorare a un agente, verificarlo, aprire la PR e registrare le ore — funzioni interamente sulla macchina dell'utente, senza dipendere dai servizi cloud o dal piano Pro a pagamento di Paradev.

Al termine l'utente potrà:

1. Modificare un task Jira dal dettaglio senza rischio di riscrivere valori vecchi.
2. Registrare ore su un'issue Jira dal dettaglio del task, vedere "le mie ore di oggi" e lo storico.
3. Configurare automazioni Jira locali con anteprima, avvio manuale, coda, limite di agenti contemporanei, ripetizione dei tentativi falliti e uno stato visibile fino all'esito.
4. Aggiungere trigger locali (commenti PR Bitbucket, CI fallita, orario) con template pronti.
5. Aprire una vista "Oggi" con ciò che richiede un'azione: agenti in attesa, PR da guardare, run da recuperare, ore registrate oggi.
7. Solo se lo attiva nelle impostazioni (spento di default), chiedere a mano una proposta di timesheet che considera sia i task chiusi senza ore sia quelli ancora in corso.
6. Non vedere più nell'interfaccia funzioni cloud/Pro (automazioni ufficiali hosted, Pages) a meno di attivarle esplicitamente, e non generare richieste di rete verso quei servizi quando sono nascoste.

Ogni milestone è un PR verso `fork/main` e quindi una release: ognuna deve essere utile da sola.


## Assumptions

- A1. Le automazioni ufficiali (router `packages/trpc/src/router/automation/`, servizio hosted con vincolo Pro, vedi `automation.ts:106` `requireAutomationsPlan`) non vengono usate né estese. Restano nel codice upstream intatte (regola fork: niente cancellazioni upstream), ma nascoste.
- A2. Pages è un servizio cloud (`cloudTrpc`, pubblicazione sui server ufficiali). Lo trattiamo come le automazioni ufficiali: nascosto di default. I report delle automazioni locali si salvano come file nel workspace.
- A3. Il motore Jira locale esistente (`packages/host-service/src/fork-integrations/fork-jira-automations.ts`) è la base: lo estendiamo, non lo riscriviamo da zero.
- A4. Le tabelle del fork si creano con SQL idempotente in `packages/host-service/src/db/fork-tables.ts` (`CREATE TABLE IF NOT EXISTS`) e si dichiarano in `packages/host-service/src/db/fork-schema.ts`. Non si usano le migration drizzle upstream (`packages/host-service/drizzle/`).
- A5. Le chiamate Jira usano il token API dell'utente tramite `ForkJiraProvider` (`packages/host-service/src/fork-integrations/fork-jira.ts`), cioè REST v3 di Jira Cloud. Niente webhook Jira (richiedono app Connect/OAuth ed endpoint pubblico): i trigger Jira restano a polling.


## Open Questions

Nessuna domanda aperta. Le cinque domande della prima stesura sono state decise (vedi Decision Log, D-Q1–D-Q5), su delega esplicita dell'utente ("vedi tu come meglio").


## Progress

- [x] (2026-10-30) Decise le domande aperte D-Q1–D-Q5.
- [x] (2026-10-30) Timesheet reso opzionale (spento di default, solo manuale) e allargato ai task in corso.
- [x] (2026-10-30) Milestone 1 — Pages tra le route Pro; pulsanti Pages, gruppo Pages del menu attività e opzione del pannello destro nascosti; query `latestRuns`, `automation.list` (cronologia e palette) e Pages delle PR spente con il flag.
- [x] (2026-10-30) Milestone 2 — bozza presa all'Edit, solo campi modificati, avviso di conflitto con "Save anyway"/"Discard my changes", metadata solo in modifica, invalidazioni mirate; mappatura stati per connessione e progetto (`fork_jira_status_mappings`, UI "Workflow statuses").
- [x] (2026-10-30) Milestone 3 — worklog: capability, storico paginato, "My time today", form con durata/giorno/ora, ora legale gestita, protezione dal doppio invio (`fork_jira_worklog_ops`).
- [x] (2026-10-30) Spike S1 — segnali trovati in `fanOutAgentLifecycle` (Start, PermissionRequest, Stop, Failed) per terminali e chat ACP.
- [x] (2026-10-30) Milestone 4 — motore v2 (`fork-automation-engine.ts`, `fork-automation-lifecycle.ts`), coda, limiti 2/1, retry 1/5/15 min, pausa dopo 3 errori, recupero al boot, anteprima, run manuale, modifica regole, comando di verifica, UI runs.
- [x] (2026-10-30) Milestone 5 — sorgenti Jira, commenti PR, check falliti, orario con finestra di recupero; template; limite di run per PR.
- [x] (2026-10-30) Milestone 6 — vista Today con voce in sidebar, ore di oggi, review richieste; timesheet opzionale (porting della skill, task in corso, orari in sequenza, conferma obbligatoria).
- [x] (2026-10-30) Typecheck desktop e host-service, Biome, `bun run test:fork` (1.391 test, 0 fallimenti), "What's new", FORK.md e docs/fork-integrations.md.
- [x] (2026-10-30) Traduzioni dei 123 nuovi messaggi nei 16 locale; `bun run check:i18n` verde. Il test `hardcoded-strings` di packages/i18n fallisce solo per voci già presenti su HEAD (ForkJiraTaskToolbar, ForkTasksBoundary, due "JQL" in ForkJiraAutomations).
- [x] (2026-10-30) Verifica: test di integrazione `fork-local-automations.integration.test.ts` (host reale, Jira finto) e revisione indipendente del diff. Corretti: run "in corso" che non liberavano lo slot dopo un riavvio, regola appena messa in pausa che avviava ancora run, "Run again" ripetibile e run ripetute ancora tra quelle da controllare, limite per PR consumato dai lanci falliti, nuovo baseline quando cambia "refire", azioni "verified"/"release" senza controllo di stato, doppio invio parallelo del worklog, versione di Jira persa dopo un conflitto, dialog che riapriva con la regola in modifica, "Register on Jira" bloccato dopo un invio parziale.
- [x] (2026-10-30) Verifica nell'app di sviluppo via CDP (stack locale, account Local Admin, porta di debug propria, clic reali): popup "What's new" nuovo; voce **Today** in sidebar e pagina con le quattro sezioni; con "Hide Pro features" acceso Pages è nascosto e senza richieste, spento compaiono Pages, Automations e Tasks; impostazione ripristinata. Non verificabile senza un Jira vero (il sito deve essere `*.atlassian.net`): Log time, Workflow statuses, Timesheet proposals e le automazioni su issue reali.
- [ ] Prova con un progetto Jira di prova e confronto manuale con `worklog.py propose` sullo stesso periodo.
- [ ] Commit e PR verso `fork/main` (su richiesta dell'utente).


## Surprises & Discoveries

- Observation: il fork aveva già un flag per le funzioni cloud/Pro, spento di default.
  Evidence: `hideProFeatures` in `apps/desktop/src/renderer/stores/fork-cli-options.ts`, letto da `useForkProFeatures()`; `/automations` era già in `PRO_ROUTES` con redirect in `routes/_authenticated/layout.tsx`. Le automazioni locali stanno in `/tasks`, escluso dal redirect.
- Observation: Pages era raggiungibile da cinque punti e le sue query partivano comunque.
  Evidence: sidebar (due layout), menu attività del workspace, pannello destro, prove della PR (`usePullRequestEvidence`).
- Observation: gli eventi di ciclo di vita dell'agente arrivano già all'host da terminali e chat ACP.
  Evidence: `packages/host-service/src/trpc/router/notifications/fan-out-agent-lifecycle.ts`, chiamato da `notifications.ts` e `chat-v3/chatAgentBridge.ts`.
- Observation: `ForkScmProvider.checks` e `comments` coprono GitHub e Bitbucket, quindi i trigger PR funzionano con entrambi.
- Observation: con zsh `$FILES` non si divide in parole; Biome riceveva un solo argomento ("File name too long"). Usare `xargs`.


## Decision Log

- Decision: escludere dal piano le automazioni ufficiali hosted/Pro; la vista automazioni mostra solo il motore locale.
  Rationale: l'utente vuole ridurre al minimo la dipendenza dai servizi cloud e Pro a pagamento. Una vista unificata Locale/Hosted (proposta nell'audit) sarebbe un investimento in una funzione che non userà.
  Date/Author: 2026-10-30 / Nicola.
- Decision: Pages nascosto di default dietro lo stesso flag cloud; i report delle automazioni sono file locali nel workspace.
  Rationale: stessa motivazione; Pages pubblica sui server ufficiali.
  Date/Author: 2026-10-30 / piano.
- Decision: il codice upstream delle funzioni cloud non si cancella; si nasconde con hook minimi.
  Rationale: regola del fork "Keep every change as far from upstream as possible" per ridurre conflitti ai merge di upstream.
  Date/Author: 2026-10-30 / piano.
- D-Q1: limite globale di 2 agenti contemporanei avviati dalle automazioni e 1 per progetto, entrambi modificabili nelle impostazioni delle automazioni locali.
  Rationale: ogni agente consuma quota dell'account e CPU (worktree, build, test). Con 2 l'utente può seguire i risultati; 1 per progetto evita due agenti che lavorano sullo stesso repository e sulle stesse dipendenze.
  Date/Author: 2026-10-30 / piano, su delega dell'utente.
- D-Q2: fuso orario di sistema; override opzionale per connessione Jira (campo `timezone` nei metadata della connessione).
  Rationale: l'utente lavora in un solo fuso; l'override costa poco e copre un'istanza Jira usata da un'altra sede.
  Date/Author: 2026-10-30 / piano, su delega dell'utente.
- D-Q3: con "Funzioni cloud" spento, le route cloud (`/pages` e la UI delle automazioni ufficiali) reindirizzano a `/`, oltre a essere tolte dalla navigazione.
  Rationale: un link vecchio o un deep link non deve riaprire una schermata cloud né far partire le sue query.
  Date/Author: 2026-10-30 / piano, su delega dell'utente.
- D-Q4: l'app reimplementa in TypeScript, dentro host-service, l'algoritmo della skill personale `jira-worklog` (`~/.agents/skills/jira-worklog/scripts/worklog.py`). Non chiama lo script e non dipende da Python né da file fuori dal repo. La skill resta com'è e continua a funzionare.
  Rationale: chiamare uno script personale da un fork pubblico creerebbe una dipendenza da file presenti solo su questa macchina (venv in un'altra repo, config in `~/.config/jira-worklog/`) e da valori di lavoro specifici (progetto, campo modulo `cf[10585]`). Rifare solo la "raccolta dati", come proposto nella prima stesura, non sarebbe servito: l'utente usa la skill proprio per avere la proposta completa del timesheet. Le regole dell'algoritmo sono descritte nella Milestone 6. Nessun valore specifico del lavoro dell'utente entra nel codice: progetto, campo modulo, ore minime/massime e ferie sono impostazioni.
  Date/Author: 2026-10-30 / piano, su delega dell'utente.
- Decision (rivede D-Q4): la proposta automatica delle ore è una funzione opzionale, spenta di default, e si avvia solo a mano. Con l'opzione spenta non c'è nessun ingresso nella UI, nessuna sezione in "Oggi" sui giorni vuoti e nessuna richiesta a Jira per il timesheet. Nemmeno con l'opzione accesa un'automazione può prepararla o ricordarla. Gli orari di inizio delle voci non sono più casuali: sono in sequenza dall'inizio della giornata lavorativa configurata, saltano la pausa pranzo e restano modificabili prima della conferma.
  Rationale: l'utente considera "border line" il riempimento automatico delle ore. Quello che si registra deve restare una scelta esplicita e riconoscibile come proposta. Orari casuali farebbero sembrare la proposta una rilevazione reale.
  Date/Author: 2026-10-30 / Nicola.
- Decision: i task in corso entrano nella proposta insieme ai task chiusi senza ore.
  Rationale: il lavoro dei giorni in cui un task è ancora aperto oggi non comparirebbe mai, oppure finirebbe tutto sui giorni vicini alla chiusura.
  Date/Author: 2026-10-30 / Nicola.
- Decision: niente nuovo flag "Funzioni cloud"; si riusa `hideProFeatures` (Settings → Fork → Hide paid features), già spento di default.
  Rationale: stesso significato, nessuna nuova chiave localStorage, nessun secondo interruttore da spiegare.
  Date/Author: 2026-10-30 / implementazione.
- Decision: i pulsanti Pages si nascondono con l'attributo `hidden`, non avvolgendoli in un componente.
  Rationale: avvolgerli reindentava ~50 righe di un file upstream; l'attributo costa una riga.
  Date/Author: 2026-10-30 / implementazione.
- Decision: le nuove colonne delle regole stanno in tabelle nuove (`fork_automation_rule_options`, `fork_automation_seen`, `fork_automation_attempts`, `fork_automation_settings`) invece di `ALTER TABLE`.
  Rationale: `CREATE TABLE IF NOT EXISTS` è idempotente senza controlli su `PRAGMA table_info`; la tabella `fork_jira_automation_runs` resta e riceve ancora i claim, così una versione precedente non riavvia issue già gestite.
  Date/Author: 2026-10-30 / implementazione.
- Decision: si ripetono in automatico solo i lanci falliti; un agente che fallisce dopo essere partito non viene rilanciato.
  Rationale: rilanciare un agente che ha già lavorato può duplicare modifiche; la ripetizione resta un'azione esplicita ("Run again").
  Date/Author: 2026-10-30 / implementazione.
- Decision: la voce "Log time" sta nel menu del dettaglio e nella sezione Time, non nelle righe della lista.
  Rationale: righe e card non hanno un menu; aggiungerlo per una sola voce costa più del beneficio.
  Date/Author: 2026-10-30 / implementazione.
- Decision: il fuso del worklog è quello di sistema (mostrato nel form); il timesheet usa il fuso salvato nelle sue impostazioni. Niente override nei metadata della connessione.
  Rationale: un solo utente in un fuso; il timesheet ha già un posto per le impostazioni.
  Date/Author: 2026-10-30 / implementazione.
- Decision: il template "Daily digest" scrive `DIGEST.md` nel workspace creato dalla run, non in `~/.paradev/digests/`.
  Rationale: l'agente lavora nel worktree; scrivere fuori dal workspace richiederebbe permessi in più.
  Date/Author: 2026-10-30 / implementazione.
- D-Q5: mappatura degli stati salvata per connessione e per chiave di progetto Jira.
  Rationale: i workflow Jira sono definiti per progetto; la stessa chiave di progetto su due istanze diverse può avere stati diversi.
  Date/Author: 2026-10-30 / piano, su delega dell'utente.


## Outcomes & Retrospective

Tutte le milestone sono implementate e coperte da test del fork; restano traduzioni, verifica nell'app reale e PR. File upstream toccati, tutti con hook di poche righe: `DashboardSidebarHeader.tsx` (+7), `WorkspaceActivityMenu.tsx` (+6/−1), `MenuGroup.tsx` (prop `hidden` opzionale), `paneOptions.ts` (gate `pages` opzionale), `page.tsx` del workspace, `useFailedAutomations.ts`, `HistoryDropdown.tsx`, `RecentlyViewedFrame.tsx`, `usePullRequestEvidence.ts`, `fan-out-agent-lifecycle.ts` (+2). Versione delle integrazioni: 8 (stati e worklog), 9 (motore v2 e timesheet); i renderer controllano la versione prima di usare le nuove procedure.


## Context and Orientation

Parti coinvolte:

- **App desktop** (`apps/desktop`): Electron. Il "renderer" (`apps/desktop/src/renderer/`) è la UI React, ambiente browser, senza moduli Node. I componenti del fork per Jira/Bitbucket sono in `apps/desktop/src/renderer/components/ForkIntegrations/components/` (es. `ForkTaskDetail`, `ForkJiraTasks`, `ForkJiraAutomations`). La visibilità delle funzioni Pro è decisa da `apps/desktop/src/renderer/lib/fork-settings-visibility.ts`.
- **Host service** (`packages/host-service`): processo Node locale che possiede il database SQLite dell'utente, avvia workspace e agenti e parla con Jira. Il codice del fork è in `packages/host-service/src/fork-integrations/`. Il renderer lo chiama via tRPC (chiamate di procedura tipizzate su HTTP) attraverso il router `packages/host-service/src/trpc/router/fork-integrations/fork-integrations.ts` (es. `client.forkTasks.edit.mutate(...)`). Le procedure tRPC sono usate anche da build già rilasciate: aggiungere procedure o campi opzionali è sicuro, rinominare o rimuovere no (vedi `packages/trpc/AGENTS.md` e la skill `.agents/skills/trpc-compat/SKILL.md`).
- **Provider Jira**: `ForkJiraProvider` in `packages/host-service/src/fork-integrations/fork-jira.ts`. Metodi esistenti: `list`, `get`, `transitions`, `advance` (sposta l'issue in "progress"/"review" cercando transizioni per nome, regex `/review/i`), `editMetadata`, `assignees`, `comments`, `edit`, `transition`, `comment`, `remove`. Le richieste passano da `this.api.request(connectionId, path, method?, body?)`.
- **Motore automazioni locale**: `fork-jira-automations.ts`. `startForkJiraAutomations` esegue `pollForkJiraAutomations` ogni 60 secondi. Per ogni regola abilitata esegue la JQL, e per ogni issue inserisce una riga in `fork_jira_automation_runs` con chiave primaria `(rule_id, task_id)`: questo è il "claim" persistente che impedisce doppi avvii. La prima scansione (`initialized=false`) registra le issue esistenti senza avviare agenti. Al massimo 5 avvii per regola per scansione; massimo 1000 issue per JQL. Il lancio crea un workspace (`workspacesRouter.createCaller(ctx).create`), collega l'issue (`forkLinkTask`), avvia l'agente (`launchForkJiraAgent`) e sposta l'issue in progress (`forkAdvanceLinkedTasks`).
- **Database del fork**: tabelle create in `packages/host-service/src/db/fork-tables.ts` (stringa SQL `FORK_TABLES_SQL` con `CREATE TABLE IF NOT EXISTS`), tipi Drizzle in `packages/host-service/src/db/fork-schema.ts`.
- **i18n**: le stringhe UI usano Lingui (`<Trans>`, `t({ message })`) con il testo inglese come id. Ogni PR deve tradurre in tutti i 17 locale e passare `bun run check:i18n`.
- **Popup "What's new"**: ogni PR con funzioni visibili aggiorna `apps/desktop/src/renderer/components/ForkWhatsNewNotice/ForkWhatsNewNotice.tsx` (3–5 righe, nuovo `FORK_WHATS_NEW_ID`).

Regole del fork da rispettare in ogni milestone: branch da `fork/main`, PR verso `fork/main`; nuova logica in file `fork-*`/`Fork*`; nei file upstream solo hook minimi (un import e una chiamata); test in file `fork-*.test.ts`; commit come `Nicola Panero <panero.nicola01.np@gmail.com>`, senza attribuzioni AI.


## Plan of Work

### Milestone 1 — Modalità local-first

Scopo: un unico interruttore "Funzioni cloud" (default spento) che nasconde automazioni ufficiali e Pages e spegne le loro query, senza toccare le funzioni locali.

Lavoro:

- In `apps/desktop/src/renderer/lib/fork-settings-visibility.ts` aggiungere `isForkCloudRoute(pathname)` con `/pages` e `/automations` (la UI ufficiale), separato da `PRO_ROUTES`. Verificare prima quale route serve `ForkJiraAutomations`: se condivide `/automations`, la route resta visibile ma il contenuto mostra solo il pannello locale (hook nel componente route upstream che, a flag spento, rende `ForkJiraAutomations`).
- Nascondere gli ingressi Pages: `DashboardSidebarHeader.tsx` (pulsanti alla riga ~492), `WorkspaceActivityMenu.tsx:265` (anche `enabled: false` sulla query Pages), `RightPaneArea/paneOptions.ts:47`. Un hook per file: `if (!forkCloudEnabled) ...`.
- In `useFailedAutomations.ts:46` aggiungere `enabled: forkCloudEnabled` alla query `latestRuns`.
- Esporre il flag nelle impostazioni del fork accanto all'attuale opzione Pro (stesso storage già usato dal flag Pro; non aggiungere chiavi localStorage nuove senza registrarle in `persisted-key-registry.test-data.ts`).
- Redirect a `/` per le route cloud a flag spento (D-Q3), con un hook nel `beforeLoad` della route upstream o nel gate del layout dashboard.

Accettazione: con il flag spento non compaiono Pages né automazioni ufficiali; nel pannello Network di DevTools aprendo dashboard e un workspace non partono richieste a Pages né a `automation.latestRuns`. Con il flag acceso tutto torna come upstream. Test `apps/desktop/src/renderer/lib/fork-settings-visibility.fork.test.ts` (o file `fork-*.test.ts` equivalente) su `isForkCloudRoute`.

### Milestone 2 — Integrità Jira

Scopo: eliminare la riscrittura di valori obsoleti e le richieste inutili.

Lavoro in `ForkTaskDetail.tsx` (file del fork):

- Oggi gli stati della bozza sono inizializzati una volta con `useState(task.title)` ecc. Spostare la bozza in un oggetto `draft` creato da una funzione `forkTaskDraft(task)` al click su Edit (`startEdit = () => { setDraft(forkTaskDraft(task)); setEditing(true) }`) e azzerato all'uscita. `cancelEdit` diventa `setDraft(null)`.
- Estrarre `forkTaskEditPatch({ base, draft })` in `ForkTaskDetail/utils/forkTaskEditPatch/` che restituisce solo i campi diversi dalla `base` catturata all'Edit (anche `title`, oggi inviato sempre). Se la patch è vuota, Save chiude senza chiamare Jira.
- Rilevare conflitti: al Save rileggere l'issue (`forkTasks.get`) e se un campo nella patch è cambiato rispetto alla `base`, mostrare un dialog "Questa issue è cambiata su Jira" con le due versioni e lasciare scegliere.
- Query `editMetadata`: `enabled: !!client && editing`.
- Invalidazione: sostituire `invalidateQueries({ queryKey: ["fork-integrations"] })` con chiavi mirate (lista task della connessione, dettaglio, commenti dell'issue).

Lavoro in host-service:

- Mappatura stati configurabile: nuova tabella `fork_jira_status_mappings (scope, connection_id, project_key, progress_status, review_status, PRIMARY KEY(scope, connection_id, project_key))` in `fork-tables.ts`/`fork-schema.ts`. `ForkJiraProvider.advance` usa la mappatura se presente, altrimenti l'euristica attuale. Hook minimo: la modifica è tutta in file `fork-*`.
- Nuove procedure tRPC additive `forkTasks.statusMapping` (query) e `forkTasks.setStatusMapping` (mutation); UI di configurazione nella card della connessione Jira (`ForkConnectionCard`), con select popolata dagli stati del progetto.

Accettazione: test `forkTaskEditPatch.test.ts` (titolo cambiato altrove non viene reinviato; patch vuota; solo labels); test host `fork-jira-workflow.test.ts` per `advance` con mappatura in italiano ("In revisione"). Manuale: aprire un task, modificare il titolo su Jira web, tornare all'app, Edit → Save senza toccare il titolo: il titolo su Jira resta quello nuovo.

### Milestone 3 — Worklog manuale

Scopo: registrare ore dal dettaglio del task in modo sicuro.

Host-service (`fork-jira.ts` e nuovo `fork-jira-worklog.ts`):

- `worklogs(connectionId, key, { startAt })`: `GET /rest/api/3/issue/{key}/worklog?startAt=&maxResults=50`, mappato in `{ id, author: {id,name,avatar}, started, timeSpentSeconds, comment (testo da ADF con fork-adf.ts), created }`.
- `addWorklog(connectionId, key, { started, timeSpentSeconds, comment })`: `POST /rest/api/3/issue/{key}/worklog?adjustEstimate=leave`. `started` nel formato Jira `yyyy-MM-dd'T'HH:mm:ss.SSSZ` con offset calcolato per quella data nel fuso di sistema, oppure nell'override della connessione (D-Q2), gestendo l'ora legale: se l'ora locale non esiste (salto in avanti) rifiutare con messaggio; se è ambigua (salto indietro) usare la prima occorrenza e mostrarlo.
- `worklogCapability(connectionId, key)`: time tracking abilitato (`GET /rest/api/3/configuration/timetracking`) e permesso `WORK_ON_ISSUES` (`GET /rest/api/3/mypermissions?issueKey=&permissions=WORK_ON_ISSUES`).
- Protezione doppio invio: tabella `fork_jira_worklog_ops (id PRIMARY KEY, scope, connection_id, issue_key, started, seconds, comment, state 'pending'|'done'|'unknown', worklog_id, created_at)`. Prima del POST si inserisce `pending`; dopo successo `done`. Se il POST va in timeout lo stato diventa `unknown`: alla riapertura o al retry si rileggono i worklog dell'issue e si cerca una voce dell'utente con stesso `started` e durata; se c'è, `done` senza reinviare. Le righe `done` più vecchie di 30 giorni si cancellano al boot.
- Procedure tRPC additive: `forkTasks.worklogs`, `forkTasks.worklogCapability`, `forkTasks.addWorklog`, `forkTasks.myWorklogToday` (somma dei worklog dell'utente con `started` oggi, via JQL `worklogAuthor = currentUser() AND worklogDate = startOfDay()` + lettura worklog delle issue risultanti).

Renderer: nuovo `ForkTaskDetail/components/ForkTaskWorklog/` con pulsante "Log time", form (durata `45m`/`1h 30m`/`2h` analizzata da `utils/parseForkDuration`, giorno, ora inizio, commento, account Jira mostrato), storico paginato, riga "My time today" separata dal totale issue. Se `worklogCapability` è negativo: spiegazione e link all'issue, nessun form. Voce "Log time" anche nel menu della riga/card in `ForkJiraTasks`.

Accettazione: test `parseForkDuration.test.ts`, `fork-jira-worklog.test.ts` (offset con ora legale 29/03 e 25/10 Europe/Rome; riconciliazione `unknown` → `done` senza secondo POST, con `api.request` finto). Manuale su un'issue di prova: registrare 15m, verificarlo su Jira web, ripetere il click veloce due volte e vedere un solo worklog.

### Spike S1 — Segnali di fine lavoro dell'agente

Obiettivo: capire quali segnali esistono già per dire "l'agente ha finito" o "aspetta input" per sessioni chat ACP e terminale (indicatori di stato nella sidebar, notifiche di fine turno, `chat_quota_recovery`). Time box: mezza giornata, solo lettura e un prototipo non committato. Esito: elenco dei segnali affidabili da usare nella Milestone 4, registrato in Surprises & Discoveries e nel Decision Log. Se per il terminale non esiste un segnale affidabile, lo stato resta `running` fino ad azione dell'utente ("Mark done") o fino all'apertura di una PR dal workspace.

### Milestone 4 — Motore automazioni locali v2

Scopo: ogni avvio è un "tentativo" con stato persistente, visibile e recuperabile.

Dati (additivi, la vecchia `fork_jira_automation_runs` resta come claim di deduplica):

    fork_jira_automation_attempts (
      id text PRIMARY KEY, rule_id text REFERENCES fork_jira_automations(id) ON DELETE CASCADE,
      task_id text, task_key text, event_key text,
      state text  -- queued | launching | running | waiting_input | agent_done | verified | failed | cancelled | unknown
      workspace_id text, terminal_id text, previous_attempt_id text,
      error text, created_at integer, updated_at integer
    )

`event_key` = `task_id` + versione dell'evento (per Jira: `updated` o stato al momento del match), così una riapertura configurata come "nuovo evento" genera un nuovo tentativo; la regola ha un nuovo campo `refire text DEFAULT 'never'` ('never' | 'on_reopen'). Nuovo campo `fork_jira_automations.paused_reason text`.

Logica in `fork-jira-automations.ts` (separare in `fork-automation-queue.ts` e `fork-automation-attempts.ts`):

- La scansione non lancia più direttamente: mette in coda (`queued`). Un dispatcher separato prende dalla coda rispettando il limite globale (default 2) e per progetto (default 1), modificabili nelle impostazioni (D-Q1), contando i tentativi in `launching|running|waiting_input`. Il limite di 5 per scansione resta come protezione.
- Al boot, i tentativi in `launching` diventano `unknown` (comportamento attuale del claim) e si mostrano da verificare; quelli `queued` ripartono.
- Retry: azione "Retry" crea un nuovo tentativo con `previous_attempt_id`; massimo 3 tentativi automatici per evento con backoff (1, 5, 15 minuti), poi la regola va in pausa con `paused_reason` dopo 3 errori consecutivi.
- Stato dopo il lancio: aggiornato dai segnali dello Spike S1; "Agent done" non chiude né sposta l'issue in Done. `verified` solo quando l'utente conferma o quando un controllo configurato nella regola (comando di verifica opzionale, es. `bun test`) termina con exit 0.
- Sleep/wake: alla ripresa dopo una pausa di più di 10 minuti tra due tick, la scansione salta gli eventi più vecchi della finestra configurata nella regola (`catchup_minutes`, default 120) e li mostra come "skipped".
- Anteprima: procedura `forkAutomations.preview({ ruleDraft })` che esegue la JQL e indica per ogni issue se verrebbe avviata, già gestita o esclusa e perché. Nessun effetto.
- Run-now: `forkAutomations.runNow({ ruleId, taskKey, dryRun })`; con `dryRun` crea solo il prompt finale e lo mostra.
- Editing completo della regola (oggi limitato) e "Disable/Pause".

UI in `ForkJiraAutomations`: lista regole con ultimo poll, prossimo poll, errori; per ogni regola la lista dei tentativi con stato, link a workspace e sessione, azioni Retry/Cancel/Open. Pagina di modifica nella forma "Quando… Se… Allora…".

Accettazione: test `fork-automation-queue.test.ts` con clock iniettato (nessuna attesa reale): limite globale rispettato; boot con `launching` → `unknown`; retry crea catena; pausa dopo 3 errori; catchup che salta eventi vecchi. Manuale: regola su progetto di prova con 4 issue, limite 2 → partono 2, le altre restano `queued` e partono quando un tentativo passa ad `agent_done`.

### Milestone 5 — Trigger locali estensibili e template

Scopo: un unico contratto evento per più sorgenti, tutte locali.

- Introdurre `ForkAutomationSource` (`fork-automation-sources.ts`): `{ kind, poll(ctx, rule) => ForkAutomationEvent[] }` con `ForkAutomationEvent = { key, title, url, payload, occurredAt }`. Il motore della Milestone 4 diventa generico; Jira è la prima sorgente.
- Sorgenti: Jira (JQL, esistente); Bitbucket PR comments (nuovi commenti su PR collegate a workspace, via provider in `fork-scm.ts`/`fork-provider.ts`, azione "rilancia l'agente nel workspace della PR"); CI fallita (stato build Bitbucket sul branch del workspace); Schedule (espressione oraria locale, es. giorni feriali 09:00).
- Le colonne della regola diventano `source_kind` + `source_config` (JSON); le regole esistenti si leggono come `source_kind='jira'` con la JQL attuale (default SQL), nessuna migrazione distruttiva.
- Template: Triage Jira (analisi e domande, nessuna modifica al ticket), Correzioni da commenti PR (commit nel workspace, nessun commento pubblicato), CI fallita (tentativi limitati a 2), Digest giornaliero (file Markdown in `$HOME/.paradev/digests/<data>.md` aperto nell'app; mai Pages).

Accettazione: test per ogni sorgente con risposte API finte; un evento con la stessa `key` non genera due tentativi. Manuale: commento su una PR di prova → entro un poll un tentativo nuovo nel workspace della PR.

### Milestone 6 — Vista "Oggi" e timesheet assistito

Vista "Oggi": route fork `/today` (componente `ForkToday` sotto `apps/desktop/src/renderer/routes/_authenticated/_dashboard/`, voce in sidebar con hook minimo). Sezioni: agenti in `waiting_input`, PR assegnate o con nuovi commenti (dati Bitbucket già usati da `packages/host-service/src/fork-integrations/fork-sidebar-pull-requests.ts`), tentativi `failed|unknown`, ore registrate oggi (dalla Milestone 3). I giorni del periodo ancora vuoti compaiono solo con l'opzione timesheet accesa. Ogni elemento porta a un'azione: apri, retry, registra ore.

Timesheet assistito. È la versione nell'app della skill personale `jira-worklog`, che oggi l'utente esegue da terminale (D-Q4). È **opzionale e spenta di default**: si attiva in Impostazioni → Jira con "Timesheet proposals". Da spenta non compare nessun ingresso e non parte nessuna richiesta. Da accesa la proposta parte solo dal pulsante "Propose hours" nella vista "Oggi" o nel dettaglio della connessione Jira; non viene mai generata, ricordata o inviata da un'automazione. La logica va in `packages/host-service/src/fork-integrations/fork-timesheet.ts` (calcolo puro, senza rete) e in `fork-timesheet-jira.ts` (lettura dei dati e invio). Regole, prese dalla skill:

- Task candidati, due gruppi mostrati separati nella UI:
  - **Chiusi**: issue portate dall'utente in uno stato della categoria "done" (Resolved, Risolto, Closed, Chiuso, Done) e con `timespent` vuoto.
  - **In corso**: issue assegnate all'utente in uno stato della categoria "indeterminate" (In Progress, In Review e simili). Sono candidate anche se hanno già ore: quelle registrate restano e contano nel tetto dei giorni.

  La JQL di base usa il progetto delle impostazioni, con un filtro modulo opzionale tramite un campo personalizzato configurabile.
- Periodo: quello scelto dall'utente (da/a); default ultimi 30 giorni fino a oggi.
- Giorni lavorativi: esclusi sabato, domenica, festivi nazionali italiani (con Pasquetta calcolata dalla Pasqua) e ferie delle impostazioni, più ferie aggiunte solo per questa proposta.
- Ore già registrate dall'utente in un giorno contano nel tetto e non si toccano. Un giorno con almeno il minimo (default 6 h) non riceve altre ore. Nessun giorno supera il massimo (default 8 h). Step 30 minuti; il totale di un giorno non è sempre il massimo.
- Un task chiuso copre solo i giorni lavorativi tra la sua creazione e la sua chiusura; se la chiusura cade in un giorno non lavorativo, l'ultimo giorno utile è il lavorativo precedente. Un task in corso copre i giorni lavorativi dal primo passaggio in uno stato "indeterminate", letto dal changelog dell'issue (`GET /rest/api/3/issue/{key}?expand=changelog`; senza transizioni si usa la creazione), fino a oggi o alla fine del periodo. Oggi è compreso solo se la proposta viene chiesta dopo l'orario di fine giornata configurato. Un task può coprire più giorni e superare 8 ore in totale.
- La ripartizione tra task usa lo stesso peso della skill (quota "effort" basata sui commenti); i task che ricevono molte più ore della loro quota vengono mostrati come "gonfiati", mai nascosti.
- Orari di inizio in sequenza dall'inizio della giornata configurato (default 09:00), una voce dopo l'altra, saltando la pausa pranzo (default 13:00–14:30). Niente orari casuali. Ogni orario è modificabile prima della conferma.
- Nessun commento nei worklog.
- Scrittura solo dopo conferma esplicita nella UI; `adjustEstimate=leave`; l'invio usa `addWorklog` della Milestone 3, quindi beneficia della protezione dal doppio invio. Mai un invio programmato, e nessuna automazione può preparare o segnalare la proposta.

Le impostazioni (abilitazione, default spenta; progetto; campo modulo; ore minime/massime; step; inizio giornata e pausa pranzo; ferie) stanno nella tabella `fork_timesheet_settings (scope, connection_id, settings_json, PRIMARY KEY(scope, connection_id))`. Nessun valore di default è legato al lavoro dell'utente: al primo uso la UI chiede il progetto.

Procedure tRPC additive (`propose` e `post` rifiutano la richiesta se l'opzione è spenta): `forkTimesheet.settings`, `forkTimesheet.saveSettings`, `forkTimesheet.propose({ connectionId, from?, to?, modules?, extraVacation? })` che restituisce voci, totali per giorno, giorni pieni saltati, giorni sotto il minimo o sopra il massimo, task gonfiati e un flag `valid`; `forkTimesheet.post({ proposalId })` che invia le voci confermate. Le proposte si salvano in `fork_timesheet_proposals` e scadono dopo 7 giorni.

UI, visibile solo con l'opzione accesa: tabella giorni × task, con i task in corso marcati come tali e le ore proposte modificabili prima della conferma; evidenza dei giorni sotto il minimo e dei task gonfiati; pulsante "Register on Jira" disabilitato se `valid` è falso.

Accettazione: `fork-timesheet.test.ts` con dati finti e un generatore casuale con seed fisso: festivi italiani (25/04, Pasquetta 2026 = 06/04); nessun giorno oltre 8 h; giorno già a 6 h saltato; chiusura di domenica che usa il venerdì; ore tutte multiple di 30 minuti; orari di inizio in sequenza e mai tra 13:00 e 14:30; un task in corso con transizione a "In Progress" del 10 copre dal 10 a ieri; un task in corso che ha già 2 h su un giorno le conserva e il giorno non supera il massimo; con opzione spenta `propose` restituisce errore e nessuna chiamata Jira. Test renderer: con opzione spenta nessun ingresso del timesheet è visibile. Confronto manuale una tantum, non nel repo: sullo stesso periodo eseguire `worklog.py propose` e `forkTimesheet.propose` e verificare che, per i soli task chiusi, task candidati, giorni saltati e totali per giorno coincidano. Orari e task in corso differiscono per scelta. Le differenze vanno annotate in Surprises & Discoveries.


## Concrete Steps

Per ogni milestone, dalla root del worktree:

    git fetch fork
    git switch -c fork/<nome-milestone> fork/main
    # ... modifiche ...
    bun run check:i18n
    bun run --filter @superset/desktop typecheck
    bun run --filter @superset/host-service typecheck
    bun run test:fork
    # Expected: typecheck senza errori; check:i18n senza messaggi mancanti; test:fork 0 fail
    git diff --numstat fork/main...HEAD | grep -vi fork
    # Expected: solo file upstream con pochi righe aggiunte (hook); oltre ~10 righe spostare la logica in file fork

Prima del PR aggiornare `ForkWhatsNewNotice.tsx` (highlights + nuovo `FORK_WHATS_NEW_ID`) e tradurre nei 17 locale.


## Validation and Acceptance

Verifica nell'app reale con la skill `.agents/skills/cdp-verification/SKILL.md` (pilotare il renderer via Chrome DevTools Protocol). Per le parti Jira usare un progetto Jira di prova: mai worklog o transizioni di prova su issue reali di lavoro. Criteri osservabili per milestone sono indicati nel Plan of Work. Criterio globale: con "Funzioni cloud" spento, un'intera giornata (task → agente → PR → worklog → Oggi) non produce richieste verso API cloud Paradev oltre a quelle già necessarie per login e aggiornamenti.


## Idempotence and Recovery

Le tabelle si creano con `CREATE TABLE IF NOT EXISTS`; le nuove colonne su tabelle esistenti con `ALTER TABLE ... ADD COLUMN` protetto da controllo `PRAGMA table_info` nello stesso file `fork-tables.ts`, così l'avvio ripetuto non fallisce. Nessuna tabella esistente viene eliminata o rinominata. Ogni milestone è un PR separato: se una release crea problemi si fa revert di quel PR; le tabelle nuove restano inerti. Il motore v2 legge ancora i claim di `fork_jira_automation_runs`, quindi tornare alla versione precedente non riavvia issue già gestite.


## Interfaces and Dependencies

Tipi principali (in `packages/shared/src/fork-integrations` o accanto ai file host del fork):

    type ForkWorklog = { id: string; author: { id: string; name: string; avatarUrl?: string };
      started: string; timeSpentSeconds: number; comment: string; created: string };
    type ForkWorklogInput = { connectionId: string; key: string; started: string;
      timeSpentSeconds: number; comment?: string; clientOpId: string };
    type ForkAutomationAttemptState = "queued" | "launching" | "running" | "waiting_input"
      | "agent_done" | "verified" | "failed" | "cancelled" | "unknown";
    interface ForkAutomationSource { kind: "jira" | "bitbucket_pr_comments" | "ci_failure" | "schedule";
      poll(ctx: HostServiceContext, rule: ForkAutomationRule): Promise<ForkAutomationEvent[]> }

Nessuna nuova dipendenza npm. Nessuna dipendenza da `packages/trpc` (API cloud) per le funzioni nuove.


---

Nota di revisione 2026-10-30: prima stesura dalle proposte dell'audit, escludendo la vista unificata con le automazioni ufficiali e l'uso di Pages per i report, su richiesta dell'utente di restare indipendente dai servizi cloud/Pro.

Nota di revisione 2026-10-30 (2): l'utente ha delegato le decisioni. Le domande aperte sono passate nel Decision Log. La Milestone 6 ora porta nell'app l'algoritmo completo della skill personale `jira-worklog`. Prima prevedeva solo bozze senza durate: l'utente usa la skill per avere il timesheet completo, quindi la versione ridotta non gli sarebbe servita.

Nota di revisione 2026-10-30 (3): su richiesta dell'utente la proposta delle ore è opzionale, spenta di default e solo manuale, e comprende anche i task in corso. Gli orari casuali della skill sono sostituiti da orari in sequenza modificabili.

Nota di revisione 2026-10-30 (4): implementazione completata per tutte le milestone; aggiornati Progress, Surprises & Discoveries, Decision Log (riuso del flag esistente, tabelle nuove al posto di ALTER, retry solo dei lanci, posizione di "Log time", fuso, digest nel workspace) e Outcomes.

Nota di revisione 2026-10-30 (5): dopo la verifica nell'app, aggiunte due funzioni richieste a parte. (a) Il modello scelto nel selettore della chat si salva nei dati del pannello (`chatModelId` e `chatModelLabel`, via `useForkPersistChatModel`): prima la ripresa usava solo il modello della creazione, quindi Cursor tornava ad Auto. Causa letta nel codice (`AcpChatPane.start` e `SessionView`), non riprodotta con un account Cursor. (b) Controllo giornaliero dei CLI degli agenti (`fork-agent-cli-updates.ts`, router `forkAgentCli`, versione integrazioni 10, popup in basso a destra e sezione in Fork Settings); copre Claude Code e Codex, non cursor-agent e grok perché non c'è una fonte di versioni verificata. Incidente: un `git checkout` sui cataloghi i18n ha annullato traduzioni non committate; ripristinate dal catalogo compilato (105 su 125 per lingua) e il resto ritradotto.
