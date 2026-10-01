# ID – formal register, penalty question, loanwords

Market ID · Multifinance (motorcycle financing) · caller voice `Damayanti` (synthetic) · ASR Whisper-small (indonesian) · bot TTS Damayanti (id_ID)

Recording: [id_call1_formal_loanwords.wav](./id_call1_formal_loanwords.wav) (left = bot, right = caller)

## Transcript

**Bot (formal):** Selamat siang. Saya Sari, asisten virtual dari Dravix Finance. Panggilan ini direkam untuk menjaga kualitas layanan. Apakah saya berbicara dengan Bapak Budi Santoso?
**Caller (ASR):** Ya, benar, dengan saya sendiri.  
  _scripted: "Ya, benar, dengan saya sendiri." · WER 0.00 · ASR 915 ms · detected formal_
**Bot (formal):** Terima kasih, Bapak Budi. Kami ingin mengingatkan bahwa angsuran ke-10 pembiayaan motor Bapak sebesar Rp1.250.000 akan jatuh tempo pada 15 Oktober 2026. Apakah Bapak dapat melakukan pembayaran sebelum tanggal tersebut?  
  _intent identity_confirmed · conf 0.965 · context_
**Caller (ASR):** Kalau saya telat bayar, dendanya berapa?  
  _scripted: "Kalau saya telat bayar, dendanya berapa?" · WER 0.00 · ASR 926 ms · detected formal_
**Bot (formal):** Jika pembayaran melewati jatuh tempo, akan dikenakan denda keterlambatan sebesar 0,5% per hari dari nilai angsuran, yaitu Rp6.250 per hari. Apakah ada hal lain yang bisa saya bantu?  
  _intent ask_penalty · conf 0.911 · cue_
**Caller (ASR):** Baik, saya akan transfer lewat virtual account sebelum jatuh tempoh.  
  _scripted: "Baik, saya akan transfer lewat virtual account sebelum jatuh tempo." · WER 0.10 · ASR 1061 ms · detected formal_
**Bot (formal):** Terima kasih, Bapak. Pembayaran dapat dilakukan melalui virtual account, aplikasi Dravix Finance, gerai Indomaret atau Alfamart, maupun kantor cabang kami. Apakah ada hal lain yang bisa saya bantu?  
  _intent will_pay · conf 0.861 · cue_
**Caller (ASR):** Tidak ada, terima kasih.  
  _scripted: "Tidak ada, terima kasih." · WER 0.00 · ASR 855 ms · detected formal_
**Bot (formal):** Terima kasih atas waktunya, Bapak Budi. Selamat siang.  
  _intent deny · conf 0.937 · context_

## Result

- Outcome: will_pay · escalated: false · ended: true · mean caller WER 0.025
- Reply variants used: formal
