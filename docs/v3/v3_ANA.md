# ANA OS V3 OVERVIEW

## 1. What This System Is

Ana is not meant to be a free-thinking chatbot.

Ana is meant to be a studio operator that works under:

- a fixed safety kernel
- a photographer's business profile
- a photographer's playbook
- case-specific memories
- deterministic backend facts

In simple words:

- business profile = what the studio does
- playbook = how Ana behaves
- memories = one-off truths and exceptions
- verifier = the guard that decides whether Ana may act
- writer = the narrow drafting layer that only writes approved output

## 2. The Main Idea

The system should be non-linear, but not chaotic.

That means Ana should:

- figure out what the current task is
- gather the right facts
- check the studio rules
- check the case memory
- see whether the action is allowed
- either act, draft, ask one clarifying question, or escalate

The system should not:

- guess hidden facts
- guess the audience
- invent studio policy
- invent timers
- send risky things without approval

## 3. The Core Layers

### Safety Kernel

This is the small fixed part that is true for every photographer.

Examples:

- no cross-tenant access
- no hallucinated facts
- no sending sensitive data without approval
- no bypassing manual thread overrides
- no double-send under retries or double-clicks

This also means:

- one photographer must never see another photographer's tasks, drafts, threads, clients, knowledge, or outbound messages

That rule is not a later polish item.
It is a launch requirement.

### Studio Business Profile

This tells Ana what the studio actually offers.

Examples:

- weddings only
- weddings plus family sessions
- no video
- Europe only
- local weekday sessions allowed
- albums offered, raws not normally offered

This layer answers:

- what work is in scope
- what work is out of scope
- where the studio travels
- what deliverables exist at all

### Playbook Rules

This tells Ana how to behave inside that business.

Examples:

- always ask before discounts
- always ask before sending raws
- Ana may schedule calls herself
- never expose planner commission to the couple
- passport packets always require approval

In practice, this layer should answer four core permission questions for each important action:

- may Ana do it alone
- may Ana draft it only
- must Ana ask first
- must Ana never do it

### Memories

This stores case-specific truths and exceptions.

Examples:

- this specific bride is also a referral partner
- this planner gets a private commission on this wedding
- this family has a publication restriction
- this couple got a one-time pricing exception
- the photographer already met them in London yesterday

### Deterministic Backend Facts

These are facts the AI should not guess.

Examples:

- who is in the thread
- whether agency CC lock is on
- whether the thread is human-only
- whether the message has broadcast risk
- whether there is an open escalation

## 4. The Runtime Flow

The runtime is meant to work like this:

1. A message or event arrives.
2. The backend resolves identity, audience, and safety facts.
3. The context builder loads:
   - business profile
   - relevant playbook rules
   - relevant memories
   - relevant global knowledge
   - recent thread context
4. The orchestrator proposes an action.
5. The verifier checks whether that action is allowed.
6. The system either:
   - acts automatically
   - drafts only
   - asks a clarifying question
   - escalates to the photographer
   - blocks the action
7. If a message must be written, the writer drafts only from approved facts.

## 5. Why The Writer Must Stay Narrow

If the writer sees the whole business logic, it will start making policy decisions while trying to sound polite.

That is dangerous.

So the writer should only receive:

- approved facts
- approved intent
- light tone context

The writer should not receive:

- broad operational freedom
- raw sensitive policy
- unresolved business ambiguity

Use case:

- Good: "Draft a polite reply confirming the consultation time."
- Bad: "Read the entire thread and decide whether to waive the fee."

## 6. Why The Verifier Matters

The orchestrator is allowed to propose.

The verifier is allowed to say yes or no.

This is what keeps the system safe.

Examples:

- the client asks for a discount
  - orchestrator proposes `discount_quote`
  - verifier checks playbook
  - if `ask_first`, Ana escalates

- the planner asks for passports
  - orchestrator proposes `share_sensitive_data`
  - verifier sees restricted document flow
  - result = ask first or human only

- a bride asks for a visual opinion on a Canva board
  - orchestrator proposes `visual_review_required`
  - verifier blocks direct AI judgment
  - Ana escalates

## 7. Why Memory Is Split Into Layers

Not all memory is the same.

### Thread Summary

Short session memory of what has been going on in this thread.

### Selected Memories

Important case-specific truths pulled into the current decision.

### Global Knowledge

Reusable studio-wide information like approved brand voice or standard contract explanations.

The reason for the split is simple:

- too little memory makes Ana forgetful
- too much memory makes Ana noisy and expensive

## 8. The Preference Categories

The system does not need a different database field for every photographer phrase.

It needs stable internal categories.

### Business Profile Categories

