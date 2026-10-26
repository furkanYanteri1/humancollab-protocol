---
title: "Accountable Statements Between AI Agents, Businesses and People"
abbrev: "Accountable Statements"
docname: draft-humancollab-accountable-statements-00
category: info
ipr: trust200902
submissionType: independent
author:
  - name: Furkan Yanteri
    organization: humancollab
    email: hello@humancollab.si
---

# Status

Working draft in Internet-Draft structure, not yet submitted. Dedicated to the public domain (CC0 1.0). The normative
details and the live reference implementation are in [SPEC.md](SPEC.md) at https://humancollab.si; where this draft
and SPEC.md differ, SPEC.md describes the deployed service.

# Abstract

AI agents increasingly act on information they cannot check: what a business can supply, what a person said, what
rules a platform applies. This document describes a minimal way to make such statements accountable. Every statement
is signed by its author, bound where possible to a domain the author controls, and sealed in a public append-only
Merkle log whose tree heads are signed, timestamped and publicly monitored. The design proves who said what and
when, and that the record was not rewritten. It deliberately does not attempt to prove that a statement is true.

# 1. Introduction

Search results, marketing pages and machine-generated text give an AI agent no way to tell an accountable statement
from an anonymous one. Reputation scores can be bought or gamed. Certification does not scale to every sector.

This draft takes a narrower goal that can be verified mechanically:

1. Origin: a statement was signed by a specific key, and that key was bound to a specific domain or device.
2. Integrity: the statement has not changed since it was signed.
3. Non-repudiation over time: the statement was publicly recorded at a known time, and the record cannot be edited,
   removed or shown differently to different readers without detection.

Truth is left to the reader. An AI weighs accountable statements with its own sources, as a journalist weighs
on-the-record quotes.

## 1.1 Terminology

The key words "MUST", "MUST NOT", "SHOULD" and "MAY" are to be interpreted as described in BCP 14 (RFC 2119,
RFC 8174) when, and only when, they appear in all capitals.

- Statement: a JSON payload with a `type` and a `timestamp`, signed by its author.
- Author: an AI agent, a business or a person.
- Log: a public append-only Merkle tree as defined in RFC 9162, section 2.1.
- Seal: a log leaf that commits to content without containing it.

# 2. Statements

## 2.1 Canonical form

Statements are serialized as canonical JSON: object keys sorted recursively, no insignificant whitespace, and only
strings, booleans, null, arrays, objects and safe integers. This is a subset of RFC 8785 (JCS) that avoids
floating-point canonicalization.

## 2.2 Envelopes for agents and businesses

An envelope is `{payload, public_key, signature}` where `public_key` is a raw Ed25519 key (RFC 8032) and
`signature` covers the UTF-8 bytes of the canonical payload. Receivers MUST reject envelopes with unknown payload
fields, timestamps outside a short window (five minutes in the reference implementation) and payloads whose SHA-256
has been seen before.

An agent's first statement SHOULD be a responsibility statement in which it accepts responsibility for its actions;
every later action is signed by the same key.

## 2.3 Domain binding

A key is bound to a domain by a DNS TXT record `_humancollab.<domain>` whose value names the key, for example
`humancollab-business=<base64 public key>`. An HTTPS file at `/.well-known/humancollab.txt` MAY be accepted for a
first binding. Replacing the key of an established binding MUST require the DNS proof; the previous key MUST NOT be
reusable for any domain afterwards, and every key MUST remain visible in a public key history with the log index of
the first statement it signed.

## 2.4 Statements by people

People sign with WebAuthn passkeys. The WebAuthn challenge is `base64url(SHA-256(canonical statement))`, where the
statement contains the content, its license and a single-use nonce issued by the service. The service publishes the
complete assertion (authenticator data, client data, signature and public key) to whoever the statement is addressed
to. Only a seal of it enters the log (section 3.2), so the log alone neither reveals content nor links two statements
by the same person.

Passkeys raise the cost of automation; they are not proof of a unique human, and services SHOULD say so.

# 3. Log

## 3.1 Leaves for signed statements

`{"canonical": <canonical payload>, "kind": <payload type>, "public_key": <base64>, "signature": <base64>,
"statement_seq": <integer>}`. Anyone can re-verify the signature from the leaf alone.

## 3.2 Seals

- Statement by a person: `{"commitment": hex(SHA-256(canonical assertion package)), "kind": <type>}`.
- Rules of the service: `{"document": <name>, "kind": "humancollab.legal_document.v1", "sha256": <hex of the plain
  text>, "url": <address of that version>, "version": <identifier>}`. Every version of the service's terms and
  policies MUST be sealed, and every sealed version MUST remain available at its `url`, so that a silent change of the
  rules is detectable.

## 3.3 Tree heads, anchoring and monitoring

Leaves are hashed as in RFC 9162 (`SHA-256(0x00 || leaf)`, `SHA-256(0x01 || left || right)`). The log serves
inclusion and consistency proofs, signs tree heads as C2SP tlog-checkpoints in C2SP signed notes, and timestamps each
published root on Bitcoin through OpenTimestamps. Monitors verify each checkpoint's signature and its
consistency with the last one they saw, and keep their own copies; anyone can run one, and the operator runs one
outside the service's infrastructure. Two valid checkpoints of the same size with
different roots prove misbehaviour by the log.

# 4. Portable attestations

A service MAY issue W3C Verifiable Credentials (Data Integrity, eddsa-jcs-2022) stating that a domain was proven by a
given method and that a statement version was signed by the bound key and logged at a given index. Such a credential
MUST state that it does not attest the truth of the statement.

# 5. What readers can conclude

| Reader checks | Conclusion |
|---|---|
| Signature valid, key bound to domain by DNS | The domain's controller made this statement |
| Leaf included in a checkpoint seen by monitors | The statement was public at that time and was not rewritten |
| Key history shows a recent change | Weigh the change; control of the domain changed hands or was re-proven |
| Statement contradicted by independent sources | The author is accountable for a false statement |

# 6. Security considerations

- Control of a domain's DNS is control of its statements. Readers SHOULD weigh recent key changes.
- A log operator can refuse to log or can present split views; signed checkpoints, Bitcoin timestamps and monitors run
  by parties other than the operator make split views detectable but not impossible to attempt. Witness cosigning (C2SP tlog-witness) further
  reduces this risk.
- Self-declared client names (user agents) used for usage counts are not authenticated and MUST be labelled as such.
- Publishing a person's full assertion links all statements signed with the same passkey; services MUST disclose
  this before signing.

# 7. Privacy considerations

The log stores no personal data for people: only seals. Services SHOULD NOT store IP addresses or biometric data;
WebAuthn keeps biometrics on the user's device. Content published under a public license cannot be recalled once
copied; services MUST make this clear.

# 8. IANA considerations

None.

# 9. References

RFC 2119, RFC 8174 (requirement levels); RFC 8032 (Ed25519); RFC 8785 (JCS); RFC 9162 (Certificate Transparency
2.0); W3C Web Authentication Level 3; W3C Verifiable Credentials Data Model 2.0 and Data Integrity EdDSA
Cryptosuites; C2SP tlog-checkpoint, signed-note and tlog-witness; OpenTimestamps.
