# Piano per le pull request dei repository aggiuntivi

Il workspace deve gestire le PR del repository Git selezionato, comprese le
cartelle aggiuntive condivise e quelle isolate in un worktree. La schermata
Pull Requests deve includere questi repository e conservare la destinazione
corretta durante lettura, creazione, review, merge e apertura di un workspace.

L'implementazione resta nel fork, con API additive e piccoli agganci nei file
upstream. Le attività sotto sono da eseguire; l'analisi di partenza è in
[fork-workspace-pr-repositories.md](../docs/fork-workspace-pr-repositories.md).

## Comportamento da ottenere

| Superficie | Regola |
| --- | --- |
| Selettore repository del workspace | Cambia il contesto di file, Changes, Review, branch e PR |
| Barra Changes e menu di pubblicazione | Stato, commit, push e creazione PR riguardano il repository selezionato |
| Tab Review | PR, thread, commenti e navigazione ai diff riguardano il repository selezionato |
| Pannello di una PR già aperta | Rimane legato alla propria PR quando cambia il selettore |
| Schermata Pull Requests | Include principale e cartelle Git dei progetti disponibili sugli host |
| Filtri della lista PR | Il progetto include tutti i suoi repository; il filtro repository restringe ulteriormente |
| Righe della lista | Una riga per PR remota, con provider, repository e contesti locali associati |
| Open in workspace | Riapre il contesto corretto e seleziona la cartella; se manca, prepara un checkout adatto |
| Azioni sugli agenti | Usano la cartella effettiva della PR come directory di lavoro |
| Badge nella sidebar globale | Riepiloga le PR collegate al workspace, indipendentemente dal selettore di una finestra |

Esempio di accettazione: il workspace contiene Superset e la cartella txcript.
Selezionando txcript, la barra e Review mostrano la PR txcript; un commit e un push
operano nel suo checkout. Nella schermata Pull Requests compaiono entrambe le PR.
Aprire la PR Superset in un pannello e poi selezionare txcript non cambia la
destinazione dei commenti o del merge di quel pannello.

Il perimetro comprende GitHub e Bitbucket Cloud, secondo i provider già supportati.
Il modello multi repository dei sandbox cloud resta distinto da `project_folders`:
non si convertono cartelle in progetti cloud e non si cambiano gli schemi hosted.
CLI e mobile mantengono le API esistenti; questo piano riguarda l'interfaccia desktop.

## Decisioni tecniche

### Separare il contesto Git dalla PR

Usare tre riferimenti distinti, in tipi nuovi del fork:

```ts
type ForkLocalRepositoryRef = {
  projectId: string;
  folderId?: string;
};

type ForkWorkspaceRepositoryRef = ForkLocalRepositoryRef & {
  workspaceId: string;
};

type ForkRepositoryPullRequestRef = {
  repository: ForkRepositoryRef;
  number: number;
};
```

`ForkRepositoryRef` esiste già e contiene provider, host, owner e nome. Host di
esecuzione e organizzazione delimitano ogni richiesta e cache; sono distinti
dall'host SCM presente in quel tipo.

Il vero `workspaceId` serve per navigazione, sessioni e foreign key. La chiave
Git sintetica `pf~...` serve solo a indirizzare le API locali già compatibili.
La cartella si identifica con il suo ID registrato, senza accettare percorsi
arbitrari dal renderer.

La PR si identifica con `forkRepositoryKey(repository) + numero`, mai con
`projectId + numero`. Account e host di esecuzione entrano nella chiave delle
richieste, ma non creano due identità remote per la stessa PR.

### Conservare la fonte dei dati del repository principale

Il principale continua a usare i binding e i collegamenti esistenti. Un adapter
li espone al nuovo flusso; le cartelle hanno tabelle proprie. La creazione di una
PR aggiuntiva non scrive `workspaces.pullRequestId` e non sostituisce la riga di
`fork_workspace_pull_requests` del principale.

Il catalogo PR è dedicato. Non si aggiungono progetti fittizi a `useHostProjects`
né righe ambigue con lo stesso `projectId` a `forkScm.projects`.

