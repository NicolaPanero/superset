# Superset — fork di Nicola

Fork personale di [superset-sh/superset](https://github.com/superset-sh/superset).
Aggiunge una chat unica per gli agenti (ACP), il passaggio nativo di una
conversazione da un agente all'altro e la gestione locale degli account. Usa i
servizi ufficiali di Superset (login, sincronizzazione): tutte le aggiunte
girano sul Mac.

## Branch

| Branch | Contenuto |
|---|---|
| `main` | Copia esatta di `superset-sh/superset` `main`. Nessun commit del fork. |
| `nicola` | Branch di integrazione: upstream più tutte le funzioni del fork. È quello da usare. |
| `feature/*` | Storico dei singoli sviluppi, già fusi in `nicola`. |

## Funzioni aggiunte

### Chat ACP come vista predefinita

Claude, Codex, Cursor Agent, Grok Build, OpenCode e Pi si aprono in una chat
grafica comune, collegata a ogni agente con l'Agent Client Protocol. Il
terminale resta a un clic: il selettore **CLI / CHAT** nell'intestazione del
pannello riprende la stessa sessione nell'altra vista. Se ACP non è
disponibile per un agente, si apre il terminale.

L'interruttore è in **Impostazioni → Experimental → ACP chat**. Cambiarlo non
modifica le sessioni già aperte.

### Passaggio tra agenti

- **Nativo (txcript)**: converte la sessione nel formato dell'agente di
  destinazione e la apre come sessione sua, con tutta la cronologia (messaggi,
  chiamate agli strumenti e risultati). Funziona tra Claude, Codex, Cursor CLI,
  Grok e OpenCode, in tutte le 20 direzioni.
  - Dal terminale: icona **Continue or fork session → Continue with another
    agent… → Native Handoff**.
  - Dalla chat: icona **Continue with another agent** (robot) nell'intestazione.
    Si sceglie agente, account e dove aprire la nuova chat.
- **Contesto**: il nuovo agente riceve come primo messaggio un riassunto della
  conversazione. Dal terminale: **Context Handoff**. Dalla chat: il selettore
  del modello di upstream permette di scegliere il modello di un altro agente.

La sessione di partenza non viene modificata. Permessi, server MCP, credenziali
e ragionamento interno del modello non vengono trasferiti.

### Storico dei passaggi

Ogni passaggio nativo registra sorgente e destinazione in un database locale.
Dal menu del terminale si vedono le conversazioni collegate, anche dopo un
riavvio, e si possono riaprire o continuare con un altro agente.

### Pannello Agents

Il pulsante **Agents** nella barra delle schede mostra, per i cinque agenti, le
sessioni aperte con stato, modello di avvio e account effettivo, e apre nuovi
agenti scegliendo modello e account. Un agente uscito senza segnalarlo (per
esempio al prompt "trust this folder" di Claude) non viene mostrato.

### Account locali (Claude e Codex)

**Impostazioni → Local agent accounts** mostra i login trovati sul Mac, con
quote, nomi personalizzati e aggiunta di nuovi account. L'account si sceglie
per ogni avvio, in chat o nel terminale, senza cambiare quello predefinito.
Gli altri agenti usano il login del loro CLI.

### Altre correzioni per gli agenti

- Cursor: la conversazione resta la stessa passando tra terminale e chat, e le
  domande e i piani di Cursor compaiono in chat come richieste da approvare.
- Grok e OpenCode in chat partono sul modello predefinito del loro CLI.

## Installare l'app

Requisiti: Bun (versione in `.bun-version`), Git e Rust (`cargo`) per compilare
il convertitore txcript.

```bash
bun install
bun run fork:install
```

Lo script compila il convertitore in `~/.superset/bin`, compila l'app con i
servizi di produzione e la installa in `/Applications/Superset.app`. L'app
precedente resta in `~/.superset/previous-app`. Chiudi Superset prima di
lanciarlo.

Le build del fork **non si aggiornano da sole**: il feed ufficiale le
sostituirebbe con la versione di upstream. Per aggiornare, sincronizza il
branch e rilancia `bun run fork:install`.

## Sviluppo

`bun run dev:desktop` avvia l'app con i servizi locali descritti in
`DEVELOPMENT.md`. Il database locale richiede PostgreSQL 18. Per usare dati di
sviluppo separati, imposta `SUPERSET_HOME_DIR` nel `.env` della radice.

Il convertitore usato da Superset è txcript con la patch
`tools/txcript-transfer/native-transfer.patch` (vedi il README in quella
cartella). Dopo una modifica alla patch:

```bash
bun scripts/build-txcript-transfer.ts
```

## Restare allineati con upstream

```bash
git switch nicola
bun run fork:sync
```

`fork:sync` fonde `superset-sh/superset` `main` nel branch corrente. Risolve da
solo i conflitti dei cataloghi di traduzione (serve `msgcat`, pacchetto
`gettext`) e poi esegue lint, `check:i18n` e il typecheck dei pacchetti
modificati dal fork. Codici di uscita: `2` conflitti nel codice, `3` controlli
falliti dopo la fusione (la fusione resta locale: `git reset --hard ORIG_HEAD`
per annullarla).

Il workflow `.github/workflows/fork-sync-upstream.yml` fa lo stesso ogni notte
su GitHub: aggiorna `main`, fonde upstream in `nicola` se i controlli passano,
altrimenti apre una issue con l'etichetta `upstream-sync`. Per attivarlo:
`nicola` deve essere il branch predefinito del fork, le Actions devono essere
abilitate e i workflow ereditati da upstream (deploy, release, CI) disattivati.

## Limiti noti

- Scelta dell'account solo per Claude e Codex.
- Il fallback automatico dell'account quando una quota finisce non c'è ancora.
- Le sessioni di Cursor IDE non sono supportate, solo Cursor CLI.
- "Apri figlia" nello storico riapre nel terminale anche una sessione nata in chat.
- La patch di txcript è legata a una revisione fissa di txcript.
- Login Microsoft, Jira e Bitbucket richiedono un backend proprio e non sono
  iniziati.
