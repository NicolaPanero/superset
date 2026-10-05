# Superset Nicola — architettura locale osservata

Audit del 3 ottobre 2026. Baseline: Superset desktop 1.35.0, commit
`b8c5ad799e1f2f626cc0daab3d970de87bb9b950`.
Questo documento descrive il codice esistente e i punti di estensione proposti.
Non dichiara già implementate le funzionalità del nuovo piano.

## Confine del lavoro

Il fork riguarda renderer desktop, Electron main e host-service locale. Le
modifiche proposte non richiedono nuove API cloud, OAuth, webhook o migrazioni
del database server. L'host-service è il runtime che gira sulla macchina che
ospita il workspace: una sua procedura tRPC locale non è una nuova API cloud.

L'app upstream continua ad avere autenticazione e funzionalità online. Le
prove usano il setup ufficiale di sviluppo, un'API localhost, account fittizio,
database Docker dedicato e `SUPERSET_HOME_DIR` separato. Questo dimostra il
funzionamento della baseline locale, non una modalità di prodotto senza login
Superset già pronta. I CLI degli agenti contattano i propri provider quando
si inviano prompt; txcript esegue queste conversioni localmente.

## Percorso di un lancio

```text
renderer / launcher / menu del terminale
  → client host-service del workspace
  → agents.run / runAgentInWorkspace
  → configurazione agente + profilo locale + comando
  → createTerminalSessionInternal
  → daemon PTY → shell → wrapper → CLI nativo
  → eventi / binding / UI
```

`AgentRunResult.sessionId` è l'ID del terminale Superset. Il distinto
`terminalAgentBindings.agentSessionId` è l'ID della conversazione del CLI.
Un risultato di txcript deve alimentare il secondo attraverso
`resumeSessionId`; non va trattato come ID del terminale.

### File del runtime

| Area | File/procedure esistenti | Responsabilità |
| --- | --- | --- |
| Configurazioni | `packages/host-service/src/trpc/router/settings/agent-configs.ts` | `list`, `add`, `update`; comando, args, resumeArgs, forkArgs, env, ordinamento; persistenza `host_agent_configs` |
| Risoluzione | `packages/host-service/src/terminal-agents/agent-config.ts` | `resolveHostAgentConfig`, `agentLaunchEnv`; env del profilo default, poi override del config |
| Lancio | `packages/host-service/src/trpc/router/agents/agents.ts` | `agents.run`, `runAgentInWorkspace`, `buildTerminalAgentLaunch`, `buildAgentCommandString`, `bindResumedSession` |
| Terminali | `packages/host-service/src/terminal/terminal.ts` | Creazione/adoption, input, snapshot, transcript, disposizione del processo |
| API terminali | `packages/host-service/src/trpc/router/terminal/terminal.ts` | `snapshot`, `transcript`, `writeInput`, `send`, `killSession`, `daemon.listSessions` |
| Daemon | `packages/host-service/src/daemon/`, `packages/pty-daemon/` | PID e sessioni PTY, socket locale, supervisione e lifecycle |
| Binding | `packages/host-service/src/terminal-agents/store.ts`, `persistence.ts`, `types.ts` | Agente, sessione nativa, eventi, account del processo, launchId, stato e subagent |
| Resume | `packages/host-service/src/trpc/router/terminal-agents/terminal-agents.ts` | Candidate, claim e deduplicazione del resume, successore del terminale |
| Wrapper | `packages/agent-setup/src/agent-wrappers-common.ts`, `agent-wrappers-claude-codex-opencode.ts`, `agent-wrappers-cursor.ts`, `agent-wrappers-grok.ts` | Report di lancio, identità e profilo riletti all'avvio del CLI |
| Catalogo | `packages/shared/src/agent-catalog.ts`, `builtin-terminal-agents.ts` | Identità, preset, command/resume/fork disponibili |