- service types (what kinds of shoots the studio does, like weddings, family, brand, or video)
- service availability (whether each service is fully offered, limited, seasonal, or not offered)
- geographic scope (where the studio works, like local only, Europe, or worldwide)
- travel policy (how the studio handles travel, such as no travel, selective travel, or destination work)
- booking scope (what booking formats are allowed, like full-day only, hourly sessions, or multi-day jobs)
- client types (what kinds of clients the studio works with, like direct couples, planners, brands, or venues)
- deliverable types (what the studio can actually deliver, like galleries, albums, prints, reels, or video edits)
- lead acceptance rules (what inquiries Ana may accept, decline, or route elsewhere)
- language support (which languages the studio can communicate in)
- team structure (whether the studio is solo, has associates, uses contractors, or has a larger team)

### Playbook Categories

- studio identity and voice (how the studio sounds, presents itself, and signs messages)
- scheduling and meetings (how Ana may book, move, confirm, or decline calls and meetings)
- pricing and discount authority (when Ana may discuss pricing and whether discounts require approval)
- invoicing, billing, and payment handling (how invoices, reminders, balances, and payment questions should be handled)
- banking exceptions and reconciliation (what to do when bank details, transfers, currencies, or payment matching become unusual)
- planner, agency, and CC etiquette (how to behave when planners, agencies, or copied contacts are involved)
- audience privacy and visibility (what topics are safe to mention depending on who can see the thread)
- file release policy (what files may be shared, such as raws, galleries, exports, or downloads)
- publication, PR, and vendor credit rules (how images may be published, credited, submitted, or kept private)
- artistic revision and visual exception handling (how Ana handles editing feedback, marked-up changes, and visual-review cases)
- sensitive data and compliance assets (how restricted information like IDs, passports, insurance, or legal files must be handled)
- proactive follow-up and automation limits (what Ana may follow up on automatically and where automation must stop)
- escalation preferences (when Ana should ask the photographer, how urgent it is, and how those requests should be delivered)

These categories let onboarding stay flexible for humans while staying structured for the system.

## 11. The Tool Layer

Tools are not full agents.

They are small, bounded capabilities that reasoning roles can call safely.

The point of tools is to avoid giving the orchestrator too much freeform power.

### `toolAudienceCheck`

This tool answers:

- who can see this thread
- who is in the audience
- whether planner or agency visibility creates restrictions
- whether broadcast risk or reply-all risk exists

This tool should return structured audience facts, not advice prose.

### `toolVerifier`

This is the most important tool in the whole system.

It answers:

- is this action allowed
- is it `auto`, `draft_only`, `ask_first`, or `blocked`
- what rule or fact caused the decision

This tool is the spine between reasoning and execution.

### `toolEscalate`

This tool creates a blocked-action escalation for the photographer.

It should take:

- the action Ana wanted
- why she is blocked
- the structured decision justification
- the question to ask the photographer

It should write to `escalation_requests`, not just send a vague chat message.

### `toolOperator`

This tool performs safe operational mutations.

Examples:

- create a task
- update a wedding milestone
- mark a pause
- attach structured metadata to a case

This tool should not bypass verifier policy.

### `toolDocuments`

This tool looks up documents and restricted assets safely.

Examples:

- find the correct contract
- find an invoice
- find a passport packet reference
- find a publication credit sheet

This tool should return document metadata and approved paths, not dump sensitive content into prompts by default.

### `toolCalculator`

This tool handles bounded calculations.

Examples:

- totals
- invoice math
- balance remaining
- simple pricing arithmetic

It exists so the model does not do sloppy business math in prose.

### `toolArchivist`

This tool stores the result of a resolved case.

It helps answer:

- should this become memory
- should this become a playbook rule
- should this stay one-off

This is how learning becomes structured instead of messy.

## 12. Workers And Runtime Units

Workers are not the same as agents.

Workers are the units that own events, retries, sends, and background execution.

### Inbound Workers

Examples:

- `webhook-web`
- `webhook-whatsapp`

These receive the outside world and turn it into internal events.

### Orchestration Workers

Examples in the current repo:

- `triage`
- `whatsappOrchestrator`

In V3, the main orchestrator path should live here.

These workers own event handling and call the reasoning roles and tools.

### Approval Workers

Examples:

- `webhook-approval`
- `api-resolve-draft`

These workers own the approval boundary between a pending draft and a real outbound action.

### Outbound Worker

Example:

- `outbound`

This worker owns real delivery and idempotent send recording.

It should be the only place where a draft becomes an actual outbound message.

### Sleeper / Follow-Up Workers

Examples:

- `milestoneFollowups`
- `prepPhaseFollowups`
- `postWeddingFlow`
- `calendarReminders`

These workers own timed background work and must re-check pause and lock flags every time they wake up.

## 13. The Orchestration Brain And The Agent Roles

The system should stay lean.

The important roles are separate, but they work together as one machine.

### Orchestrator

This is the reasoning brain.

Its job is to:

- understand the current ask
- gather the relevant context
- choose a candidate action
- produce structured decision justification

It is allowed to propose.

It is not allowed to send risky actions on its own.

In simple words:

- it is the planner
- it is not the final gate
- it should think broadly, but act narrowly

Current repo references:

- `supabase/functions/inngest/functions/whatsappOrchestrator.ts`
- V1 or V2 routing still also flows through `supabase/functions/inngest/functions/triage.ts`