### Rendere esplicite le scelte ambigue

Se più remote, account o PR corrispondono al contesto, mostrare la scelta e
salvarla al livello corretto. Una risoluzione fallita non ricade sul principale.
In particolare, eliminare dal nuovo percorso il fallback implicito di
`useForkPullRequestPaneTarget` a `workspace.projectId`.

Una mutazione già partita conserva il target iniziale. Uno switch aggiorna le
azioni successive. Un pannello PR aperto conserva sempre il riferimento remoto
della propria PR.

## Sequenza e dipendenze

| Fase | Risultato | Dipende da |
| --- | --- | --- |
| 0 | Baseline e inventario dei chiamanti | Nessuna |
| 1 | Tipi e identità condivise | 0 |
| 2 | Resolver del repository e degli account | 1 |
| 3 | Binding e collegamenti persistenti delle cartelle | 1, 2 |
| 4 | API additive e compatibilità host | 2, 3 |
| 5 | Scoperta PR e creazione nel repository corretto | 4 |
| 6 | Contesto attivo di Changes e Review | 4, 5 |
| 7 | Catalogo, ricerca e filtri della lista PR | 4, 5 |
| 8 | Dettagli e mutazioni con identità PR esplicita | 4, 6, 7 |
| 9 | Apertura workspace e handoff agli agenti | 5, 8 |
| 10 | Riepilogo sidebar, refresh e pulizia | 5, 7, 9 |
| 11 | Traduzioni, verifiche e preparazione della PR | Tutte |

Le fasi sono checkpoint di una sola funzionalità da consegnare completa. Il fork
rilascia a ogni merge: raggruppare gli interventi collegati in una PR verso
`fork/main`, con commit piccoli e revisionabili. Un'eventuale necessità di
migrazione hosted richiederebbe un piano distinto e una PR separata.

## Fase 0 Baseline e inventario

- [ ] Verificare base e stato del branch rispetto a `fork/main`, preservando
  analisi, piano ed eventuali modifiche di altri agenti.
- [ ] Registrare i risultati iniziali dei controlli previsti dal fork, distinguendo
  eventuali errori già presenti da quelli introdotti dalla funzione.
- [ ] Inventariare gli ingressi PR: barra Changes, tab Review, sidebar globale,
  lista e dettaglio PR, link da terminale/chat, toast di creazione e comandi agenti.
- [ ] Cercare anche i chiamanti che risolvono indirettamente da `projectId`:
  diff, thread, check log, commenti, draft, review, merge e checkout.
- [ ] Prima di cambiare un contratto esistente, seguire la ricerca dei chiamanti
  distribuiti prevista da `trpc-compat`. Preferire nuove procedure per evitare
  cambiamenti ai contratti già in uso.

Completamento: esiste una mappa delle chiamate e ogni ingresso ha un target locale
o remoto esplicito. Nessuna azione di scrittura resta fuori dall'inventario.

## Fase 1 Tipi e chiavi

- [ ] Aggiungere `packages/shared/src/fork-repository-pr.ts` con riferimenti,
  chiavi e risultati discriminati del nuovo flusso.
- [ ] Distinguere repository locale, repository remoto sorgente e repository
  remoto di destinazione della PR. Riutilizzare `forkRepositoryKey`.
- [ ] Definire stati espliciti: caricamento, pronto, cartella mancante, senza Git,
  remote non supportato, scelta richiesta, account non disponibile ed errore.
- [ ] Per la PR distinguere assenza verificata, PR collegata e più candidate.
  Una richiesta fallita non equivale a nessuna PR.
- [ ] Definire capacità per azione: Git locale, push, creazione, commenti, draft,
  review e metodi di merge. Detached HEAD disabilita le azioni sul branch.
- [ ] Definire chiavi per cache, righe, pannelli e link; aggiungere regressioni
  in `fork-repository-pr.test.ts` per numeri uguali e provider diversi.

Completamento: due PR con lo stesso numero in repository diversi non collidono;
due percorsi locali dello stesso repository mantengono contesti Git distinti.

## Fase 2 Resolver del contesto locale e remoto

