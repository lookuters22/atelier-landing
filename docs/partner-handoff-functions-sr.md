# Partner Handoff: Sta je uradjeno (srpski, product verzija)

Ovaj dokument je napisan za partner handoff na jednostavnijem, vise product jeziku, ali bez izostavljanja bitnih tehnickih delova.

Ideja sistema je sledeca:

- studio ima svoja zvanicna pravila
- operator moze da napravi jednokratni izuzetak
- sistem moze da zapamti ljudski kontekst
- sistem moze da primeti obrazac i predlozi novo pravilo
- ali nista ne postaje zvanicna politika bez covekove potvrde

Takodje:

- Gmail import je napravljen tako da nista ne upisuje direktno u zive projekte
- sve prvo ide u staging / review zonu
- Inbox ostaje glavno mesto za mail rad, ne pravimo novi paralelni inbox

## 1. Glavna logika proizvoda

Postoje 4 nivoa istine u sistemu:

### `playbook_rules`

To su zvanicna pravila studija.

To je odgovor na pitanje:

> "Kako studio inace posluje?"

Primer:

- "Za destination vencanja naplacujemo travel fee."
- "Second shooter se naplacuje dodatno."

Ovo je bazna politika.

### `authorized_case_exceptions`

To su jednokratni izuzeci za konkretan slucaj.

To je odgovor na pitanje:

> "Da li za ovaj konkretan wedding pravimo izuzetak od pravila?"

Primer:

- "Za ovo jedno vencanje necemo naplatiti travel fee."

Vrlo vazno:

- ovo ne menja globalnu politiku
- ovo menja samo taj jedan slucaj

### `memories`

To su ljudske, relacione i kontekstualne informacije.

To je odgovor na pitanje:

> "Sta treba da znamo o ljudima i situaciji, a da nije pravilo?"

Primer:

- "Mladina sestra placa."
- "Majka ne sme da menja timeline bez odobrenja para."
- "Ovo je referral od Marije."

Vrlo vazno:

- memory ne menja cenu
- memory ne menja scope
- memory ne menja timeline politiku sam po sebi

### `playbook_rule_candidates`

To su predlozi za buduca pravila.

To je odgovor na pitanje:

> "Da li se ista odluka ponavlja toliko cesto da bi mozda trebalo da postane zvanicna politika?"

Primer:

- "Vec treci put ove nedelje rucno odobravamo isto odstupanje za Lake Como travel fee."

Sistem tada ne menja odmah pravila.

Umesto toga, pravi kandidata za review.

## 2. Learning loop: kako sistem "uci" iz operatorovih odluka

Ovo je jedan od najvaznijih delova koji smo uradili.

Poenta:

- Danilo ili operator ne mora da bira iz dropdown-a da li je nesto memory, exception ili policy
- moze da pise normalnim jezikom
- backend onda to pretvara u strukturirane zapise

Primer operator poruke:

> "Vazi, skinite travel fee samo ovaj put, ali second shooter ostaje doplata. Ona je Marijin referral."

Sistem iz toga moze da izvuce:

- exception: travel fee waived for this wedding only
- memory: bride is Maria referral
- eventualno candidate ako vidi da se isti obrazac stalno ponavlja

## 3. `src/types/operatorResolutionWriteback.types.ts`

Ovo je glavni ugovor za learning loop.

Na product jeziku:

- ovo je "dozvoljeni format" u koji operatorova slobodna poruka sme da bude prevedena

On definise:

- koje vrste artefakata postoje
- sta svaka vrsta sme da sadrzi
- kako izgleda receipt posle uspesnog upisa

### Zasto je bitno

Bez ovoga bi AI vracao sta god hoce.

Sa ovim:

- backend zna tacno sta ocekuje
- kasnije UI zna tacno sta je sacuvano
- receipt moze da se koristi za undo/edit kasnije

## 4. `supabase/functions/_shared/learning/operatorResolutionWritebackZod.ts`

Ovo je najvaznija sigurnosna kapija pre upisa.

Na product jeziku:

- ovo je "carina" kroz koju AI output mora da prodje pre nego sto dobije pravo da udje u bazu

Sta proverava:

- da li je shape dobar
- da li su enum vrednosti validne
- da li su UUID-jevi validni
- da li je confidence normalan
- da li je observation count smislen
- da li ima duplih exception-a
- da li memory samo ponavlja isti override koji vec postoji kao exception

### Primer

Ako AI vrati:

- `decision_mode = "maybe"`

ili napravi:

- exception: "travel_fee waived"
- memory: "travel_fee was waived"

to se ovde zaustavlja i nista se ne upisuje.

## 5. `supabase/functions/_shared/learning/classifyOperatorResolutionLearningLoop.ts`

Ovo je funkcija koja operatorovu slobodnu poruku daje modelu i trazi strukturiran JSON.

Na product jeziku:

- ovo je "prevodilac" iz operatorovog ljudskog jezika u sistemski jezik

U promptu smo naucili model:

- sta je exception
- sta je memory
- sta je candidate
- da ne sme da duplira istu ideju u dva artefakta

### Primer

Ako operator napise:

> "Odobri popust samo ovaj put."

to treba da zavrsi kao exception.

Ako operator napise:

> "Ovo su prijatelji od Marije."

to treba da zavrsi kao memory.

Ako sistem vidi isti pattern stalno:

to moze da postane playbook candidate.

## 6. `supabase/functions/_shared/learning/executeLearningLoopEscalationResolution.ts`

Ovo je glavni backend "orchestrator" za learning loop.

Na product jeziku:

- ovo je glavna operativna ruta koja od jedne operator odluke pravi siguran i kompletan backend rezultat

Sta radi redom:

1. ucita escalation
2. proveri da pripada pravom photographer-u
3. pripremi correlation podatke
4. podrzi idempotent retry ako je isto vec reseno
5. po potrebi odredi learning outcome
6. pozove freeform classifier
7. validira output kroz Zod
8. dopuni exception podatke ako fale
9. pripremi memory artifact key-eve
10. pozove jedan atomski SQL RPC
11. vrati typed receipt

### Zasto je bitno

Ovo je mesto koje spaja:

- AI klasifikaciju
- sigurnosnu validaciju
- atomski upis
- receipt za product/UI buducnost

### Realni primer

Ako WhatsApp retry-je isti resolution, ova funkcija ne pravi drugi exception i drugi memory, vec vraca isti zavrseni rezultat.

## 7. `complete_learning_loop_operator_resolution(...)`

Fajl:

- [20260423120100_complete_learning_loop_operator_resolution.sql](/C:/Users/Despot/Desktop/wedding/supabase/migrations/20260423120100_complete_learning_loop_operator_resolution.sql)

Na product jeziku:

- ovo je "jedan siguran zavrsni checkout" za operatorovu odluku

Sta radi:

- zakljuca escalation red
- proveri da svi kljucevi pripadaju istom photographer-u / wedding-u / thread-u
- upise sve learning artefakte
- zatvori escalation
- vrati receipt

### Zasto je bitno

Bez ovoga bi mogli da imamo:

- sacuvan memory
- nesacuvan exception
- escalation zatvoren

To bi napravilo haos.

Sa ovim je pravilo:

- ili sve uspe
- ili nista ne uspe

## 8. Memory provenance

Fajl:

- [20260423120000_memories_learning_loop_provenance.sql](/C:/Users/Despot/Desktop/wedding/supabase/migrations/20260423120000_memories_learning_loop_provenance.sql)

Na product jeziku:

- memory sada zna odakle je dosao

To znaci da mozemo da pratimo:

- iz kog escalation-a je nastao
- iz kog learning-loop artifact-a je nastao

### Zasto je bitno

Kasnije mozemo da odgovorimo:

- zasto ovaj memory postoji
- ko ga je indirektno proizveo
- da li je isti memory vec ranije napravljen

## 9. `resolveOperatorEscalationResolution.ts`

Fajl:

- [resolveOperatorEscalationResolution.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/learning/resolveOperatorEscalationResolution.ts)

Ovo je zajednicki handoff za dashboard i WhatsApp.

Na product jeziku:

- ovo je "jedna centralna raskrsnica" kroz koju prolazi svako operator razresenje eskalacije

Sta radi:

- ucita escalation
- proveri ownership
- podrzi learning-loop retry
- ako je escalation otvoren, klasifikuje learning outcome
- proveri da li ovo mora u strict document path
- ako mora, salje na legacy document flow
- ako ne mora, salje na learning loop
- posle uspesnog razresenja cisti operator hold

### Zasto je bitno

Pre ovoga su dashboard i WhatsApp mogli da pocnu da se razilaze.

Sada:

- isti backend princip vazi za oba entrypoint-a

## 10. `completeEscalationResolutionAtomic.ts`

Ovo je stariji strict path koji je ostao za document/compliance slucajeve.

Na product jeziku:

- ovo je i dalje potreban "poseban sef" za osetljive audit/document slucajeve