Un terminale può ospitare più lanci successivi. Il suo ID da solo non basta
a distinguere un vecchio processo da quello corrente: rispettare `launchId`,
session ID e controlli sugli eventi tardivi. Alcuni dati del binding, come
`launchId` e snapshot dell'account, sono mantenuti in memoria; la tabella
SQLite non contiene necessariamente tutti i campi del tipo runtime.

I preset upstream includono opzioni permissive. Per la prova di ownership è
stato aggiunto un config solo nel database di sviluppo, con Codex in sandbox
read-only. Non sono stati alterati i preset di prodotto.

## Renderer e handoff esistenti

La radice delle componenti del workspace v2 è:

```text
apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/
```

| Percorso relativo alla radice sopra | Funzione |
| --- | --- |
| `hooks/useAgentSessionLauncher/useAgentSessionLauncher.ts` | Crea sessioni chat ACP oppure terminali; passa forkSessionId al runtime |
| `hooks/usePaneRegistry/usePaneRegistry.tsx` | Collega launcher, pane e callback |
| `hooks/usePaneRegistry/components/TerminalPane/components/TerminalPaneHeaderExtras/components/TerminalSessionHandoffMenu/TerminalSessionHandoffMenu.tsx` | Dialogo “Continue with another agent” e fork nativo dello stesso agente |
| `hooks/usePaneRegistry/components/TerminalPane/components/TerminalPaneHeaderExtras/` | Passaggio delle callback al menu |

Altri punti utili:

- `apps/desktop/src/renderer/hooks/useV2AgentConfigs/useV2AgentConfigs.ts`:
  configurazioni per host; cache 30 secondi e refetch al focus.
- `apps/desktop/src/renderer/hooks/host-service/useTerminalAgentBindings/`:
  binding del terminale mostrato.
- `apps/desktop/src/renderer/lib/host-service-client.ts`: client del runtime
  selezionato, con autenticazione tenuta nel renderer.
- `packages/cli/src/commands/agents/create/command.ts`: CLI con
  `--resume-session`, `--fork-session`, `--from-terminal`; distinguere target
  locale e remoto.

### Continue e fork oggi

Il Continue legge `terminal.transcript`, genera un prompt tramite
`packages/shared/src/terminal-session-handoff.ts` e avvia un nuovo agente.
Non crea una conversazione nativa convertita. Il budget è 36.000 caratteri.
Le fonti, in ordine, sono conversazione Claude/Codex da store, ring PTY e
schermata visibile. Il contesto della conversazione letto da Superset non
include tutta la cronologia degli strumenti. Il ring è limitato e la schermata
può rappresentare un solo frame.

Il fork usa `forkArgs` e l'ID nativo della sorgente. Non è un cambio di agente.
Il runtime rifiuta resumeSessionId e forkSessionId insieme. Il fork crea un
nuovo ID che verrà rilevato dal CLI; il resume può essere associato subito
all'ID noto tramite `bindResumedSession`.

Il launcher renderer non espone ancora un input di resume nativo equivalente
a quello del runtime. Inoltre, per alcune configurazioni prova prima il
percorso chat ACP. L'estensione futura deve instradare esplicitamente il
resume convertito verso il terminale, come già avviene per il fork.

## Sessioni native e risoluzione del profilo

`packages/host-service/src/terminal-agents/harness-session-ref.ts` costruisce
`terminalHarnessSession`: binding, worktree, transcriptPath riportato e env di
lancio. `harness-sessions/transcript.ts` e `read-off-loop.ts` eseguono la lettura
della conversazione su worker. `harness-sessions/index.ts` registra i controlli
di esistenza e restituisce `true`, `false` o `null` quando non può sapere.

La registrazione per i cinque agenti è attualmente:

| Agente Superset | Adapter txcript | Store interrogabile in Superset | Transcript conversazionale Superset | Fork nel preset |
| --- | --- | --- | --- | --- |
| `claude` | `claude_code` | Sì | Sì | Sì |
| `codex` | `codex` | Sì | Sì | Sì |
| `cursor-agent` | `cursor` | Non registrato | Fallback PTY | Non configurato |
| `grok` | `grok` | Non registrato | Fallback PTY | Sì |
| `opencode` | `opencode` | Sì, SQLite | Fallback PTY | Sì |