- [ ] Creare `packages/host-service/src/fork-integrations/fork-repository-context.ts`.
- [ ] Verificare workspace, progetto, appartenenza della cartella e disponibilità
  del percorso tramite i resolver esistenti di `project-folders`.
- [ ] Usare il worktree isolato quando esiste; altrimenti il percorso condiviso.
  Leggere branch e HEAD effettivi da Git, senza ereditare il branch del principale.
- [ ] Canonicalizzare il percorso quando serve a condividere watcher o lock.
  Un worktree distinto rimane un contesto distinto anche se condivide il git common dir.
- [ ] Risolvere remote di lettura, push e base della PR. Riutilizzare la logica di
  `runtime/pull-requests/utils/workspace-refs.ts` per branch remoti rinominati e upstream.
- [ ] Rispettare binding esplicito, configurazione Git del branch e remote di push;
  applicare i fallback documentati solo quando la scelta è univoca.
- [ ] Supportare PR da fork con head e base su repository diversi. La sorgente
  del push non determina automaticamente il repository di destinazione della PR.
- [ ] Risolvere l'account per repository/provider tramite le connessioni esistenti,
  mantenendo disponibile il percorso GitHub di sistema già supportato.
- [ ] Non ereditare l'account del principale per una cartella di un altro provider.
  Un binding diventato incompatibile richiede una nuova scelta.
- [ ] Restituire motivi strutturati di indisponibilità, senza credenziali o URL
  contenenti segreti nei log, nelle route o nelle risposte al renderer.

Completamento: principale, cartella condivisa e worktree isolato producono
percorso, branch, remote e account corretti. Una cartella estranea al progetto
viene rifiutata e non provoca un fallback.

## Fase 3 Persistenza delle cartelle

Usare `packages/host-service/src/db/fork-schema.ts` e `fork-tables.ts` per nuove
tabelle locali create da `ensureForkTables`. Nessun intervento nel journal
Drizzle ufficiale o in `packages/db` è previsto.

- [ ] Aggiungere `fork_folder_repository_bindings`, con scope, progetto e cartella
  reali, identità remota, connessione e scelta dei remote. Una riga per cartella
  e scope; foreign key e cancellazione collegata al progetto/cartella.
- [ ] Aggiungere `fork_workspace_repository_pull_requests`, con scope, workspace
  e cartella reali, riferimento PR, branch sorgente e impronta dei remote usati
  per l'associazione. Una scelta attiva per cartella del workspace.
- [ ] Conservare eventuali dati PR in cache con data di aggiornamento. Il numero
  di righe resta limitato alle cartelle dei workspace, senza una cronologia per
  ogni cambio branch.
- [ ] Prima di usare una scelta attiva, confrontare repository e branch con il
  contesto corrente. Più PR candidate sono dati di ricerca; l'utente ne sceglie una.
- [ ] Invalidare scelta e cache quando cambiano branch, remote o binding account;
  rimuovere i collegamenti quando si elimina cartella o workspace.
- [ ] Esporre i dati legacy del principale tramite adapter, senza duplicarne la
  fonte o copiare automaticamente la sua PR nelle cartelle.
- [ ] Verificare inizializzazione idempotente, apertura di un database locale
  preesistente, foreign key e pulizia in un database temporaneo.

Completamento: principale e due cartelle possono avere tre PR indipendenti;
riaprire l'app conserva le associazioni e cambiare branch non riusa quella vecchia.

## Fase 4 API additive e host di versioni diverse

Creare procedure in nuovi file sotto
`packages/host-service/src/trpc/router/fork-repository-pr/`, con un solo aggancio
di registrazione nel router. Nomi proposti per il nuovo namespace `forkRepositoryPr`:

| Procedura | Input essenziale | Risultato |
| --- | --- | --- |
| `catalog` | Progetti selezionati | Repository remoti deduplicati e contesti locali disponibili |
| `resolve` | Workspace e cartella opzionale | Contesto Git, provider, account e capacità |
| `getForWorkspace` | Contesto locale | PR attiva, assenza verificata o candidate |
| `bind` | Contesto locale e scelta account/remote | Binding validato e contesto aggiornato |
| `createForWorkspace` | Contesto, snapshot Git, head/base e contenuto | Riferimento della PR creata o già esistente |
| `search` | Progetti, repository, filtri e cursore | Pagina deduplicata con avvisi e cursore successivo |
| `getLinkedWorkspaces` | Identità completa della PR | Tutti i contesti locali validi collegati |
| `prepareWorkspace` | PR e contesto di progetto/cartella scelto | Workspace reale e cartella da selezionare |
| `handoff` | PR, contesto e agente scelto | Avvio nel repository corretto |
| `summaries` | Workspace richiesti | Riepiloghi PR per repository |

Per dettagli, diff e azioni riutilizzare le procedure SCM che accettano già un
repository esplicito. Dove GitHub risolve solo da progetto, aggiungere procedure
del fork che passano il repository e il client corretto ai servizi esistenti.
Mantenere la ricchezza del dettaglio GitHub, compresi timeline e commenti inline.

- [ ] Aggiungere una capacità opzionale nella risposta delle connessioni del
  fork, e aggiornare la sua versione secondo la convenzione esistente.
- [ ] Il desktop verifica la capacità prima di chiamare procedure nuove; assenza
  della capacità o procedura non trovata disabilitano solo il nuovo flusso.
- [ ] Su un host precedente il principale continua a usare le API legacy; una
  cartella non mostra la PR del principale come ripiego.
- [ ] Definire la versione host richiesta dalla funzione e verificare la policy
  di `MIN_HOST_SERVICE_VERSION`; un eventuale incremento non sostituisce i guard.
- [ ] Conservare forma, default, codici errore e semantica delle vecchie API.
  Per i nuovi conflitti di contesto usare risposte che la nuova UI sa distinguere.
- [ ] Applicare gli stessi limiti di autenticazione e scrittura dei router
  esistenti, senza spostare credenziali o chiamate provider nel renderer.

Completamento: nuovo desktop con host precedente e vecchio client con host nuovo
mantengono il flusso principale; le cartelle non generano chiamate incompatibili.

## Fase 5 Scoperta aggiornamento e creazione PR

- [ ] Creare `fork-repository-pr-discovery.ts` e
  `fork-repository-pr-create.ts` nei servizi del fork.
- [ ] Scoprire le PR confrontando repository sorgente, branch remoto e base;
  non associare PR soltanto perché il branch ha lo stesso nome.
- [ ] Se una PR collegata è chiusa o merged, cercare un'eventuale nuova PR aperta
  prima di riutilizzare lo stato storico. Distinguere assenza, errore e ambiguità.
- [ ] Condividere le letture per provider/account/PR. Aggiornare dopo push,
  creazione, commenti, draft e merge, senza attendere soltanto il polling.
- [ ] All'apertura del form mostrare repository sorgente, branch, destinazione,
  base e account, precompilati dal contesto selezionato.
- [ ] Al submit acquisire uno snapshot immutabile di contesto, branch, HEAD,
  remote e base. Ricontrollarlo sull'host prima delle scritture.
- [ ] Riutilizzare commit e push locali con la chiave Git corretta. Dove il codice
  presuppone una riga workspace reale, aggiungere un wrapper del fork.
- [ ] Serializzare le operazioni Git incompatibili sullo stesso checkout;
  ricontrollare il contesto anche contro cambiamenti Git esterni al processo.
- [ ] Cercare una PR esistente per la stessa sorgente e destinazione. Se la
  creazione ha esito incerto, verificare se esiste prima di consentire un retry.
- [ ] Dopo il push verificare il riferimento remoto atteso e creare la PR usando
  head e base espliciti. Non usare un branch letto dopo lo switch della UI.
- [ ] Salvare il collegamento della sola cartella interessata. Un errore di refresh
  dopo la creazione non deve essere mostrato come creazione fallita.
- [ ] Conservare le integrazioni Jira esistenti: usare il vero workspace per link
  e avanzamento a review, rendere gli aggiornamenti ripetuti idempotenti. Nessun
  nuovo avanzamento automatico a Done al merge di una sola PR.

