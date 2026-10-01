# Human-assistance request (q1_human_escalation)

Call id: `call_20261001_97bfc5` · Customer voice: macOS `say` Aman (synthetic) · Agent voice: Tara · ASR: Whisper-base (local) · Mean customer WER: 0.333

Recording: [q1_human_escalation.wav](./q1_human_escalation.wav) (stereo: left = agent, right = customer)

## Transcript

**Agent:** Hello, this is Asha, a virtual assistant calling from Dravix Health. This call is recorded for quality and training. You recently asked for a health insurance quote. Is this a good time to talk for about three minutes?
**Customer (ASR):** Yes tell me.  
  _scripted: "Yes, tell me." · WER 0 · ASR 313 ms_
**Agent:** Great, thank you. May I know your full name?  
  _consent · 0.5 ms_
**Customer (ASR):** Neha Kapoor  
  _scripted: "Neha Kapoor." · WER 0 · ASR 303 ms_
**Agent:** Thanks Neha. How old are you?  
  _answer · 0.2 ms_
**Customer (ASR):** 52.  
  _scripted: "Fifty two." · WER 1 · ASR 290 ms_
**Agent:** Who would you like to cover: just yourself, or also your spouse, children or parents?  
  _answer · 0.4 ms_
**Customer (ASR):** I don't want to talk too about, connect mate a real person please.  
  _scripted: "I don't want to talk to a bot, connect me to a real person please." · WER 0.33 · ASR 460 ms_
**Agent:** Of course. I'm connecting you to a licensed human advisor now. I've shared the details you gave me so you won't need to repeat them.  
  _human_request · 0.2 ms_

## Result

- Outcome: **escalated_to_human** · qualification: **incomplete** · plan: - · escalated: true
- Slots: `{"age":52,"name":"Neha Kapoor"}`
- Actions executed: escalation, crm_summary
- Unanswered (handed to advisor): none

## Checks

- ✅ escalated to human
- ✅ escalation webhook/action logged
- ✅ context handed over (CRM summary)
