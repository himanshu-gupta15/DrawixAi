# Q1 – Recorded test calls

_Synthetic caller voices (macOS say) -> local Whisper-base ASR -> agent service -> synthetic agent voice; stereo recordings in public/recordings/q1_

**6/6 calls passed all checks (21/21 checks); mean caller-side ASR WER 0.253.**

| Scenario | Outcome | Qualification | Escalated | Actions | Checks | Caller WER | Recording · transcript |
|---|---|---|---|---|---|---|---|
| Cooperative customer | qualified | qualified | false | callback, lead, crm_summary | ✅ qualified<br>✅ callback scheduled<br>✅ lead created<br>✅ CRM summary written | 0.092 | [wav](../../public/recordings/q1/q1_cooperative.wav) · [md](../../public/recordings/q1/q1_cooperative.md) |
| Objections (employer cover, price) | callback_scheduled | qualified | false | callback, lead, crm_summary | ✅ employer objection answered from KB<br>✅ no invented answer<br>✅ still qualified<br>✅ callback scheduled | 0.157 | [wav](../../public/recordings/q1/q1_objections.wav) · [md](../../public/recordings/q1/q1_objections.md) |
| Incomplete and conflicting details | qualified | qualified | false | callback, lead, crm_summary | ✅ reprompted for missing name<br>✅ asked to resolve conflicting age<br>✅ final age is the confirmed one (34)<br>✅ qualified | 0.367 | [wav](../../public/recordings/q1/q1_incomplete_conflicting.wav) · [md](../../public/recordings/q1/q1_incomplete_conflicting.md) |
| Out-of-scope / unavailable information | qualified | qualified | false | lead, crm_summary | ✅ said information unavailable (IVF)<br>✅ refused other product (car insurance)<br>✅ unanswered questions passed to advisor<br>✅ qualified (parents need Gold+) | 0.212 | [wav](../../public/recordings/q1/q1_out_of_scope.wav) · [md](../../public/recordings/q1/q1_out_of_scope.md) |
| Human-assistance request | escalated_to_human | incomplete | true | escalation, crm_summary | ✅ escalated to human<br>✅ escalation webhook/action logged<br>✅ context handed over (CRM summary) | 0.333 | [wav](../../public/recordings/q1/q1_human_escalation.wav) · [md](../../public/recordings/q1/q1_human_escalation.md) |
| Qualification edge case: condition needing underwriting | callback_scheduled | needs_underwriting | false | callback, lead, crm_summary | ✅ marked needs underwriting (not rejected, no approval promised)<br>✅ callback scheduled | 0.354 | [wav](../../public/recordings/q1/q1_underwriting.wav) · [md](../../public/recordings/q1/q1_underwriting.md) |
