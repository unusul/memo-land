# App attività di gruppo — documento di progetto

Data: 2026-11-03. Stato: bozza da approvare (rev. dopo la scelta decentralizzata).

Legenda: quello che non è marcato l'ha deciso l'utente. **[scelta di Claude]** indica una decisione presa da Claude durante la conversazione, che l'utente può ancora correggere.

## 1. Intento

Un gestore di idee, cose da fare, ricorrenze e calendario pensato per **piccoli gruppi collaborativi** (massimo ~10 persone), usabile da PC e da telefono, costruito solo su servizi gratuiti e **decentralizzato**: chi scarica l'app ha la piena libertà di gestire tutto come crede. Non c'è un server centrale. Ogni gruppo ha il suo **motore**, che decide dove vivono i dati e chi esegue timer e notifiche, ed è configurato da chi apre il gruppo.

Il problema che risolve: nessuna app esistente fa insieme tutto quello che serve. In particolare:
- catturare un'idea al volo, anche offline, e riorganizzarla con calma dopo;
- far cambiare forma alla stessa cosa nel tempo: idea → cosa da fare con scadenza → ricorrente → evento, con sotto-attività;
- ricorrenze che ripartono dal completamento;
- sostituzioni su singole occorrenze senza cambiare l'assegnatario della serie;
- memo che aspettano un evento esterno ("quando la ops X è chiusa, fai Y");
- allegati e immagini incollate;
- Claude come utente nativo.

## 2. Obiettivi

1. Cattura velocissima di una bozza (testo, foto, file, incolla), anche **offline**, da telefono e da PC.
2. Un'unica entità "attività" che cambia forma aggiungendo o togliendo proprietà.
3. Collaborazione nel gruppo: assegnare, accettare o rifiutare, prendersi attività libere, coprire una singola occorrenza.
4. Agenda di gruppo visibile a tutti i membri.
5. Notifiche configurabili per categoria, per canale e per gruppo.
6. Accesso nativo per Claude, e un'interfaccia unica riusabile dalle integrazioni (bot Telegram).
7. Più account nella stessa app, con un'agenda unica.
8. **Motori intercambiabili**: l'app parla con i motori attraverso un'interfaccia unica. Aggiungere o cambiare motore non richiede di riscrivere l'app.

## 3. Cosa non si fa (in questa prima versione)

- **Motori oltre ai due della prima versione** (Google e centralizzato su Supabase). Altri forse più avanti.
- Un server centrale **obbligatorio**: il motore centralizzato è una scelta, tranne che per i gruppi di dominio.
- Integrazioni con sistemi esterni per sbloccare i memo in attesa: lo sblocco è manuale.
- Spostare dati da un account a un altro, o da un motore a un altro.
- Creare bozze dal bot Telegram: arriva dopo, ma l'architettura deve renderlo banale.
- Login con account Claude (non esiste come provider per app di terzi). WhatsApp come canale (a pagamento).
- Gruppi oltre ~10 persone, app negli store.

## 4. Anti-obiettivi: l'app è fallita, anche se funziona, se…

- **È lenta da aprire.** Dall'icona si deve arrivare subito all'agenda già autenticata, e alla cattura con un tocco.
- **Non accetta l'incolla di un'immagine.** Ctrl+V sul PC, incolla dagli appunti sul telefono, trascinamento.
- **Propone sempre le stesse azioni.** Proprietà e azioni si ordinano in base all'uso della persona.
- **È chiusa alle integrazioni.**
- **(dal vincolo sui motori)** Va riscritta per cambiare motore.

## 5. Vincoli

- Solo servizi gratuiti, dimensionati per ≤10 persone per gruppo.
- Un solo codice per PC e telefono.
- L'app è statica e chiunque può pubblicarne una copia. Il server centralizzato (Supabase), se c'è, appartiene a chi pubblica la copia.
- Configurare il motore di un gruppo richiede qualche minuto, una tantum, guidato dall'app: è accettato.

## 6. Architettura: app e motori

### App
- Client statico (PWA), pubblicato su GitHub Pages; chiunque può pubblicarne una copia.
- Contiene tutta la logica di interfaccia, la cache offline e l'unione dell'agenda fra gruppi e account.
- Parla con ogni gruppo attraverso l'**interfaccia motore**, una sola per tutti i motori: leggere e scrivere attività, allegati, membri, storico, preferenze di notifica, e ricevere i cambiamenti.

