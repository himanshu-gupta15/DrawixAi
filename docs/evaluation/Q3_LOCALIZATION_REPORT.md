# Q3 – Native-language voice bots: configuration, localization and findings

Measured numbers are in [Q3_RESULTS.md](./Q3_RESULTS.md), which is generated from `q3-tests*.json`, `q3-asr.json` and `q3-calls.json`.

## 1. Use cases

| | Philippines | Indonesia |
|---|---|---|
| Sector | Life insurance, bancassurance (policy referred by a partner bank) | Multifinance (motorcycle financing, *pembiayaan motor*) |
| Flow | Premium reminder and lapse prevention, beneficiary/rider questions, bank-referral question | Installment (*angsuran/cicilan*) reminder with collections support: penalty, tenor, DP, early settlement, restructuring request |
| Languages | English, Tagalog/Filipino, Taglish | Formal and casual Bahasa Indonesia, English finance loanwords, regional speakers (Javanese ngoko/krama, Sundanese, Medan) |
| Terms used | premium, policy, beneficiary, rider, lapse, coverage, bank referral, grace period, reinstatement | cicilan, angsuran, tenor, denda, DP, jatuh tempo, pembiayaan, pelunasan, keringanan, restrukturisasi |
| Config | `data/markets/ph.json` | `data/markets/id.json` |

## 2. Configuration per market

| | PH | ID |
|---|---|---|
| Browser ASR (live demo) | Web Speech API, locale `fil-PH` | Web Speech API, locale `id-ID` |
| Server ASR (tests, recorded calls) | Whisper-small (local ONNX), language forced to `tagalog` | Whisper-small, language forced to `indonesian` |
| TTS (browser) | `fil-PH` → `en-PH` → `en-US` fallback chain | `id-ID` |
| TTS (recorded calls) | macOS `Damayanti` (id_ID) for Tagalog/Taglish replies, `Samantha` (en_US) for English replies; **no Filipino voice is installed** | macOS `Damayanti` (id_ID, native) |
| Number/amount handling for TTS | `₱2,450.00` → "2,450 pesos" (English numbers, as people actually say amounts) | `Rp1.250.000` → "satu juta dua ratus lima puluh ribu rupiah", `0,5%` → "nol koma lima persen", `ke-10` → "kesepuluh" |
| Dates | Taglish/English: "October 15"; formal Tagalog variant: "ika-15 ng Oktubre" | "15 Oktober 2026" (formal), "tanggal 15" (casual) |
| Politeness | *po/opo*, *kayo/ninyo*, "Ma'am Maria" in every variant | *Bapak/Pak*; never *lo/gue* even with casual callers; *nggih* mirrored for Javanese speakers in the casual register |

**Untested (stated plainly).** The browser `fil-PH`/`id-ID` Web Speech recognisers and browser voices depend on the user's browser and OS. They are wired up and selectable in `/multilingual`, but I could not run them with a real human voice in this environment. All ASR numbers below come from local Whisper on synthesized speech.

## 3. Localization examples (not literal translation)

Shown live in `/multilingual` from `data/markets/localization-examples.json`.

