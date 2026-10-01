# Q3 – Measured results (generated)

## Conversation tests (language/register detection, intent, in-language replies, escalation)

- Held-out v2 (clean): **71/75 checks passed**
- Held-out v1, first run (before general fixes): 83/98
- Same set after the fixes (now a development set): 97/98

Failed checks in held-out v2:

- ID "Baik, terima kasih atas informasinya. Sudah cukup." → intent ∈ {deny} (got fallback)
- ID "Baik, terima kasih atas informasinya. Sudah cukup." → call ended
- ID "Wis tak transfer mau esuk, Mbak." → intent ∈ {already_paid} (got will_pay)
- ID "Mbak, kalau mau kredit mobil baru di sini bunganya berapa?" → intent ∈ {fallback} (got ask_amount)

## Recorded calls (2 per market)

| Call | Outcome | Mean caller WER | Recording · transcript |
|---|---|---|---|
| PH – English-leaning Taglish, finance terms, cooperative | will_pay | 0.165 | [wav](../../public/recordings/q3/ph_call1_taglish_cooperative.wav) · [md](../../public/recordings/q3/ph_call1_taglish_cooperative.md) |
| PH – Tagalog, can't-afford objection, human escalation | escalated | 0.437 | [wav](../../public/recordings/q3/ph_call2_tagalog_objection_escalation.wav) · [md](../../public/recordings/q3/ph_call2_tagalog_objection_escalation.md) |
| ID – formal register, penalty question, loanwords | will_pay | 0.025 | [wav](../../public/recordings/q3/id_call1_formal_loanwords.wav) · [md](../../public/recordings/q3/id_call1_formal_loanwords.md) |
| ID – non-Jakarta accent proxy (Malay voice), casual objection, escalation | escalated | 0.387 | [wav](../../public/recordings/q3/id_call2_accent_proxy_objection_escalation.wav) · [md](../../public/recordings/q3/id_call2_accent_proxy_objection_escalation.md) |

## ASR (Whisper, local) on synthesized speech

_Speech is synthesized by macOS voices, not recorded from native speakers; WER on real phone audio will be higher. The Malay voice is only a proxy for a non-Jakarta accent._

| Market · voice · model · forced language | Mean WER | Mean latency (ms) |
|---|---|---|
| PH | Samantha | whisper-base | tagalog | 0.548 | 544 |
| PH | Samantha | whisper-base | english | 0.722 | 429 |
| PH | Samantha | whisper-small | tagalog | 0.624 | 1234 |
| PH | Samantha | whisper-small | english | 0.692 | 1000 |
| PH | Damayanti | whisper-base | tagalog | 0.648 | 414 |
| PH | Damayanti | whisper-base | english | 11.656 | 1486 |
| PH | Damayanti | whisper-small | tagalog | 0.408 | 974 |
| PH | Damayanti | whisper-small | english | 0.688 | 923 |
| ID | Damayanti | whisper-base | indonesian | 0.546 | 468 |
| ID | Damayanti | whisper-base | english | 0.862 | 478 |
| ID | Damayanti | whisper-small | indonesian | 0.324 | 1030 |
| ID | Damayanti | whisper-small | english | 0.722 | 1001 |
| ID | Amira | whisper-base | indonesian | 0.656 | 477 |
| ID | Amira | whisper-base | english | 0.92 | 425 |
| ID | Amira | whisper-small | indonesian | 0.54 | 1050 |
| ID | Amira | whisper-small | english | 0.908 | 969 |

Per category (whisper-small, market language forced):

