# Objections (employer cover, price) (q1_objections)

Call id: `call_20261001_0ab7b5` · Customer voice: macOS `say` Aman (synthetic) · Agent voice: Tara · ASR: Whisper-base (local) · Mean customer WER: 0.157

Recording: [q1_objections.wav](./q1_objections.wav) (stereo: left = agent, right = customer)

## Transcript

**Agent:** Hello, this is Asha, a virtual assistant calling from Dravix Health. This call is recorded for quality and training. You recently asked for a health insurance quote. Is this a good time to talk for about three minutes?
**Customer (ASR):** Yes, okay.  
  _scripted: "Yes, okay." · WER 0 · ASR 291 ms_
**Agent:** Great, thank you. May I know your full name?  
  _consent · 0.7 ms_
**Customer (ASR):** This is Imran Sheikh.  
  _scripted: "This is Imran Shaikh." · WER 0.25 · ASR 316 ms_
**Agent:** Thanks Imran. How old are you?  
  _answer · 0.5 ms_
**Customer (ASR):** I'm 29.  
  _scripted: "I'm twenty nine." · WER 0.67 · ASR 306 ms_
**Agent:** Who would you like to cover: just yourself, or also your spouse, children or parents?  
  _answer · 0.5 ms_
**Customer (ASR):** Just me.  
  _scripted: "Just me." · WER 0 · ASR 283 ms_
**Agent:** Which city do you live in?  
  _answer · 0.4 ms_
**Customer (ASR):** Mumbai.  
  _scripted: "Mumbai." · WER 0 · ASR 275 ms_
**Agent:** Does anyone you want to cover have an existing health condition, like diabetes, blood pressure, thyroid or a heart problem?  
  _answer · 0.5 ms_
**Customer (ASR):** Honestly I already have insurance from my office, why do I need another one?  
  _scripted: "Honestly, I already have insurance from my office, why do I need another one?" · WER 0 · ASR 437 ms_
**Agent:** I understand. Group cover usually ends when you leave or change jobs, often has a lower sum insured, and may not cover parents. A personal policy keeps waiting-period credit building independently of employment. Coming back to my question: Does anyone you want to cover have an existing health condition, like diabetes, blood pressure, thyroid or a heart problem?  
  _objection · grounded (extractive) · kb_objection_002 (sales objection playbook v1.3) · 448.3 ms_
**Customer (ASR):** No health issues.  
  _scripted: "No health issues." · WER 0 · ASR 376 ms_
**Agent:** Does anyone to be covered smoke or use tobacco?  
  _answer · 0.4 ms_
**Customer (ASR):** No.  
  _scripted: "No." · WER 0 · ASR 352 ms_
**Agent:** Roughly what premium budget do you have in mind, per month or per year?  
  _answer · 0.4 ms_
**Customer (ASR):** This sounds too expensive for me.  
  _scripted: "Hmm, this sounds too expensive for me." · WER 0.14 · ASR 383 ms_
**Agent:** I understand. The Silver plan starts at about ₹6,200 a year (roughly ₹520 a month), premiums can be paid in 12 monthly instalments at no extra cost, and premiums qualify for tax deduction under Section 80D. Coming back to my question: Roughly what premium budget do you have in mind, per month or per year?  
  _objection · grounded (extractive) · kb_objection_001 (sales objection playbook v1.3) · 122 ms_
**Customer (ASR):** may be around 800 a month.  
  _scripted: "Maybe around eight hundred a month." · WER 0.67 · ASR 352 ms_
**Agent:** Thanks Imran. Based on what you've told me, you're eligible, and the Silver plan fits a budget of about ₹9,600 a year. Would you like a licensed advisor to send you a detailed quote and call you back? If yes, what time suits you?  
  _answer · 0.9 ms_
**Customer (ASR):** Okay, call me on Saturday morning.  
  _scripted: "Okay, call me on Saturday morning." · WER 0 · ASR 390 ms_
**Agent:** Thank you. I've scheduled a callback for Saturday morning. Have a great day!  
  _callback_request · 0.5 ms_

## Result

- Outcome: **callback_scheduled** · qualification: **qualified** · plan: Silver · escalated: false
- Slots: `{"age":29,"city":"Mumbai","name":"Imran Sheikh","budget":{"raw":"800 a month","annual":9600},"health":{"none":true,"conditions":[]},"smoker":false,"members":["self"]}`
- Actions executed: callback, lead, crm_summary
- Unanswered (handed to advisor): none

## Checks

- ✅ employer objection answered from KB
- ✅ no invented answer
- ✅ still qualified
- ✅ callback scheduled
