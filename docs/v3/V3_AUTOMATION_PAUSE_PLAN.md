# V3 Automation Pause And State Control Plan

## Goal
Ensure automated follow-ups, reminders, and drips respect the emotional and strategic state of a wedding thread.

## Why This Track Exists
Real threads showed that trust can be broken if the system keeps nudging a client while a case is paused, emotionally sensitive, or waiting on strategy.

## Phase 1
Pause State Model

### Objective
Standardize the state flags V3 needs.

### Core States
- suspended/escalated
- compassion_pause
- strategic_pause
- emergency_pause
- agency_cc_lock

## Phase 2
Worker Guardrails

### Objective
Make follow-up workers immediately skip paused threads.

### Targets
- stalled communication workers
- milestone reminders
- post-wedding drips
- payment follow-ups

## Phase 3
Scheduled Follow-Up Contract

### Objective
Only allow durable follow-up timers when explicitly approved by policy or workflow.

### Examples
- wire-transfer follow-up
- unanswered direct question nudge
- post-gallery album pitch

## Phase 4
Human Control Surface

### Objective
Give the operator deterministic controls.

### Needed
- mute/override
- resume
- strategic hold
- compassion hold

## Phase 5
Replay Proof

### Target Stress Tests
- Stress Test 1 wire follow-up
- Stress Test 2 emergency pause
- Stress Test 6 compassion pause
- Stress Test 8 stalled communication nudge

