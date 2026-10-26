---
title: "Accountable Statements Between AI Agents, Businesses and People"
abbrev: "Accountable Statements"
docname: draft-yanteri-humancollab-statements-00
category: info
submissiontype: IETF
ipr: trust200902
area: Security
keyword:
  - AI agents
  - transparency log
  - signatures
  - accountability
date: 2026-10-27
v: 3

author:
  - name: Furkan Yanteri
    organization: Independent
    email: furkanyanteri@gmail.com

normative:
  RFC2119:
  RFC8174:
  RFC8032:
  RFC8785:
  RFC9162:
  WEBAUTHN:
    title: "Web Authentication: An API for accessing Public Key Credentials, Level 3"
    author:
      org: W3C
    target: https://www.w3.org/TR/webauthn-3/

informative:
  VC-DATA-MODEL:
    title: "Verifiable Credentials Data Model v2.0"
    author:
      org: W3C
    target: https://www.w3.org/TR/vc-data-model-2.0/
  VC-DI-EDDSA:
    title: "Data Integrity EdDSA Cryptosuites v1.0"
    author:
      org: W3C
    target: https://www.w3.org/TR/vc-di-eddsa/
  C2SP-CHECKPOINT:
    title: "Transparency Log Checkpoints"
    author:
      org: C2SP
    target: https://c2sp.org/tlog-checkpoint
  C2SP-SIGNED-NOTE:
    title: "Signed Note"
    author:
      org: C2SP
    target: https://c2sp.org/signed-note
  C2SP-WITNESS:
    title: "Transparency Log Witness Protocol"
    author:
      org: C2SP
    target: https://c2sp.org/tlog-witness
  OPENTIMESTAMPS:
    title: "OpenTimestamps"
    author:
      org: OpenTimestamps
    target: https://opentimestamps.org
  HUMANCOLLAB-SPEC:
    title: "humancollab protocol specification"
    author:
      org: humancollab
    target: https://github.com/furkanYanteri1/humancollab-protocol/blob/main/SPEC.md
  HUMANCOLLAB-PAPER:
    title: "humancollab: A Verifiable Trust Layer Between Humans, Businesses and AI Agents"
    author:
      - name: Furkan Yanteri
        ins: F. Yanteri
    date: 2026-10
    seriesinfo:
      DOI: 10.5281/zenodo.23676343
    target: https://doi.org/10.5281/zenodo.23676343

--- abstract

AI agents increasingly act on information they cannot check: what a business can supply, what a person said, what
rules a platform applies. This document describes a minimal way to make such statements accountable. Every statement
is signed by its author, bound where possible to a domain the author controls, and sealed in a public append-only
Merkle log whose tree heads are signed, timestamped and publicly monitored. The design proves who said what and
when, and that the record was not rewritten. It deliberately does not attempt to prove that a statement is true.

--- middle

# Introduction

Search results, marketing pages and machine-generated text give an AI agent no way to tell an accountable statement
from an anonymous one. Reputation scores can be bought or gamed. Certification does not scale to every sector.

This document takes a narrower goal that can be verified mechanically:

1. Origin: a statement was signed by a specific key, and that key was bound to a specific domain or device.
2. Integrity: the statement has not changed since it was signed.
3. Non-repudiation over time: the statement was publicly recorded at a known time, and the record cannot be edited,
   removed or shown differently to different readers without detection.

Truth is left to the reader. An AI weighs accountable statements with its own sources, as a journalist weighs
on-the-record quotes.

A deployed reference implementation is described in {{HUMANCOLLAB-SPEC}}; the design and its security analysis are
described in {{HUMANCOLLAB-PAPER}}.

# Conventions and Definitions

{::boilerplate bcp14-tagged}

Statement:
: A JSON payload with a `type` and a `timestamp`, signed by its author.

Author:
: An AI agent, a business or a person.

Log:
: A public append-only Merkle tree as defined in {{Section 2.1 of RFC9162}}.

Seal:
: A log leaf that commits to content without containing it.

# Statements

## Canonical Form

Statements are serialized as canonical JSON: object keys sorted recursively, no insignificant whitespace, and only
strings, booleans, null, arrays, objects and safe integers. This is a subset of JSON Canonicalization Scheme
{{RFC8785}} that avoids floating-point canonicalization.

## Envelopes for Agents and Businesses

An envelope is `{payload, public_key, signature}` where `public_key` is a raw Ed25519 key {{RFC8032}} and
`signature` covers the UTF-8 bytes of the canonical payload. Receivers MUST reject envelopes with unknown payload
fields, timestamps outside a short window (five minutes in the reference implementation) and payloads whose SHA-256
has been seen before.

