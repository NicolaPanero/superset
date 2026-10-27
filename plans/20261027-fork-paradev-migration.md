# Da Superset++ a Paradev++

Portare il fork sulla release stabile Paradev 2.0.0, rinominare la sua
presentazione in Paradev++ e conservare il simbolo attuale. Account, sessioni,
impostazioni e aggiornamenti delle installazioni esistenti devono continuare a
funzionare. Questo documento pianifica l'implementazione: il merge non è stato
applicato e gli script non sono ancora stati modificati.

## Risultato e scelte

- **Sorgente upstream:** `ParadevAI/Paradev`, release desktop stabili pubblicate.
- **Nome visibile del fork:** `Paradev++`, compresi menu, home, testi accessibili,
  aggiornamenti, documentazione corrente e note di release.
- **Logo:** stesso simbolo, icone e animazione. Il testo del wordmark cambia da
  Superset++ a Paradev++, mantenendo lo stile; non si adotta il nuovo simbolo
  ufficiale Paradev.
- **Identità persistente:** mantenere i nomi tecnici legacy necessari per dati,
  crittografia, protocolli e installer. Il cambio di marchio non richiede una
  migrazione dei database o degli account.
- **Distribuzione:** resta `NicolaPanero/superset`, con PR verso `fork/main`,
  revisione del proprietario e release solo dopo il merge. Il repository del
  fork non viene rinominato da questa attività.
- **Perimetro:** migrazione upstream e marchio in una PR coordinata. Il supporto
  completo delle PR dei repository aggiuntivi resta nel
  [piano dedicato](20261026-fork-workspace-pr-repositories.md): è pianificato,
  non implementato dalle modifiche recenti.

## Baseline verificata il 27 ottobre 2026

