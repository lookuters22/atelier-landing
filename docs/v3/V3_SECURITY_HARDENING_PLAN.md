# V3 Security Hardening Plan

## Goal
Harden both the general platform security and the AI-specific safety boundaries of V3.

## Why This Track Exists
As V3 gains richer memory and stronger operator powers, the cost of a leak or spoofed action increases.

## Phase 1
Transport And Runtime Baseline

### Objective
Verify platform security assumptions.

### Check
- HTTPS/TLS everywhere
- WSS for real-time channels
- secure secret handling
- least-privilege worker access
- tenant-scoped DB queries

### Pass Criteria
- no insecure transport path
- no obvious cross-tenant query path

## Phase 2
Prompt-Boundary And PII Audit

### Objective
Ensure sensitive data does not leak into model prompts unnecessarily.

### Audit
- passports
- DOBs
- banking details
- legal/compliance documents
- planner commission / internal pricing notes

### Target Areas
- orchestrator prompt sanitization
- writer facts assembly
- escalation payload assembly

## Phase 3
Attachment And Document Security

### Objective
Make attachment handling safe and explicit.

### Focus
- screenshots
- passports
- NDAs
- insurance certificates
- visual proofs/mockups

### Pass Criteria
- attachments requiring human review are not treated as ordinary text context

## Phase 4
Operator-Channel Authenticity

### Objective
Protect the operator “god-key” lane.

### Focus
- WhatsApp identity binding
- escalation-to-operator matching
- spoofing resistance
- audit trail for operator actions

## Phase 5
Field-Level Security And Secrets

### Objective
Protect especially sensitive stored fields.

### Focus
- envelope encryption / vault strategy for third-party secrets
- restricted access handling for high-risk PII

## Phase 6
Security Proof Report

### Objective
Write a concrete high/medium/low findings report with fixes and residual risks.

