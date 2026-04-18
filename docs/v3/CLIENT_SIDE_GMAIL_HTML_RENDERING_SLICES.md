# CLIENT-SIDE GMAIL HTML RENDERING SLICES

## Goal

Move Gmail HTML **rendering** to the browser so inbox detail feels instant and Gmail-like, without making Inngest the renderer and without bloating Postgres.

This should preserve the **existing Inbox UI**:

- same layout
- same thread detail shell
- same fold/expand behavior
- same iframe rendering posture
- no redesign of the pane or message cards

## What already exists

The repo already has the right UI primitives:

- [EmailHtmlIframe.tsx](C:\Users\Despot\Desktop\wedding\src\components\email\EmailHtmlIframe.tsx)
- [sanitizeEmailHtml.ts](C:\Users\Despot\Desktop\wedding\src\lib\sanitizeEmailHtml.ts)
- [ConversationFeed.tsx](C:\Users\Despot\Desktop\wedding\src\components\chat\ConversationFeed.tsx)
- [useThreadMessagesForInbox.ts](C:\Users\Despot\Desktop\wedding\src\hooks\useThreadMessagesForInbox.ts)

Today the inbox HTML source still comes from Gmail import artifacts / metadata:

- `metadata.gmail_import.body_html_sanitized`
- `metadata.gmail_import.render_html_ref`

That means the browser UI is already using a sandboxed iframe, but the **HTML generation/storage path** is still tied to server-side preprocessing.

## What should change

We should change the **HTML source path**, not the visual shell.

Target behavior:

1. Gmail materialization stores a **minimal render payload** only
2. Browser decodes Gmail HTML from that payload
3. Browser sanitizes it
4. Existing `EmailHtmlIframe` renders it
5. Legacy artifact paths remain as fallback until migration is complete

## Hard constraints

### 1. No DB bloat

Do **not** store full Gmail raw message JSON or full headers/history in `messages.raw_payload`.

Store only the render subset needed by the client.

### 2. Images should load like Gmail

Do **not** keep the current posture that strips all remote image URLs if the goal is Gmail-like fidelity.

Allow remote `<img>` loading inside the sandboxed iframe.

### 3. Inngest is not the renderer

Inngest / server-side code may still:

- fetch Gmail
- materialize canonical messages
- extract the minimal render payload

But they should **not** own inbox display rendering or pre-render the final HTML document for the browser.

## Recommended minimal render payload

Use a compact render payload stored on the canonical `messages` row.

Recommended shape:

```ts
type GmailRenderPayloadV1 = {
  version: 1;
  provider: "gmail";
  gmail_message_id: string;
  gmail_thread_id: string;
  html_base64url?: string | null;
  plain_base64url?: string | null;
  inline_related_parts?: Array<{
    cid: string;
    mime_type: string;
    data_base64url: string;
  }>;
};
```

Store:

- the `text/html` part only
- optional `text/plain` fallback
- inline `cid:` assets required for rendering

Do not store:

- full Gmail header history
- full Gmail message JSON
- unrelated MIME parts
- normal file attachments not needed for HTML render
- large server-generated sanitized HTML blobs for new messages

## Hybrid storage recommendation

To avoid bloating Postgres with giant promo emails:

- store small render payloads directly in `messages.raw_payload`
- store large render payloads in Supabase Storage and keep a compact pointer in `raw_payload`

This still keeps rendering client-side.

It also keeps Supabase cost safer than storing oversized HTML blobs in hot Postgres rows.

## Current code references

Read these first before implementing:

- [EmailHtmlIframe.tsx](C:\Users\Despot\Desktop\wedding\src\components\email\EmailHtmlIframe.tsx)
- [sanitizeEmailHtml.ts](C:\Users\Despot\Desktop\wedding\src\lib\sanitizeEmailHtml.ts)
- [ConversationFeed.tsx](C:\Users\Despot\Desktop\wedding\src\components\chat\ConversationFeed.tsx)
- [useThreadMessagesForInbox.ts](C:\Users\Despot\Desktop\wedding\src\hooks\useThreadMessagesForInbox.ts)
- [gmailImportMessageMetadata.ts](C:\Users\Despot\Desktop\wedding\src\lib\gmailImportMessageMetadata.ts)
- [gmailImportMaterialize.ts](C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\gmailImportMaterialize.ts)
- [buildGmailMaterializationArtifact.ts](C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\buildGmailMaterializationArtifact.ts)
- [gmailMessageBody.ts](C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\gmailMessageBody.ts)
- [DATABASE_SCHEMA.md](C:\Users\Despot\Desktop\wedding\docs\v3\DATABASE_SCHEMA.md)
- [GMAIL_IMPORT_SCALABILITY_SLICES.md](C:\Users\Despot\Desktop\wedding\docs\GMAIL_IMPORT_SCALABILITY_SLICES.md)

## Non-goals