| Market · voice · category | Mean WER |
|---|---|
| PH | Samantha | tagalog | 0.895 |
| PH | Samantha | taglish | 0.665 |
| PH | Samantha | english | 0 |
| PH | Damayanti | tagalog | 0.555 |
| PH | Damayanti | taglish | 0.465 |
| PH | Damayanti | english | 0 |
| ID | Damayanti | formal | 0.2 |
| ID | Damayanti | casual | 0.1 |
| ID | Damayanti | loanwords | 0.56 |
| ID | Damayanti | regional_javanese_lexical | 0.38 |
| ID | Damayanti | regional_medan_lexical | 0.38 |
| ID | Amira | formal | 0.2 |
| ID | Amira | casual | 0.2 |
| ID | Amira | loanwords | 0.67 |
| ID | Amira | regional_javanese_lexical | 0.63 |
| ID | Amira | regional_medan_lexical | 1 |

Every utterance (reference vs hypothesis):

| Market | Voice | Model | Lang | Reference | Hypothesis | WER |
|---|---|---|---|---|---|---|
| PH | Samantha | small | tagalog | Opo, babayaran ko po bago mag-due date. | Apo, ba bae arang ko po bae go magdue date. | 0.88 |
| PH | Samantha | small | english | Opo, babayaran ko po bago mag-due date. | Apo, Babayaran Koppu Begumagdu date. | 0.75 |
| PH | Samantha | small | tagalog | Wala pa po akong pera ngayon, sa susunod na sahod pa. | Walapapo akong parang gayan, sayes na sunod na sa hod pa. | 0.91 |
| PH | Samantha | small | english | Wala pa po akong pera ngayon, sa susunod na sahod pa. | Walapapohakumparangayun, say se sunid nasahid pa. | 0.91 |
| PH | Samantha | small | tagalog | Pwede ba akong magbayad thru GCash this Friday? | Weed ba akong magbayod through G-Cash this Friday? | 0.63 |
| PH | Samantha | small | english | Pwede ba akong magbayad thru GCash this Friday? | Weed Baak and Mag Bayad through G Cash this Friday. | 1 |
| PH | Samantha | small | tagalog | Ano mangyayari sa coverage ko pag nag-lapse yung policy? | Ano Mangayari say coverage copagnag laps young policy? | 0.7 |
| PH | Samantha | small | english | Ano mangyayari sa coverage ko pag nag-lapse yung policy? | Anomangayari say coverage copagnag laps young policy. | 0.8 |
| PH | Samantha | small | tagalog | Can I change the beneficiary of my policy? | Can I change the beneficiary of my policy? | 0 |
| PH | Samantha | small | english | Can I change the beneficiary of my policy? | Can I change the beneficiary of my policy? | 0 |
| PH | Damayanti | small | tagalog | Opo, babayaran ko po bago mag-due date. | Opo, babayaran ko po bago ma'yudete. | 0.38 |
| PH | Damayanti | small | english | Opo, babayaran ko po bago mag-due date. | Opo, Babayaran Ko Po Baguoma, Judith | 0.5 |
| PH | Damayanti | small | tagalog | Wala pa po akong pera ngayon, sa susunod na sahod pa. | Walapapu akong perangayon, sasusunot na sahot pa. | 0.73 |
| PH | Damayanti | small | english | Wala pa po akong pera ngayon, sa susunod na sahod pa. | Wala Papua Kong Perangayon, Sasu Sunotna Sahodpa | 0.91 |
| PH | Damayanti | small | tagalog | Pwede ba akong magbayad thru GCash this Friday? | Wede ba akong magbaya true gay cash this Friday. | 0.63 |
| PH | Damayanti | small | english | Pwede ba akong magbayad thru GCash this Friday? | We are going to pay you back in cash this Friday. | 1.13 |
| PH | Damayanti | small | tagalog | Ano mangyayari sa coverage ko pag nag-lapse yung policy? | ano mangyayari sa coverage ko pa na lapse yung palesi. | 0.3 |
| PH | Damayanti | small | english | Ano mangyayari sa coverage ko pag nag-lapse yung policy? | I am going to ask you to cover the policy. | 0.9 |
| PH | Damayanti | small | tagalog | Can I change the beneficiary of my policy? | Can I change the beneficiary of my policy? | 0 |
| PH | Damayanti | small | english | Can I change the beneficiary of my policy? | Can I change the beneficiary of my policy? | 0 |
| ID | Damayanti | small | indonesian | Baik, saya akan membayar angsuran sebelum tanggal lima belas Oktober. | Baik, saya akan membayar angsuran sebelum tanggal 15 Oktober. | 0.2 |
| ID | Damayanti | small | english | Baik, saya akan membayar angsuran sebelum tanggal lima belas Oktober. | Okay, I will pay the bill before 15 October. | 1 |
| ID | Damayanti | small | indonesian | Waduh Mbak, gaji gue belum cair, nanti aja ya bayarnya. | Waduh mba, gaji gue belum cair, nanti aja ya bayarnya. | 0.1 |
| ID | Damayanti | small | english | Waduh Mbak, gaji gue belum cair, nanti aja ya bayarnya. | Waduh Mba, Gaji Gwee Belum Chair, Nanti Ajaya Bayarnya. | 0.5 |
| ID | Damayanti | small | indonesian | Kalau telat, late fee-nya berapa? Bisa reschedule nggak? | Kalau telat, latviannya berapa, bisa reschedulenga? | 0.56 |
| ID | Damayanti | small | english | Kalau telat, late fee-nya berapa? Bisa reschedule nggak? | If later, how late the V will be, can you wait? | 1.11 |
| ID | Damayanti | small | indonesian | Durung ono duit, Mbak. Mengko tak bayar nggih. | Durung ono duit, Mbak, mengkota bayar nge. | 0.38 |
| ID | Damayanti | small | english | Durung ono duit, Mbak. Mengko tak bayar nggih. | Durung ono duit, ma, mengkota bayar ngih. | 0.5 |
| ID | Damayanti | small | indonesian | Bah, kek mana lah, awak belum gajian, lae. | Bah, ketmanalah, awak belum gajian, lae. | 0.38 |
| ID | Damayanti | small | english | Bah, kek mana lah, awak belum gajian, lae. | Bah, ket manalah, awak belum gajian, lai. | 0.5 |
| ID | Amira | small | indonesian | Baik, saya akan membayar angsuran sebelum tanggal lima belas Oktober. | Baik, saya akan membayar angsuran sebelum tanggal 15 Oktober. | 0.2 |
| ID | Amira | small | english | Baik, saya akan membayar angsuran sebelum tanggal lima belas Oktober. | Okay, I will pay the bill before 15 October. | 1 |
| ID | Amira | small | indonesian | Waduh Mbak, gaji gue belum cair, nanti aja ya bayarnya. | Waduh mba, gaji gue belum cair, nanti aja ya bayannya. | 0.2 |
| ID | Amira | small | english | Waduh Mbak, gaji gue belum cair, nanti aja ya bayarnya. | Wado mba ga jigwe belom chai nanti a jaya bayanya. | 0.9 |
| ID | Amira | small | indonesian | Kalau telat, late fee-nya berapa? Bisa reschedule nggak? | Kalautelah, le, fi, nya berapa, bisa reschedulim gra. | 0.67 |
| ID | Amira | small | english | Kalau telat, late fee-nya berapa? Bisa reschedule nggak? | If later, Lea, Fiamia, Berapa, Bissaris, Cedulem Gra | 0.89 |
| ID | Amira | small | indonesian | Durung ono duit, Mbak. Mengko tak bayar nggih. | Durung ono duit mba mengkota bayang gih. | 0.63 |
| ID | Amira | small | english | Durung ono duit, Mbak. Mengko tak bayar nggih. | Durung ono dui mba mengkota bayang ghi. | 0.75 |
| ID | Amira | small | indonesian | Bah, kek mana lah, awak belum gajian, lae. | Ba, kemanalah, awat belom gajian, lah ye. | 1 |
| ID | Amira | small | english | Bah, kek mana lah, awak belum gajian, lae. | Bye. | 1 |