La tabella descrive il codice; non certifica la compatibilità di txcript con
i cinque CLI installati. Un adapter dichiarato non dimostra un resume reale.

Claude usa `CLAUDE_CONFIG_DIR`, Codex `CODEX_HOME`. Il percorso iniziale di una
sessione e quello del nuovo lancio possono divergere dopo un cambio di default.
La lettura può cercare anche lo store precedente; il resume/fork deve verificare
lo store che il processo target userà realmente. Prima del transfer servono
quindi profilo sorgente effettivo e profilo target scelto e fissato.

Un dettaglio del codice attuale richiede attenzione: `terminalHarnessSession`
ricalcola `env` dal config e dal default corrente; non carica dal DB un env
immutabile registrato al lancio. Il transcriptPath riportato e lo snapshot
account del binding aiutano a ritrovare la sorgente effettiva. Il nuovo provider
non deve assumere che l'env ricalcolato identifichi sempre il vecchio profilo,
specialmente dopo setDefaultAccount o un restart del host-service.

Il codice Superset per la directory di progetto Claude gestisce realpath,
normalizzazione NFC, caratteri non alfanumerici e percorsi oltre 200 caratteri.
Non assumere che il writer di txcript implementi lo stesso schema. Il POC ha
usato un percorso semplice; Unicode, underscore, symlink e percorsi lunghi
restano da verificare. Riferimento: `docs/agent-session-handoff.md`.

## Account e quota esistenti

| File/area | Funzione |
| --- | --- |
| `packages/host-service/src/trpc/router/usage/usage.ts` | `logins`, `quota`, `sessionAccount`, `setDefaultAccount`, provisioning/removal |
| `usage/profiles.ts` | Scoperta bounded dei profili Claude e delle home Codex; distingue subscription/API |
| `usage/default-account.ts` | Default host-wide, pointer atomici e fallback della selezione legacy dal DB |
| `usage/account-provisioning.ts` | Condivisione delle integrazioni gestite nei profili |
| `usage/session-account/session-account.ts` | Identità e attribuzione al profilo effettivo del processo, con validazione successiva |
| `usage/claude.ts`, `codex.ts`, `grok-quota.ts`, `opencode-quota.ts` | Lettura account/quote dai provider disponibili |
| `usage/types.ts` | Finestre reali, fetchedAt, status, selection, credentialKind |
| `apps/desktop/src/renderer/hooks/host-service/useHostUsageQuota/` | Query quota per host |
| `apps/desktop/src/renderer/routes/_authenticated/settings/usage/hooks/useSetDefaultUsageAccount/` | Cambio default locale e invalidazione cache |

I path `usage/...` nella tabella sono relativi a
`packages/host-service/src/trpc/router/`.

Il cambio account non riscrive le credenziali: conserva una directory da
iniettare nel prossimo lancio. I pointer sono in
`$SUPERSET_HOME_DIR/state/default-claude-config-dir` e `default-codex-home`.
I wrapper li rileggono anche quando la shell era già aperta. L'env esplicito
di un config ha precedenza sul default. Il processo già avviato mantiene il
suo profilo.

La query quota riunisce Claude, Codex, Grok, Antigravity e OpenCode; non c'è una
quota Cursor equivalente. OpenCode può esporre abbonamenti sottostanti in sola
lettura. I profili selezionabili sono Claude e Codex. Una sorgente API può non
avere finestre quota: non equivale a capacità infinita.

La cache quota dura almeno cinque minuti e condivide la richiesta in corso.
`isDefault` viene ricalcolato separatamente dal dato di quota. Le finestre
contengono ID, label, usedPercent e resetsAt; l'account ha fetchedAt e status
come ok, token_expired, token_stale, unavailable o signed_out. Il codice evita
di fare refresh OAuth concorrenti al CLI. La policy futura deve riutilizzare
queste regole, evitando un refresh indiscriminato per ogni lancio.

