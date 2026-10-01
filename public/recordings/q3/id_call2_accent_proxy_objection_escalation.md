# ID – non-Jakarta accent proxy (Malay voice), casual objection, escalation

Market ID · Multifinance (motorcycle financing) · caller voice `Amira` (synthetic) · ASR Whisper-small (indonesian) · bot TTS Damayanti (id_ID)

Recording: [id_call2_accent_proxy_objection_escalation.wav](./id_call2_accent_proxy_objection_escalation.wav) (left = bot, right = caller)

## Transcript

**Bot (formal):** Selamat siang. Saya Sari, asisten virtual dari Dravix Finance. Panggilan ini direkam untuk menjaga kualitas layanan. Apakah saya berbicara dengan Bapak Budi Santoso?
**Caller (ASR):** Ya, betul, saya budi.  
  _scripted: "Iya, betul, saya Budi." · WER 0.25 · ASR 847 ms · detected formal_
**Bot (formal):** Terima kasih, Bapak Budi. Kami ingin mengingatkan bahwa angsuran ke-10 pembiayaan motor Bapak sebesar Rp1.250.000 akan jatuh tempo pada 15 Oktober 2026. Apakah Bapak dapat melakukan pembayaran sebelum tanggal tersebut?  
  _intent identity_confirmed · conf 0.901 · context_
**Caller (ASR):** Waduh mba, gaji saya belum cair, belum bisa bayar.  
  _scripted: "Waduh Mbak, gaji saya belum cair, belum bisa bayar." · WER 0.11 · ASR 1027 ms · detected casual_
**Bot (casual):** Saya ngerti, Pak, lagi berat ya. Biar nggak kena denda, usahakan bayar sebelum tanggal 15. Kalau butuh keringanan atau reschedule, harus lewat petugas kami, Pak. Mau saya sambungkan?  
  _intent objection_no_money · conf 0.93 · cue_
**Caller (ASR):** Ya, sambungkan kepetugas aja.  
  _scripted: "Iya, sambungkan ke petugas saja." · WER 0.80 · ASR 864 ms · detected casual_
**Bot (casual):** Oke, Pak. Saya sambungkan ke petugas kami ya, ditunggu sebentar.  
  _intent escalation · conf 0.9 · cue_

## Result

- Outcome: escalated · escalated: true · ended: true · mean caller WER 0.387
- Reply variants used: formal, casual