### Zasto nije zamenjen learning loop-om

Zato sto document/compliance flow ima posebne zahteve i nije isto sto i:

- exception
- memory
- candidate

### Realni primer

Ako neko trazi ili salje osetljiv identifikacioni dokument, to ne ide kroz learning-loop policy logic, nego kroz strict audit-safe putanju.

## 11. `playbook_rule_candidates`

Fajl:

- [20260421120000_playbook_rule_candidates_learning_loop.sql](/C:/Users/Despot/Desktop/wedding/supabase/migrations/20260421120000_playbook_rule_candidates_learning_loop.sql)

Na product jeziku:

- ovo je parking za buduca pravila

Vrlo vazno:

- kandidat nije live pravilo
- kandidat ne menja automatizaciju
- kandidat je samo predlog koji ceka review

### Realni primer

Ako operator vec peti put rucno odobri isto odstupanje, sistem moze reci:

> "Mozda ovo vise nije izuzetak, mozda treba da postane pravilo."

Ali i dalje ne menja nista sam.

## 12. Candidate review i promotion

Fajlovi:

- [20260424120000_review_playbook_rule_candidate.sql](/C:/Users/Despot/Desktop/wedding/supabase/migrations/20260424120000_review_playbook_rule_candidate.sql)
- [20260425120000_review_playbook_rule_candidate_approve_sets_is_active.sql](/C:/Users/Despot/Desktop/wedding/supabase/migrations/20260425120000_review_playbook_rule_candidate_approve_sets_is_active.sql)

Glavna SQL funkcija:

- `review_playbook_rule_candidate(...)`

Na product jeziku:

- ovo je "ljudski approval gate" izmedju AI predloga i zive studijske politike

Podrzane akcije:

- `approve`
- `reject`
- `supersede`

### `approve`

Kada se kandidat odobri:

- nalazi se ili pravi odgovarajuci live `playbook_rule`
- taj rule se aktivira
- kandidat se oznacava kao `approved`
- cuva se veza `promoted_to_playbook_rule_id`
- cuva se ko je odobrio i kada

### `reject`

Kada se kandidat odbije:

- ostaje inertan
- ne pravi se live rule

### `supersede`

Kada kandidat treba da bude zamenjen boljim kandidatom:

- oznaci se kao superseded
- moze da pokazuje na noviji kandidat

### Realni primer

AI predlozi:

> "Waive travel surcharge for Lake Como weddings."

Danilo hoce da odobri precizniju verziju:

> "Waive only ferry surcharge for Lake Como weddings."

Tada:

- originalni candidate ostaje kao AI audit trag
- live rule koristi human-approved varijantu

## 13. `reviewPlaybookRuleCandidateRpc.ts`

Fajl:

- [reviewPlaybookRuleCandidateRpc.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/learning/reviewPlaybookRuleCandidateRpc.ts)

Na product jeziku:

- ovo je prevodilac iz UI request-a u SQL RPC argumente

Sta radi:

- proveri da li je body validan
- proveri da li su UUID-jevi validni
- proveri da li je override decision mode dozvoljen
- spremi ciste argumente za SQL

### Zasto je bitno

UI greska ne sme da postane database crash.

## 14. `mapPlaybookRuleCandidateReviewReceipt.ts`

Fajl:

- [mapPlaybookRuleCandidateReviewReceipt.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/learning/mapPlaybookRuleCandidateReviewReceipt.ts)

Na product jeziku:

- ovo pravi uredan, tipiziran receipt posle review akcije

To znaci da frontend kasnije moze lepo da prikaze:

- kandidat odobren
- koje pravilo je nastalo
- da li je bilo override-a

## 15. Gmail foundation: sta je uradjeno

Ovo je osnova za historical import iz Gmail-a.

Najvaznije pravilo:

- nista iz Gmail-a ne ide direktno u live weddings/threads
- sve ide prvo u staging

## 16. `connected_accounts`

Tabela napravljena u:

- [20260426120000_gmail_import_connected_accounts_import_candidates.sql](/C:/Users/Despot/Desktop/wedding/supabase/migrations/20260426120000_gmail_import_connected_accounts_import_candidates.sql)

Na product jeziku:

- ovo je tabela koja cuva da je Gmail povezan

Sadrzi:

- koji photographer je povezao Gmail
- koji je Google account
- email
- display name
- sync status
- token expiry
- eventualni sync error

### Bitno

Ovde nema secret token-a.

## 17. `connected_account_oauth_tokens`

Ista migracija kao gore.

Na product jeziku:

