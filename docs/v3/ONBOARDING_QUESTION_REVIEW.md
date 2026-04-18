# Onboarding Question Review

This document reviews the current onboarding flow in plain language.

The goal is to answer three things for every part of onboarding:

1. What is this question trying to do?
2. What do the answers really mean in practice?
3. Does this actually make sense in the product, or should it change?

This is written from a product/operator point of view, not a developer point of view.

## Overall Opinion

The onboarding flow has a strong idea behind it: define how Ana should present the studio, what the studio offers, how much Ana is allowed to do, and what language she should use.

That said, several questions are currently harder to understand than they need to be. The main pattern is:

- the underlying product idea often makes sense
- the wording is often too abstract, internal, or operational
- some questions are trying to do too much in one field
- a few questions overlap or feel redundant

The biggest issues are:

- `manager` versus `photographer` naming is confusing
- geography is too vague, especially for large metro areas
- some authority options are understandable only after explanation
- some labels sound internal rather than client-facing
- Vault is conceptually valid, but the name and framing are abstract

## Step 1: Identity

This step is trying to establish who the studio is and who Ana is speaking on behalf of.

### 1. What is your studio called?

What it means:
- the studio name Ana should use
- the business/brand name clients should see

What the answer does:
- gives Ana the main business identity

Does it make sense?
- Yes

Recommendation:
- Keep as is

### 2. Which currency do you usually quote in?

What it means:
- what money Ana should reference in pricing and quoting

What the answer does:
- keeps pricing language consistent

Does it make sense?
- Yes

Recommendation:
- Keep as is

### 3. What timezone should Ana use for scheduling and reminders?

What it means:
- which timezone should be treated as the studio’s default

What the answer does:
- affects calendar/scheduling language

Does it make sense?
- Yes

Recommendation:
- Keep as is

### 4. Who should Ana name as the manager when it matters?

What it currently seems to mean:
- if Ana ever needs to mention a real human, whose name should she use?

What users are likely to think it means:
- what Ana’s own name should be
- or who the photographer is

Why it is confusing:
- it sounds like Ana has a manager title that needs to be named
- it becomes redundant if photographer names are asked next
- many studios do not have a separate manager

What it likely does in practice:
- gives Ana one human name to reference in moments where mentioning a real person feels more natural

Examples:
- “I’ll check this with Miljana.”
- “Rajko will review this personally.”

Does it make sense?
- The product need sort of makes sense
- The wording does not

Recommendation:
- Reword strongly
- Best version: `If Ana ever needs to mention a real person, who should that be?`
- Consider allowing:
  - photographer
  - studio manager
  - no one / keep it as Ana only

Secondary recommendation:
- If the studio has no separate manager, this should usually just be the photographer

### 5. Who are the photographers on the team?

What it means:
- who the actual photographers are

What the answer does:
- gives Ana the names of the photography team
- helps with natural references and signatures

Examples:
- `Rajko`
- `Rajko and Ana`
- `Rajko, Ana, and Luka`

Does it make sense?
- Yes

Recommendation:
- Keep
- But make it clearer that this is the actual photography team, not the admin/manager identity

### 6. Operator WhatsApp in E.164 for urgent escalations (optional)

What it means:
- the phone number to use if something urgent should be escalated by WhatsApp

What the answer does:
- gives the system a real urgent contact path

Why it feels awkward:
- the wording is technical
- most operators will not know what `E.164` means

Does it make sense?
- Yes, operationally
- No, wording-wise

Recommendation:
- Reword to something normal like:
  - `Urgent WhatsApp number (optional)`
  - `Which WhatsApp number should urgent escalations go to?`

## Identity Step Summary

Keep:
- studio name
- currency
- timezone
- photographer names

Change:
- manager question
- WhatsApp escalation wording

Main concern:
- `manager` and `photographer` currently feel overlapping and confusing

---

## Step 2: Scope

This step is trying to define what the studio offers, where it wants to work, how it handles travel, and what Ana should do when a lead falls outside scope.

### 1. What should pop up first when someone thinks about your studio?

This is the services question.

Possible answers:
- Weddings
- Family
- Maternity
- Brand
- Video

What it means:
- which service categories the studio actively offers

What it does:
- helps Ana know what is in scope and out of scope

Does it make sense?
- Yes

Recommendation:
- Keep
- But the title could be more direct, because this one reads more like a brand exercise than a business-scope question
- Clearer version:
  - `Which services do you actually offer?`

### 2. Where does the studio actually want to be in play?

This is the geography stance.

Possible answers:
- Local only
- Regional
- Domestic
- Europe
- Worldwide