| Market | Aspect | Literal translation (avoided) | What the bot says | Why |
|---|---|---|---|---|
| PH | Code-switching register | "Ang inyong buwanang hulog para sa patakaran ng seguro ay dapat bayaran." | "Yung monthly premium ng LifeSecure policy n'yo na ₱2,450.00 ay due na sa October 15." | Filipino customers say *premium/policy/due* in English inside Tagalog sentences; "patakaran ng seguro" sounds machine-made |
| PH | Dates & amounts | "ika-15 ng Oktubre, dalawang libo apat na raan…" | "October 15", "₱2,450.00" spoken as "2,450 pesos"; the formal Tagalog variant only uses "ika-15 ng Oktubre" | Everyday speech uses English months and English numbers for money |
| PH | Politeness | "Gusto mo bang magbayad?" | "Makakapagbayad po ba kayo on or before the due date?" | Service register needs *po* and plural-respectful *kayo* |
| PH | Objection (lapse) | "Kung hindi ka magbabayad, ang iyong polisiya ay mawawalan ng bisa." | "Gets ko po, Ma'am, mahirap talaga pag gipit. Para tuloy-tuloy pa rin ang coverage ng family n'yo, may 31-day grace period pa po kayo…" | Empathy first, frames the payment around family and beneficiary, uses the real grace rule rather than a threat |
| ID | Register mirroring | "Pembayaran cicilan Anda jatuh tempo." | Formal: "angsuran ke-10 … sebesar Rp1.250.000 akan jatuh tempo pada 15 Oktober 2026"; casual: "cicilan motor yang ke-10 … jatuh temponya tanggal 15" | "Anda" is stiff on calls; the bot mirrors register but stays polite |
| ID | Amounts for TTS | "Rp 1,250,000.00" | "Rp1.250.000" → spoken in words | Indonesian separators, and TTS misreads "Rp" |
| ID | Collections tone | "Anda harus membayar sekarang atau akan dikenakan denda." | "Saya ngerti, Pak, lagi berat ya. Biar nggak kena denda, usahakan bayar sebelum tanggal 15. Kalau butuh keringanan atau reschedule, harus lewat petugas kami." | No pressure (OJK consumer-protection expectations); restructuring is routed to a human, never promised |
| ID | Regional speakers | (none) | Javanese ngoko → casual reply + *nggih*; krama → formal; Sundanese/Medan no-money phrasings are recognised as the objection | Non-Jakarta callers are understood instead of getting a fallback |

## 4. Code-switching behaviour

- **Detection** (`lib/multilingual/lang.ts`). PH counts Tagalog vs English words. An utterance is `tl` or `en` only if ≥ 85 % of the marked words are in that language, otherwise it's `taglish`. Finance loanwords (premium, policy, DP, transfer, virtual account…) are **excluded** from the English count, because they're native vocabulary in both markets. ID scores formal vs casual markers, krama vs ngoko Javanese, and Sundanese/Medan markers.
- **Reply language** is sticky. It changes only on confident evidence (≥ 2 marked words), so "Opo." doesn't flip a Taglish call, and a loanword doesn't trigger English. The held-out tests check that a non-English caller never gets an English reply variant.
- **ASR and code-switching (measured).** Forcing the *market* language works far better than forcing English on mixed speech (whisper-small: PH 0.41 vs 0.69 WER with the Indonesian voice; ID 0.32 vs 0.72). Worse, forcing English on Indonesian makes Whisper **translate** instead of transcribe: "Baik, saya akan membayar angsuran sebelum tanggal lima belas Oktober" → "Okay, I will pay the bill before 15 October." transformers.js Whisper has no automatic language ID (it silently defaults to English), so the language must be configured per market or per call.
- **Mid-word code-switches are the weak spot.** "late fee-nya" → "latviannya", "reschedule nggak" → "reschedulenga" (ID loanwords category: WER 0.56–0.67); "mag-due date" → "ma'yudete" (PH).

## 5. ASR quality summary (Whisper, synthesized speech)

| Configuration (whisper-small, market language) | Mean WER |
|---|---|
| ID native voice (Damayanti) – all categories | 0.324 |
| ID accent proxy (Amira, Malay voice) – all categories | 0.540 |
| PH, Tagalog/Taglish read by the Indonesian voice | 0.408 |
| PH, Tagalog/Taglish read by the US-English voice | 0.624 |
| Pure English sentence (both PH voices) | 0.000 |

Whisper-base is about 2× faster (≈ 0.45 s vs ≈ 1.0 s per utterance on an Apple M4) but less accurate (ID native 0.55). WER is inflated slightly by numerals: the reference "lima belas" vs the hypothesis "15" counts as errors.

**Observed errors**

- Tagalog word merging: "Wala pa po akong pera ngayon" → "Walapapu akong perangayon".
- English-voice phonetics on Tagalog: "Opo, babayaran ko po" → "Apo, ba bae arang ko po".
- Code-switched suffixes: "late fee-nya" → "latviannya".
- A repetition-loop hallucination with whisper-base when the language was wrong ("the day before the day before…", WER 11.7).
- Forced-English translation of Indonesian, described above.