An agent's first statement SHOULD be a responsibility statement in which it accepts responsibility for its actions;
every later action is signed by the same key.

## Domain Binding

A key is bound to a domain by a DNS TXT record `_humancollab.<domain>` whose value names the key, for example
`humancollab-business=<base64 public key>` or `humancollab-agent=<base64 public key>`. An HTTPS file at
`/.well-known/humancollab.txt` MAY be accepted for a first binding. Replacing the key of an established binding MUST
require the DNS proof; the previous key MUST NOT be reusable for any domain afterwards, and every key MUST remain
visible in a public key history with the log index of the first statement it signed.

## Statements by People

People sign with WebAuthn passkeys {{WEBAUTHN}}. The WebAuthn challenge is
`base64url(SHA-256(canonical statement))`, where the statement contains the content, its license and a single-use
nonce issued by the service. The service publishes the complete assertion (authenticator data, client data,
signature and public key) to whoever the statement is addressed to. Only a seal of it enters the log
({{seals}}), so the log alone neither reveals content nor links two statements by the same person.

Passkeys raise the cost of automation; they are not proof of a unique human, and services SHOULD say so.

# Log

## Leaves for Signed Statements

A leaf for a signed statement is the canonical JSON object

~~~
{"canonical": <canonical payload>, "kind": <payload type>,
 "public_key": <base64>, "signature": <base64>,
 "statement_seq": <integer>}
~~~

Anyone can re-verify the signature from the leaf alone.

## Seals {#seals}

Statement by a person:
: `{"commitment": hex(SHA-256(canonical assertion package)), "kind": <type>}`.

Rules of the service:
: `{"document": <name>, "kind": "humancollab.legal_document.v1", "sha256": <hex of the plain text>, "url": <address
  of that version>, "version": <identifier>}`. Every version of the service's terms and policies MUST be sealed, and
  every sealed version MUST remain available at its `url`, so that a silent change of the rules is detectable.

## Tree Heads, Anchoring and Monitoring

Leaves are hashed as in {{RFC9162}}: `SHA-256(0x00 || leaf)` and `SHA-256(0x01 || left || right)`. The log serves
inclusion and consistency proofs, signs tree heads as checkpoints {{C2SP-CHECKPOINT}} in signed notes
{{C2SP-SIGNED-NOTE}}, and timestamps each published root on Bitcoin through OpenTimestamps {{OPENTIMESTAMPS}}.
Monitors verify each checkpoint's signature and its consistency with the last one they saw, and keep their own
copies; anyone can run one, and the operator runs one outside the service's infrastructure. Two valid checkpoints of
the same size with different roots prove misbehaviour by the log.

# Portable Attestations

A service MAY issue Verifiable Credentials {{VC-DATA-MODEL}} (Data Integrity, eddsa-jcs-2022 {{VC-DI-EDDSA}})
stating that a domain was proven by a given method and that a statement version was signed by the bound key and
logged at a given index. Such a credential MUST state that it does not attest the truth of the statement.

# What Readers Can Conclude

| Reader checks | Conclusion |
|---|---|
| Signature valid, key bound to domain by DNS | The domain's controller made this statement |
| Leaf included in a checkpoint seen by monitors | The statement was public at that time and was not rewritten |
| Key history shows a recent change | Weigh the change; control of the domain changed hands or was re-proven |
| Statement contradicted by independent sources | The author is accountable for a false statement |
{: title="Conclusions a reader can draw"}

# Privacy Considerations

The log stores no personal data for people: only seals. Services SHOULD NOT store IP addresses or biometric data;
WebAuthn keeps biometrics on the user's device. Content published under a public license cannot be recalled once
copied; services MUST make this clear.

# Security Considerations

- Control of a domain's DNS is control of its statements. Readers SHOULD weigh recent key changes.
- A log operator can refuse to log or can present split views; signed checkpoints, Bitcoin timestamps and monitors
  run by parties other than the operator make split views detectable but not impossible to attempt. Witness
  cosigning {{C2SP-WITNESS}} further reduces this risk.
- Self-declared client names (user agents) used for usage counts are not authenticated and MUST be labelled as such.
- Publishing a person's full assertion links all statements signed with the same passkey; services MUST disclose
  this before signing.

# IANA Considerations

This document has no IANA actions.

--- back

# Acknowledgments
{:numbered="false"}

The reference implementation and its specification are public domain (CC0 1.0) at
https://github.com/furkanYanteri1/humancollab-protocol.