Completamento: dalla cartella si può trovare o creare una PR senza toccare branch,
remote o collegamento del principale; switch e retry non cambiano la destinazione.

## Fase 6 Contesto selezionato di Changes e Review

- [ ] Introdurre `useForkWorkspaceRepositoryContext` e un provider del fork
  condiviso dalle superfici che seguono il selettore.
- [ ] Derivare la scelta da `selectedRepoStore` e `useWorkspaceFolders`, conservando
  separati workspace reale, cartella e chiave Git sintetica.
- [ ] Se una cartella selezionata scompare, mostrare lo stato non disponibile e
  disabilitare le azioni fino a una scelta valida. Non interpretarla come principale.
- [ ] Collegare il contesto a `WorkspaceGitStatusProvider`, `ChangesControl`,
  `usePRFlowState`, `useShipActions`, `ShipControl` e `PRStatusGroup` tramite piccoli
  agganci o componenti del fork.
- [ ] Verificare base branch, elenco commit, rinomina branch, filtri Changes,
  staging e apertura diff: ciascuno deve mantenere la propria chiave repository.
- [ ] Aggiornare `WorkspaceSidebar`, `useReviewTab` e `useReviewCommentNavigation`:
  query PR/thread, commenti, intestazione e apertura del diff devono usare il repo
  selezionato e passare la `repoKey` corretta.
- [ ] Definire il contesto dei pannelli: Changes aperto dal selettore segue quel
  contesto; diff di file e dettagli PR già aperti mantengono il proprio riferimento.
- [ ] Isolare titolo/body/draft del form per repository o chiudere il form allo
  switch; una bozza di A non può essere inviata come PR di B senza una nuova scelta.
- [ ] Aggiornare le query key. Durante il caricamento di B non mantenere abilitate
  le azioni con i dati di A. Una risposta tardiva aggiorna solo la cache di A.
- [ ] Le mutazioni in corso restano visibili per il contesto originale, con toast
  e link che riaprono workspace e cartella originali.

Completamento: switch principale → cartella → principale aggiorna insieme barra,
Changes e Review, mentre una PR già aperta resta stabile.

## Fase 7 Catalogo ricerca filtri e paginazione

- [ ] Creare `fork-repository-pr-catalog.ts` e un hook desktop dedicato; non
  cambiare il significato di `project.list`, `useHostProjects` o `forkScm.projects`.
- [ ] Per ogni progetto includere il principale e le cartelle Git. Nel catalogo
  globale usare il percorso sorgente; per le operazioni locali usare il worktree.
- [ ] Raggruppare per identità remota conservando tutte le appartenenze a progetti,
  cartelle e host. La stessa PR non deve moltiplicarsi per numero di checkout.
- [ ] Cercare solo sui repository dei progetti selezionati. Il filtro repository
  è un'ulteriore restrizione; nessuna selezione significa tutti quelli del progetto.
- [ ] Mostrare provider e `owner/repo` nei filtri e nelle righe. Rimuovere i filtri
  non più validi senza perdere l'identità di una PR aperta nel dettaglio.
- [ ] Conservare filtri autore, review e stato e gli avvisi sui limiti dei provider.
  Un repository senza accesso produce un avviso locale, lasciando visibili gli altri.
- [ ] Usare un nuovo endpoint a cursore con ordinamento stabile per aggiornamento
  e chiave PR. Raggruppare le ricerche dove il provider lo consente.
- [ ] Unire i risultati con buffer e avanzamento per sorgente: non incrementare
  semplicemente la pagina di tutti i repository insieme. Conservare i risultati
  già letti ma non ancora emessi per evitare salti e duplicati.
- [ ] Legare il cursore a query, filtri e contesto di accesso. Eventuale stato
  sull'host deve avere limite e TTL; dopo scadenza o riavvio ripartire dalla prima
  pagina senza presentare una lista vuota come risultato definitivo.
- [ ] Esporre se il conteggio è esatto o parziale. Non sommare copie della stessa
  PR o dichiarare un totale esatto quando un provider è indisponibile.
