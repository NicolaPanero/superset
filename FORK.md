# Superset++

Fork personale di [superset-sh/superset](https://github.com/superset-sh/superset),
basato sul tag desktop **1.38.0**. Usa i servizi ufficiali per
login e sincronizzazione; le estensioni del fork girano sull’host locale.

[Installazione](#installazione-e-compatibilità-dei-dati) ·
[Account e quote](#account-prima-dellavvio-e-quote) ·
[Continuazione automatica](#continuazione-automatica-delle-chat-claude) ·
[Trasferimenti](#trasferimenti) ·
[Protezione dei branch](#eliminazione-workspace)

## Uso quotidiano

- **Settings → Fork → Connections** configura GitHub, Bitbucket Cloud e Jira Cloud.
  Le stesse schede sono disponibili nell'onboarding. Jira e Bitbucket accettano
  token personali oppure un servizio OAuth compatibile; un broker può collegarli
  entrambi. Jira abilita la sorgente Tasks anche con le funzioni Pro nascoste.
  Le chiamate partono dall'host verso le API ufficiali, indipendentemente dal login
  Superset. Contratto OAuth e limiti: [docs/fork-integrations.md](docs/fork-integrations.md).
  GitHub e Bitbucket condividono la schermata Pull Requests, con l'icona del
  provider su ogni repository. Jira è la vista Tasks predefinita quando
  configurato: ricerca, filtri rapidi, lista/board e dettaglio affiancato;
  JQL resta disponibile nei controlli avanzati.

- **Settings → Fork → MCP servers** gestisce un solo elenco di server MCP
  (HTTP, SSE, stdio) per tutti gli agenti e gli account dell'host, salvato in
  `$SUPERSET_HOME_DIR/fork/mcp-servers.json`. Al primo avvio importa quelli di
  `~/.claude.json` senza toccarli. Le chat ACP ricevono l'elenco a ogni sessione;
  i terminali `claude` e `codex` lo ricevono dai wrapper (`--mcp-config` e `-c`).
  Header e variabili restano sull'host: l'interfaccia mostra solo i nomi.

- **Settings → Fork → Interactive home background** attiva uno sfondo di
  caratteri nella home di creazione dei workspace, anche sotto la barra in alto,
  e nella schermata di un workspace senza schede aperte.
  A riposo onde grigie, lente e tenui nascono in punti casuali e si
  allargano; muovendo il mouse se ne generano altre lungo il percorso. Ogni
  click genera un’onda arancione dal profilo irregolare, con increspature
  secondarie; i caratteri cambiano sulla cresta. Il logo Superset++ fa parte
  dello sfondo: caratteri fermi e tenui che diventano arancio pieno dove passa
  un’onda da click, seguendone la forma. Al massimo tre onde da click restano
  attive insieme, con almeno 0,4 secondi fra un click e il successivo; un nuovo
  click non cancella quelle in corso. Colori e contrasto seguono il tema scelto
  in **Settings → Appearance**, chiaro, scuro o personalizzato. L’opzione è
  attiva per impostazione predefinita; chi la disattiva mantiene la scelta su
  questo dispositivo. Il disegno
  avviene in WebGL2 sulla GPU, alla risoluzione nativa dello schermo e senza
  librerie aggiuntive: 30 fotogrammi al secondo a riposo, 60 durante un’onda da
  click, nessuno quando la finestra è inattiva. Senza WebGL2 la home resta
  quella originale. Con **riduci movimento** mostra una composizione statica.
  Pulsanti, campi e menu mantengono i propri click.
- **Settings → Fork → Hide paid features** nasconde anche i selettori del
  dispositivo nella home, in **Workspaces** e nelle impostazioni Git e progetto.
  In questa modalità la creazione, l’elenco dei workspace e le impostazioni
  usano il computer locale, anche con una selezione remota salvata o in un link.
- Nel composer della chat, come nella creazione di un workspace, ci sono il
  selettore del **modello** e il tondino dell’**account** con la quota.
  Il selettore mostra tutti gli agenti come schede: modello ed effort
  dell’agente in uso si applicano subito; per un altro agente restano una
  bozza finché **Switch…** non apre la conferma, e chiudere il selettore la
  annulla. Il tondino elenca gli account con la quota, la continuazione
  automatica, i reset del provider e la copia dell’ID sessione; scegliere un
  altro account apre la stessa conferma.
- La conferma sceglie account, posizione (stessa chat, pannello affiancato o
  nuova scheda) e trasferimento: **Full history** riprende la conversazione
  nativa con gli strumenti, **Summary only** passa solo i messaggi. La chat di
  partenza resta aperta finché la nuova non è avviata; il cambio account
  Claude mantiene la chat nello stesso pannello.
- Nel selettore dei permessi della chat compare **Plan** quando l’agente
  espone questa modalità. Usa la pianificazione nativa. Per Claude approva
  automaticamente le letture e le ricerche nel workspace e i comandi di
  esplorazione riconosciuti, verificando anche pipe, concatenazioni e percorsi
  reali. Le approvazioni valgono per una sola chiamata. Modifiche, uscita da
  Plan, tool MCP, percorsi esterni e comandi non riconosciuti richiedono
  conferma; le domande sulle scelte progettuali restano visibili.
  Le letture shell con percorsi relativi devono iniziare con
  `cd <percorso assoluto nel workspace> && …`. Per le patch di `git diff`
  servono `--no-ext-diff --no-textconv`, per evitare helper configurati.
- **+ → Agent** nelle schede avvia una nuova sessione. L’icona **Find a chat**
  nell’intestazione cerca per titolo, modello o branch nei depositi locali di
  Claude, Codex, Cursor CLI, Grok e OpenCode, nei profili e nelle cartelle del
  progetto, inclusi i worktree. Se una chat è già collegata a Superset, la riapre
  e la mette a fuoco. Gli elenchi seguono l’ordine e le icone delle impostazioni.
- **CLI / CHAT**, disponibile attivando le opzioni CLI avanzate, riprende la
  stessa sessione nell’altra vista, conservando
  l’account effettivo e la configurazione. L’adattatore uscente viene fermato
  prima di avviare quello nuovo: la cronologia ha un solo processo scrittore.
- Chiudere il pannello mantiene la chat in **Background chats**. Il comando
  **Stop** ferma l’agente; se lo stop fallisce la chat resta recuperabile.
  Restano al massimo 20 chat in background per area di lavoro.
- I messaggi utente mostrano ora, copia e diramazione al passaggio del mouse.
  Con Claude e Codex, **Fork from here** riparte dal messaggio scelto:
  se è un messaggio utente, ne rimette il testo nella bozza. **Rewind from here**
  chiede conferma e riavvolge solo la chat; i file restano invariati.
  La sessione originale resta nella cronologia e viene lasciata aperta se
  la copia non si carica. Gli altri agenti mantengono il fork dell’intera sessione.
- **Pages** conserva il flusso ufficiale: una pagina compare dopo una pubblicazione
  riuscita. La chat usata per crearla rimane una sessione separata.
- I terminali usano **SF Mono a 12 px** su macOS, caricato dal sistema come nel
  Terminale nativo, con **JetBrains Mono** incluso come fallback. Windows e Linux
  usano JetBrains Mono a 12 px. Interlinea 1,1 e contrasto minimo 3:1 sono comuni.
  Il tema **Dark** usa la palette ANSI di VS Code, più satura di quella pastello.
  Le preferenze salvate prevalgono;
  font e valori restano modificabili in **Settings → Appearance → Terminal typography**.
  Il font variabile normale e corsivo proviene da JetBrains Mono **v2.304**
  ([sorgente](https://github.com/JetBrains/JetBrainsMono/tree/cd5227bd1f61dff3bbd6c814ceaf7ffd95e947d9/fonts/variable));
  la licenza SIL OFL 1.1 è inclusa nelle risorse dell’app.
- L’editor e i diff dei temi **Dark** e **Light** usano la palette **Dark+ / Light+**
  di VS Code. La dimensione iniziale è 12 px su ogni sistema: Menlo su
  macOS, Consolas su Windows, Droid Sans Mono su Linux con fallback
  JetBrains Mono incluso. Le legature sono disattivate; tutte le preferenze restano
  modificabili nelle impostazioni. CodeMirror mantiene il proprio parser:
  la classificazione dei token può differire dal motore di VS Code.

## Configurazione guidata di Grok e Cursor

In **Settings → Agents**, la scheda di Grok o Cursor mostra uno stato compatto.
**Configure** apre installazione, login e **Apply recommended settings**;
**Advanced configuration** conserva i controlli manuali. Questa prima versione
riguarda gli agenti configurati sull’host locale nella schermata v2. Gli host
precedenti mantengono la configurazione manuale.

Il controllo riconosce il CLI dal suo help, rileva anche le cartelle di
installazione comuni e verifica ACP con il solo `initialize`, in una cartella
temporanea: nessun login automatico, sessione nuova, prompt o richiesta al modello.
Il comando generico `agent` viene considerato per Cursor solo se si identifica
come Cursor. Le verifiche hanno timeout e vengono condivise dalla cache della UI.
Il login e l’installazione si eseguono, dopo il click, nel terminale dell’app usando
il CLI e l’installer ufficiali. Il terminale resta aperto fino alla chiusura manuale.

Le impostazioni consigliate richiedono un’applicazione esplicita. Sostituiscono
comando, argomenti, trasporto del prompt e opzioni di ripresa del singolo agente;
conservano nome, icona, ordine, hook e le altre variabili. Non abilitano
l’approvazione automatica degli strumenti. Una modifica intervenuta nel frattempo
impedisce di applicare una vecchia anteprima. Le chat già aperte mantengono la
propria configurazione; comando e modello scelti arrivano ai nuovi avvii CLI e ACP.

Per Grok, **Use an API key** configura esplicitamente l’API xAI con fatturazione
separata e modello selezionato. La chiave è nascosta durante l’inserimento,
conservata nell’ambiente dell’agente sul database locale dell’host, come le
impostazioni avanzate, e rimossa dal form dopo l’invio. Le procedure del setup
restituiscono soltanto stato e conferma; i preset sincronizzati non includono
`XAI_API_KEY`. Le impostazioni del CLI che impongono credenziali o endpoint di
modello bloccano questo percorso per evitare override ambigui: restano modificabili
manualmente. Applicare le impostazioni normali o fare login non rimuove le
configurazioni API esistenti. **API key configured** indica presenza, non validità:
la verifica non usa richieste a pagamento.

Ogni persona installa il proprio CLI e collega il proprio account o chiave.
L’esportazione di preset condivisibili rimane un passaggio successivo.
Riferimenti: [Grok ACP](https://docs.x.ai/build/cli/headless-scripting),
[Grok API e priorità delle credenziali](https://docs.x.ai/build/enterprise),
[Cursor ACP](https://cursor.com/docs/cli/acp).

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

Il login esterno **CLI login** e il selettore **CHAT/CLI** sono nascosti per
impostazione predefinita. Si possono ripristinare da **Impostazioni → Agents →
Opzioni CLI avanzate**: è una preferenza locale di questo dispositivo.
Quando l’opzione è disattivata, anche i menu di creazione e cambio account nella
chat mostrano soltanto i profili separati. **CLI login** non viene mai suggerito né scelto dalla continuazione
automatica, anche quando le opzioni avanzate sono attive.

Per Claude e Codex, usare **Aggiungi account** per accedere in un profilo dedicato;
il login già presente nel terminale non è sufficiente per una nuova chat con le
opzioni avanzate disattivate. I profili, le credenziali e le sessioni già esistenti
restano conservati; il terminale di sviluppo e quelli usati per il login rimangono
disponibili. Le configurazioni che impongono credenziali API continuano a usare
quelle credenziali senza richiedere un login in abbonamento.

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

## Continuazione automatica delle chat Claude e Codex

Apri il tondino dell’account nel composer → **Automatic continuation**. Le due
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

La continuazione interviene dopo un errore effettivo di quota di Claude o Codex tramite ACP,
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

La funzione riguarda le chat Claude e Codex integrate. I terminali mantengono i controlli
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

| Funzione | Base ufficiale 1.38 | Estensione Superset++ |
|---|---|---|
| Chat ACP e CLI/CHAT | Pannelli, protocolli, ripresa e passaggio tra viste | Account/configurazione persistenti e ponte Cursor CLI/ACP |
| Ripresa e fork dello stesso agente | Azioni ufficiali | Conservazione dei profili nelle operazioni locali |
| Modelli e opzioni della chat | Selettore ufficiale | Solo modelli dell’agente corrente; agente/account nell’intestazione |
| Cambio tra agenti diversi | Passaggio del contesto | Conversione dei formati nativi tramite txcript e provenienza locale |
| Chat locali | Sessioni collegate all’host | Ricerca nei depositi nativi, deduplicazione per deposito e riapertura delle chat collegate |
| Account | Identità e consumi ufficiali | Profili indipendenti, login CLI separato, scelta prima dell’avvio e cambio account Claude nella chat |
| Quote e continuazione | Controlli nativi degli agenti | Riepilogo condiviso e continuazione opt-in delle chat Claude e Codex con cambio account o attesa del reset |
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

### Verifiche delle conversioni

Il motore validato è txcript `v0.14.4-fork.15`. Il contesto generato da Grok,
i riepiloghi di sessione e i messaggi di ripresa automatica vengono distinti
dai prompt dell’utente. Il contesto utile resta disponibile senza attribuirlo alla persona.
I riepiloghi Claude marcati `isCompactSummary` e il contesto di compattazione
Grok mantengono il ruolo assistente nelle sei destinazioni testate. Il testo
identico incollato da una persona resta invece un messaggio utente.

I test nativi coprono tutte le 20 direzioni tra Claude Code, Codex, Cursor Agent,
Grok e OpenCode, con prompt Unicode di oltre 50 KB, esempi di tag XML, testo
di ragionamento, chiamate e risultati degli strumenti, errori dei comandi,
risultati strutturati e immagini. Le sessioni incomplete, con ID errato o fuori
dal deposito autorizzato non devono creare una chat di destinazione. Queste
prove usano archivi temporanei ed eseguono il motore fissato prima della build.

## Installazione e compatibilità dei dati

```sh
curl -fsSL https://raw.githubusercontent.com/NicolaPanero/superset/fork/main/scripts/fork/install.sh | sh
```

Le release includono **macOS Apple Silicon** e **Windows x64**. Su Mac chiudi l’app prima di eseguire
lo script. Per installare manualmente, scarica `Superset-fork-arm64.zip` dalle
[release del fork](https://github.com/NicolaPanero/superset/releases/latest).

Su Windows scarica `Superset-fork-x64.exe` dalla stessa release e aprilo.
L’installazione è per utente, non richiede privilegi amministrativi e usa
il nome Superset++, il protocollo `superset-fork://` e dati separati dal Superset
ufficiale. Gli agenti e Git devono essere disponibili sul PC; l’installer include
il CLI Superset e i due strumenti txcript nativi x64. L’installer Windows non
è firmato e al primo avvio Windows può mostrare un avviso sull’editore.
Gli aggiornamenti successivi arrivano dall’app, con gli stessi avvisi del Mac:
il download viene verificato prima della chiusura, i servizi vengono arrestati,
l’installer aggiorna lo stesso percorso e riapre l’app. Chat e profili sono conservati.

L’app Mac si chiama **Superset++.app**, usa l’icona con il **+** e convive con Superset
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
circa un minuto dopo l’avvio, poi ogni 15 minuti. Un controllo viene eseguito
anche tornando all’app o riattivando il computer, con un intervallo minimo di
un minuto per evitare richieste ripetute durante i cambi di finestra.
La disponibilità di un aggiornamento compare in basso a destra, nella finestra
in primo piano, senza interrompere la chat. **Later** nasconde solo quella
release; una release successiva genera un nuovo avviso. Se l’app è in background,
l’avviso resta in attesa del ritorno alla finestra. **Check for Updates** avvia
una verifica manuale e ripropone la release rimandata nella finestra nativa.
I controlli usano richieste condizionali e rispettano i limiti di GitHub.
Con **Install and restart**, l’app mostra una finestra di avanzamento e resta
aperta finché download, checksum e preparazione del bundle non sono completati.
Chiudere la finestra di avanzamento annulla la preparazione. Il riavvio ha un
limite di attesa; un fallimento conserva il bundle precedente e permette di
riprovare. L’installer usa la release mostrata, non una nuova release arrivata
nel frattempo. Gli errori sono registrati in `~/Library/Logs/Superset++/fork-update.log`.
L’aggiornamento ufficiale è disabilitato nel fork.

Le build con il vecchio updater chiudono invece subito la finestra e scaricano
in background: attendere qualche minuto prima di riaprire o interrompere l’app.

## Branch, motore e aggiornamenti

- `main` segue senza modifiche `superset-sh/superset`.
- `fork/main` integra le release stabili `desktop-v*` e le estensioni locali.
- `feature/*` conserva lo storico degli sviluppi già integrati.

Il terzo progetto è [NicolaPanero/txcript](https://github.com/NicolaPanero/txcript).
La versione validata è fissata in `scripts/fork/txcript-version.json`; nuove
release del motore non vengono adottate implicitamente. Aggiornare il file,
eseguire i controlli e solo allora creare una build. Per installare il
motore fissato localmente: `bun scripts/build-txcript-transfer.ts`.
Zed è stato dismesso. La pubblicazione di txcript non cambia il motore usato
da Superset++: serve aggiornare esplicitamente il pin. Il repository remoto di Zed conserva lo storico con Actions disabilitate.

`fork-sync-upstream.yml` segue quotidianamente le release stabili pubblicate.
Mantiene `main` come specchio ufficiale e propone ogni nuova release con una
pull request da `fork/sync-desktop-v…` verso `fork/main`. Non aggiorna direttamente
`fork/main` e non abilita il merge automatico. I controlli richiesti vengono
eseguiti sulla pull request; il merge resta una tua decisione.
I tag preparati prima della pubblicazione di una release non vengono proposti. `fork-release.yml` parte
su ogni push a `fork/main` (anche se contiene più commit), oppure su avvio manuale, e costruisce solo
commit non ancora pubblicati, usando il motore fissato. Un nuovo push annulla la
build precedente: resta da completare soltanto quella dell’ultima revisione.
Un minuto di attesa prima dei lavori costosi raggruppa i push ravvicinati.
Le pull request usano il workflow di regressione e salvano per 30 giorni il tree
Git verificato. Dopo il merge, la release riusa il risultato se il contenuto è
identico e l'esecuzione della PR nello stesso repository è conclusa con successo,
anche se lo SHA cambia per merge, squash o rebase. Se la prova manca, è scaduta o
il contenuto è diverso, esegue la validazione prima delle build. Le prove native
Mac e Windows restano obbligatorie.
I controlli completi della release possono essere riusati in un nuovo tentativo
solo per il medesimo commit già validato. Download e helper fissati sono in cache;
le prove native delle due piattaforme restano obbligatorie prima di memorizzare
un pacchetto verificato. Se una piattaforma fallisce, un nuovo tentativo dello
stesso commit può riusare l’archivio già verificato dell’altra piattaforma.
L’opzione manuale `force` permette una ricompilazione completa.
La conclusione del sync non avvia una build: solo il merge della proposta su
`fork/main` avvia il workflow di release. Prima della pubblicazione viene verificato che il commit
sia ancora l’ultimo di `fork/main`. Il workflow controlla traduzioni,
tipi e test del fork prima di avviare le build Mac e Windows. Ogni piattaforma
esegue le 20 conversioni native; Windows verifica anche l’installer NSIS, i moduli
nativi nel runtime Electron installato e lo script di aggiornamento. La release
viene pubblicata solo quando entrambe le piattaforme hanno superato i controlli,
con tutti e due i download: una build fallita lascia disponibile la release precedente.
Se il merge upstream presenta conflitti, il sync apre una pull request in bozza
che punta al commit ufficiale: va riconciliata con `fork/main` prima di completare
il merge. Una proposta già aperta o chiusa non viene ricreata al controllo successivo.
Se è fallita soltanto l’apertura della PR, il sync recupera il branch già creato
senza sovrascrivere le correzioni manuali. `FORK_SYNC_TOKEN` deve consentire
Contents, Workflows e Pull requests in scrittura.
Per sincronizzare localmente: `bun run fork:sync` su un branch di lavoro.

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
- `ForkChatExtras` fornisce al composer, tramite `ForkComposerControlsProvider`,
  selettore, tondino e conferma del fork; le proprietà aggiunte a `ModelPicker`
  ufficiale sono in `fork-model-picker-props.ts` e arrivano con `...fork`, lontano
  dalle righe che upstream modifica. `ForkHandoffMenus` resta per i terminali.
- Integrazioni Bitbucket e Jira: `forkHostProviders` in `app.ts` sostituisce le
  credenziali in un solo punto; i layout di PR e Tasks leggono i parametri
  `fork*` con `forkRouteSearch` (una riga ciascuno); `useForkPullRequestRedirect`
  apre i link Bitbucket; `NewProjectModal` cambia solo l’import del selettore
  e la chiamata `forkProjectCreator(...).mutate`, mentre `GitHubRepositoryPicker`
  resta quello ufficiale.
- `useForkBackgroundChats` e `ForkImportChatDialog` per gestione e ricerca
  delle conversazioni; `forkChatCloseIntent` distingue chiusura e stop.
- `fork-identity.ts`, `fork-data-migration`, `fork-updates.ts` e
  `scripts/fork/` per identità, dati e distribuzione.
- `ForkHomeBackground` (in `renderer/components`) e `fork-home-appearance.ts`
  per lo sfondo opzionale: disegno, animazione, logo e stili restano nel
  componente del fork. La home e la schermata vuota del workspace
  (`WorkspaceEmptyState`) aggiungono solo il livello di sfondo e il contenitore
  del logo; senza sfondo la schermata vuota mostra il logo `{+}` del fork.
- `useForkPaneActions` nasconde la × di un pannello quando è l’unico della sua
  scheda, perché la × della scheda fa già la stessa cosa; `page.tsx` e
  `RightPaneArea.tsx` cambiano solo il passaggio delle azioni.
- Barra delle schede e intestazioni dei pannelli senza sfondo proprio, con lo
  stesso colore del contenuto: in `TabBar.tsx` e `PaneHeader.tsx` cambia solo la
  classe del colore di sfondo.
- `ForkWordmark` per la scritta **SUPERSET++** della schermata di avvio, con lo
  stesso effetto di luce dell’originale, e della pagina di accesso.
  `AuthProvider` cambia solo l’import; il logo della pagina di accesso arriva
  dalla riga di export in `sign-in/components/SupersetLogo/index.ts`.

Quando upstream assorbe una funzione, confrontare comportamento, profili e
cronologia prima di rimuovere l’estensione. Il trasferimento nativo, il ponte
Cursor e l’affinità degli account restano funzioni del fork.

## Verifiche

I test del fork coprono conversioni, annullamento del helper, isolamento dei
profili, ripresa, account, ponte Cursor, chat in background e contesto
esplicito con paginazione e troncamento. `bun run check:i18n` richiede tutte
le traduzioni delle 17 lingue. Il typecheck riguarda desktop e host-service.
Una prova manuale con gli agenti reali resta distinta da questi controlli.

Esegui `bun run test:fork` per le regressioni desktop, unità/runtime e integrazioni
host. La CI usa lo stesso comando e verifica separatamente il motore nativo
prima di impacchettare. I test usano profili simulati, database e repository
temporanei. Copertura, comandi e limiti in [docs/fork-testing.md](docs/fork-testing.md).


### Gemini e Google Antigravity

Entrambi compaiono come chat ACP quando sono presenti nelle impostazioni.
Gemini usa il CLI ufficiale (`gemini --acp`) e il login Google; il profilo
predefinito delle chat è separato dal login del terminale tramite
`GEMINI_CLI_HOME`. Un valore esplicitamente configurato resta utilizzabile.

Antigravity usa il [server ACP ufficiale Google](https://github.com/agentclientprotocol/registry/tree/main/antigravity-acp),
fissato alla versione 1.3.0. Alla prima apertura viene scaricato da Google per
la piattaforma corrente; gli avvii successivi usano la cache locale. Non viene
avviato il CLI `agy` al posto del server ACP. Il login proposto è Google OAuth. Lo stato della chat è separato dal CLI
tramite `GEMINI_HOME`; i comandi degli strumenti mantengono il loro `HOME`.

I test automatici verificano registrazione, identità della configurazione,
modelli Gemini, login ACP prima di apertura/ripresa, profilo Gemini separato,
URL delle distribuzioni, cache concorrente e fallimenti dell'installazione.
Il server Antigravity macOS arm64 è stato inoltre avviato in un ambiente
isolato per verificare `initialize`, versione, login Google e ripresa delle
sessioni, senza autenticare un account o inviare prompt.

Le funzionalità di account gestiti, quota, reset e continuazione automatica
non sono estese agli account Google. La continuazione automatica resta per
Claude e Codex. Il codec Antigravity di txcript riguarda il deposito del CLI `agy`,
non un deposito ACP verificato; Gemini non ha ancora un codec txcript.
Per questo i due agenti sono visibili in “Continue with”, ma la conversione
nativa verso di essi è disabilitata. Prima di abilitarla servono prove dei
depositi ACP e un account Google per validare login, entitlement e ripresa.

### Importazione dalla schermata iniziale

Accanto alla cronologia dei prompt compare “Find a chat”, con un'icona di
importazione distinta. Dopo aver scelto il progetto, apre la ricerca nel
workspace locale già esistente oppure ne registra uno sul checkout del
progetto, senza inviare prompt, avviare agenti o creare worktree. La ricerca
copre anche le sessioni negli altri worktree del progetto.
“Continue with” segue tutte le configurazioni e il loro ordine nelle
impostazioni. Le configurazioni eliminate non vengono ripristinate attraverso
preset impliciti; quelle senza conversione verificata restano visibili con
la ragione dell'indisponibilità.


### Modalità chat predefinita e sessioni salvate come terminale

Con “Mostra CLI avanzate” disattivato, tutti gli agenti con un harness ACP
partono come chat, anche alla creazione di un workspace. Grok e Cursor sono
riconosciuti anche dal launcher host, oltre che dal selettore dell'interfaccia.
Una sessione rimasta in modalità terminale viene ripresa come chat usando
il suo ID nativo. Se sta rispondendo o aspettando un permesso, il passaggio
attende la fine del turno. Una shell normale resta una shell.

Un errore di conversione mostra un pulsante Retry; non provoca un nuovo agente
né tentativi automatici continui. Riattivando le opzioni CLI avanzate è ancora
possibile scegliere la modalità terminale.

Il controllo guidato Grok/Cursor negozia ACP 1 e 2, con i nomi dei campi di
entrambe le versioni, e invia solo `initialize`. Se il controllo non riesce a
confermare la chat, le impostazioni mostrano “CLI installed” e spiegano che la
compatibilità verrà verificata all'apertura. Questo esito non forza l'uso del
terminale e non implica che una chat già funzionante sia incompatibile.


### Full access nelle chat ACP

Il menu delle modalità offre Full access anche per Cursor e per gli altri
agenti ACP configurati. Quando l'agente espone un bypass nativo, viene usato
quel modo. Negli altri casi la chat approva automaticamente le richieste di
permesso degli strumenti, usando le opzioni effettivamente offerte dall'agente.
Cursor viene portato in modalità Agent, se prima era in Ask.

La scelta viene salvata insieme alla chat e alla preferenza dell'agente,
come le altre modalità. Può essere attivata anche quando un comando aspetta
Allow e può essere disattivata tornando alla modalità con conferme. Non
modifica i file globali dei permessi del CLI. Restano validi i limiti del
provider, del sandbox e del sistema operativo; le domande per chiarire il
lavoro richiedono ancora una risposta.

I test coprono ACP 1 e 2, ripresa delle sessioni, modalità native, richieste
pendenti, cambio di modalità rifiutato o confermato in ritardo, aggiornamenti
del modello/modalità e isolamento tra conversazioni. La modalità aggiunta
alla chat non viene inviata al provider come un ID nativo inventato.


### Continuazione automatica della chat corrente

Current chat è disponibile per tutti gli agenti ACP. Le due opzioni sono
separate: cambiare account quando la quota finisce, oppure aspettare il reset
e riprendere sulla stessa sessione. Quando un agente o un host non supporta
una delle opzioni, la sezione spiega il requisito mancante senza mostrare una
spunta che non potrebbe funzionare.

Claude e Codex supportano entrambe le opzioni. Possono essere abilitate anche
dopo un errore di quota, finché la stessa chat è ancora attiva; Stop, un nuovo
prompt o un cambio di modello annullano la ripresa del vecchio lavoro. Le
quote devono essere recenti e verificate, gli account alternativi isolati e
in abbonamento. Il login CLI e le chiavi API non vengono suggeriti come
alternative. Quota esaurita, autenticazione fallita e rate limit temporaneo
sono condizioni diverse: questi ultimi non attivano la rotazione.

La ripresa mantiene sessione, modello e modalità dei permessi, compreso Full
access. Per Codex viene copiata soltanto la cronologia del rollout nel profilo
di destinazione; credenziali, configurazione e database dell'account non
vengono copiati. Una cronologia di destinazione più recente o incompatibile
interrompe la rotazione e lascia disponibile la chat originale. La ripresa
usa strictResume, così un errore non genera silenziosamente una chat vuota.

Cursor, Grok, OpenCode, Gemini, Antigravity e gli altri agenti mostrano per ora
il requisito mancante. Le quote lette da altri store o provider non vengono
attribuite automaticamente alla sessione ACP attuale. Gli host precedenti
continuano a gestire Claude; Codex viene abilitato solo quando l'host espone
esplicitamente le nuove capacità.
