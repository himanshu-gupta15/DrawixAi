# PH – English-leaning Taglish, finance terms, cooperative

Market PH · Life insurance (bancassurance) · caller voice `Samantha` (synthetic) · ASR Whisper-small (tagalog) · bot TTS Damayanti for Tagalog/Taglish, Samantha for English (no fil-PH voice available)

Recording: [ph_call1_taglish_cooperative.wav](./ph_call1_taglish_cooperative.wav) (left = bot, right = caller)

## Transcript

**Bot (taglish):** Good afternoon po! Si Ana po ito, virtual assistant ng Dravix Life, yung insurance partner ng bank ninyo. Recorded po ang call na ito for quality purposes. Si Ma'am Maria Santos po ba ito?
**Caller (ASR):** Yes, this is Maria.  
  _scripted: "Yes, this is Maria." · WER 0.00 · ASR 1450 ms · detected en_
**Bot (en):** Thank you, Ma'am Maria. I'm calling to remind you that the monthly premium of your LifeSecure policy, ₱2,450.00, is due on October 15. Will you be able to pay on or before the due date?  
  _intent identity_confirmed · conf 0.954 · context_
**Caller (ASR):** Okay, Paromagkano NGA Ulajong Premium Co.  
  _scripted: "Okay, pero magkano nga ulit yung premium ko?" · WER 0.63 · ASR 1424 ms · detected taglish_
**Bot (taglish):** Ayos po, salamat! Pwede po kayong magbayad via auto-debit sa bank account n'yo, sa kahit anong branch, or sa GCash o Maya gamit yung policy number n'yo. May iba pa po ba kayong tanong?  
  _intent will_pay · conf 0.855 · context_
**Caller (ASR):** Is there a grace period if I pay late?  
  _scripted: "Is there a grace period if I pay late?" · WER 0.00 · ASR 853 ms · detected en_
**Bot (en):** Yes. You have a 31 day grace period, so your coverage stays active until November 15. After that, the policy may lapse. Is there anything else I can help you with?  
  _intent ask_grace_period · conf 0.958 · cue_
**Caller (ASR):** Saig, I'll pay on Friday.  
  _scripted: "Sige, I'll pay on Friday." · WER 0.20 · ASR 853 ms · detected en_
**Bot (en):** Thank you! You can pay through auto-debit from your bank account, at any partner bank branch, or via GCash or Maya using your policy number. Is there anything else I can help you with?  
  _intent will_pay · conf 0.948 · cue_
**Caller (ASR):** No, that's all. Thank you.  
  _scripted: "No, that's all. Thank you." · WER 0.00 · ASR 825 ms · detected en_
**Bot (en):** Thank you for your time, Ma'am Maria. Take care!  
  _intent deny · conf 0.89 · context_

## Result

- Outcome: will_pay · escalated: false · ended: true · mean caller WER 0.165
- Reply variants used: en, taglish
