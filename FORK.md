# Superset++

Fork personale di [superset-sh/superset](https://github.com/superset-sh/superset),
basato sulla release stabile desktop **1.37.0**. Usa i servizi ufficiali per
login e sincronizzazione; le estensioni del fork girano sull’host locale.

## Uso quotidiano

- **Agente · Account** nell’intestazione della chat apre un unico pannello
  per scegliere l’agente, il suo account e dove continuare: nella stessa
  chat, in una nuova scheda o in un pannello affiancato.
- Il selettore del **modello** contiene soltanto i modelli dell’agente in uso
  e le sue opzioni. Non cambia agente o account.
- **Trova una chat** nel pannello Agents cerca per titolo, modello o branch
  nei depositi locali di Claude, Codex, Cursor CLI, Grok e OpenCode, in tutti
  gli account e nelle cartelle del progetto, inclusi i worktree. Se la chat
  è già collegata a Superset, la riapre e la mette a fuoco.
- **CLI / CHAT** riprende la stessa sessione nell’altra vista, conservando
  l’account effettivo e la configurazione. L’adattatore uscente viene fermato
  prima di avviare quello nuovo: la cronologia ha un solo processo scrittore.
- Chiudere il pannello mantiene la chat in **Background chats**. Il comando
  **Stop** ferma l’agente; se lo stop fallisce la chat resta recuperabile.
  Restano al massimo 20 chat in background per area di lavoro.

## Account prima dell’avvio e quote

La creazione workspace propone accanto al provider l’account effettivo dell’host e
la quota disponibile per il modello scelto. La scelta vale per quella creazione;
cambiando host/provider o iniziando una nuova creazione torna il predefinito.
**Suggerito** indica l’abbonamento con più quota verificata: la scelta resta manuale.
Lo stesso riepilogo compare nel menu account, nelle intestazioni e in Usage.

La schermata controlla la cache condivisa all’apertura, al ritorno e ogni trenta
secondi mentre è visibile. La cache dell’host dura quindici secondi; le richieste
al provider restano distanziate di cinque minuti per account, con backoff su 429. Dati vecchi o mancanti restano segnalati; non equivalgono a quota libera.
Il rinnovo passa dal CLI del profilo, senza richieste al modello, hook o MCP:
Claude usa soltanto `/usage`, Codex soltanto le procedure RPC dell’account.
Ogni verifica ha un limite di 15 secondi, al massimo due possono essere attive e
ogni profilo viene verificato al massimo una volta ogni cinque minuti. Il backoff
`Retry-After` si conserva anche se il CLI rinnova il token. L’ultima lettura riuscita
resta sull’host per 24 ore, fino a 128 account, con la data originale e l’identità
verificata. Non viene attribuita a un nuovo login nello stesso profilo.

Cambio account e avvio sono diretti: quota vecchia, esaurita o fatturazione API
restano indicazioni nel selettore, senza dialoghi di conferma. **Ultima lettura**
mostra la quota conservata con la sua data originale. Account mancanti o
credenziali imposte incompatibili producono ancora un errore prima dell’avvio.
Cursor/Grok continuano a usare i loro crediti.
La scelta arriva a chat, CLI, avvio dopo il setup e naming. Una scelta mancante o
incompatibile con credenziali imposte produce un errore prima della creazione.
Il naming fallito deriva il titolo localmente. Le chat già aperte non vengono spostate.

## Eliminazione workspace

La preferenza globale **Elimina branch** rimane ricordata. La casella compare
soltanto dopo un’anteprima che verifica il branch; mostra il suo nome esatto.
Un workspace sulla cartella principale conserva sempre branch e file del progetto.

Sono eliminabili solo branch nuovi creati con successo dal fork: la configurazione
Git locale conserva l’ID del workspace creatore e il riferimento esatto. Le rinomine
automatiche aggiornano questa provenienza. Branch preesistenti, importati, recuperati
da remoto, condivisi o non verificabili restano conservati; nessun nome di branch
attribuisce retroattivamente una provenienza. Il backend ricontrolla prima di
eliminare e il flag `force` non aggira queste protezioni. Non elimina branch remoti.
Nelle cancellazioni multiple la preferenza si applica solo ai branch idonei.

## Cosa è ufficiale e cosa mantiene il fork

| Funzione | Base ufficiale 1.37 | Estensione Superset++ |
|---|---|---|
| Chat ACP e CLI/CHAT | Pannelli, protocolli, ripresa e passaggio tra viste | Account/configurazione persistenti e ponte Cursor CLI/ACP |
| Ripresa e fork dello stesso agente | Azioni ufficiali | Conservazione dei profili nelle operazioni locali |
| Modelli e opzioni della chat | Selettore ufficiale | Solo modelli dell’agente corrente; agente/account nell’intestazione |
| Cambio tra agenti diversi | Passaggio del contesto | Conversione dei formati nativi tramite txcript e provenienza locale |
| Chat locali | Sessioni collegate all’host | Ricerca nei depositi nativi, deduplicazione per deposito e riapertura delle chat collegate |
| Account | Identità e consumi ufficiali | Profili locali per avvio e trasferimento; cambio account Claude nella chat |

La chat ACP e il passaggio CLI/CHAT non sono stati introdotti dal fork.
L’integrazione riutilizza i nuovi pannelli `chat-v3` ufficiali; un piccolo
adattatore in `ForkChatExtras/utils/forkChatContext` collega le estensioni
locali ai loro dati senza mantenere una seconda implementazione del pannello.

## Trasferimenti

Il trasferimento **nativo** converte la sessione verso Claude, Codex, Cursor
CLI, Grok o OpenCode, nelle 20 direzioni supportate dal motore. Mantiene
messaggi, chiamate agli strumenti e risultati compatibili con la destinazione.
La sorgente viene conservata; ogni passaggio registra agente, configurazione,
account e sessione in un database locale. Un avviso mostra la provenienza.

Se il trasferimento nativo non è disponibile o fallisce, il pannello resta
aperto e propone **Continua con il contesto**. Serve una scelta esplicita.
Questo trasferimento invia soltanto i messaggi visibili e può omettere storia
precedente: conserva il limite ufficiale di **36.000 caratteri** del contesto.
Quel limite non si applica alla conversione nativa di txcript. La ricerca
non fonde copie indipendenti in account diversi: l’identità comprende agente,
percorso canonico del deposito e ID nativo; gli alias dello stesso deposito
vengono unificati conservando la versione più recente.

Permessi, server MCP, credenziali e ragionamento interno del modello non
vengono trasferiti. Sono supportate le sessioni di Cursor CLI, non Cursor IDE.
L’account per avvio si sceglie per Claude e Codex; il cambio di account dentro
una chat aperta è disponibile per Claude. Non esiste un cambio automatico di
account quando finisce la quota.

## Installazione e compatibilità dei dati

```sh
curl -fsSL https://raw.githubusercontent.com/NicolaPanero/superset/fork/main/scripts/fork/install.sh | sh
```

L’app si chiama **Superset++.app** e convive con Superset ufficiale.
Il nome visibile cambia; restano invariati bundle ID, schema `superset-fork://`,
porta locale 51742 e cartelle `~/.superset-fork` e
`~/Library/Application Support/Superset Fork`. Chat, impostazioni e login
del fork precedente continuano a usare gli stessi dati. Le vecchie build
del fork vengono rimosse dal percorso delle applicazioni; lo script locale
ne mantiene una copia in `~/.superset-fork/previous-app`.

La build include `txcript-transfer` e `txcript-cli` della stessa release.
Il nome dell’asset `Superset-fork-arm64.zip` resta stabile per compatibilità
con l’aggiornatore. La firma è ad-hoc, senza notarizzazione Apple.
Il primo passaggio da un vecchio fork installato come Superset copia una
volta i dati ufficiali senza sovrascrivere quelli esistenti; i worktree
restano dove sono. Il login può richiedere una nuova autenticazione.

Per compilare e installare dal checkout: `bun run fork:install`.
La compilazione usa i servizi di produzione e richiede che l’app precedente
sia chiusa. L’aggiornatore ufficiale è disabilitato; quello del fork controlla
le release ogni sei ore e propone l’installazione con riavvio.

## Branch, motore e aggiornamenti

- `main` segue senza modifiche `superset-sh/superset`.
- `fork/main` integra le release stabili `desktop-v*` e le estensioni locali.
- `feature/*` conserva lo storico degli sviluppi già integrati.

Il terzo progetto è [NicolaPanero/txcript](https://github.com/NicolaPanero/txcript).
La versione validata è fissata in `scripts/fork/txcript-version.json`; nuove
release del motore non vengono adottate implicitamente. Aggiornare il file,
eseguire i controlli e solo allora creare una build. Per installare il
motore fissato localmente: `bun scripts/build-txcript-transfer.ts`.
Zed è stato dismesso: la pubblicazione di txcript avvia soltanto il workflow
Superset. Il repository remoto di Zed conserva lo storico con Actions disabilitate.

`fork-sync-upstream.yml` segue quotidianamente le release stabili e verifica
lint, traduzioni e tipi prima del push. `fork-release.yml` parte anche a ogni push su `fork/main` e costruisce solo
commit non ancora pubblicati, usando il motore fissato; controlla traduzioni,
tipi e test del fork prima di impacchettare e pubblicare. Un conflitto di
sincronizzazione richiede risoluzione manuale e non pubblica una build.
Per sincronizzare localmente: `bun run fork:sync` su `fork/main`.

## Riduzione dei conflitti

Tenere le estensioni in file propri e limitare gli agganci nei file ufficiali:

- `fork-schema.ts` e `ensureForkTables` per i dati locali; niente modifiche
  al journal delle migrazioni ufficiali.
- Procedure additive in `agents/fork-*.ts`, `usage/fork-procedures.ts` e
  `session-transfer`; i contratti tRPC esistenti rimangono compatibili.
- `ForkChatExtras`, `AcpChatHandoffMenu` e `ForkHandoffMenus` per le azioni
  specifiche; selettore del modello e pannello chat restano quelli ufficiali.
- `useForkBackgroundChats` e `ForkImportChatDialog` per gestione e ricerca
  delle conversazioni; `forkChatCloseIntent` distingue chiusura e stop.
- `fork-identity.ts`, `fork-data-migration`, `fork-updates.ts` e
  `scripts/fork/` per identità, dati e distribuzione.

Quando upstream assorbe una funzione, confrontare comportamento, profili e
cronologia prima di rimuovere l’estensione. Il trasferimento nativo, il ponte
Cursor e l’affinità degli account restano funzioni del fork.

## Verifiche

I test del fork coprono conversioni, annullamento del helper, isolamento dei
profili, ripresa, account, ponte Cursor, chat in background e contesto
esplicito con paginazione e troncamento. `bun run check:i18n` richiede tutte
le traduzioni delle 17 lingue. Il typecheck riguarda desktop e host-service.
Una prova manuale con gli agenti reali resta distinta da questi controlli.
