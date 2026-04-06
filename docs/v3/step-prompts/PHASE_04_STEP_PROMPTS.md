# PHASE 4 STEP PROMPTS

## Step 4A

```text
Implement only Step 4A from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 4
- docs/v3/execute_v3.md Step 4A
- docs/v3/DATABASE_SCHEMA.md sections 5.1, 5.1A, and 5.17

Task:
Design the onboarding payload and storage mapping for:
- photographer settings
- studio_business_profiles
- playbook_rules
- optional knowledge base seed entries

Touch only one payload or mapping helper slice.

Do not build the full UI here.

Stop after Step 4A.
```

## Step 4B

```text
Implement only Step 4B from docs/v3/execute_v3.md.

Task:
Model the minimum onboarding capture for one category group only.

Choose one:
- business profile fields
- money and pricing rules
- planner and privacy rules
- publication and raws
- artistic revision and visual review
- escalation preferences

Touch only the files needed for that one category group.

Stop after Step 4B.
```

## Step 4C

```text
Implement only Step 4C from docs/v3/execute_v3.md.

Task:
Split onboarding output into the correct storage layers:
- settings
- studio_business_profiles
- playbook_rules
- optional knowledge_base

Refactor only one storage path in this slice.

Do not store wedding-specific exceptions in playbook_rules.

Stop after Step 4C.
```

## Step 4D

```text
Implement only Step 4D from docs/v3/execute_v3.md.

Task:
Support restricted action classes from day one.

Implement only one narrow action class mapping such as:
- discount_quote = ask_first
- release_raw_files = ask_first
- publication_permission = ask_first
- schedule_call = auto

Touch only the mapping or persistence files needed for this one action class.

Stop after Step 4D.
```

## Step 4D.1

```text
Implement only Step 4D.1 from docs/v3/execute_v3.md.

Task:
Build an explicit action-permission matrix during onboarding for one narrow action family set.

The runtime must be able to resolve:
- do alone
- draft only
- ask first
- never do

Do not leave this as prose-only onboarding text.

Stop after Step 4D.1.
```

## Step 4E

```text
Implement only Step 4E from docs/v3/execute_v3.md.

Task:
Support deterministic business-scope decisions for one scope area only:
- offered service types
- travel scope
- in-scope vs out-of-scope leads
- allowed deliverables

Touch only the smallest helper or mapping files needed.

Stop after Step 4E.
```

## Step 4F

```text
Implement only Step 4F from docs/v3/execute_v3.md.

Task:
Make sure onboarding answers are mapped into structured storage, not kept as one giant freeform blob.

Refactor only one onboarding storage path that is still too unstructured.

Stop after Step 4F.
```
