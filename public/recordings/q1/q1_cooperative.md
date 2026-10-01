# Cooperative customer (q1_cooperative)

Call id: `call_20261001_846731` · Customer voice: macOS `say` Rishi (synthetic) · Agent voice: Tara · ASR: Whisper-base (local) · Mean customer WER: 0.092

Recording: [q1_cooperative.wav](./q1_cooperative.wav) (stereo: left = agent, right = customer)

## Transcript

**Agent:** Hello, this is Asha, a virtual assistant calling from Dravix Health. This call is recorded for quality and training. You recently asked for a health insurance quote. Is this a good time to talk for about three minutes?
**Customer (ASR):** Yes, sure, go ahead.  
  _scripted: "Yes, sure, go ahead." · WER 0 · ASR 753 ms_
**Agent:** Great, thank you. May I know your full name?  
  _consent · 0.9 ms_
**Customer (ASR):** My name is Rohan Verma.  
  _scripted: "My name is Rohan Verma." · WER 0 · ASR 380 ms_
**Agent:** Thanks Rohan. How old are you?  
  _answer · 0.9 ms_
**Customer (ASR):** I am 34 years old.  
  _scripted: "I am thirty four years old." · WER 0.33 · ASR 324 ms_
**Agent:** Who would you like to cover: just yourself, or also your spouse, children or parents?  
  _answer · 0.5 ms_
**Customer (ASR):** myself and my wife.  
  _scripted: "Myself and my wife." · WER 0 · ASR 322 ms_
**Agent:** Which city do you live in?  
  _answer · 0.5 ms_
**Customer (ASR):** I live in Pune.  
  _scripted: "I live in Pune." · WER 0 · ASR 343 ms_
**Agent:** Does anyone you want to cover have an existing health condition, like diabetes, blood pressure, thyroid or a heart problem?  
  _answer · 0.4 ms_
**Customer (ASR):** No, nobody has any health problems.  
  _scripted: "No, nobody has any health problems." · WER 0 · ASR 360 ms_
**Agent:** Does anyone to be covered smoke or use tobacco?  
  _answer · 0.5 ms_
**Customer (ASR):** No, we don't smoke.  
  _scripted: "No, we don't smoke." · WER 0 · ASR 327 ms_
**Agent:** Roughly what premium budget do you have in mind, per month or per year?  
  _answer · 0.5 ms_
**Customer (ASR):** around 1500 rupees a month.  
  _scripted: "Around fifteen hundred rupees a month." · WER 0.33 · ASR 335 ms_
**Agent:** Thanks Rohan. Based on what you've told me, you're eligible, and the Platinum plan fits a budget of about ₹18,000 a year. Would you like a licensed advisor to send you a detailed quote and call you back? If yes, what time suits you?  
  _answer · 8.9 ms_
**Customer (ASR):** Yes please, tomorrow at 6 pm.  
  _scripted: "Yes please, tomorrow at six pm." · WER 0.17 · ASR 357 ms_
**Agent:** Thank you Rohan. A licensed advisor will call you tomorrow at 6 pm with your detailed quote. Have a great day!  
  _next_step · 0.7 ms_

## Result

- Outcome: **qualified** · qualification: **qualified** · plan: Platinum · escalated: false
- Slots: `{"age":34,"city":"Pune","name":"Rohan Verma","budget":{"raw":"1500 rupees a month","annual":18000},"health":{"none":true,"conditions":[]},"smoker":false,"members":["self","spouse"]}`
- Actions executed: callback, lead, crm_summary
- Unanswered (handed to advisor): none

## Checks

- ✅ qualified
- ✅ callback scheduled
- ✅ lead created
- ✅ CRM summary written
