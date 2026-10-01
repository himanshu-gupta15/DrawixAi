import { test } from "node:test";
import assert from "node:assert/strict";
import { detectId, detectPh, lexicalYesNo } from "@/lib/multilingual/lang";
import { idr, php, speechId, terbilang, dateTl, dateId } from "@/lib/multilingual/format";
import { initialMlState, mlTurn } from "@/lib/multilingual/engine";

test("Philippine language detection: English / Tagalog / Taglish", () => {
  assert.equal(detectPh("Yes, I will pay on Friday").variant, "en");
  assert.equal(detectPh("Opo, babayaran ko po bukas").variant, "tl");
  assert.equal(detectPh("Sige po, I'll pay na lang next week").variant, "taglish");
  assert.ok(detectPh("Ano mangyayari sa coverage ko pag nag-lapse yung policy").loanwords.includes("coverage"));
});

test("Indonesian register + regional markers", () => {
  assert.equal(detectId("Baik, saya akan membayar sebelum tanggal tersebut").register, "formal");
  assert.equal(detectId("Udah gue bayar kok, santai aja").register, "casual");
  assert.equal(detectId("Durung ono duit, mengko tak bayar").regional, "javanese");
  assert.equal(detectId("Punten Teh, teu acan aya artos").regional, "sundanese");
  assert.equal(lexicalYesNo("ID", "Nggih, leres"), true);
  assert.equal(lexicalYesNo("PH", "Wala na po"), false);
});

test("localized amounts, dates and TTS text", () => {
  assert.equal(idr(1250000), "Rp1.250.000");
  assert.equal(php(2450), "₱2,450.00");
  assert.equal(terbilang(1250000), "satu juta dua ratus lima puluh ribu");
  assert.equal(dateTl("2026-10-15"), "ika-15 ng Oktubre");
  assert.equal(dateId("2026-10-15"), "15 Oktober 2026");
  assert.match(speechId("denda 0,5% per hari, Rp6.250"), /nol koma lima persen.*enam ribu dua ratus lima puluh rupiah/);
});

test("PH call: Tagalog caller gets Tagalog replies; escalation ends the call in-language", async () => {
  let s = initialMlState("PH");
  let r = await mlTurn(s, "Opo, ako po si Maria."); s = r.state;
  assert.equal(r.variant, "tl");
  r = await mlTurn(s, "Gusto ko pong makausap ang agent ko.");
  assert.equal(r.intent, "escalation");
  assert.ok(r.ended && r.state.escalated);
  assert.match(r.reply, /ikokonekta/);
});

test("ID call: wrong person gets no account details (privacy)", async () => {
  const r = await mlTurn(initialMlState("ID"), "Bukan, salah sambung.");
  assert.ok(r.ended);
  assert.ok(!/Rp|angsuran/.test(r.reply));
});
