# Superset++

Fork personale di [superset-sh/superset](https://github.com/superset-sh/superset),
basato sulla release stabile desktop **1.37.0**. Usa i servizi ufficiali per
login e sincronizzazione; le estensioni del fork girano sull’host locale.

[Installazione](#installazione-e-compatibilità-dei-dati) ·
[Account e quote](#account-prima-dellavvio-e-quote) ·
[Continuazione automatica](#continuazione-automatica-delle-chat-claude) ·
[Trasferimenti](#trasferimenti) ·
[Protezione dei branch](#eliminazione-workspace)

## Uso quotidiano

- **Agent · Account** nell’intestazione apre due schede:
  **Chat corrente** mostra account, quota e opzioni di continuazione salvate subito;
  **Cambia agente o account** gestisce il cambio manuale con **Continue**.
  Il cambio account Claude mantiene la chat nello stesso pannello. Per un altro
  agente puoi scegliere la stessa chat, una nuova scheda o un pannello affiancato.
- Il selettore del **modello** contiene soltanto i modelli dell’agente in uso
  e le sue opzioni. Non cambia agente o account.
- **+ → Agent** nelle schede avvia una nuova sessione. L’icona **Find a chat**
  nell’intestazione cerca per titolo, modello o branch nei depositi locali di
  Claude, Codex, Cursor CLI, Grok e OpenCode, nei profili e nelle cartelle del
  progetto, inclusi i worktree. Se una chat è già collegata a Superset, la riapre
  e la mette a fuoco. Gli elenchi seguono l’ordine e le icone delle impostazioni.
- **CLI / CHAT** riprende la stessa sessione nell’altra vista, conservando
  l’account effettivo e la configurazione. L’adattatore uscente viene fermato
  prima di avviare quello nuovo: la cronologia ha un solo processo scrittore.
- Chiudere il pannello mantiene la chat in **Background chats**. Il comando
  **Stop** ferma l’agente; se lo stop fallisce la chat resta recuperabile.
  Restano al massimo 20 chat in background per area di lavoro.
- **Pages** conserva il flusso ufficiale: una pagina compare dopo una pubblicazione
  riuscita. La chat usata per crearla rimane una sessione separata.

## Account prima dell’avvio e quote

La creazione workspace propone accanto al provider l’account effettivo dell’host e
la quota disponibile per il modello scelto. La scelta vale per quella creazione;
cambiando host/provider o iniziando una nuova creazione torna il predefinito.
**Suggerito** indica l’abbonamento con più quota verificata: la scelta resta manuale.
Lo stesso riepilogo compare nel menu account, nelle intestazioni e in Usage.

### Profili indipendenti e login CLI

Aggiungi un account dal selettore della chat o da **Settings → Usage** e accedi
con il CLI del provider. Ogni nuovo profilo conserva il proprio login nella
cartella dedicata del fork. Superset++ non copia credenziali o token dal login CLI
esterno. I profili nominati già indipendenti sono adottati nel loro percorso.

L’identità verificata del profilo resta associata a quell’account. Cambiare login
nel CLI esterno non cambia il predefinito di Superset++. Se un profilo manca o
risulta disconnesso, rimane visibile: usa **Reconnect account** con la stessa
identità oppure scegli un altro profilo. Per una nuova identità, aggiungi un
nuovo profilo; le quote del vecchio account non vengono riutilizzate.

La voce separata **CLI login** segue invece il login esterno corrente. È una
scelta esplicita per l’avvio, non può diventare il predefinito di Superset++ ed
è esclusa dagli account suggeriti per la continuazione automatica. Anche le
chat importate senza configurazione agente conservano una scelta esplicita.
Cambiare account per un nuovo avvio non sposta o arresta le chat già aperte.

Gli host remoti richiedono il fork aggiornato per l’isolamento e la verifica
dell’identità. I workspace cloud non espongono i profili locali del computer.
Dettagli in [docs/fork-accounts.md](docs/fork-accounts.md).

### Letture della quota

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

## Continuazione automatica delle chat Claude

Apri **Agent · Account → Chat corrente → Continuazione automatica**. Le due
opzioni riguardano questa chat e sono entrambe inizialmente disattivate:

- **Passa all’account suggerito quando la quota finisce**: continua nella stessa
  chat con l’abbonamento verificato che offre più quota per il modello scelto.
- **Attendi il reset della quota e riprendi**: aspetta che la quota torni disponibile.
  Per rimanere sullo stesso account, attiva solo questa opzione. Se attivi anche
  il cambio account, può usare un altro abbonamento verificato quando disponibile.

Le spunte si salvano subito: puoi chiudere il dialogo senza premere **Continue**.
Quel pulsante appartiene alla scheda **Cambia agente o account** e applica il
cambio manuale.

Puoi attivare un’opzione anche dopo un errore di quota già ricevuto dalla chat
ancora attiva sull’host. Il fork conserva solo l’ultimo turno interrotto di quella
sessione e account; la scelta avvia la verifica e, se necessario, l’attesa.
Se la sessione è chiusa, la UI indica di premere prima **Resume**. Un nuovo prompt,
**Stop**, un cambio di modello/account o una nuova sessione impediscono di far
ripartire una vecchia attività. Non riparte autonomamente dopo un riavvio dell’host.

Il servizio host gestisce l’attesa anche quando il pannello passa nelle chat in
background. Le preferenze restano sull’host, fino a 1.024 chat per 30 giorni,
e vengono rimosse quando si elimina il workspace.

### Scelta dell’account e ripresa

La continuazione interviene dopo un errore effettivo di quota del CLI Claude,
mai per una lettura vecchia o un normale errore 429. Usa abbonamenti con quota
recente verificata per il modello; esclude account API, login CLI esterno come
destinazione, duplicati dello stesso login e profili già falliti prima del reset.

Nel cambio account la conversazione nativa viene copiata conservando l’originale
e ripresa con lo stesso identificativo, modello e modalità. Viene inviata una
continuazione del lavoro interrotto, senza reinviare l’ultimo prompt. I messaggi
in coda aspettano il completamento di quel turno. Identità e abbonamento sono
ricontrollati prima della continuazione; credenziali imposte dalla configurazione
impediscono il passaggio.

L’attesa richiede una lettura riuscita successiva all’errore, controlla al reset
con un intervallo minimo di cinque minuti e rispetta `Retry-After`. Lo stato
**Waiting for quota** compare sulla chat; **Stop** annulla l’attesa. È limitata
a 24 ore e quattro riprese consecutive. Tool in background attivi richiedono
intervento manuale per conservarli.

La funzione riguarda le chat Claude integrate. I terminali mantengono i controlli
nativi del CLI; gli altri agenti non cambiano account automaticamente. Se la
ripresa della conversazione fallisce per account o sessione non caricabile,
la schermata di recupero mostra un’indicazione e interrompe i tentativi automatici
ripetuti; il tentativo manuale rimane disponibile.

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
| Account | Identità e consumi ufficiali | Profili indipendenti, login CLI separato, scelta prima dell’avvio e cambio account Claude nella chat |
| Quote e continuazione | Controlli nativi degli agenti | Riepilogo condiviso e continuazione opt-in delle chat Claude con cambio account o attesa del reset |
| Eliminazione workspace | Gestione dei workspace e worktree | Verifica della provenienza e protezione dei branch locali, importati o condivisi |

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
una chat aperta è disponibile per Claude. Il cambio automatico per quota esaurita
è disponibile nelle chat Claude integrate, solo dopo aver attivato l’opzione
per quella chat: vedi [Continuazione automatica](#continuazione-automatica-delle-chat-claude).

## Installazione e compatibilità dei dati

```sh
curl -fsSL https://raw.githubusercontent.com/NicolaPanero/superset/fork/main/scripts/fork/install.sh | sh
```

La build pubblicata è per **macOS Apple Silicon**. Chiudi l’app prima di eseguire
lo script. Per installare manualmente, scarica `Superset-fork-arm64.zip` dalle
[release del fork](https://github.com/NicolaPanero/superset/releases/latest).

L’app si chiama **Superset++.app**, usa l’icona con il **+** e convive con Superset
ufficiale. Rispetto al fork precedente restano invariati bundle ID, schema `superset-fork://`,
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
sia chiusa. Per ricevere gli aggiornamenti automatici dopo una build locale,
installa una release pubblicata dal fork con lo script sopra: i dati restano
nelle stesse cartelle. Installare l’app ufficiale non aggiorna Superset++ e
non trasferisce automaticamente i suoi dati nell’app ufficiale.

Le build pubblicate usano l’aggiornatore del fork: il primo controllo avviene
circa un minuto dopo l’avvio, poi ogni sei ore. **Check for Updates** avvia una
verifica manuale e ripropone anche una release rimandata con **Later**.
L’installazione richiede un riavvio; quella ufficiale è disabilitata nel fork.

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

Il README contiene una presentazione breve del fork e conserva la documentazione
ufficiale in un blocco espandibile. Le istruzioni specifiche restano in questo
file e in `docs/fork-accounts.md`, così gli aggiornamenti delle funzionalità del
fork non richiedono di riscrivere le sezioni ufficiali.

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
