# Pull request dei repository aggiuntivi

Analisi del codice del 26 ottobre 2026. Proposta da implementare; nessuna modifica
al comportamento dell'app e nessuna verifica nell'app in esecuzione.

Piano operativo: [Piano per le pull request dei repository aggiuntivi](../plans/20261026-fork-workspace-pr-repositories.md).

## Problema e cause

Le cartelle aggiuntive appartengono al progetto (`project_folders`). Ogni workspace
le vede come cartelle condivise oppure come worktree isolati
(`workspace_folder_worktrees`). Il selettore cambia lo stato `selectedRepoStore`;
file e diff usano la `workspaceKey` della cartella selezionata.

Il flusso PR conserva invece il modello del repository principale:

| Punto | Comportamento attuale | Conseguenza |
| --- | --- | --- |
| `ChangesControl` e `usePRFlowState` | Ricevono il vero `workspaceId`, senza leggere la cartella selezionata | Badge PR e sincronizzazione del branch restano sul principale |
| `WorkspaceGitStatusProvider` | Legge lo stato Git del workspace principale | Anche contatori e azioni della barra possono riferirsi al principale |
| `useShipActions` | Commit, push e creazione PR ricevono quel `workspaceId` | Lo switch non cambia il repository delle operazioni |
| `git.getPullRequest` | Cerca un workspace reale e il suo `pullRequestId`, dopo il percorso Bitbucket del fork | Non risolve le cartelle aggiuntive |
| `pullRequests.createForWorkspace` | Cerca un workspace reale e risolve GitHub tramite il suo `projectId` | Non basta passare la chiave sintetica della cartella |
| `forkCreateWorkspacePullRequest` e `forkWorkspaceReviewTarget` | Usano progetto, branch e binding del workspace principale | La stessa limitazione riguarda Bitbucket |
| `PullRequestsView` e `useProjectQueryTargets` | Partono da `useHostProjects`, che legge `project.list` | Le cartelle extra non diventano sorgenti della lista |
| `forkScmProjects` e ricerca PR | Risolvono i remote dei soli progetti registrati | Aggiungere solo un'opzione nella UI non estende la ricerca |
| Dettagli e azioni basati su `projectId` | Il progetto identifica un solo repository | Commenti, diff e mutazioni devono conoscere il repository effettivo |

Il resolver Git `resolveWorktreePath` supporta già le chiavi sintetiche
`pf~<workspaceId>~<folderId>`. Questo supporto riguarda il percorso locale,
non l'identità della PR e i collegamenti nel database.

Il runtime ufficiale conserva un puntatore PR attivo in `workspaces.pullRequestId`
e una tabella di collegamenti `workspace_pull_requests`. Quest'ultima consente più
collegamenti, ma non identifica la cartella del workspace. Il fork conserva una PR
per `(scope, workspaceId)` in `fork_workspace_pull_requests`, con foreign key verso
un workspace reale. Le chiavi sintetiche non possono essere inserite in quel campo.

## Comportamento proposto

- Nel workspace, il repository selezionato governa stato, branch, commit, push,
  base branch, creazione PR, badge e apertura della PR collegata.
- Una cartella senza Git non mostra azioni PR. Un repository senza remote supportato
  mantiene le operazioni Git locali e mostra il motivo per cui le PR non sono disponibili.
- Il dettaglio di una PR già aperta mantiene il suo repository durante lo switch.
  Merge, commenti e draft operano sull'identità di quella PR.
- La schermata Pull Requests resta una vista globale. Un filtro di progetto include
  il principale e i repository Git aggiuntivi; un filtro repository permette di
  restringere la lista. L'apertura dalla cartella può preimpostare questo filtro.
- Ogni riga mostra provider e `owner/repo`. Repository presenti in più progetti o
  cartelle producono una sola PR nella lista, mantenendo i contesti locali associati.
- Il badge nella sidebar globale dei workspace deve avere una regola esplicita:
  raccomandato un riepilogo delle PR dei repository, con scelta quando sono più di una.
  Non deve dipendere dalla selezione temporanea di una finestra.

## Modello e risoluzione

Separare tre identità:

1. **Contesto locale:** host, organizzazione, vero workspace, cartella opzionale,
   percorso del worktree. Serve alle operazioni Git e a trovare il workspace collegato.
2. **Repository remoto:** provider, server, owner e nome. Serve alla ricerca, alla
   deduplicazione e alla scelta dell'account. Head e base possono essere repository
   diversi nel caso di una PR da fork.
3. **PR:** repository di destinazione e numero. Il solo numero, o la coppia
   `projectId + numero`, non distingue più tutte le PR.

Un resolver del fork sull'host deve validare l'appartenenza della cartella al
progetto, trovare il worktree effettivo, leggere branch/HEAD e remote correnti e
risolvere provider e account. La UI passa ID registrati, senza scegliere liberamente
un percorso filesystem. Il branch va letto dal repository selezionato: le cartelle
condivise possono avere un branch diverso da quello principale.

Per la scoperta PR riusare la logica esistente di lettura dei riferimenti Git:
il branch remoto di push può differire dal nome locale. Rispettare binding del
repository, upstream e remote di push; distinguere destinazione della PR e
repository sorgente quando `origin` è un fork. Le configurazioni ambigue richiedono
una scelta visibile, evitando di assumere sempre `origin` o il remote del principale.