| Riferimento | Commit / risultato |
| --- | --- |
| `origin/fork/main`, appena recuperato | `c6996416c77cbbec3df020a50f0d44e23801bb4b` |
| HEAD analizzato, con gli ultimi due commit locali | `23d4cc1a59bd9d5449d43d3f36643e3ceb04af05` |
| Release upstream scelta | [`desktop-v2.0.0`](https://github.com/ParadevAI/Paradev/releases/tag/desktop-v2.0.0) |
| Commit effettivo della release | `d450c93b0d5faeebd28a5bd62108fb052bfed37e` |
| Antenato comune HEAD / release | `a6dba6688589f26597d18db7eb918df2779991ce` |
| Commit su ciascun lato dall'antenato | 178 sul lato fork, 43 sul lato upstream |
| Delta upstream dall'antenato | 1.152 file, 24.076 aggiunte e 19.367 rimozioni |
| Simulazione contro HEAD | 38 file in conflitto: 21 codice/configurazione e 17 cataloghi |
| Simulazione contro `origin/fork/main` | Stessi 38 percorsi in conflitto |
| Parent e source GitHub del fork | Entrambi già `ParadevAI/Paradev` |

La simulazione usa `git merge-tree --write-tree --name-only --messages`, senza
toccare branch, index o file del checkout. Il codice di uscita 1 indica i
conflitti trovati. I tree risultanti contengono marker di conflitto e non sono
build utilizzabili. Quello contro HEAD è
`fdc03dc97d47edd5422b5c773a233261c3721efa`; quello contro `origin/fork/main` è
`28aefd4c131e5202f2f7aa2e4e804cfc1c1c9bd4`.

Il branch locale `fork/main` non è la base affidabile di questa analisi: è
arretrato rispetto a `origin/fork/main`. Recuperare sempre il riferimento remoto
e ripetere il confronto prima di implementare. Anche il numero dei conflitti è
legato agli SHA sopra, non alle future versioni dei branch.

Il tag 2.0.0 mantiene `productName: "Superset"`, namespace `@superset`, bundle ID
e variabili `SUPERSET_*`. Cambia repository ufficiale e marchio. Aggiorna anche
Electron da 41.10.7 a 44.9.3 e introduce un nuovo layout dei workspace, la ricerca
della cronologia dalla chat e modifiche al controllo ACP. Non ci sono cambiamenti
in `packages/db` nel delta upstream analizzato.

## Fase 0 — Preparare una base che conservi il lavoro recente

- [ ] Recuperare `origin/fork/main` e la release dal repository Paradev esplicito;
  registrare gli SHA e controllare lo stato del checkout.
- [ ] Creare il branch di implementazione da `origin/fork/main`, senza cambiare
  direttamente `fork/main` o `main` e senza includere modifiche di altri agenti.
- [ ] Conservare il piano multi repository di `b0785690d8` e i fix di
  `23d4cc1a59`: integrarli prima oppure portarli sul branch se non sono ancora
  nella base remota. Evitare duplicazioni se sono già stati integrati.
- [ ] Registrare i risultati dei controlli sulla base, distinguendo gli eventuali
  problemi preesistenti dalle regressioni del merge.
- [ ] Ripetere la simulazione dopo il recupero dei riferimenti e salvare nella PR
  il riepilogo dei conflitti riferito agli SHA effettivi.

Completamento: base aggiornata, fix recenti presenti e nessuna modifica a dati o
installazioni dell'utente.

## Fase 1 — Aggiornare la sorgente degli script e dell'automazione

File principali: `scripts/fork/sync-upstream.sh`,
`scripts/fork/prepare-upstream-pr.sh`, `.github/workflows/fork-sync-upstream.yml`.

- [ ] Aggiungere una configurazione del fork, per esempio
  `scripts/fork/upstream.json`, con repository `ParadevAI/Paradev`, URL Git
  `https://github.com/ParadevAI/Paradev.git`, branch `main` e politica delle
  release. Leggerla anche dal workflow, evitando tre copie degli URL.
- [ ] Fare il checkout necessario prima dei passi del workflow che leggono tale
  configurazione; non dipendere da file non ancora disponibili sul runner.
- [ ] Gestire sia l'assenza di `upstream` sia il remote esistente con URL Superset:
  il solo `remote add` attuale non corregge il secondo caso. Non cambiare `origin`.
- [ ] Usare l'API `repos/ParadevAI/Paradev/releases`, escludendo draft,
  prerelease, canary e release CLI. Conservare il filtro `desktop-vX.Y.Z` e il
  confronto numerico delle versioni. Un'integrazione da `main` resta esplicita.
- [ ] Risolvere il commit della release, anche per tag annotati, e verificare che
  il commit recuperato via Git corrisponda a quello selezionato tramite API.
- [ ] Recuperare con `--no-tags` in un ref dedicato alla sorgente, per esempio
  `refs/fork/upstream/paradev/desktop-v2.0.0`. Non sovrascrivere tag globali:
  stesso nome tra sorgenti diverse non garantisce lo stesso commit. Se una
  release già registrata cambia SHA, fermarsi con un errore esplicito.
- [ ] Usare ancestry locale dopo il fetch per sapere se il commit è già incluso.
  Il confronto GitHub tra repository diversi non è necessario; non trasformare
  404, errori di autenticazione o rate limit in un generico "da integrare" con
  `|| true`.
- [ ] Identificare la proposta con sorgente, tag e commit fissato, per esempio
  `fork/sync-paradev-desktop-v2.0.0-d450c93`. Aggiornare titolo, body e link alla
  release, evitando collisioni con le vecchie PR `fork/sync-$tag`.
- [ ] Distinguere proposta aperta, integrata e chiusa senza merge. Una proposta
  chiusa non deve impedire per sempre un nuovo tentativo esplicito. Recuperare
  un branch già pubblicato senza sovrascrivere le risoluzioni manuali.
- [ ] Conservare il percorso draft quando il merge automatico trova conflitti:
  spiegare che il branch può puntare al commit ufficiale e deve essere
  riconciliato con `fork/main` prima di diventare pronto. Nessun auto-merge.
- [ ] Impedire al percorso `--push` di scrivere su `fork/main` o `main`, anche
  tramite override del branch. Pubblicare solo il branch di proposta.
- [ ] Separare la proposta di release dal mirror di `main`. Oggi l'API
  `merge-upstream` segue già Paradev perché il parent GitHub è stato aggiornato;
  non è necessario ricreare il fork. Se si conserva il mirror automatico
  esistente, verificarne prima il parent atteso e mantenerlo separato dalla
  selezione della release; nessun nuovo push manuale sui branch principali.
- [ ] Mantenere esclusi i workflow ufficiali di deploy/release, compresi quelli
  aggiunti dal nuovo upstream. Restano attivi quelli autorizzati del fork.

Controlli: aggiornare i test fork `fork-sync-release.test.ts` e
`fork-upstream-pr.test.ts` con remote esistente, release escluse, tag uguali da
sorgenti diverse, SHA incoerente, errore API, ripetizione della proposta,
recupero delle modifiche manuali e protezione dei branch. Usare fixture e
comandi simulati, senza rete o attese reali.

Completamento: l'automazione propone il commit stabile Paradev corretto una sola
volta, con riferimenti verificabili e revisione del proprietario.

## Fase 2 — Risolvere dipendenze e packaging prima dell'interfaccia

- [ ] Portare desktop, host-service e CLI a `2.0.0` insieme; conservare script,
  dipendenze e configurazioni aggiunti dal fork.
- [ ] Unire `patchedDependencies` del manifest radice: mantenere la patch Claude
  ACP 0.85.0 del fork e quella xterm; aggiungere la patch upstream
  `@pierre/diffs@1.3.6`. Verificare che ogni patch si applichi alla versione
  effettivamente risolta.
- [ ] Rigenerare `bun.lock` dai manifest riconciliati usando la versione Bun del
  progetto. Non risolverlo scegliendo un intero lato. Terminare con
  `bun install --frozen-lockfile`.
- [ ] Adottare Electron 44.9.3 e i passi upstream per installazione di Electron,
  Node distribuito e pdev. Verificare copie dei moduli nativi, SQLite e PTY
  usando i controlli di runtime del repository.
- [ ] Per pdev conservare versione 0.2.1 e checksum upstream, aggiornando il
  download a `paradevai/pdev`. Verificare cache e avvio offline; nella release
  rendere obbligatorio il bundle con la configurazione `PDEV_BUNDLE_REQUIRED`
  già esistente, così un download fallito non produce un'app incompleta.
- [ ] Non cambiare implicitamente il motore di trasferimento: conservare
  `scripts/fork/txcript-version.json` e il relativo tag del repository txcript.
- [ ] In `electron-builder.ts` unire l'identità del fork e le sue risorse con
  `afterPack: localizeMacDisplayName(...)` introdotto da Paradev. Conservare
  `CFBundleName` e `CFBundleDisplayName` tecnici coerenti con `productName`, come
  richiede ora upstream per gli Helper Electron; il nome visibile passa dalle
  risorse `InfoPlist.strings` generate nelle cartelle `.lproj`.
- [ ] Conservare selezione delle icone fork, metadata e script installer. Il
  publish ufficiale ora punta a Paradev: verificare separatamente il percorso
  del fork e non adottare quel feed per gli aggiornamenti dei nostri client.

Completamento: installazione riproducibile con lockfile congelato, patch attive
e pacchetto avviabile con moduli nativi per il nuovo Electron.

## Fase 3 — Definire Paradev++ senza cambiare l'identità dei dati

| Nome/identificatore | Scelta |
| --- | --- |
| Nome mostrato nell'app e dal sistema | `Paradev++` |
| `productName` del pacchetto fork | `Superset++`, fissato esplicitamente |
| Bundle/eseguibile legacy | `Superset++.app`, `Superset++`, `Superset++.exe` |
| Bundle ID | `com.superset.desktop.fork` |
| Protocollo | `superset-fork://` |
| Workspace marker | `SUPERSET_WORKSPACE_NAME=fork` |
| Home host | `~/.superset-fork` |
| Profilo Electron | `~/Library/Application Support/Superset Fork` |
| Chiavi renderer e credenziali | Conservare chiavi `superset-fork-*`, percorsi e nomi Keychain |
| OAuth broker e notifiche | Conservare `superset-fork-desktop` e porta `51742` |
| Pacchetti, CLI e configurazione | Conservare `@superset/*`, comandi e `.superset` |
| Repository e canale updater | `NicolaPanero/superset` e asset fork esistenti |

- [ ] Estendere `apps/desktop/fork-identity.ts` o aggiungere un helper fork
  condiviso fra build e runtime che distingua nome tecnico e nome visibile.
  Non derivare in futuro l'identità persistente dal marchio upstream.
- [ ] Collegarlo con piccoli hook a `app-display-name.ts`, builder e chiamanti
  di titoli/menu/About. Conservare i suffissi di sviluppo e canary.
- [ ] Coprire il caso concreto `app.name=Superset++`: l'attuale sostituzione del
  prefisso `Superset` aggiunge nuovamente il suffisso `++`. Passare solo
  `DESKTOP_DISPLAY_NAME=Paradev++` produrrebbe `Paradev++++`; passare `Paradev`
  risolverebbe i menu ma lascerebbe il builder senza i due più. La risoluzione
  deve dare il nome completo corretto in entrambi i percorsi.
- [ ] Riutilizzare la configurazione del display name esistente, evitando nuove
  variabili d'ambiente se non necessarie. Verificare anche i valori incorporati
  da Vite e quelli del workflow, non soltanto l'ambiente della shell.
- [ ] Verificare nei test fork identità invariata, nome visibile esatto e
  comportamento delle build ufficiali senza il marker fork.

Non rinominare cartelle, database, cookie, preferenze o chiavi cifrate durante
questa migrazione. `auth-token.enc` dipende dalla crittografia Electron/Keychain:
la conservazione del solo bundle ID non dimostrerebbe la compatibilità di
un'identità rinominata. La prova finale deve usare anche una build impacchettata.

## Fase 4 — Cambiare le scritte personalizzate e conservare il logo

- [ ] Aggiornare `ForkWordmark/ForkWordmark.tsx`: le lettere SUPERSET sono
  tracciati SVG, quindi cambiare il solo `aria-label` non cambia il testo
  disegnato. Realizzare il wordmark PARADEV++ con lo stile attuale.
- [ ] In `ForkHomeBackground/fork-home-scene.ts` aggiornare `LOGO_TEXT`,
  conservando i tracciati `LOGO_PATHS` del simbolo e il comportamento delle onde.
- [ ] Aggiornare title e nomi accessibili di `ForkProductMark`, `ForkHomeBrand` e
  del componente `SupersetIcon` della creazione workspace. Mantenere geometria
  e viewBox accoppiati del logo fork durante il conflitto con l'icona upstream.
- [ ] Conservare byte per byte `src/resources/build/fork-icons/` e le immagini
  `tray/forkIconTemplate` normali, @2x e relativo SVG. Registrare gli hash prima
  e dopo per verificare che il simbolo distribuito sia lo stesso.
- [ ] Aggiornare toast, errori e testi degli updater (`fork-updates`,
  `fork-update-progress`, `ForkUpdateToast`), messaggi leggibili degli installer,
  descrizioni di `fork-handoff` e testi di `fork-git-setup`. Non cambiare gli
  identificatori tecnici o la cronologia Git esistente.
- [ ] Aggiornare introduzione e link di README/FORK e le guide correnti del fork;
  correggere anche la base 1.38 ormai obsoleta in `FORK.md`. Spiegare una volta
  "Paradev++, precedentemente Superset++" e perché alcuni percorsi restano legacy.
- [ ] Aggiornare i riferimenti upstream nelle regole del fork e nelle istruzioni
  mantenute localmente. Conservare note storiche, licenze, ragione sociale e
  istruzioni che citano un file tecnico realmente chiamato Superset.
- [ ] Cercare nuovamente `Superset++` e `superset-sh/superset` nel contenuto del
  fork. Classificare ogni residuo: testo da cambiare, storia o identificatore di
  compatibilità. Non fare una sostituzione globale nei sorgenti upstream.

Completamento: le superfici personalizzate mostrano Paradev++, il simbolo rimane
identico e i riferimenti legacy rimasti hanno una ragione verificabile.

## Fase 5 — Risolvere i conflitti dell'interfaccia con hook del fork

| Area in conflitto | Risoluzione prevista | Comportamento da conservare |
| --- | --- | --- |
| `page.tsx`, `RightPaneArea` | Adottare `WorkspaceSplitLayout`/`WorkspaceToolbar` e il nuovo focus upstream; spostare gli agganci fork nel proprietario corretto | Cartella Git selezionata, branch, blocchi Run, controlli e sfondo del fork |
| `WorkspaceEmptyState`, `NewWorkspaceScreen` | Adottare azioni e struttura upstream, reinserendo componenti fork; rimuovere i componenti ufficiali dismessi | Marchio fork, account/modello prima dell'avvio, importazione cronologia |
| `useAgentSessionLauncher` | Comporre il nuovo launcher con preparazione ACP e trasferimenti del fork | Account esplicito, snapshot del modello/configurazione, allegati, sessione nativa |
| `ChatPane`, `AcpChatPane`, `SessionView` | Unire import e callback; aggiungere `onOpenHistory` senza perdere i dati fork | `promptTitle`, provider contesto, selettori, quote e handoff |
| `useAcpChatEnabled` | Adottare il nuovo store/preferenza quando compatibile, mantenendo la scelta fork per il default ACP | ACP disponibile senza flag Pro; CLI avanzata e preferenze già salvate |
| `SettingsSidebar`, layout e ricerca | Rappresentare distintamente i due flag | Nascondere funzioni a pagamento senza disabilitare o mostrare erroneamente ACP |
| `DesktopNotices` | Comporre priorità delle notice, nuovo caso rebrand e popup fork | Una sola notice alla volta, dismiss persistente e annuncio Paradev++ coerente col logo mantenuto |
| `README.md` | Mantenere introduzione e download del fork; aggiornare la sezione ufficiale da upstream | Nessun download ufficiale scambiato per aggiornamento del fork |

Il conflitto nelle impostazioni è particolarmente insidioso: l'ultimo parametro
booleano è `hideProFeatures` nel fork e `acpChatFlag` in upstream. Scegliere un lato
può compilare e alterare il significato. Conservare entrambi con parametri
distinti o un wrapper fork tipizzato e verificare le quattro combinazioni.

Per ACP preservare preferenze, semantica della CLI avanzata e fallback su host
precedenti. L'apertura della cronologia upstream e il recupero/import nativo del
fork devono usare la stessa destinazione quando riaprono una sessione esistente,
evitando sessioni duplicate o un cambio implicito dell'account.

La nuova notice ufficiale contiene il proprio rebrand: decidere nel codice fork
come adattarla o filtrarla per questa distribuzione, senza ignorare le altre
notice di servizio. Il popup del fork deve essere aggiornato nella fase 7.

Non ripristinare interi vecchi file UI per risolvere i conflitti. Portare la
logica in nuovi file `fork-*`/`Fork*` e lasciare import, chiamate e props minime
nei file upstream. Non modificare i test ufficiali: aggiungere regressioni fork.

## Fase 6 — Proteggere le implementazioni già introdotte

Nel commit recente `23d4cc1a59`, soltanto i 17 cataloghi sono toccati anche dal
delta upstream analizzato. Nessuno dei suoi file sorgente presenta un conflitto
diretto per questa release. Questo non verifica automaticamente il comportamento:
i chiamanti della chat e il layout sono cambiati.

| Scenario | Verifica richiesta dopo il merge |
| --- | --- |
| Claude con quota esaurita e Continue su Pause | Lo switch manuale resta disponibile senza cambiare Continue |
| Claude realmente occupato | `Stop and switch account` attende lo stop confermato prima di spostare la sessione |
| Arresto fallito o processo ancora attivo | Nessun trasferimento, riavvio concorrente o rimozione prematura dal registry |
| Stop richiesto due volte | Disposal condiviso e stesso errore, senza perdere il processo ancora vivo |
| Recovery quote contemporanea allo switch | Attendere/serializzare la recovery in corso, senza ricreare un worker dismesso |
| Target pronto, fallito o bloccato | Confermare readiness e sessione nativa attesa; rollback solo dopo chiusura confermata del target |
| Prompt in coda | Restano in pausa dopo lo switch; nessun invio spontaneo |
| Nuova sessione senza progetto / workspace ancora ottimistico | Nessun `workspace_unavailable`; preflight del modello prima dell'inserimento |
| Modello rimosso, cambiato o catalogo non disponibile | Validare opzioni effettive; niente sessione parziale con configurazione invalida |
| Desktop nuovo con host vecchio | Capability guard per `agents.switchChatAccount`; azione non supportata gestita senza errore dell'intera chat |
| Handoff Full history / Summary only, CLI / CHAT | Account e configurazione conservati, un solo processo scrittore e cronologia recuperabile |
| Claude, Codex, Cursor e Grok | Avvio, permessi Plan, modello/effort, import e riapertura della sessione |
| Repository principale e cartella aggiuntiva | Selettore, Changes, branch, base diff e Run non perdono il contesto nel nuovo toolbar |

Accettare anche il nuovo controllo upstream dell'adapter ACP per
`requires_action` con approvazioni gestite dal client. Nel catalogo analizzato
`clientApprovalModes` è attivo solo per pdev: questo controllo non sostituisce
il fix Claude. Provare pdev con Full access senza richiesta reale (resta
operativo), domanda esplicita (attesa utente) e Claude con approvazione reale
(attesa preservata). Il diff upstream di `chat-v3/resumeAfterUpdate.ts` cambia
il testo del marchio, non la semantica delle code: non rimuovere i meccanismi di
recovery del fork o confonderli con la scelta Continue su Pause.

Conservare le nuove procedure additive, il campo opzionale di capability e
`pendingWorkspace` interno. Applicare la skill `trpc-compat` se la risoluzione
tocca un contratto esistente: cercare i client rilasciati e mantenere le forme
precedenti. Questa migrazione non richiede rinominare procedure per il marchio.

Per le PR multi repository verificare soltanto che la migrazione non elimini i
punti di aggancio esistenti e aggiornare, se necessario, i riferimenti al nuovo
toolbar nel piano dedicato. Non presentare come risolto il bug ancora pianificato.

## Fase 7 — Cataloghi e popup della release

- [ ] Riconciliare i 17 cataloghi dopo aver risolto i sorgenti. Usare la
  rigenerazione Lingui come inventario dei messaggi necessari, preservando le
  traduzioni del fork e aggiungendo quelle nuove di upstream e del rebrand.
- [ ] Non usare "ours" sull'intero catalogo e non considerare `msgcat --use-first`
  una verifica sufficiente: cambi di ID, contesti, plurali e nuove stringhe
  richiedono il controllo successivo di estrazione/compilazione.
- [ ] Tradurre tutti i nuovi ID in cs, de, en, es, fr, id, it, ja, ko, nl, pl,
  pt-BR, ru, tr, vi, zh-CN e zh-TW. Trattare Paradev++ come marchio non tradotto.
- [ ] Aggiornare `ForkWhatsNewNotice`: nuovo `FORK_WHATS_NEW_ID`, titolo
  `What's new in Paradev++` e 3–5 punti sulle novità realmente consegnate.
  Conservare la chiave di storage esistente per il dismiss.
- [ ] Eseguire `bun run check:i18n`, verificare compilazione strict per tutte le
  lingue e committare i cataloghi deterministici insieme ai sorgenti.

Completamento: nessun messaggio mancante e popup della migrazione mostrato una
volta; nessuna promessa di funzionalità non incluse nella PR.

## Fase 8 — Updater e aggiornamento di un'installazione esistente

Conservare `SUPERSET_AUTO_UPDATE=disabled` e il repository del fork usato dal suo
updater. L'updater ufficiale e quello del fork non devono scaricare a vicenda le
proprie distribuzioni. Gli URL dei servizi ufficiali vanno invece portati con
le modifiche upstream, verificando callback OAuth, domini consentiti e deep link.

- [ ] Conservare la distinzione fra marchio e servizi: nel tag analizzato
  l'API canonica resta `https://api.superset.sh`. Non costruire URL sostituendo
  automaticamente Superset con Paradev.
- [ ] Importare `own-domains.ts` e il suo export shared mantenendolo compatibile
  con Node strip-types: viene letto anche dalle configurazioni di build.
  Verificare CSP HTTP/WebSocket, origini autorizzate e domini simili da rifiutare.
- [ ] Verificare i cambi upstream di `JwtAuthProvider`: condivisione della
  richiesta token in corso, backoff e timeout, login OAuth CLI, API key, token
  cambiato dopo un rifiuto e cambio sessione durante una richiesta precedente.
  Non rinominare header `x-superset-*` per il solo cambio del marchio.
- [ ] Mantenere la nuova fiducia automatica pdev limitata al sandbox come da
  upstream, rispettando `PDEV_CODING_AGENT_DIR`, rifiuti salvati e JSON corrotti.
  Non estenderla ai repository locali dell'utente.

Gli installer già incorporati nei client cercano asset e bundle precisi:
`Superset-fork-arm64.zip`, `Superset++.app` e `Superset++`. Anche il percorso
Windows valida `Superset++.exe`. Mantenerli nella prima release Paradev++,
insieme a verifiche di provenienza, checksum, bundle ID e rollback.

Una sola release ponte non rende sicura la rinomina fisica: un vecchio client
può saltarla e scaricare direttamente la nuova `latest` con il proprio installer
precedente. Un eventuale futuro bundle `Paradev++.app` richiederà asset legacy
compatibili su ogni latest raggiungibile oppure un canale distinto per i client
nuovi. Tale rinomina fisica è fuori da questa migrazione.

- [ ] Controllare la versione minima macOS effettiva nel bundle prodotto con
  Electron 44. Upstream aggiunge `gate-mac-update-manifest.ts` e pubblica
  `minimumSystemVersion` nei manifest: conservarlo per i manifest distribuiti.
  Il fork però legge GitHub `latest` e installa uno ZIP senza consultare quei
  manifest. Serve anche un controllo del sistema operativo nel percorso fork,
  prima di dichiarare l'installer pronto e prima di sostituire il bundle.
- [ ] Leggere `LSMinimumSystemVersion` dal pacchetto verificato e confrontarlo
  con `sw_vers -productVersion`: entrambi esprimono la versione macOS. Non
  confrontarlo direttamente con `uname`/`os.release()`, che esprimono Darwin;
  il manifest upstream usa invece proprio la versione Darwin convertita.
  Coprire `install.sh`, il percorso updater e `install-desktop.sh`, che installa
  dal checkout senza passare per il primo. Testare versioni sotto, uguali e sopra
  il minimo, senza rete o attese reali. Un rifiuto conserva l'app precedente e
  avviene prima di spostarla o dichiarare l'installer pronto.
- [ ] Verificare il caso dei client già pubblicati che ignorano il nuovo limite
  macOS: un controllo aggiunto oggi non li aggiorna retroattivamente. Se il
  nuovo bundle alza il minimo, non renderlo `latest` sul canale legacy prima di
  una soluzione compatibile anche per chi salta una release ponte. Mantenere
  per tali client una distribuzione compatibile o separare il canale nuovo.
- [ ] Aggiornare titoli e note della release in `fork-release.yml`, conservando
  tag fork, asset tecnici e pin txcript.
- [ ] Verificare `fork-release-lookup`, `fork-update-install`,
  `fork-windows-update` e gli installer in `scripts/fork/`; aggiornare i test
  fork pertinenti per il nuovo nome mostrato senza allentare le validazioni.
- [ ] Provare con un profilo di test preesistente: aggiornamento da una vecchia
  Superset++, login decifrabile, account/profili presenti, sessioni riapribili,
  preferenze e cartelle aggiuntive conservate, una sola installazione del fork.
- [ ] Provare anche installazione pulita e ripristino del vecchio bundle in caso
  di sostituzione fallita, senza eseguire migrazioni inverse dei dati.
- [ ] Verificare nome nel Finder, Dock, menu, finestre e About sulla build
  impacchettata. Il percorso fisico legacy resta documentato.

## Fase 9 — Controlli, revisione e consegna

Ordine dei controlli richiesti, da eseguire sull'implementazione risolta:

1. Installazione con lockfile congelato e verifiche delle patch dipendenze.
2. Test mirati fork di sync, identità/display name, settings, launcher,
   lifecycle dei processi, switch account, preflight e updater.
3. `bun run check:i18n` e controllo del diff dei cataloghi.
4. `bun run lint`, typecheck desktop e host-service; includere chat-runtime,
   chat, agent-setup e shared come già fa `scripts/fork/validate.sh`.
5. `bun run test:fork --catalogs-ready`, tramite il runner del fork; usare le
   suite native pertinenti quando richieste dal cambiamento Electron/PTY.
6. `bun run check:plugins` se il merge porta modifiche ai metadati plugin.
   Non modificare a mano i manifest generati; non pubblicare plugin per il solo
   cambio del nome desktop. Conservare il file unico degli installati del fork.
7. Build e controlli del runtime nativo; smoke test del pacchetto sul target
   effettivamente distribuito. Eseguire i controlli Windows se si tocca quel
   percorso; non dichiarare supportate architetture non provate.
8. Verifica UI reale con la skill `cdp-verification`: creazione sessione,
   switch account fermo/occupato, cronologia, settings, home e nuovo layout.
   Se l'autenticazione del dev environment è bloccata, risolverla o riportare la
   verifica come incompleta: i test unitari non la sostituiscono.
9. Aggiornamento reale del pacchetto su profilo di test e confronto hash logo.
10. Audit finale della superficie di divergenza upstream e revisione del diff.

L'audit richiesto dalle regole del fork va eseguito contro la base aggiornata:
`git diff --numstat origin/fork/main...HEAD`, filtrando i file fork. Per il merge
upstream separare il delta ufficiale dai cambi personalizzati, altrimenti i
1.152 file importati falsano il conteggio della manutenzione del fork. Revisionare
anche il diff del merge risolto contro ciascun parent e i file auto-merge nelle
aree account/runtime; un merge testuale riuscito non prova la compatibilità.

Organizzare commit revisionabili nella stessa PR: configurazione sync, merge e
risoluzioni, nome visibile/logo, cataloghi e note di release. Rispettare autore
`Nicola Panero <panero.nicola01.np@gmail.com>`, senza attribuzioni AI. La PR deve
elencare base e target esatti, decisioni sui conflitti, controlli realmente
eseguiti e prove ancora mancanti. La revisione e il merge del proprietario sono
il passaggio finale; non attivare auto-merge o pubblicare una release prima.

Completamento: tutti i controlli necessari passano, un'installazione precedente
si aggiorna mantenendo i dati, il nome è Paradev++, il logo è quello attuale e
le funzionalità del fork restano presenti.

## Appendice — I 38 percorsi in conflitto rilevati

I seguenti 21 file richiedono una risoluzione di codice/configurazione:

```text
README.md
apps/desktop/electron-builder.ts
apps/desktop/package.json
apps/desktop/src/renderer/components/DesktopNotices/DesktopNotices.tsx
apps/desktop/src/renderer/hooks/useAcpChatEnabled/useAcpChatEnabled.ts
apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/RightPaneArea/RightPaneArea.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceEmptyState/WorkspaceEmptyState.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useAgentSessionLauncher/useAgentSessionLauncher.ts
apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/ChatPane.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/AcpChatPane/AcpChatPane.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/SessionView/SessionView.tsx
apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx
apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen/NewWorkspaceScreen.tsx
apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen/components/SupersetIcon/SupersetIcon.tsx
apps/desktop/src/renderer/routes/_authenticated/settings/components/SettingsSidebar/SettingsSidebar.tsx
apps/desktop/src/renderer/routes/_authenticated/settings/layout.tsx
apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.ts
bun.lock
package.json
packages/cli/package.json
packages/host-service/package.json
```

Gli altri 17 sono `packages/i18n/locales/<locale>/messages.po`, per le lingue
`cs`, `de`, `en`, `es`, `fr`, `id`, `it`, `ja`, `ko`, `nl`, `pl`, `pt-BR`, `ru`,
`tr`, `vi`, `zh-CN` e `zh-TW`.

La risoluzione prevista è descritta nelle fasi 2, 5 e 7. Il nuovo codice del
fork resta nei file dedicati; i file ufficiali importati automaticamente non
diventano un'occasione per riordinare o rifattorizzare parti estranee.
