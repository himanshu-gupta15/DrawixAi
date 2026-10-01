# Qualification edge case: condition needing underwriting (q1_underwriting)

Call id: `call_20261001_78be4d` · Customer voice: macOS `say` Samantha (synthetic) · Agent voice: Tara · ASR: Whisper-base (local) · Mean customer WER: 0.354

Recording: [q1_underwriting.wav](./q1_underwriting.wav) (stereo: left = agent, right = customer)

## Transcript

**Agent:** Hello, this is Asha, a virtual assistant calling from Dravix Health. This call is recorded for quality and training. You recently asked for a health insurance quote. Is this a good time to talk for about three minutes?
**Customer (ASR):** Sure.  
  _scripted: "Sure." · WER 0 · ASR 291 ms_
**Agent:** Great, thank you. May I know your full name?  
  _consent · 0.4 ms_
**Customer (ASR):** Kavita Rao  
  _scripted: "Kavita Rao." · WER 0 · ASR 321 ms_
**Agent:** Thanks Kavita. How old are you?  
  _answer · 0.3 ms_
**Customer (ASR):** I'm 50.  
  _scripted: "I'm fifty." · WER 0.5 · ASR 326 ms_
**Agent:** Who would you like to cover: just yourself, or also your spouse, children or parents?  
  _answer · 0.5 ms_
**Customer (ASR):** Only me.  
  _scripted: "Only me." · WER 0 · ASR 298 ms_
**Agent:** Which city do you live in?  
  _answer · 0.3 ms_
**Customer (ASR):** Hi, Draved.  
  _scripted: "Hyderabad." · WER 2 · ASR 330 ms_
**Agent:** Does anyone you want to cover have an existing health condition, like diabetes, blood pressure, thyroid or a heart problem?  
  _answer · 0.4 ms_
**Customer (ASR):** Yes, I had a heart bypass surgery last year.  
  _scripted: "Yes, I had a heart bypass surgery last year." · WER 0 · ASR 384 ms_
**Agent:** Thank you for sharing that; declaring it protects your future claims. Does anyone to be covered smoke or use tobacco?  
  _answer · 0.2 ms_
**Customer (ASR):** No.  
  _scripted: "No." · WER 0 · ASR 285 ms_
**Agent:** Roughly what premium budget do you have in mind, per month or per year?  
  _answer · 0.4 ms_
**Customer (ASR):** around 20,000 a year.  
  _scripted: "Around twenty thousand a year." · WER 0.4 · ASR 338 ms_
**Agent:** Thanks Kavita. Because of the bypass history, an underwriter has to review the application, so I can't confirm approval on this call, but an advisor can take it forward. A free medical check-up at home will be needed. Would you like a licensed advisor to send you a detailed quote and call you back? If yes, what time suits you?  
  _answer · 0.6 ms_
**Customer (ASR):** Yes, call me tomorrow at 5pm.  
  _scripted: "Yes, call me tomorrow at five pm." · WER 0.29 · ASR 364 ms_
**Agent:** Thank you. I've scheduled a callback for tomorrow at 5pm. Have a great day!  
  _callback_request · 0.3 ms_

## Result

- Outcome: **callback_scheduled** · qualification: **needs_underwriting** · plan: Platinum · escalated: false
- Slots: `{"age":50,"city":"Hi Draved","name":"Kavita Rao","budget":{"raw":"20000 a year","annual":20000},"health":{"none":false,"conditions":["bypass"]},"smoker":false,"members":["self"]}`
- Actions executed: callback, lead, crm_summary
- Unanswered (handed to advisor): none

## Checks

- ✅ marked needs underwriting (not rejected, no approval promised)
- ✅ callback scheduled