### Scelta del motore per gruppo
- Chi apre un gruppo (personale o su invito) sceglie il motore: **Google** (decentralizzato, nel proprio account) o **centralizzato** (il server Supabase della copia dell'app).
- I **gruppi di dominio** usano **sempre** il motore centralizzato.
- La prima versione costruisce **entrambi i motori**, anche per verificare che l'interfaccia unica regga davvero due implementazioni diverse.

### Motore centralizzato (Supabase)
- Server Supabase gratuito di chi pubblica la copia dell'app: Postgres con Row Level Security, Auth (Google, Microsoft/Entra ID, link magico), Storage per gli allegati, Edge Functions per l'interfaccia motore, i webhook e l'invio, pg_cron per i timer, Realtime per gli aggiornamenti.
- **Gruppi di dominio**: al login con un dominio non pubblico, il server mette l'account nel gruppo di quel dominio, creandolo se manca. Niente link da condividere, niente Drive condiviso.
- **Account Microsoft**: possono usare i gruppi su questo motore. È il motore naturale per chi non ha Google.
- Limiti noti: il piano free va in pausa dopo 7 giorni senza attività (serve un ping pianificato), 500 MB di database e 1 GB di storage.

### Motore Google (deciso dopo la prova del 2026-11-04)
Vive nell'account Google di chi apre il gruppo, in due pezzi:
- **Dati in Firestore**, nel progetto Firebase gratuito (piano Spark, senza carta) di chi apre il gruppo:
  - accesso con Firebase Auth (login Google) e **regole di sicurezza Firestore** che applicano membri e ruoli;
  - aggiornamenti in tempo reale e cache offline forniti da Firestore;
  - allegati: **[scelta di Claude]** da decidere nel piano. Firebase Storage gratuito richiede ora il piano a consumo, quindi l'alternativa è il Drive del proprietario tramite lo script.
- **Apps Script solo come server sempre acceso**, collegato allo stesso progetto: timer (scadenze, promemoria, rimandi, ricorrenze), invio Telegram ed email, indirizzo web per il webhook Telegram e il feed iCal. Legge e scrive Firestore tramite la sua API REST.
- **Configurazione**: procedimento guidato dall'app. Chi apre il gruppo crea il progetto Firebase, incolla la sua configurazione pubblica nell'app, pubblica le regole fornite dall'app e installa lo script.
- **Ripristino**: se il proprietario se ne va, il progetto Firebase resta suo. La cessione del gruppo richiede che aggiunga un altro membro come proprietario del progetto. **[scelta di Claude]** La procedura va descritta nel piano.

### Perché Firestore e non il foglio (misurato il 2026-11-04)
- Apps Script come backend dei dati costa circa 1,5 secondi per chiamata, più il tempo del foglio: circa 2 secondi per lettura o scrittura. Va contro il requisito di un'app veloce.
- Apps Script regge le chiamate in parallelo (LockService atomico, 20 su 20 riuscite) e risponde al browser senza preflight CORS. Resta quindi adatto per timer e notifiche.
- Dettagli: `.superpowers/spikes/google-engine/findings.md` (locale, non nel repository).

### Interfaccia programmabile unica
L'app, il connettore Claude e il futuro bot Telegram usano le stesse operazioni dell'interfaccia motore. Nessuna operazione è disponibile solo dalla UI.

## 7. Persone, account, gruppi

### Account e persona
- Un **account** è un account Google o Microsoft con cui fai il login nell'app. Un account Microsoft può usare solo gruppi sul motore centralizzato.
- Una **persona** può collegare più account (email1, email2): dall'app, con "Collega un altro account", fai il login con il secondo, e questa è la prova del possesso. Puoi scollegarlo in qualsiasi momento.
- Ogni bozza, attività, gruppo e allegato appartiene a **un solo account** e lì resta.
- I dati della persona (account collegati, Telegram, preferenze di notifica, statistiche d'uso delle azioni) stanno nel **motore del gruppo personale** del suo account principale. **[scelta di Claude]**
- **Agenda unica**: mescola gli elementi di tutti gli account collegati, con un colore per account.
- **[scelta di Claude]** Una bozza nasce nell'account predefinito, che si cambia con un tocco al momento della cattura. Dopo la creazione l'account non cambia più.

### Gruppi

| Tipo | Come nasce | Proprietario | Eliminabile | Ospiti | Uscita |
|---|---|---|---|---|---|
| **Personale** | uno per account, al primo accesso, sul motore scelto | l'account | no | no | — |
| **Di dominio** | automatico al login, per il dominio dell'email se non è pubblico; **sempre sul motore centralizzato** | **nessuno**, tutti membri alla pari | **no** | **no** | ognuno entra ed esce da solo; **nessuno toglie nessuno** |
| **Su invito** | creato da chiunque, sul motore scelto | chi lo crea | solo il proprietario | sì | il membro esce, o lo tolgono proprietario o membri **[scelta di Claude]** |

- Un account può avere gruppi su motori diversi. L'agenda unica li unisce comunque.
- **Domini pubblici** (gmail.com, outlook.com, …): nessun gruppo di dominio. **[scelta di Claude]** Si usa una lista mantenuta nell'app.
- Nei gruppi condivisi **tutto è di tutti**: ogni membro vede e modifica tutte le attività del gruppo.
- Quando un utente lascia un gruppo, quel gruppo sparisce dalla sua app e le attività assegnate a lui tornano **non assegnate**, con il motivo nello storico.
- **Rischio accettato**: chi lascia l'azienda vede il gruppo di dominio finché non esce da solo o finché l'account aziendale non viene chiuso.

### Ruoli nei gruppi su invito [scelta di Claude]
- **Proprietario**, uno solo: tutto, più eliminare il gruppo e cederne la proprietà.
- **Membro**: crea, modifica e assegna attività, invita.
- **Ospite**: vede tutto, commenta, accetta o rifiuta ciò che gli assegnano, chiude le proprie attività. Non invita e non modifica le attività degli altri.
- I ruoli li applica lo script (vedi §6, accesso ai dati): i membri non hanno accesso diretto ai file del gruppo.

## 8. L'attività

### Una sola entità, fatta di proprietà
Non ci sono tipi fissi. Un'attività ha un titolo, un testo, degli allegati, e un insieme di **proprietà facoltative**:

| Proprietà | Effetto |
|---|---|
| Gruppo | senza gruppo è una **bozza**, privata dell'account |
| Scadenza | cosa da fare entro una data |
| Data/ora (inizio–fine) | evento a calendario |
| Ripeti | ricorrente (vedi sotto) |
| Assegnatario | qualcuno deve farla |
| In attesa di… | memo bloccato da una condizione esterna, descritta a parole |
| Riprendi il… | rimandata: sparisce e ritorna a quella data |
| Padre | sotto-attività di un'altra |

Togliere una proprietà riporta l'attività alla forma precedente. Ogni cambio finisce nello storico.

### Bozze: la casella d'ingresso
- **La cattura funziona offline**: la bozza (testo e allegati) si salva sul dispositivo e si invia da sola quando torna la rete. **[scelta di Claude]** Offline l'agenda resta leggibile dall'ultima copia scaricata; le altre modifiche richiedono la rete.
- Le bozze stanno nel gruppo personale dell'account, visibili solo a lui.
- Smistare una bozza significa:
  - spostarla in un gruppo;
  - tenerla come idea personale;
  - archiviarla;
  - rimandarla ("riprendi tra un mese");
  - scomporla in più attività.
- **[scelta di Claude]** Le attività generate da una bozza restano collegate a quella d'origine. Se la bozza passa a un gruppo con un altro motore, viene copiata lì e il collegamento diventa un riferimento.

### Ricorrenze
- **A calendario fisso** (regola stile RFC 5545) oppure **dal completamento** (la prossima si calcola dalla data in cui l'ultima è stata fatta).
- **Sostituzione su un'occorrenza**: la serie resta di pippo; le occorrenze prese da pluto risultano sue, e le successive tornano a pippo da sole.

### Assegnazione
- Stati: non assegnata → proposta a X → accettata / rifiutata.
- Il rifiuto riporta l'attività **libera nel gruppo**, con rifiuto e motivo nello storico. **[scelta di Claude]** Il motivo è obbligatorio e chi aveva assegnato riceve una notifica.
- **[scelta di Claude]** Chiunque nel gruppo, tranne gli ospiti, può prendersi un'attività libera.

### Memo in attesa
- Un'attività con "In attesa di…" sta nella lista "In attesa". **Qualsiasi membro** può segnare la condizione come avverata: il memo diventa una cosa da fare attiva e scatta la notifica di sblocco.

### Allegati
- Immagini e file: foto, incolla, trascinamento. Salvati nel Drive del motore. **[scelta di Claude]** Le immagini vengono ridotte prima del caricamento.

### Storico
Creazione, cambi di forma, assegnazioni, rifiuti con motivo, sostituzioni, completamenti, sblocchi, uscite dal gruppo.

## 9. Schermate (dai mockup approvati)

- **Schermata iniziale = agenda.** Giorni con le attività di tutti i gruppi e account collegati (colore per account), sostituzioni ("copre pluto"), sezione "In attesa". Barra in basso: Agenda | Bozze (n) | Gruppi | Io.
- **Pulsante + sempre visibile** per la cattura. **[scelta di Claude]** Scorciatoia "Nuova bozza" premendo a lungo l'icona.
- **Dettaglio attività = "aggiungi proprietà"**: testo e allegati, poi le proprietà da aggiungere, **ordinate per uso della persona**.
- Il calendario di ogni membro è visibile al gruppo **solo per le attività di quel gruppo**. **[scelta di Claude]**

## 10. Claude e integrazioni

- **Claude [scelta di Claude]**:
  - **prima versione**: un connettore MCP **locale**, che gira sul PC con Claude Desktop o Claude Code e usa l'interfaccia motore con le credenziali Google della persona. Non serve nessun server;
  - **più avanti**: un connettore remoto per Claude da telefono o da claude.ai, esposto dal motore. Con Apps Script è il punto più fragile, quindi va verificato prima.
  - Operazioni pensate per un agente: crea bozza, aggiungi/togli proprietà, assegna, leggi agenda di un periodo, segna come avverata una condizione, smista bozza. Claude agisce sempre con i permessi della persona.
- **Telegram**: il bot invia le notifiche tramite lo script del motore. Più avanti riceverà messaggi per creare bozze, tramite l'indirizzo web dello script.
- **Calendari esterni [scelta di Claude]**: feed iCal in sola lettura servito dallo script.

## 11. Notifiche

- **Canali**: Telegram, email e push del browser. Teams è rimandato.
- **Chi spedisce**: lo script del motore di ciascun gruppo. Quando entri in un gruppo, gli comunichi dove vuoi ricevere le sue notifiche. Il predefinito viene dalle tue preferenze di persona, e lo puoi sostituire per gruppo (es. gruppo 1 → email1, gruppo 2 → email2).
- I messaggi indicano gruppo e account. Una persona presente nello stesso gruppo con due account riceve una notifica sola.
- **Email**: inviata dallo script con l'account del motore. Quote Google: circa 100 al giorno per account personali, 1500 per Workspace.
- **Push**: Apps Script non ha gli algoritmi per Web Push. Dai gruppi sul motore Google la prima versione notifica solo via Telegram, email e in app; le push restano sul motore centralizzato. **[scelta di Claude]** Si potranno aggiungere più avanti tramite Firebase Cloud Messaging.
- **Ogni categoria è attivabile per ogni canale.** Valori iniziali **[scelta di Claude]**:

| Categoria | Predefinito |
|---|---|
| Ti hanno assegnato un'attività | push + Telegram |
| La tua assegnazione è stata accettata/rifiutata | push |
| Scadenza in arrivo / scaduta | push + Telegram |
| Promemoria di un evento | push |
| Un memo in attesa si è sbloccato | push + Telegram |
| Un'attività rimandata è tornata | solo in app |
| Commenti e modifiche sulle tue attività | solo in app |
| Uscita di un membro dal gruppo | solo in app |
| Riepilogo giornaliero | email, spento |

## 12. Come si costruisce [scelta di Claude, l'utente ha delegato]

- **App**: PWA in React + TypeScript, pubblicata su GitHub Pages. Archivio offline nel browser (IndexedDB) con coda di invio per bozze e allegati.
- **Login**: Google Identity Services nel client, con i permessi Drive/Fogli minimi necessari.
- **Motore Google**: Firestore (SDK web di Firebase) per dati, permessi, tempo reale e offline; Apps Script per timer, invio e indirizzo web.
- **Motore centralizzato**: Supabase free (vedi §6). Login nel client con Supabase Auth per i gruppi su questo motore.
- **Telegram [scelta di Claude, dopo la revisione]**: **un bot per persona**, creato una tantum con BotFather durante la configurazione del gruppo personale. Il suo token e il webhook stanno nello script del motore personale. Gli script degli altri gruppi non conoscono il token: consegnano la notifica all'indirizzo dello script personale del destinatario, che la inoltra. Così il futuro "crea bozza da Telegram" finisce direttamente nelle bozze, che vivono nel gruppo personale. Un bot unico pubblico non è possibile senza server centrale: Telegram ammette un solo webhook per bot, e il token sarebbe leggibile da chiunque installi lo script.
- **Puntualità dei timer**: sul motore Google un promemoria può arrivare fino a ~10 minuti dopo (controllo periodico ogni 5–10 minuti). Sul motore centralizzato è puntuale al minuto.
- **Limiti in configurazione**: intervallo dei controlli, quote (esecuzione, email, chiamate esterne), dimensioni massime degli allegati e riduzione delle immagini, intervallo di aggiornamento fra membri sono **parametri di configurazione per motore**, mai valori scritti nel codice, così si adeguano se Google o Supabase cambiano i limiti.
- **Limiti noti**: quote di Apps Script (tempo di esecuzione giornaliero, chiamate esterne, email) e quote gratuite di Firestore (letture e scritture giornaliere, 1 GiB). Per ≤10 persone dovrebbero bastare, ma vanno misurate presto.

## 13. Lasciato a chi costruisce

- Schema dei dati nel motore Google (Fogli o JSON nel Drive), nomi, struttura dell'interfaccia motore e degli strumenti MCP.
- Gestione delle modifiche contemporanee di due membri.
- Algoritmo di ordinamento per uso.
- Rappresentazione di ricorrenze ed eccezioni.
- Aspetto grafico, layout da PC, libreria UI.
- Strategia di test e ordine di consegna.