- ovo je sef za tajne tokene

Ovde cuvamo:

- access token
- refresh token

Poenta:

- app moze da zna da je Gmail povezan
- ali klijent ne vidi tajne tokene

## 18. `import_candidates`

Ista migracija.

Na product jeziku:

- ovo je staging karantin za Gmail thread-ove

Sta ovde zavrsava:

- Gmail thread id
- snippet
- subject
- broj poruka
- label info
- status

### Najbitnije pravilo

- ovo jos nisu pravi studio thread-ovi
- ovo jos nisu wedding projekti
- ovo su kandidati za kasniji review

### Realni primer

Ako korisnik sync-uje label:

> "Weddings 2026"

thread-ovi zavrsavaju ovde, a ne odmah u zive projekte.

## 19. `auth-google-init/index.ts`

Fajl:

- [auth-google-init/index.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/auth-google-init/index.ts)

Na product jeziku:

- ovo je siguran pocetak Gmail connect flow-a iz Settings stranice

Sta radi:

- proveri da je korisnik prijavljen
- cita OAuth config
- potpise secure state
- vrati JSON `{ url }`

Frontend onda radi redirect na Google.

### Zasto je ovako uradjeno

Zato sto SPA mora da posalje JWT bezbedno.

Ne radimo glupi `<a href>` flow.

## 20. `auth-google-callback/index.ts`

Fajl:

- [auth-google-callback/index.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/auth-google-callback/index.ts)

Na product jeziku:

- ovo je mesto gde se Gmail konekcija stvarno zavrsava

Sta radi:

- proveri state
- razmeni code za tokene
- procita Google identity
- upise ili osvezi `connected_accounts`
- upise ili osvezi tokene
- vrati korisnika nazad u Settings

### Bitna dorada koju smo uradili

Ako Google pri reconnect-u ne posalje novi refresh token:

- ne brisemo stari

To je bilo jako bitno da se sync ne bi pokvario kasnije.

## 21. `googleOAuthState.ts`

Fajl:

- [googleOAuthState.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/gmail/googleOAuthState.ts)

Na product jeziku:

- ovo obezbedjuje da Gmail callback pripada pravom photographer-u koji je i zapoceo connect

## 22. `googleOAuthToken.ts`

Fajl:

- [googleOAuthToken.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/gmail/googleOAuthToken.ts)

Na product jeziku:

- ovo je modul za OAuth tokene: exchange, refresh, i merge logika

Bitna helper funkcija:

- `mergeGoogleReconnectRefreshToken(...)`

Njena poenta:

- ako Google ne posalje novi refresh token, zadrzi stari

## 23. `ensureGoogleAccess.ts`

Fajl:

- [ensureGoogleAccess.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/gmail/ensureGoogleAccess.ts)

Glavna funkcija:

- `ensureValidGoogleAccessToken(...)`

Na product jeziku:

- ovo je "daj mi ispravan Gmail token pre nego sto radimo sync"

Sta radi:

- proveri da li access token jos vazi
- osvezi ga ako treba
- cuva novi expiry
- cuva refresh token ako treba
- stavi account u `error` ako refresh ne uspe

### Realni primer

Sync worker ne mora da zna nista o OAuth detaljima.

Samo kaze:

> "Treba mi validan token za ovaj account."

## 24. `gmailThreads.ts`

Fajl:

- [gmailThreads.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/gmail/gmailThreads.ts)

Na product jeziku:

- ovo je tanki sloj koji prica sa Gmail API-jem

Koristi:

- `labelIds`

ne koristi:

- krhke search query-je tipa `q: label:...`

### Zasto je bitno

Ovo je stabilniji "fast lane" za korisnike koji su vec dobro organizovali svoj Gmail preko label-a.

## 25. `syncGmailLabelImportCandidates.ts`

Fajl:

- [syncGmailLabelImportCandidates.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/syncGmailLabelImportCandidates.ts)

Na product jeziku:

- ovo je background worker koji stvarno povlaci Gmail thread-ove i stavlja ih u staging

Sta radi:

- ucita connected account i tokene
- stavi status na `syncing`
- obezbedi validan token
- povuce thread-ove za izabrani Gmail label
- paginira
- capuje na max `200`
- za svaki thread uzme metadata
- upise ili osvezi `import_candidates`
- na kraju vrati account u `connected`
- ili stavi `error` ako nesto pukne

### Dedupe logika

Jedan Gmail thread po account-u = jedan staging red.

To znaci:

- isti thread nece praviti duplikate samo zato sto je bio u vise label-a