- do not redesign Inbox
- do not replace `EmailHtmlIframe`
- do not replace `ConversationFeed`
- do not remove old Gmail HTML fallbacks in the first slice
- do not move all Gmail fetch logic into the browser
- do not store full Gmail raw payloads for convenience

---

## Slice plan

### Slice 1

Define the minimal Gmail render payload contract and extraction helpers.

### Slice 2

Write that minimal render payload during Gmail materialization without bloating DB rows.

### Slice 3

Switch inbox detail rendering to prefer browser-decoded Gmail render payload while preserving old fallbacks and existing UI.

### Slice 4

Allow Gmail-like remote image rendering safely enough for the current product posture and verify no UI regressions.

---

## Slice 1 Prompt

```text
Implement Slice 1 of client-side Gmail HTML rendering: define the minimal render payload contract and client extraction helpers.

Goal:
- Prepare the repo for browser-side Gmail HTML rendering without changing the existing Inbox UI.
- Do not change the visible layout or redesign any message/thread components.
- In this slice, only add the shared payload contract + browser extraction utilities.

Critical product constraints:
1. Do not bloat the database with full Gmail raw payloads or full header history.
2. Do not make Inngest the renderer.
3. Do not change the look/feel of the Inbox UI in this slice.

Read these files/docs first:
- docs/v3/CLIENT_SIDE_GMAIL_HTML_RENDERING_SLICES.md
- src/components/email/EmailHtmlIframe.tsx
- src/lib/sanitizeEmailHtml.ts
- src/components/chat/ConversationFeed.tsx
- src/hooks/useThreadMessagesForInbox.ts
- src/lib/gmailImportMessageMetadata.ts
- supabase/functions/_shared/gmail/gmailMessageBody.ts
- docs/GMAIL_IMPORT_SCALABILITY_SLICES.md

Current architecture to preserve:
- The Inbox already renders HTML with EmailHtmlIframe + client-side sanitization.
- We are not replacing that.
- We are changing the source of HTML from server-prepared artifacts to browser-decoded Gmail render payload.

What to implement in this slice:
1. Add a shared minimal Gmail render payload contract for canonical messages.
   Recommended new file:
   - src/lib/gmailRenderPayload.ts

2. Define a compact payload shape intended for messages.raw_payload (or a future Storage-backed pointer), for example:
   - version
   - provider
   - gmail_message_id
   - gmail_thread_id
   - html_base64url
   - plain_base64url
   - inline_related_parts (cid assets only)

3. Add parsing/type-guard helpers for that payload.

4. Add browser-side extraction helpers that:
   - decode Gmail Base64URL content
   - return HTML string when html_base64url exists
   - fall back to plain text when HTML is absent
   - optionally resolve cid: references using inline_related_parts

5. Reuse behavior from supabase/functions/_shared/gmail/gmailMessageBody.ts where relevant so MIME/body semantics stay aligned.

6. Keep this slice focused on shared utilities.
   - Do not yet write the payload during Gmail materialization
   - Do not yet change Inbox rendering behavior
   - Do not yet change sanitizer remote-image behavior

Important constraints:
- Do not store or require the full Gmail raw message JSON.
- Do not add heavyweight payload fields “just in case.”
- Do not touch EmailHtmlIframe visual behavior.
- Do not change ConversationFeed rendering structure.
- Do not remove existing metadata-based HTML fallback paths.

Acceptance criteria:
- There is now a clear, minimal Gmail render payload contract in frontend/shared code.
- There are browser-safe helpers to decode/extract HTML/plain text from that contract.
- The utilities are explicitly designed to avoid DB bloat.
- No visible UI behavior changes in this slice.

Please implement the code and include a short summary of:
- the final payload shape
- why it avoids DB bloat
- how the browser extraction path works
- which existing UI components remain unchanged
```

---

## Slice 2 Prompt

```text
Implement Slice 2 of client-side Gmail HTML rendering: write the minimal Gmail render payload during Gmail materialization without bloating Postgres.

Goal:
- Persist only the compact render payload needed for browser-side rendering.
- Keep Inbox UI unchanged.
- Keep server-side Gmail import/materialization working.

Read these files/docs first:
- docs/v3/CLIENT_SIDE_GMAIL_HTML_RENDERING_SLICES.md
- src/lib/gmailRenderPayload.ts
- supabase/functions/_shared/gmail/buildGmailMaterializationArtifact.ts
- supabase/functions/_shared/gmail/gmailImportMaterialize.ts
- supabase/functions/_shared/gmail/gmailMessageBody.ts
- src/types/database.types.ts
- docs/GMAIL_IMPORT_SCALABILITY_SLICES.md

What to implement:
1. During Gmail materialization, build the minimal Gmail render payload:
   - html_base64url
   - plain_base64url
   - inline_related_parts for cid-referenced render assets only
   - message/thread ids

2. Persist that payload in a way that avoids DB bloat:
   - small payloads may live in messages.raw_payload
   - large payloads should use a compact pointer strategy if needed
   - choose the smallest safe approach that fits the current codebase

3. Do not store:
   - full Gmail headers
   - full Gmail response JSON
   - unrelated MIME parts
   - giant duplicate sanitized HTML blobs for new messages

4. Preserve existing legacy/fallback metadata paths for older messages:
   - metadata.gmail_import.body_html_sanitized
   - metadata.gmail_import.render_html_ref

5. Keep current materialization behavior otherwise intact.

Constraints:
- Do not redesign Gmail import pipeline.
- Do not make Inngest generate the final browser-rendered HTML document.
- Do not change Inbox UI components in this slice.
- Be very explicit about any payload size threshold or pointer fallback you introduce.

Acceptance criteria:
- New Gmail materialized messages carry the minimal client render payload.
- The stored payload is compact and intentionally avoids DB bloat.
- Existing older messages still remain compatible with legacy HTML paths.
- No visible Inbox UI changes in this slice.

Please implement the code and include a short summary of:
- where the render payload is built
- where/how it is stored
- what was intentionally excluded to avoid bloat
- how old messages still fall back safely
```