What it means:
- where the studio is willing to operate

What the choices seem to mean:
- `Local only` = close to home / home market only
- `Regional` = wider nearby area
- `Domestic` = whole country
- `Europe` = across Europe
- `Worldwide` = international

Main problem:
- `Local only` is too vague
- in places like Los Angeles or New York, “local” can mean very different things
- the choice tries to do too much without a follow-up

Does it make sense?
- Broadly yes
- Current wording no

Recommendation:
- Rename `Local only` to `Home market only`
- Keep the broad stance question
- Add a follow-up text field when relevant:
  - `What area counts as your home market?`

Example answers:
- `New York City only`
- `Greater Los Angeles`
- `South Florida`
- `London and nearby counties`

This is one of the clearest candidates for a product change.

### 3. How should Ana understand your travel posture?

Possible answers:
- Travels freely
- Selective travel
- No travel
- Destination minimums

What it means:
- how open the studio is to travel work

What the choices mean:
- `Travels freely` = generally happy to travel
- `Selective travel` = open, but only in the right situations
- `No travel` = stays in normal market only
- `Destination minimums` = travel work is possible, but only under certain minimum conditions

Does it make sense?
- Yes

Recommendation:
- Keep
- Might benefit from helper text or examples, especially for `Destination minimums`

### 4. What do clients walk away with?

This is the deliverables question.

Possible answers:
- Digital gallery
- Album
- RAW files
- Video
- Prints

What it means:
- what the studio actually provides at the end

What it does:
- stops Ana from offering products the studio does not provide

Does it make sense?
- Yes

Recommendation:
- Keep

### 5. Which languages do you work in?

Possible answers currently include:
- EN
- DE
- FR
- IT
- ES
- SR
- HR
- PT
- NL

What it means:
- which languages Ana can safely use with leads/clients

Does it make sense?
- Yes

Recommendation:
- Keep
- Consider whether the language list is too limited long term, but the question itself makes sense

### 6. When a lead asks for a service you do not offer

Possible answers:
- Decline politely
- Route to you
- Escalate

What they mean in plain language:
- `Decline politely` = Ana says no herself, politely
- `Route to you` = this should come directly to you
- `Escalate` = this needs human handling, but in a less specifically-personal way

Main issue:
- `Route to you` and `Escalate` are too close in meaning unless already explained

Does it make sense?
- The policy concept makes sense
- The distinction is too fuzzy in current wording

Recommendation:
- Keep the idea
- Reword the options

Better version:
- `Ana declines it politely`
- `Ana flags it for human review`
- `Send it directly to me`

### 7. When a lead is outside your geography

Possible answers:
- Decline politely
- Route to you
- Escalate

Same issue as above:
- the logic makes sense
- the wording is not clear enough

Recommendation:
- Same as above

## Scope Step Summary

Keep:
- services
- travel
- deliverables
- languages
- out-of-scope handling idea

Change:
- geography wording
- add local-area follow-up
- clarify `Route to you` versus `Escalate`
- make service question more direct

---

## Step 3: Voice

This step is trying to define how Ana should sound and what reusable language rules she should follow.

### 1. Which emotional voice should Ana naturally fall into?

Possible answers:
- Warm editorial
- Direct & minimal
- Luxury formal
- Friendly casual

What it means:
- which communication style Ana should default to

What the options mean:
- `Warm editorial` = polished, soft, emotionally intelligent
- `Direct & minimal` = concise, efficient, low-fluff
- `Luxury formal` = elevated, refined, more ceremonial
- `Friendly casual` = relaxed, approachable, conversational

Does it make sense?
- Yes

Recommendation:
- Keep

### 2. What phrases and standard lines should shape the final wording?

This is really a reusable language-controls screen, not one single question.

Sub-fields:
- Banned phrases
- Signature / closing
- Standard booking line
- Standard scope line

#### Banned phrases

What it means:
- words or phrases Ana should avoid

Example:
- `cheap`
- `guarantee`
- `last minute`

Makes sense?
- Yes

#### Signature / closing

What it means:
- the normal sign-off Ana should use

Example:
- `Warmly, Elena`

Makes sense?
- Yes

#### Standard booking line

What it means:
- a reusable sentence about response timing or booking process

Example:
- `We typically reply within one business day.`

Makes sense?
- Yes

#### Standard scope line

What it means:
- a reusable sentence describing service range or coverage

Example:
- `We photograph weddings across Europe.`

Makes sense?
- Yes

Main issue with this page:
- the wording is too abstract
- users may think they are meant to write full scripts

