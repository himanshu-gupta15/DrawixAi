# Out-of-scope / unavailable information (q1_out_of_scope)

Call id: `call_20261001_987474` · Customer voice: macOS `say` Rishi (synthetic) · Agent voice: Tara · ASR: Whisper-base (local) · Mean customer WER: 0.212

Recording: [q1_out_of_scope.wav](./q1_out_of_scope.wav) (stereo: left = agent, right = customer)

## Transcript

**Agent:** Hello, this is Asha, a virtual assistant calling from Dravix Health. This call is recorded for quality and training. You recently asked for a health insurance quote. Is this a good time to talk for about three minutes?
**Customer (ASR):** Yes.  
  _scripted: "Yes." · WER 0 · ASR 300 ms_
**Agent:** Great, thank you. May I know your full name?  
  _consent · 0.7 ms_
**Customer (ASR):** Arjun Mehra  
  _scripted: "Arjun Mehta." · WER 0.5 · ASR 315 ms_
**Agent:** Thanks Arjun. How old are you?  
  _answer · 0.3 ms_
**Customer (ASR):** 38.  
  _scripted: "Thirty eight." · WER 1 · ASR 292 ms_
**Agent:** Who would you like to cover: just yourself, or also your spouse, children or parents?  
  _answer · 0.3 ms_
**Customer (ASR):** Me and my parents, my father is seventy.  
  _scripted: "Me and my parents. My father is seventy." · WER 0 · ASR 376 ms_
**Agent:** Which city do you live in?  
  _answer · 0.4 ms_
**Customer (ASR):** Delhi.  
  _scripted: "Delhi." · WER 0 · ASR 306 ms_
**Agent:** Does anyone you want to cover have an existing health condition, like diabetes, blood pressure, thyroid or a heart problem?  
  _answer · 0.2 ms_
**Customer (ASR):** Does the policy cover IVF treatment?  
  _scripted: "Does the policy cover IVF treatment?" · WER 0 · ASR 358 ms_
**Agent:** I'm sorry, I don't have verified information about that, so I won't guess. I can note this question for a licensed advisor to answer when they call you. Coming back to my question: Does anyone you want to cover have an existing health condition, like diabetes, blood pressure, thyroid or a heart problem?  
  _question · not grounded → fallback · 113.8 ms_
**Customer (ASR):** My mother has, thyroid.  
  _scripted: "My mother has thyroid." · WER 0 · ASR 323 ms_
**Agent:** Thank you for sharing that; declaring it protects your future claims. Does anyone to be covered smoke or use tobacco?  
  _answer · 0.2 ms_
**Customer (ASR):** No.  
  _scripted: "No." · WER 0 · ASR 286 ms_
**Agent:** Roughly what premium budget do you have in mind, per month or per year?  
  _answer · 0.4 ms_
**Customer (ASR):** Do you also sell car insurance?  
  _scripted: "Do you also sell car insurance?" · WER 0 · ASR 346 ms_
**Agent:** I can only help with Dravix Health's health insurance plans, so I don't have information on motor insurance. I can note this question for a licensed advisor to answer when they call you. Coming back to my question: Roughly what premium budget do you have in mind, per month or per year?  
  _question · not grounded → fallback · 57.5 ms_
**Customer (ASR):** around 25,000 a year.  
  _scripted: "Around twenty five thousand a year." · WER 0.5 · ASR 339 ms_
**Agent:** Thanks Arjun. Based on what you've told me, you're eligible, and the Platinum plan fits a budget of about ₹25,000 a year. Please note: Pre-existing disease must be declared on the proposal form. Declared PED such as diabetes, hypertension, thyroid disorders and asthma is accepted and covered after a waiting period of 36 months. A free medical check-up at home will be needed. Would you like a licensed advisor to send you a detailed quote and call you back? If yes, what time suits you?  
  _answer · grounded (extractive) · kb_eligibility_004 (underwriting & eligibility rules v2.0) · 48 ms_
**Customer (ASR):** No call back needed. Just email me.  
  _scripted: "No callback needed, just email me." · WER 0.33 · ASR 367 ms_
**Agent:** Thank you Arjun. We'll email your quote summary. Have a great day!  
  _next_step · 0.4 ms_

## Result

- Outcome: **qualified** · qualification: **qualified** · plan: Platinum · escalated: false
- Slots: `{"age":38,"city":"Delhi","name":"Arjun Mehra","budget":{"raw":"25000 a year","annual":25000},"health":{"none":false,"conditions":["thyroid"]},"smoker":false,"members":["self","parents"],"parent_age":70}`
- Actions executed: lead, crm_summary
- Unanswered (handed to advisor): Does the policy cover IVF treatment? | Do you also sell car insurance?

## Checks

- ✅ said information unavailable (IVF)
- ✅ refused other product (car insurance)
- ✅ unanswered questions passed to advisor
- ✅ qualified (parents need Gold+)
