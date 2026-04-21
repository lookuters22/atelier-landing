# Agent Workflow

## Roles

- `composer2`: delivery / implementation agent
- `opus`: product-mapping / architecture agent

## What Each Agent Should Do

### `composer2`
Use for:
- narrow bug fixes
- hardening
- migrations
- idempotency fixes
- regression-safe refactors
- tests
- merge-ready implementation

Strengths:
- tighter execution
- safer first-pass code
- better for finishing and shipping

Prompt style for `composer2`:
- keep prompts narrow
- define exact files to inspect
- ask for small chunks
- require tests in the same chunk
- prefer smallest safe change
- emphasize no broad refactors
- ask for verification at the end

Good examples:
- “Fix this bug in the smallest safe way. Inspect these files first. Add/update tests. Do not broaden scope.”
- “Harden this path for race safety / provenance / idempotency. Keep RPC signatures stable if possible.”

### `opus`
Use for:
- mapping product behavior
- turning vague goals into system design
- policy/rules design
- routing logic design
- identifying edge cases
- defining acceptance criteria
- shaping the right architecture before code is written

Strengths:
- better at understanding product intent
- better at broader system framing
- useful for deciding what the app should do

Risks:
- can be sloppier in implementation details
- should not be trusted alone for final merge-ready code

Prompt style for `opus`:
- ask for behavior design, not final implementation
- ask it to separate concepts clearly
- ask for decision rules, edge cases, and acceptance criteria
- ask for chunked implementation plan, not broad code rewrite
- use it to define the system, then hand implementation to `composer2`

Good examples:
- “Map the correct product behavior for this flow. Separate classification, policy, and action.”
- “Design the routing/model for this feature, including edge cases, states, and acceptance criteria.”

## Recommended Workflow

1. Use `opus` first when the problem is fuzzy, product-heavy, or policy-heavy.
2. Ask `opus` to define:
   - desired behavior
   - edge cases
   - decision rules
   - acceptance criteria
   - implementation chunks
3. Then hand the scoped plan to `composer2`.
4. Ask `composer2` to:
   - implement in small chunks
   - keep changes narrow
   - add tests
   - verify behavior
5. Review the result for regressions before trusting it.

## Rule Of Thumb

- If the question is “What should the system do?” → use `opus`
- If the question is “Make this safe, correct, and shippable” → use `composer2`

## Important Reminder

`opus` may understand the product direction better.
`composer2` is currently more trustworthy for production-safe implementation.

So:
- use `opus` to think
- use `composer2` to ship
