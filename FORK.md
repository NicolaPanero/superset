# Superset fork

Fork personale di [superset-sh/superset](https://github.com/superset-sh/superset).
Aggiunge una chat unica per gli agenti (ACP), il passaggio nativo di una
conversazione da un agente all'altro e la gestione locale degli account. Usa i
servizi ufficiali di Superset (login, sincronizzazione): tutte le aggiunte
girano sul Mac.

## Branch

| Branch | Contenuto |
|---|---|
| `main` | Copia esatta di `superset-sh/superset` `main`. Nessun commit del fork. |
| `fork/main` | Branch di integrazione: l'ultima release stabile di upstream più tutte le funzioni del fork. È quello da usare e da cui si compila. |
| `feature/*` | Storico dei singoli sviluppi, già fusi in `fork/main`. |

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

Su un Mac Apple Silicon, dall'ultima release del fork:

```bash
curl -fsSL https://raw.githubusercontent.com/NicolaPanero/superset/fork/main/scripts/fork/install.sh | sh
```

Installa `/Applications/Superset.app`, che contiene anche il convertitore
txcript (`Contents/Resources/resources/bin/txcript-transfer`), così app e
convertitore hanno sempre la stessa versione. Impostazioni e dati restano (stanno in `~/.superset` e
`~/Library/Application Support/Superset`), quindi aggiornare equivale a
reinstallare. L'app non è notarizzata: installata con il comando si apre
normalmente; scaricata dal browser va aperta una volta da Impostazioni di
Sistema → Privacy e sicurezza → "Apri comunque".

Il fork mantiene l'identità dell'app ufficiale, così login e dati funzionano
come con la build di upstream: **sostituisce** Superset ufficiale, non convive
con esso. L'aggiornamento automatico di upstream è spento, perché riporterebbe
l'app alla versione ufficiale. Al suo posto l'app controlla le release del fork
ogni 6 ore e propone "Installa e riavvia", che esegue lo script sopra.

Per compilare e installare dal checkout locale, sempre con il convertitore
incluso (serve anche Rust): `bun run fork:install`. L'app precedente resta in
`~/.superset/previous-app`.

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

## Automatismi su GitHub

| Workflow | Quando | Cosa fa |
|---|---|---|
| `fork-sync-upstream.yml` | ogni giorno alle 05:17 UTC, o a mano | Allinea `main` a upstream. Fonde in `fork/main` l'ultima release stabile di upstream (tag `desktop-v*`), esegue lint, `check:i18n` e il typecheck dei pacchetti modificati dal fork, e solo se passano fa il push. Tiene disattivati i workflow ereditati da upstream. |
| `fork-release.yml` | dopo ogni sincronizzazione, o a mano | Se `fork/main` ha un commit senza release, compila su un runner macOS il convertitore txcript e l'app che lo contiene (firma ad-hoc), e la pubblica come release `desktop-vX.Y.Z-fork.<commit>`. |

Se un'esecuzione fallisce GitHub manda una mail. Una sincronizzazione fallita
(conflitti o controlli rossi) non pubblica nulla: si risolve a mano con lo
script locale.

`main` e `fork/main` sono protetti: niente force-push né cancellazione, anche
per l'amministratore; i push normali restano permessi.

Il token automatico delle Actions non può pubblicare modifiche ai file in
`.github/workflows`, che upstream cambia spesso. Per quelle serve il secret
`FORK_SYNC_TOKEN`: un token fine-grained limitato a questo repository, con
permessi **Contents** e **Workflows** in scrittura. Va rinnovato alla
scadenza: quando scade, la sincronizzazione fallisce e arriva la mail.

### Sincronizzare a mano

```bash
git switch fork/main
bun run fork:sync
```

`fork:sync` fonde l'ultima release stabile di upstream nel branch corrente
(`bash scripts/fork/sync-upstream.sh --checks upstream/main` segue invece il
`main` di sviluppo). Risolve da solo i conflitti dei cataloghi di traduzione
(serve `msgcat`, pacchetto `gettext`) e poi esegue gli stessi controlli del
workflow. Codici di uscita: `2` conflitti nel codice, `3` controlli falliti
dopo la fusione (la fusione resta locale: `git reset --hard ORIG_HEAD` per
annullarla).

## Separazione da upstream

Per ridurre i conflitti, il codice del fork sta in file propri e i file di
upstream ricevono solo agganci brevi:

- tabelle del database in `packages/host-service/src/db/fork-schema.ts`, create
  da `ensureForkTables`: lo schema e il journal delle migrazioni restano quelli
  di upstream;
- procedure tRPC in `agents/fork-procedures.ts` e `usage/fork-procedures.ts`,
  incluse con una riga nei router di upstream;
- passaggio nativo e storico in `TerminalNativeHandoffMenu`,
  `AcpChatHandoffMenu` e `ForkHandoffMenus`; il menu di upstream resta
  invariato;
- voci delle impostazioni in `fork-settings-items.ts`, interruttore ACP in
  `AcpChatSetting`, rinomina account in `AccountRenameDialog`.
- avviso di aggiornamento in `apps/desktop/src/main/lib/fork-updates.ts`,
  avviato con una riga accanto all'aggiornamento automatico di upstream;
- automatismi in `.github/workflows/fork-*.yml` e `scripts/fork/`.

Nuove funzioni del fork vanno scritte allo stesso modo.

## Limiti noti

- Scelta dell'account solo per Claude e Codex.
- Il fallback automatico dell'account quando una quota finisce non c'è ancora.
- Le sessioni di Cursor IDE non sono supportate, solo Cursor CLI.
- "Apri figlia" nello storico riapre nel terminale anche una sessione nata in chat.
- La patch di txcript è legata a una revisione fissa di txcript.
- Login Microsoft, Jira e Bitbucket richiedono un backend proprio e non sono
  iniziati.
