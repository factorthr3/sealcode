# Data Processing Agreement: template placeholder

> **Not legal advice and not ready to sign.** This is the structure counsel should complete before
> any customer relies on it (see the legal checks in `docs/BRIEF.md`).

1. **Parties and roles.** The customer is the controller; Sealcode is the processor.
2. **Subject matter and duration.** Providing the Sealcode gateway for the term of the agreement.
3. **Nature and purpose.** Forwarding AI coding requests to TEE-hosted models and returning responses;
   metering, rate limiting and audit logging of request metadata.
4. **Categories of data.**
   - Account data: names, work email addresses, roles.
   - Request metadata: timestamps, key and member identifiers, model, token counts, latency,
     status and receipt IDs.
   - Request content (prompts, code, completions): processed transiently inside TEEs and **never
     stored** by Sealcode.
5. **Categories of data subjects.** The customer's staff and contractors who use Sealcode.
6. **Processor obligations.** Documented instructions only; confidentiality; security measures
   (Annex II); assistance with data subject requests, DPIAs and breach notification; deletion or
   return at the end of the service.
7. **Subprocessors.** The list at `/compliance` (Annex III) and the notification process for changes.
8. **International transfers.** UK IDTA / EU SCCs where a subprocessor is outside the UK/EEA.
9. **Audits.** The public attestation and trust center, questionnaires, and reasonable audits.
10. **Breach notification.** Without undue delay, and in any case within an agreed number of hours.

**Annex II: technical and organisational measures** (from `/security` and `docs/threat-model.md`):
TEE isolation for all components that handle content; TLS terminating inside the CVM; no content
logging, enforced by an allowlist logger and tests; hashed API keys; mandatory two-factor sign-in
for admins; per-org query scoping with tests; reproducible, digest-pinned images; published
attestation.