- [ ] Aggiornare chiave riga, evidenziazione e selezione nel dettaglio eliminando
  l'assunzione `projectId:number`.

Completamento: due repository con PR dello stesso numero restano distinguibili;
scorrere più pagine non perde PR e un repo presente in due progetti appare una volta.

## Fase 8 Dettagli link e mutazioni remote

- [ ] Introdurre un target immutabile con repository, numero, host di esecuzione
  e connessione risolta. Il progetto è contesto locale, non identità remota.
- [ ] Estendere in modo additivo i parametri delle route del fork e i dati dei
  pannelli; riusare `repo` e `forkProvider` dove già presenti. I vecchi link
  continuano a risolversi quando il repository è univoco.
- [ ] Aggiornare link da terminale/chat, toast, apertura interna e pannelli
  Bitbucket. Un dettaglio deve aprirsi anche se il repository esiste solo come cartella.
- [ ] Adattare GitHub detail/content/diff/thread mantenendo le funzioni esistenti;
  estendere i percorsi che richiedono ancora il repository principale del progetto.
- [ ] Verificare tutte le azioni esposte: commento, risposta, commento inline,
  risoluzione thread, review, approvazione, draft/ready, close/reopen e merge.
- [ ] Validare capacità provider, identità repository e numero sul server.
  Confrontare l'HEAD atteso prima del merge dove il provider lo supporta.
- [ ] Aggiornare cache e badge della PR mutata, non soltanto quelli del selettore
  attuale. Conservare il target anche se lo switch avviene durante la richiesta.
- [ ] Se un binding o contesto locale non è più valido, lasciare leggibile il
  riferimento remoto e richiedere una risoluzione valida prima di scrivere.

Completamento: aprire A, selezionare B e commentare A invia il commento ad A;
lo stesso vale per tutte le mutazioni senza dipendere dal progetto principale.

## Fase 9 Workspace collegati checkout e agenti

- [ ] Cercare i collegamenti nell'unione tra principale legacy e cartelle,
  verificando repository e branch prima di proporre il workspace.
- [ ] Se il contesto corrente è collegato, proporlo per primo. Se esistono più
  contesti validi, mostrare la scelta; non usare il primo progetto corrispondente.
- [ ] Open in workspace naviga al vero workspace e seleziona la cartella prima
  di consumare l'intento di apertura PR.
- [ ] Per una PR aggiuntiva senza workspace, non passare il suo numero alla
  creazione standard sul progetto principale. Preparare il workspace principale
  dal suo branch previsto e fare checkout della PR nel worktree della cartella.
- [ ] Aggiungere al provisioner del fork un override esplicito per checkout/branch
  della cartella interessata. `isolateFolder` oggi usa il branch del principale:
  il nuovo percorso deve poter scegliere il branch effettivo della PR aggiuntiva.
- [ ] Una cartella condivisa con modifiche o branch usato altrove non viene
  cambiata automaticamente: proporre un worktree isolato e validare i conflitti.
- [ ] Nel checkout PR, un errore di isolamento interrompe la preparazione senza
  operare sulla cartella condivisa. Gestire esplicitamente il comportamento
  recuperabile di `provisionFolderWorktrees`, che oggi può lasciare il percorso
  condiviso quando non riesce a creare il worktree.
- [ ] Se il repository è già registrato come progetto autonomo, permettere di
  scegliere quel contesto invece di creare un progetto duplicato.
- [ ] Aggiornare `usePullRequestAgentHandoff`, Fix findings e le azioni analoghe:
  distinguere il workspace per persistenza dalla directory di lavoro del repo.
- [ ] Passare il percorso risolto sull'host all'avvio effettivo di chat o terminale
  tramite un percorso del fork o un parametro opzionale compatibile. Selezionare
  una cartella nella UI non è sufficiente a cambiare il cwd del processo.
- [ ] Includere nel prompt provider, repository, numero, branch e riferimenti
  pertinenti, mantenendo il comportamento di selezione agente/account già esistente.

Completamento: Open in workspace e Fix findings di una PR aggiuntiva aprono o
avviano il processo nella cartella corretta senza cambiare il branch principale.