---

## Slice 3 Prompt

```text
Implement Slice 3 of client-side Gmail HTML rendering: switch Inbox detail rendering to prefer browser-decoded Gmail render payload while preserving existing UI and legacy fallbacks.

Goal:
- Keep the exact same Inbox/thread UI structure.
- Only change the HTML source preference order.

Read these files/docs first:
- docs/v3/CLIENT_SIDE_GMAIL_HTML_RENDERING_SLICES.md
- src/components/email/EmailHtmlIframe.tsx
- src/lib/sanitizeEmailHtml.ts
- src/components/chat/ConversationFeed.tsx
- src/hooks/useThreadMessagesForInbox.ts
- src/lib/gmailImportMessageMetadata.ts
- src/lib/gmailRenderPayload.ts

What to implement:
1. Update Inbox message hydration so the preferred order becomes:
   - client-renderable Gmail render payload from messages.raw_payload
   - legacy metadata.gmail_import.body_html_sanitized
   - legacy render_html_ref storage fetch
   - plain text fallback

2. Decode Gmail HTML in the browser from the new compact render payload.

3. Sanitize using the existing sanitizeEmailHtml.ts path.

4. Render through the existing EmailHtmlIframe component only.

5. Do not redesign:
   - ConversationFeed
   - message cards
   - fold/expand behavior
   - pane layout

6. Keep the old fallback path intact for previously imported emails.

Constraints:
- No UI restyling.
- No new visual shell.
- No dangerous direct dangerouslySetInnerHTML usage.
- No removal of current fallback support in this slice.

Acceptance criteria:
- Inbox detail can render Gmail HTML from the new compact render payload client-side.
- Existing iframe/sanitizer/UI structure remains unchanged.
- Older Gmail-imported messages still render through fallback paths.
- No visible Inbox layout regression.

Please implement the code and include a short summary of:
- the new render source precedence
- which files changed
- how the old fallback path is preserved
- what UI components were intentionally left unchanged
```

---

## Slice 4 Prompt

```text
Implement Slice 4 of client-side Gmail HTML rendering: allow Gmail-like remote image rendering while preserving the existing Inbox UI and sandbox posture.

Goal:
- Make promo/newsletter emails visually load like Gmail, including remote images.
- Keep the existing Inbox UI unchanged.
- Keep rendering inside the existing sandboxed iframe.

Read these files/docs first:
- docs/v3/CLIENT_SIDE_GMAIL_HTML_RENDERING_SLICES.md
- src/components/email/EmailHtmlIframe.tsx
- src/lib/sanitizeEmailHtml.ts
- src/components/chat/ConversationFeed.tsx

What to implement:
1. Update email sanitization policy so remote image URLs can load inside the iframe.
2. Keep blocking dangerous tags and event-handler attributes:
   - script
   - iframe
   - object
   - embed
   - form
   - inline event handlers like onload/onerror/onclick
3. Preserve cid/inlined related-part support for Gmail-render payload content.
4. Ensure links still behave safely and do not break the app shell.
5. Verify EmailHtmlIframe sizing still works with remote-loaded images.

Important:
- The visual shell of Inbox must not change.
- The iframe remains the isolation boundary.
- We want Gmail-like image behavior, not server-side image inlining for display.

Constraints:
- Do not redesign the thread pane.
- Do not replace EmailHtmlIframe.
- Do not move rendering back into Inngest.

Acceptance criteria:
- Remote images in Gmail HTML render inside the iframe like Gmail-style email viewing.
- Existing Inbox UI remains visually unchanged apart from richer email content display.
- Dangerous active content is still blocked.
- No double-scrollbar or major sizing regression in the iframe.

Please implement the code and include a short summary of:
- what sanitizer behavior changed
- how remote images are now allowed
- what remained blocked for safety
- how the UI shell was preserved
```