Recommendation:
- Keep the structure
- Reword the main heading to something simpler, such as:
  - `What reusable lines should Ana follow?`
- Add clearer helper text:
  - `Keep this short. These are reusable house lines, not full scripts.`

## Voice Step Summary

This step mostly makes sense.

Main changes needed:
- mostly wording clarity, not structural change

---

## Step 4: Authority

This step is trying to decide how much Ana is allowed to do on her own.

This is one of the most important steps in the whole onboarding, but also one of the most confusing.

The four choices mean:

- `Ana handles it` = Ana can do it directly
- `Ana drafts it` = Ana prepares a reply/action, but a human approves
- `Ana asks me` = Ana pauses and asks before doing anything
- `Never do this` = Ana is not allowed to do that action at all

That core model is good.

The confusing part is the wording of several scenarios.

### Scheduling

#### Schedule a discovery call

What it means:
- when a lead wants to book a discovery call, what is Ana allowed to do?

Does it make sense?
- Yes

Recommendation:
- Keep

#### Move a scheduled discovery call

What it means:
- when someone wants to reschedule, what is Ana allowed to do?

Does it make sense?
- Yes

Recommendation:
- Keep

### Pricing & money

#### Offer or change a quote / discount

What it means:
- can Ana discuss or modify pricing offers?

Does it make sense?
- Yes

Recommendation:
- Keep

#### Send an invoice

What it means:
- can Ana send invoices without stopping for approval?

Does it make sense?
- Yes

Recommendation:
- Keep

#### Payment plan exceptions

What it means:
- can Ana deal with requests outside the normal payment plan?

Does it make sense?
- Yes

Recommendation:
- Keep, maybe slightly plainer wording

#### Late payment extensions

What it means:
- can Ana offer extra time for overdue or due-soon payments?

Does it make sense?
- Yes

Recommendation:
- Keep

### Deliverables & files

#### Release RAW files

What it means:
- can Ana approve/share RAW file delivery?

Does it make sense?
- Yes

Recommendation:
- Keep

#### Publication / gallery permission

What it means:
- can Ana decide about image use, gallery access, or publishing permissions?

Does it make sense?
- Yes

Recommendation:
- Keep

### Coordination

#### Planner or vendor coordination

What it means:
- can Ana handle communication with planners, venues, florists, makeup artists, etc.?

Does it make sense?
- Yes

Recommendation:
- Keep

#### Vendor credit requests

What it means:
- can Ana handle requests about tagging, naming, or crediting vendors?

Does it make sense?
- Yes

Recommendation:
- Keep

#### Respond to art / creative feedback

What it means:
- can Ana respond when a client comments on editing style, image choices, aesthetic direction, and similar creative concerns?

Does it make sense?
- Yes

Recommendation:
- Keep

#### Operator notification routing decisions

What it seems to mean:
- can Ana decide when something should be sent to the human operator for attention?

Why it is a problem:
- this is very internal language
- most users will not know what an “operator notification routing decision” is

Does it make sense?
- The product idea may make sense
- The wording does not

Recommendation:
- Rename completely

Better versions:
- `Decide when to bring me in`
- `Decide when an issue needs human attention`
- `Choose when to escalate to me`

This is one of the clearest reword candidates in the whole flow.

### Sensitive communication

#### Share private client data

What it means:
- can Ana share sensitive client information?

Does it make sense?
- Yes

Recommendation:
- Keep

#### Proactive follow-up outreach

What it means:
- can Ana reach out first, without being directly prompted by a client?

Does it make sense?
- Yes

Recommendation:
- Keep

### Escalation page

This page asks two things:

1. Which kinds of issues should interrupt you immediately?
2. For everything else, do you want instant alerts or batched review?

#### Immediate notification topics

Options:
- PR / publication disputes
- Banking & payment exceptions
- Sensitive data / compliance
- Same-day timeline blockers

What they mean:
- urgent issue categories that should notify you immediately

Does it make sense?
- Yes

Recommendation:
- Keep
- But the phrase `Immediate notification topics` is slightly dry; could be more human

#### Batching preference

Options:
- `Urgent immediately; batch the rest when safe`
- `Always notify immediately`
- `Prefer digest even when urgency is borderline`

What they mean:
- how interruptive Ana should be when escalating things

Does it make sense?
- Yes

Recommendation:
- Keep
- This page mostly works once explained

## Authority Step Summary

Keep:
- overall permission model
- most action areas
- escalation concept

Change:
- strongly reword internal-sounding labels
- especially `Operator notification routing decisions`
- consider slightly plainer wording on some money/payment items

This step makes product sense, but the language needs polishing.