## Fase 10 Sidebar refresh pulizia e prestazioni

- [ ] Il riepilogo combina principale e cartelle per identità PR. Con una PR
  mostra il badge esistente; con più PR mostra un conteggio e un menu con repo
  e stato. La scelta in una finestra non cambia il riepilogo globale.
- [ ] Condividere richieste e watcher tra barra, Review, dettaglio e sidebar.
  Lo stato remoto si memorizza per provider/account/PR; il contesto Git rimane
  separato per checkout.
- [ ] Aggiornare su eventi Git pertinenti, ritorno in primo piano e azioni PR;
  mantenere un refresh di sicurezza con scadenze e richieste concorrenti limitate.
- [ ] Limitare il lavoro remoto ai repository rilevanti, evitando una richiesta
  GitHub/Bitbucket per cartella a ogni render e per ogni duplicato del checkout.
- [ ] Gestire host offline, rate limit e token scaduto come stato del repository
  interessato. Non nascondere dati degli altri repository.
- [ ] Pulire cache e collegamenti su eliminazione, archiviazione, disconnessione,
  cambio organizzazione e rimozione della cartella, secondo la durata del dato.
- [ ] Per le nuove preferenze evitare collezioni senza limite in localStorage.
  Tenere la selezione transitoria nello store esistente; dati per entità sul DB
  host. Se serve una preferenza persistente, documentarne limite e cancellazione.
- [ ] Usare `rawErrorMessage` nei log e `errorMessage` soltanto per il testo UI.

Completamento: lo stesso repository in più cartelle non moltiplica richieste
remote e nessun collegamento eliminato ricompare da una cache vecchia.

## Mappa dei file

| Area | File esistenti da collegare | Nuova logica del fork |
| --- | --- | --- |
| Identità | `packages/shared/src/fork-integrations.ts` | `packages/shared/src/fork-repository-pr.ts` |
| Risoluzione locale | `project-folders`, `git/utils/resolve-worktree.ts` | `fork-integrations/fork-repository-context.ts` |
| Database locale | `db/fork-schema.ts`, `db/fork-tables.ts` | Definizioni e accesso alle due nuove tabelle del fork |
| API host | Registrazione nel router host | `trpc/router/fork-repository-pr/` |
| Servizi PR | Servizi GitHub/Bitbucket già esistenti | `fork-repository-pr-discovery.ts`, `fork-repository-pr-create.ts`, `fork-repository-pr-catalog.ts` |
| Workspace desktop | `page.tsx`, Changes, Review e provider Git | Hook e componenti nuovi sotto `ForkIntegrations`, co-locati per uso |
| Lista e dettaglio | `PullRequestsView`, `PullRequestsContent`, hook detail | Catalogo, filtri e target PR del fork |
| Navigazione | Intenti pannelli, route e apertura link | Helper `fork-*` per target, contesti e compatibilità |
| Agent handoff | `usePullRequestAgentHandoff`, avvio chat/terminale | Risoluzione cwd e preparazione checkout del fork |

Ogni nuovo componente segue cartella, file omonimo e `index.ts`; hook, utilità e
test restano vicini al consumatore. Nei file upstream aggiungere soltanto gli
agganci necessari, spostando la logica nei file del fork. Non modificare test
upstream: aggiungere file `fork-*.test.ts` o `fork-*.test.tsx`.

## Fase 11 Verifica e consegna

### Regressioni automatiche