## 6. Regional-accent observations (Indonesia)

There is **no real regional speaker** in this test set. As a *proxy* for a non-Jakarta accent, the Malay voice `Amira` (ms_MY) read the same Indonesian sentences; its prosody and vowels resemble Riau/Sumatran Malay-influenced speech. Results (whisper-small, `indonesian`):

- Standard formal/casual sentences hold up (WER 0.2, same as the native voice).
- Loanwords (0.67 vs 0.56) and **regional lexical items degrade sharply**: Javanese 0.63 vs 0.38, Medan 1.0 vs 0.38. Example: "Bah, kek mana lah, awak belum gajian, lae" → "Ba, kemanalah, awat belom gajian, lah ye".
- The recorded call with this voice still completed correctly (objection recognised, escalation in casual register), because the intent layer tolerates partial ASR errors ("gaji saya belum cair", "sambungkan … petugas").
- **Conclusion:** accent plus regional vocabulary is where ASR fails first. Production needs real recordings from Javanese, Sundanese and Medan speakers, plus an ASR with Indonesian accent coverage or fine-tuning (see §8).

## 7. TTS compromises

- **Filipino.** No `fil-PH` voice is available on this macOS install. For recorded calls I measured which installed voice Whisper understands best when it reads Tagalog: the Indonesian voice (WER 0.41) beat the US-English voice (0.62). So Tagalog/Taglish replies use `Damayanti`, and English replies use `Samantha`. It is understandable but clearly not native (English words in Taglish are pronounced with Indonesian phonology). In the browser, the page uses a `fil-PH` voice if the OS has one, otherwise it falls back to `en-PH`/`en-US` and says so in the UI.
- **Indonesian.** The native `id-ID` voice was used for both bot and standard caller, so in that call both sides share a voice.
- **Production:** a neural `fil-PH` voice (e.g. Google Cloud TTS or Azure `fil-PH-BlessicaNeural`) and an `id-ID` neural voice. The TTS step is behind `speak()` / `sayToPcm()`, so only that function changes.

## 8. Comparison and known gaps

| | PH | ID |
|---|---|---|
| Hardest input | Tagalog function-word merging; Taglish phonology on a non-native voice | Code-switched suffixes (`-nya`, `nggak`) on English loanwords; regional vocabulary under accent |
| Best measured ASR | 0.41 WER (whisper-small, tagalog) | 0.32 WER (whisper-small, indonesian) |
| Intent layer on held-out v2 | 6/6 conversations fully passed | 3 failures: sentence-final closing ("Sudah cukup"), Javanese *wis tak transfer* (already paid) read as a promise, out-of-scope car-loan interest answered as an amount question |

**Native-speaker gaps.** All Tagalog, Taglish, Bahasa and regional content was written by me without native-speaker review. It needs review for naturalness (e.g. "Gets ko po", "ngerti", "nggih" placement), for the right register per customer segment, and for regional terms. No real native-speaker audio was tested.

**Compliance gaps (not legal advice; to be checked with compliance teams):**

- **PH:**
  - Insurance Commission rules for collection and reminder calls, and the grace-period and reinstatement wording in the actual policy contract.
  - Data Privacy Act 2012: consent and recording notice. The bot discloses recording and verifies identity before stating amounts, but there is no consent-capture step.
  - Bancassurance rules on what the bank vs the insurer may say.
- **ID:**
  - OJK consumer-protection and collection rules (calling hours, no intimidation, no disclosure to third parties). The bot verifies identity first, ends wrong-party calls without details and never threatens, but **calling-hour enforcement is not implemented**.
  - The penalty rate, restructuring process and DP wording must match the actual financing contract.
  - Recording consent.

**Engineering gaps**

- The bot's replies are template variants. A production version could use an LLM with the same packs as grounding, constrained per register.
- Whisper has no language auto-detect in transformers.js. A real deployment needs language ID per turn, or market-specific ASR.
- Tests used synthesized speech, not phone-band (8 kHz) human audio with background noise.