---

## Step 5: Vault

This step is trying to capture the default wording Ana should use for sensitive topics.

Important distinction:
- Authority decides whether Ana may act
- Vault decides how Ana should phrase sensitive replies if she is allowed to reply

That distinction is smart.

What is weak is the naming and clarity.

### Overall concept: Vault

What it really is:
- a reusable wording bank for sensitive topics

Why the name is confusing:
- `Vault` sounds dramatic and abstract
- it does not immediately tell the user what they are filling in

Recommendation:
- Consider renaming the step to something like:
  - `Sensitive wording`
  - `Policy wording`
  - `How Ana should phrase sensitive topics`

### 1. Discounts & investment

What it means:
- how Ana should talk about price, discounts, value, and package changes

Does it make sense?
- Yes

Recommendation:
- Keep

### 2. Payment exceptions

What it means:
- how Ana should talk about non-standard payment situations

Does it make sense?
- Yes

Recommendation:
- Keep

### 3. Late payment extensions

What it means:
- how Ana should phrase responses when someone wants more time to pay

Does it make sense?
- Yes

Recommendation:
- Keep

### 4. RAW files

What it means:
- how Ana should explain the studio’s stance on RAW file requests

Does it make sense?
- Yes

Recommendation:
- Keep

### 5. Publication & gallery use

What it means:
- how Ana should phrase permission around publishing, galleries, and image use

Does it make sense?
- Yes

Recommendation:
- Keep

### 6. Sensitive data & privacy

What it means:
- how Ana should talk about privacy-sensitive issues

Does it make sense?
- Yes

Recommendation:
- Keep

## Vault Step Summary

The structure actually makes good sense.

Main issue:
- the step naming and framing are too abstract

Recommendation:
- keep the content areas
- rename the step
- make the intro text simpler

---

## Step 6: Review

This step is the final review before initialization.

What it does:
- summarizes all prior choices
- shows defaults versus explicit choices
- lets the operator jump back and edit sections

Does it make sense?
- Yes

Recommendation:
- Keep

Potential minor concern:
- showing `Default:` in several places is useful, but this may reveal that some things were never truly chosen
- that is good operationally, but the earlier steps should make defaults feel less accidental

---

## Biggest Problems To Change First

If only a few things change first, these should be the priority:

### 1. `Who should Ana name as the manager when it matters?`

Why:
- easily one of the most confusing questions
- overlaps with photographer naming
- sounds like it is asking Ana’s name

Recommended fix:
- reword or merge with photographer/human-reference logic

### 2. `Local only`

Why:
- too fuzzy for large metro areas
- users will interpret it differently

Recommended fix:
- replace with `Home market only`
- add follow-up for exact local area

### 3. `Route to you` versus `Escalate`

Why:
- not distinct enough in plain language

Recommended fix:
- rewrite options more clearly

### 4. `Operator notification routing decisions`

Why:
- internal jargon
- hard to understand without explanation

Recommended fix:
- rename in plain language

### 5. `Vault`

Why:
- concept is valid, name is abstract

Recommended fix:
- rename the step to something more obvious

---

## Suggested Simpler Wording Set

Here is a cleaner wording direction for the most confusing parts.

### Identity

Current:
- `Who should Ana name as the manager when it matters?`

Better:
- `If Ana ever needs to mention a real person, who should that be?`

### Geography

Current:
- `Local only`

Better:
- `Home market only`

Follow-up:
- `What area counts as your home market?`

### Out-of-scope actions

Current:
- `Decline politely`
- `Route to you`
- `Escalate`

Better:
- `Ana declines it politely`
- `Send it directly to me`
- `Flag it for human review`

### Authority item

Current:
- `Operator notification routing decisions`

Better:
- `Decide when to bring me in`

### Vault

Current step name:
- `Vault`

Better:
- `Sensitive wording`

---

## Final Opinion

The onboarding flow is not broken in concept.

In fact, the ecosystem logic is mostly solid:

- Identity defines who the studio is
- Scope defines what the studio does
- Voice defines how Ana sounds
- Authority defines what Ana is allowed to do
- Vault defines how Ana should phrase sensitive topics
- Review confirms everything before initialization

So the real issue is not that the whole system makes no sense.

The real issue is:
- several questions are written in a way that makes the operator stop and decode them
- some terms sound internal instead of natural
- a couple of fields overlap and should be clarified

My blunt opinion:

- around 70–80% of the onboarding concept makes sense
- around 20–30% needs wording cleanup or small structural fixes

The good news is that this mostly looks like a product-language problem, not a total product-logic problem.