| Scenario | Asserzione necessaria |
| --- | --- |
| Principale e cartella GitHub | Stato e azioni usano ciascun checkout e repository |
| Principale GitHub e cartella Bitbucket | Provider e account restano separati |
| PR con numero uguale | Cache, righe, pannelli e mutazioni non collidono |
| Cartella condivisa e isolata | Si usa il percorso e il branch effettivo |
| Branch remoto diverso dal locale | La PR si collega al riferimento remoto corretto |
| PR da fork | Push sulla sorgente e PR sul repository di destinazione |
| Più PR candidate | Nessuna selezione arbitraria e scelta conservata finché valida |
| Switch con risposta tardiva | Dati A non diventano dati B |
| Switch durante una mutazione | Target e toast conservano A |
| Cambio branch esterno | Push/creazione rifiutano lo snapshot diventato incoerente |
| Retry dopo esito incerto | Si ritrova la PR esistente senza duplicarla |
| Stessa PR in più progetti | Una riga, tutti i contesti locali associati |
| Paginazione su più sorgenti | Nessun salto o duplicato con date di aggiornamento uguali |
| Accesso parziale | Avviso per il repo in errore e dati degli altri conservati |
| Cartella mancante o rimossa | Nessun fallback operativo al principale |
| Open in workspace | Si seleziona la cartella e il checkout giusto |
| Isolamento del worktree fallito | Preparazione interrotta e cartella condivisa intatta |
| Handoff agente | cwd del processo nella cartella, workspace reale nella persistenza |
| Database precedente | Inizializzazione ripetibile e collegamenti principali conservati |
| Host precedente | Principale operativo e nuove capacità disabilitate correttamente |

Usare fixture piccole, database temporanei e Git reale solo per le proprietà di
branch, worktree e remote che lo richiedono. Provider remoti simulati con input
espliciti o server locali. Nessun timer reale lungo, retry per test flaky o
`mock.module` globale di servizi condivisi. Ogni test deve coprire un comportamento.

### Controlli del repository

- [ ] Eseguire `bun run check:i18n` e completare tutte le 17 traduzioni delle
  stringhe nuove, comprese condizioni di errore e scelta repository.
- [ ] Eseguire `bun run --cwd apps/desktop typecheck`.
- [ ] Eseguire `bun run --cwd packages/host-service typecheck`.
- [ ] Eseguire `bun run test:fork` con i preload del fork.
- [ ] Eseguire lint mirato e `git diff --check` sui file modificati.
- [ ] Controllare che il nuovo codice non cambi contratti legacy attraverso
  selezioni DB che restituiscono automaticamente nuove colonne.
- [ ] Riesaminare i file upstream con
  `git diff --numstat fork/main...HEAD | grep -vi fork`; spostare nei file del
  fork la logica che supera circa dieci righe aggiunte per file.

### Verifica desktop con CDP

Seguire la skill `cdp-verification` e collegarsi al renderer di questo worktree.
Preparare repository di prova con principale, cartella GitHub, cartella Bitbucket
e cartella senza Git; usare worktree condivisi e isolati nei casi pertinenti.
Le scritture remote vanno provate soltanto su PR e repository destinati alla verifica.

- [ ] Cambiare repository e verificare insieme barra, Changes e Review.
- [ ] Aprire due PR, cambiare selettore e controllare stabilità dei pannelli.
- [ ] Verificare filtri, stessa numerazione e caricamento di più pagine nella lista.
- [ ] Creare una PR dalla cartella e verificare branch, remote e link principale.
- [ ] Provare commento, draft e merge sui target di prova dei provider interessati.
- [ ] Riaprire il workspace dalla PR aggiuntiva e verificare la cartella selezionata.
- [ ] Avviare un handoff di prova e verificare cwd e identità del workspace.
- [ ] Simulare richiesta lenta, host offline e cartella rimossa, controllando
  console e disponibilità delle azioni. Conservare screenshot ed esiti per il review.

### Preparazione della PR

- [ ] Aggiornare `ForkWhatsNewNotice` con 3–5 punti in inglese, cambiare
  `FORK_WHATS_NEW_ID` e tradurre tutte le voci.
- [ ] Aggiornare `FORK.md` e `docs/fork-integrations.md` con filtri, selezione,
  collegamenti e comportamento degli host precedenti.
- [ ] Riportare nella descrizione PR comportamento prima/dopo, compatibilità,
  controlli eseguiti, prove CDP e limiti rimasti.
- [ ] Completare il diff review e lasciare la PR destinata a `fork/main` alla
  revisione del proprietario, senza merge o pubblicazione automatica.

La funzione è completa quando tutte le superfici e le azioni usano il contesto
corretto, i casi di concorrenza e compatibilità sono coperti e nessuna cartella
aggiuntiva modifica implicitamente il repository principale.
