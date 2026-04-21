# G5 grouped Gmail import: attachment path

**Purpose:** Document how a staged `import_candidate` tied to a `gmail_label_import_group_id` can end up with `threads.wedding_id` set to the batch “lazy” wedding, and when it must stay unfiled (`wedding_id = null`).

## 1. Data model (schema intent)

- **`gmail_label_import_groups`**: one logical batch per `(photographer, connected_account, Gmail label id)`. Product-wise, approve-once still targets **one** inquiry container for the batch, but **CRM-linking** is no longer automatic from label membership alone (Chunk 3).
- **`import_candidates.gmail_label_import_group_id`**: ties each staged row to that batch.

## 2. Group row lifecycle (staging)

- **`ensurePendingGmailLabelImportGroup.ts`**: Ensures there is at most one `pending` / `approving` group per `(photographer_id, connected_account_id, source_identifier)`. Creates `pending` row if needed. Does **not** assign weddings or threads.

## 3. Approval worker (where batch wedding is chosen)

- **`processGmailLabelGroupApproval.ts`** (`processChunk` loop):
  - Loads pending candidates for `gmail_label_import_group_id = groupId`, ordered by `created_at`.
  - Maintains **`lazyWedding`**: `{ weddingId, labelName }`. Initial `weddingId` may come from the group row (`materialized_wedding_id`) on retry.
  - For **each** candidate, builds **`groupedAttachmentAnchorEmails`**:
    - If `lazyWedding.weddingId` is set: **`loadAnchorEmailsForGroupedImportWedding`** — normalized inbound senders from email threads already filed under that wedding whose `ai_routing_metadata.gmail_label_import_group_id` matches this batch.
    - Plus a **same-chunk overlay** (`chunkAnchorOverlay`): senders from candidates in the **current** chunk that were just linked, so step boundaries inside one chunk still see anchors before the next DB read.
  - Calls **`materializeGmailImportCandidate(..., weddingId: passWeddingId, groupedAttachmentAnchorEmails, ...)`** where **`passWeddingId = lazyWedding.weddingId`**.

### 3.1 Chunk 3: explicit attachment eligibility (not label, not “not suppressed”)

**Same Gmail label and passing suppression are necessary but not sufficient** to set `threads.wedding_id` to the batch wedding.

**Positive evidence** (see **`gmailProjectAttachmentEligibility.ts`** / **`evaluateGroupedImportAttachmentEligibility`**):

1. **Known client** — inbound sender email matches an existing `clients.email` for this photographer (via `photographerHasClientMatchingEmail`), or  
2. **Batch sender anchor** — normalized inbound sender is in the merged anchor set (prior linked threads in this group + chunk overlay).

If evidence is weak, missing, or ambiguous → **`groupedAttachmentEligible: false`** → thread stays **unfiled** for the batch wedding; provenance records **`grouped_attachment_eligibility`**.

**Lazy batch wedding creation** runs only when a candidate is **`!suppressed && groupedAttachmentEligible`**, and `lazyWedding.weddingId` is still null. An all-suppressed or all-ineligible batch **never** creates the lazy wedding.

## 4. Where `wedding_id` is actually written

### 4.1 New thread (`materializeGmailImportCandidate`)

- Runs **`classifyGmailImportCandidate`**. If **suppressed** → **`effectiveWeddingId = null`** (unchanged).
- If grouped and **not** suppressed → eligibility evaluation. **`effectiveWeddingId`** is the passed-in batch id **only if** **`groupedAttachmentEligible === true`**; otherwise **`null`**, and **`grouped_attachment_eligibility`** is merged into routing / import provenance for audit.
- RPC **`complete_gmail_import_materialize_new_thread`** receives **`p_thread_wedding_id: effectiveWeddingId`**.

### 4.2 Lazy first eligible candidate (wedding created after materialize)

- First **attachment-eligible** candidate may materialize with **`wedding_id` null** because `lazyWedding.weddingId` was still null.
- Worker then **`ensureBatchWeddingForGroup`**, then **`backpatch_lazy_grouped_import_wedding_link`** for **new-thread** path only, aligning thread + candidate JSON with the lazy wedding id.

### 4.3 Reuse existing thread

- **`materializeGmailImportCandidate`** returns **`groupedAttachmentEligible` / reason / evidence** (after the same eligibility rules as new-thread).
- **`finalizeApprovedImportCandidate`** receives **`threadWeddingId`**: **`null`** if suppressed or ineligible; **`lazyWedding.weddingId`** only if **`needsThreadWeddingIdUpdate && attachmentEligible`**. Ineligible reuse gets **`grouped_attachment_eligibility`** in **`extraProvenance`**.

## 5. Suppressed candidates in the same batch

- Unchanged: suppressed threads are **not** CRM-linked to the batch wedding; suppression provenance is preserved.

## 6. Summary table

| Stage | File / RPC | Role |
|--------|------------|------|
| Group + FK | `ensurePendingGmailLabelImportGroup`, sync staging | One pending group per label scope |
| Batch wedding | `gmailLabelImportLazyWedding.ts`, `processGmailLabelGroupApproval` | Lazy wedding only after first **eligible** candidate |
| Eligibility | `gmailProjectAttachmentEligibility.ts` | Client match or batch sender anchor — not label alone |
| Attach new thread | `gmailImportMaterialize` → `complete_gmail_import_materialize_new_thread` | **`effectiveWeddingId`** from suppression + eligibility |
| Repair first row | `backpatchLazyGroupedImportWeddingLink` | Aligns thread + candidate JSON with lazy wedding id |
| Reuse thread | `gmailImportMaterialize` + `finalize_gmail_import_link_existing_thread` | Same eligibility; **`threadWeddingId`** gated |

## 7. Later chunks (out of scope here)

- Provenance on manual link (`rpc_link_thread_to_wedding`, etc.).
- LLM / fuzzy matching for identity (not used for this gate).
