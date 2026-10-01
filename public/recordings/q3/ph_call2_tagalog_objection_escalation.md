# PH – Tagalog, can't-afford objection, human escalation

Market PH · Life insurance (bancassurance) · caller voice `Damayanti` (synthetic) · ASR Whisper-small (tagalog) · bot TTS Damayanti for Tagalog/Taglish, Samantha for English (no fil-PH voice available)

Recording: [ph_call2_tagalog_objection_escalation.wav](./ph_call2_tagalog_objection_escalation.wav) (left = bot, right = caller)

## Transcript

**Bot (taglish):** Good afternoon po! Si Ana po ito, virtual assistant ng Dravix Life, yung insurance partner ng bank ninyo. Recorded po ang call na ito for quality purposes. Si Ma'am Maria Santos po ba ito?
**Caller (ASR):** Opo, ako o po si Maria.  
  _scripted: "Opo, ako po si Maria." · WER 0.20 · ASR 874 ms · detected tl_
**Bot (tl):** Salamat po, Ma'am Maria. Tumatawag po ako para ipaalala na ang buwanang premium ng inyong LifeSecure policy na ₱2,450.00 ay dapat mabayaran sa ika-15 ng Oktubre. Makakabayad po ba kayo sa o bago ang due date?  
  _intent identity_confirmed · conf 0.876 · context_
**Caller (ASR):** Walapapu akong perangayon, sasusunot na sahot pa.  
  _scripted: "Wala pa po akong pera ngayon, sa susunod na sahod pa." · WER 0.73 · ASR 1099 ms · detected tl_
**Bot (tl):** Pasensya na po, hindi ko po masyadong naintindihan. Pakiulit po?  
  _intent will_pay · conf 0.831 · fallback_
**Caller (ASR):** Pasensyana po, gipit po ako ngayong buwan.  
  _scripted: "Pasensya na po, gipit po ako ngayong buwan." · WER 0.25 · ASR 1045 ms · detected tl_
**Bot (tl):** Naiintindihan ko po, mahirap talaga kapag gipit. Para hindi po mawala ang proteksyon ng pamilya ninyo, may 31 araw pa po kayong palugit hanggang ika-15 ng Nobyembre. Kung kailangan ninyo ng ibang payment arrangement, puwede ko po kayong i-refer sa licensed advisor. Gusto n'yo po ba?  
  _intent objection_no_money · conf 0.924 · cue_
**Caller (ASR):** Opo, gusto ko po nga kausap ang atvisor.  
  _scripted: "Opo, gusto ko pong makausap ang advisor." · WER 0.57 · ASR 1183 ms · detected tl_
**Bot (tl):** Sige po, ikokonekta ko po kayo sa isang licensed advisor namin. Sandali lang po.  
  _intent escalation · conf 0.911 · cue_

## Result

- Outcome: escalated · escalated: true · ended: true · mean caller WER 0.437
- Reply variants used: tl