**Distinzione UI:** l'attuale schermata `settings/agent-accounts` con
`AgentAccountsSettings` riguarda credenziali per workspace cloud. La gestione
locale richiesta va costruita sopra `usage` e i profili locali; riusare la
pagina cloud senza separarne il significato introdurrebbe una dipendenza
cloud fuori dallo scope.

## Storage locale esistente

| Storage | Proprietario e contenuto | Uso futuro consigliato |
| --- | --- | --- |
| `$SUPERSET_HOME_DIR/local.db` | Electron, `apps/desktop/src/main/lib/local-db/index.ts`; schema `packages/local-db/src/schema/schema.ts`; settings desktop e dati legacy | Preferenze solo desktop raggiunte via electronTrpc |
| `$SUPERSET_HOME_DIR/host/<org>/host.db` | Host-service; `src/db/schema.ts` e migrazioni locali | Config agente, workspace/progetti, terminali/binding; lineage e policy del runtime |
| Pointer in `state/` | Selezione default host-wide, letta dai wrapper | Mantenere il meccanismo esistente |
| Renderer localStorage | Singleton UI e collezioni già esistenti, quota condivisa circa 10 MB | Solo piccoli settings bounded, con allowlist e cancellazione |
| Store dei CLI | Sessioni e credenziali native dei provider | Rimangono di proprietà dei CLI; conversione solo tramite txcript |

Lineage, audit delle scelte account e alias legati a entità non devono diventare
mappe localStorage illimitate. Usare SQLite locale, migrazioni generate e una
policy di retention/deletion. Le policy che il CLI/host deve applicare senza
renderer vanno conservate sul runtime; non basta uno setting desktop.

`host.db` è organizzativo, i default account sono host-wide. Alias e policy
per profili condivisi da più organizzazioni richiedono una scelta esplicita
dell'ambito prima della migrazione: non duplicare default confliggenti in più
DB. Le preferenze specifiche del workspace possono rimanere nel suo host.db.

## Punti di estensione proposti

1. Un solo registry per mapping agenti/adapter e capabilities osservate,
   distinto dal catalogo dei preset di lancio.
2. Moduli `session-transfer` nel host-service: context provider, txcript
   provider, rilevamento CLI, risultato strutturato e warning.
3. Procedura locale additiva per conversione, con capability guard per host
   vecchi. Nessuna modifica all'API Superset cloud.
4. Target risolto e profilo fissato prima di scrivere la sessione. Lancio
   successivo tramite `agents.run` con lo stesso profilo e resumeSessionId.
5. Piccoli hook nel launcher e nel menu esistenti; percorso ACP escluso per
   questo resume; fallback context scelto dall'utente.
6. Lineage come grafo di sessioni e archi locali. Registrarvi risultato,
   profili, provider e stato effettivo del lancio, senza transcript o token.
7. AccountSelectionPolicy separata dal cambio default. Prima supporto manuale;
   poi fallback opt-in, solo su nuovi processi, con quota fresca ed eleggibilità.

Il codice di conversione e il processo target devono girare sull'host del
workspace, anche quando il renderer gira su un'altra macchina. Il primo MVP
può limitarsi al medesimo host e dichiarare il limite. La compatibilità tRPC
deve restare additiva, come richiesto dagli AGENTS del repository.

## Prova di ownership

Il POC ha convertito una sessione Claude con `txcript ... --no-resume`, poi
chiamato il vero `agents.run` del host-service locale con l'ID risultante.
Il TUI Codex ha mostrato la cronologia importata. Il processo nativo Codex è
stato osservato sotto wrapper, shell PTY e daemon Superset di questa istanza.
`killSession` e un nuovo `agents.run` hanno cambiato ID terminale mantenendo
lo stesso ID nativo e la cronologia. La chiusura finale ha rimosso il terminale
dall'elenco vivo del daemon.

Questa è una prova del runtime reale tramite API locali. Non è un test della
futura azione UI “Native Handoff”, che non è stata implementata in questo ciclo.