I binding account/remote delle cartelle devono essere propri del repository;
non devono sovrascrivere il binding del progetto principale.

Per i collegamenti aggiungere una tabella locale del fork creata da
`ensureForkTables`, con vero workspace, chiave del repository locale, riferimenti
remoti e branch. Una PR di una cartella non deve sostituire il puntatore del
principale. Più PR candidate per branch o basi differenti richiedono una scelta
esplicita. Eliminazione della cartella e del workspace deve pulire i collegamenti;
cambio branch o remote deve invalidarne l'associazione attiva.

## Interventi consigliati

1. Introdurre resolver e catalogo repository in nuovi file `fork-*`. Aggiungere
   procedure del fork per catalogo, PR del contesto locale e creazione. Lasciare
   invariati i contratti esistenti per i client già distribuiti.
2. Introdurre un hook/componente del fork che fornisca il contesto selezionato
   alla barra Changes e alle azioni. Conservare separati il vero workspace usato
   per navigazione/chat e la chiave Git usata per il repository aggiuntivo.
3. Aggiungere un catalogo dedicato alle PR per host, principale più cartelle Git.
   Non trasformare le cartelle in progetti fittizi dentro `useHostProjects`, usato
   anche da altre funzionalità. Per una cartella il catalogo globale parte dal
   percorso sorgente; il collegamento a un workspace usa il suo worktree effettivo.
4. Estendere ricerca e filtri con identità repository esplicita, usando una nuova
   procedura o un input opzionale che abiliti il nuovo comportamento. Conservare
   il comportamento predefinito delle vecchie API. Non aggiungere righe con lo
   stesso `projectId` a `forkScm.projects` senza adeguare i suoi consumatori.
5. Aggiornare identità delle righe, selezione, route, cache, dettagli, diff, thread,
   commenti e mutazioni. Il percorso GitHub `getContentByRepo` è un precedente
   utile per la lettura; le operazioni basate sul progetto restano da estendere.
   Anche il dettaglio Bitbucket deve risolvere la cartella, oggi cerca un progetto.
6. Aggiornare il collegamento PR → workspace: riaprire il workspace e selezionare
   la cartella corretta. Gli handoff verso chat/agenti devono ricevere quel contesto
   e usare la cartella del repository interessato.

Limitare gli agganci nei file upstream a import, chiamate e parametri opzionali;
implementazione, nuovi componenti e regressioni restano nei file del fork.

Cache e richieste devono includere host, organizzazione e identità del contesto
o della PR. Una risposta del repository A arrivata dopo lo switch su B non deve
essere mostrata come dato di B. Una mutazione già avviata deve conservare il target
originale. Durante il caricamento di B, evitare azioni ancora abilitate con dati di A.
Condividere i refresh ed evitare un polling remoto per ogni cartella a ogni render.
Un host privo delle nuove procedure deve mostrare la funzione aggiuntiva come non
disponibile, mantenendo funzionante il repository principale.

## Verifica dell'implementazione

Regressioni mirate in file `fork-*.test.*`:

- Principale GitHub più cartella GitHub con una PR diversa, anche con lo stesso numero.
- Principale GitHub più cartella Bitbucket, con binding account separati.
- Cartella condivisa con branch diverso e cartella con worktree isolato.
- Switch A → B con risposta tardiva di A; creazione avviata su A durante lo switch.
- Creazione che usa percorso, head, base e remote della cartella e mantiene il link principale.
- Diff, commenti, draft e merge indirizzati alla PR aperta anche dopo uno switch.
- Filtro progetto che include le cartelle, filtro repository e deduplicazione tra progetti.
- Apertura dalla lista che ritrova workspace e cartella; cartella rimossa, remote
  cambiato, detached HEAD e assenza di Git o remote supportato.
- Branch remoto diverso dal locale e PR da fork verso un repository differente.
- Compatibilità con host senza le nuove procedure e funzionamento del flusso principale.

Poi eseguire `bun run check:i18n`, typecheck desktop e host-service,
`bun run test:fork` e verificare il flusso nell'app tramite CDP. Eventuali stringhe
nuove richiedono tutte le 17 traduzioni; una PR che introduce la funzione aggiorna
anche il popup What's New. Questa analisi non richiede tali controlli perché
modifica soltanto documentazione.

## Riferimenti principali

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useWorkspaceFolders/useWorkspaceFolders.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/ChangesControl/ChangesControl.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePRFlowState/usePRFlowState.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useShipActions/useShipActions.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets/useProjectQueryTargets.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestsView/components/PullRequestsContent/PullRequestsContent.tsx`
- `apps/desktop/src/renderer/components/ForkIntegrations/components/ForkPullRequests/ForkPullRequests.tsx`
- `packages/host-service/src/project-folders/project-folders.ts`
- `packages/host-service/src/trpc/router/git/git.ts`
- `packages/host-service/src/trpc/router/pull-requests/procedures/create-for-workspace.ts`
- `packages/host-service/src/fork-integrations/fork-projects.ts`
- `packages/host-service/src/fork-integrations/fork-workspace-pull-request.ts`
- `packages/host-service/src/fork-integrations/fork-workspace-review.ts`
- `packages/host-service/src/fork-integrations/fork-search-pull-requests.ts`
- `packages/host-service/src/runtime/pull-requests/utils/workspace-refs.ts`
- `packages/host-service/src/db/fork-schema.ts`