## 26. `gmailSyncFailure.ts`

Fajl:

- [gmailSyncFailure.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/gmail/gmailSyncFailure.ts)

Na product jeziku:

- ovo pretvara velike i ruzne greske u kratak, upotrebljiv sync error summary

### Zasto je bitno

Ne zelimo:

- ogroman stack trace u bazi

zelimo:

- kratko objasnjenje sta je puklo

## 27. `gmail-enqueue-label-sync/index.ts`

Fajl:

- [gmail-enqueue-label-sync/index.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/gmail-enqueue-label-sync/index.ts)

Na product jeziku:

- ovo je tanka API ruta koja zakazuje Gmail label sync job

Sta radi:

- proveri JWT
- proveri connected account ownership
- validira ID
- posalje Inngest event

### Realni primer

Kasniji Settings UI moze da kaze:

> "Sync label Active Weddings"

i ova ruta ce zakazati pravi posao u pozadini.

## 28. Dashboard i WhatsApp sada koriste isti backend princip

### `dashboard-resolve-escalation/index.ts`

Na product jeziku:

- dashboard vise nije poseban backend svet

On sada koristi isti shared resolver.

### `operatorOrchestrator.ts`

Na product jeziku:

- i WhatsApp operator putanja koristi isti shared resolver

### Zasto je bitno

To znaci:

- manje drift-a
- manje duplirane logike
- ista pravila ponasanja bez obzira odakle operator resava problem

## 29. `deriveEffectivePlaybook.ts`

Fajl:

- [deriveEffectivePlaybook.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/policy/deriveEffectivePlaybook.ts)

Nismo ga redizajnirali u ovom delu, ali je bitan za razumevanje.

Na product jeziku:

- ovo je motor koji od live pravila pravi aktivan policy baseline

Vrlo bitno:

- `playbook_rule_candidates` ne ulaze ovde
- samo live `playbook_rules` ulaze ovde
- inactive rules se ignorisu

### Posledica

Kandidat ne radi nista.

Tek kada ga covek odobri i pretvori u live pravilo, on ulazi u pravi policy engine.

## 30. Jedan kompletan primer: pricing + context

Klijent pita:

> "Mozete li da skinete travel fee?"

Danilo odgovori:

> "Moze ovaj put, posto je referral od Marije."

Sta sistem radi:

1. escalation ide kroz shared resolver
2. proceni da nije document/compliance slucaj
3. ide u learning loop
4. classifier predlozi:
   - exception za travel fee
   - memory za referral context
5. Zod proveri da nema gluposti i preklapanja
6. atomic RPC upise oba artefakta i zatvori escalation
7. ako se isti pattern ponavlja, moze nastati candidate za buduce pravilo
8. covek kasnije moze odobriti taj candidate i pretvoriti ga u live rule

## 31. Jedan kompletan primer: Gmail import

Photographer ode u Settings i klikne:

> "Connect Gmail"

Sta se desava:

1. `auth-google-init` vrati Google OAuth URL
2. korisnik odobri Gmail read-only pristup
3. `auth-google-callback` sacuva account i tokene
4. kasnije korisnik izabere Gmail label, na primer:
   - `Weddings 2026`
5. `gmail-enqueue-label-sync` zakaze background job
6. `syncGmailLabelImportCandidates` povuce thread-ove
7. thread-ovi zavrse u `import_candidates`
8. jos nista nije postalo live wedding ili live inbox thread
9. kasnije ce postojati review flow za approve/dismiss/merge

## 32. Sta je vec gotovo

- learning-loop classifier
- strict validation pre write-a
- atomic writeback
- retry-safe / idempotent behavior
- shared resolver za dashboard i WhatsApp
- centralizovano ciscenje operator hold-a
- backend za candidate review / promotion
- Gmail OAuth connect backend
- Gmail label fast-lane import u staging

## 33. Sta jos nije uradjeno

- UI za review `import_candidates`
- UI za approve/dismiss Gmail staging redova
- materialization staging kandidata u canonical `threads` i `weddings`
- UI za candidate review listu
- bulk digest za review kandidata
- edit-before-approve UI za candidate-e

## 34. Najkraca moguca product istina

Ono sto sada postoji je:

- sistem zna sta je studio pravilo
- zna sta je jednokratni izuzetak
- zna sta je ljudski kontekst
- zna da primeti ponavljajuci pattern
- ali ne menja politiku bez coveka
- zna da poveze Gmail
- zna da historical mail uveze u staging bez rizika da odmah zagadi live podatke