### Verifier

This is the safety gate.

Its job is to check:

- manual overrides
- audience facts
- playbook rules
- authorized exceptions
- current evidence
- whether the action is allowed, draft-only, ask-first, or blocked

The verifier is what turns a smart system into a safe system.

In simple words:

- if the orchestrator says "I think we should do this"
- the verifier says "are we actually allowed to do this"

### Writer / Persona

This is the drafting layer.

Its job is to:

- write the final message politely
- keep the correct studio tone
- stay inside approved factual boundaries

Current repo references:

- `supabase/functions/inngest/functions/persona.ts`
- `supabase/functions/_shared/persona/personaAgent.ts`

This layer should not decide business policy.

In simple words:

- it writes the email
- it does not decide whether the email should exist

### Escalation Operator

This is the photographer-facing clarification mode.

Its job is to:

- ask short structured questions on WhatsApp
- capture the photographer's answer
- store the result into `escalation_requests`
- decide whether the answer became memory or playbook

This does not have to be a huge separate agent.
It can stay a constrained operator mode of the orchestrator.

In simple words:

- this is Ana raising her hand and asking the photographer for help

How she should ask:

- one decision at a time
- short and operational
- state what was asked
- state what Ana wanted to do
- state why she is blocked
- ask for the smallest approval needed

### Archivist / Learning Layer

This is the layer that stores the outcome of real decisions.

Its job is to answer:

- was this one-off
- was this reusable
- should it go into memory
- should it become a playbook rule

This is how the system improves without polluting policy.

In simple words:

- this is the librarian that stores the lesson in the right place

How the answer should be remembered:

- reusable studio rule -> `playbook_rules`
- one-off case exception -> `memories`
- sensitive file handling -> `documents`
- unresolved situation -> keep it open in `escalation_requests`

## 14. How The Parts Work Together

Here is the simple teamwork model:

1. An inbound message comes in through `webhook-web` or `webhook-whatsapp`.
2. An Inngest event is created.
3. The context builder loads the database context:
   - `photographers.settings`
   - `studio_business_profiles`
   - `playbook_rules`
   - `memories`
   - `knowledge_base`
   - `thread_summaries`
   - `threads`
   - `messages`
   - `documents`
4. The orchestrator decides what kind of action is being proposed.
5. The verifier checks whether that action is allowed.
6. If the action needs a client-facing message, the writer drafts it.
7. The draft lands in `drafts`.
8. The photographer approves through `webhook-approval` or `api-resolve-draft`.
9. The outbound worker sends the message safely.
10. If the system got blocked, it writes to `escalation_requests` and pings or queues the photographer depending on urgency.
11. If the outcome taught the system something reusable, it updates `playbook_rules`.
12. If it was a one-off case fact, it stores it in `memories`.

## 15. The Onboarding Process

Onboarding should happen in two passes.

### Pass 1: Business Scope

Capture what the studio does.

Examples:

- what types of shoots do you offer
- do you do weddings, family, video, brand, commercial
- do you travel locally, nationally, in Europe, worldwide
- what do you never offer
- what deliverables do you offer
- what kinds of leads are out of scope immediately

### Pass 2: Playbook Rules

Capture how Ana should behave.

Examples:

- can Ana schedule calls alone
- can Ana discuss pricing
- can Ana offer discounts
- can Ana send invoices
- can Ana share raws
- can Ana answer publication questions
- what always needs approval

### Pass 3: Runtime Learning

After onboarding, Ana still learns.

But learning must be controlled:

- reusable rule -> `playbook_rules`
- one-off exception -> `memories`
- sensitive file -> `documents`
- blocked uncertainty -> `escalation_requests`

## 16. Use Cases

### Use Case A: Out-Of-Scope Inquiry

A lead asks for video coverage in Asia.

If the business profile says:

- no video
- Europe only

Ana can safely decline or route without bothering the photographer.

### Use Case B: Discount Request

A bride asks for a better price.

If the playbook says:

- `discount_quote = ask_first`

Ana does not guess.
Ana escalates on WhatsApp.

### Use Case C: One-Off Exception

The photographer says:

"For this couple, let them have the raws."

That should go into memory for that case, not into global policy.

### Use Case D: Sensitive Data

A planner asks for passport details.

Ana should not pull that from general knowledge.
This should go through restricted documents and approval-first sending.

### Use Case E: Visual Review

A client asks:

"Can you tell me if this Canva layout looks right?"

Ana can acknowledge the request and escalate it, but should not pretend to see what she cannot verify.

## 17. Why This Is Better Than A Linear Workflow

A linear workflow assumes every case moves through the same path.

Real wedding operations do not work like that.

Real cases involve:

- planners
- couples
- payers
- travel
- pricing exceptions
- emotional crises
- visual assets
- banking issues
- offline updates

So the system must adapt.

But adaptation must happen inside:

- stable categories
- stable database structures
- strict verification
- controlled learning

That is the whole idea behind V3.