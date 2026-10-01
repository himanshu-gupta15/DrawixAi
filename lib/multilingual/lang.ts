/**
 * Lexicon-based language / register detection for code-switched speech.
 * PH: English vs Tagalog vs Taglish (ratio of Tagalog to English function words).
 * ID: formal vs casual register + regional markers (Javanese, Sundanese, Medan/Batak).
 * Domain loanwords (premium, policy, DP, transfer...) are deliberately NOT counted as English,
 * because Filipino and Indonesian speakers use them inside otherwise native sentences.
 */
const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\s'-]/gu, " ").split(/\s+/).filter(Boolean);

const TL = new Set("po opo ba na ng ang mga sa ko ako ikaw kayo hindi oo sige salamat kasi yung yun lang naman pa wala meron may gusto pwede puwede ngayon bukas magkano kailan saan paano bakit ano sino akin namin natin siya talaga din rin kung pero nang mo niyo nyo ninyo inyo inyong sahod pera bayad magbabayad babayaran nagbayad makausap gipit sayang palugit hulog mamaya tawag tawagan eh nga kami tayo dito diyan dyan ito iyan alam kailangan muna lahat wag huwag ayoko gets ipa po'y ganun ganon nalang na-gets ka".split(" "));
// Frequent English function + everyday content words (enough to separate English from Tagalog spans).
const EN = new Set(("the is are was were i you my your we our it this that will would can could should what when where why how which who do does did have has had not don't can't won't i'll i'm it's yes no please thank thanks okay ok want need already pay paid about with for from and but if because just still really time today tomorrow call back speaking talk person real anything else " +
  "next last week month year day night morning afternoon money salary job work busy later now soon right away again sure fine good bad late early first second maybe actually also only very much more less all some any none nothing something everything " +
  "get got give make take send tell ask know think see say said go going come help use keep stop cancel change update settle afford spend friday monday saturday sunday weekend her him she he they them their there here rather").split(" "));
// Finance / insurance terms used natively inside Tagalog and Indonesian sentences.
const LOANWORDS = new Set("premium policy beneficiary rider lapse coverage bank branch auto-debit gcash maya advisor agent grace period insurance due date reinstatement transfer dp virtual account app aplikasi reschedule restruktur late fee cash cs customer service deadline online sms".split(" "));

export type PhVariant = "en" | "tl" | "taglish";
export interface PhDetection { variant: PhVariant; tagalog: number; english: number; loanwords: string[]; confident: boolean }

/** Lexical yes/no for short confirmations, where an embedding classifier is unreliable. */
const PH_YES = /^(oo|opo|oho|yes|yeah|yup|sige|sure|okay|ok|tama|korek|ako nga|ako po|ako ito|siya nga|ito na|speaking)\b/i;
const PH_NO = /^(hindi|wala na|wala po|no|nope|ayoko|hindi po|wrong number|none)\b/i;
const ID_YES = /^(iya|iyo|ya|yaa|betul|benar|bener|nggih|leres|muhun|ok|oke|boleh|mau|siap|sip|dengan saya)\b/i;
const ID_NO = /^(bukan|tidak|nggak|enggak|gak|ga|ngga|mboten|salah sambung|cukup|sudah cukup|udah cukup|gak usah|nggak usah|tidak usah)\b/i;

export function lexicalYesNo(market: "PH" | "ID", text: string): boolean | null {
  const t = text.trim().toLowerCase().replace(/^(ah|eh|uh|um|hmm|ay|waduh|aduh|mbak|kak|teh|ma'am),?\s+/, "");
  const [yes, no] = market === "PH" ? [PH_YES, PH_NO] : [ID_YES, ID_NO];
  if (no.test(t)) return false;
  if (yes.test(t)) return true;
  return null;
}

export function detectPh(text: string): PhDetection {
  const w = words(text);
  const loan = w.filter((x) => LOANWORDS.has(x));
  const tl = w.filter((x) => TL.has(x)).length;
  const en = w.filter((x) => EN.has(x) && !TL.has(x)).length;
  const total = tl + en;
  // Any meaningful English span (>15% of marked words) makes an utterance Taglish.
  const variant: PhVariant = total === 0 ? "taglish" : tl / total >= 0.85 ? "tl" : en / total >= 0.85 ? "en" : "taglish";
  return { variant, tagalog: tl, english: en, loanwords: loan, confident: total >= 2 };
}

const ID_FORMAL = new Set("saya bapak ibu tidak sudah apakah bagaimana terima kasih mohon baik akan dapat ingin silakan tersebut membayar".split(" "));
const ID_CASUAL = new Set("ga gak nggak ngga enggak gue gw lo lu udah aja banget sih dong deh kok kayak gimana ntar emang duit bilang kak bro mbak mas makasih yaudah oke nih tuh seret gajian pake waduh cair ngomong".split(" "));
const JAVANESE = new Set("nggih mboten sampun piye monggo sekedap matur nuwun kulo dalem ndak opo iyo wis durung ono tak mengko wingi leres kalih mangke pengen".split(" "));
const SUNDANESE = new Set("atuh teh mah punten hatur nuhun teu acan euy muhun artos aya".split(" "));
const MEDAN = new Set("kau lae bah awak cemana pigi kek".split(" "));
const ID_EN = new Set("transfer reschedule late fee deadline payment cash online app sorry please thanks ok okay".split(" "));

export type IdRegister = "formal" | "casual";
export interface IdDetection { register: IdRegister; formal: number; casual: number; regional: "javanese" | "sundanese" | "medan" | null; regionalMarkers: string[]; englishLoanwords: string[]; confident: boolean }

export function detectId(text: string): IdDetection {
  const w = words(text);
  const formal = w.filter((x) => ID_FORMAL.has(x)).length;
  const casual = w.filter((x) => ID_CASUAL.has(x)).length;
  const jv = w.filter((x) => JAVANESE.has(x)), su = w.filter((x) => SUNDANESE.has(x)), md = w.filter((x) => MEDAN.has(x));
  const joined = ` ${w.join(" ")} `;
  if (joined.includes(" kek mana ")) md.push("kek mana");
  const regional = jv.length >= Math.max(1, su.length, md.length) ? (jv.length ? "javanese" : null) : su.length >= md.length ? "sundanese" : "medan";
  // Krama Javanese (nggih, sampun, kulo, mboten) is a polite register; ngoko (iyo, wis, tak) is casual.
  const krama = jv.filter((x) => ["nggih", "sampun", "kulo", "mboten", "matur", "nuwun", "leres", "mangke", "kalih", "dalem"].includes(x)).length;
  const ngoko = jv.length - krama;
  // Sundanese particles (atuh, teh, euy) and Medan markers signal a familiar, casual tone.
  const familiar = md.length + su.filter((x) => ["atuh", "teh", "euy", "mah"].includes(x)).length;
  const register: IdRegister = formal + krama >= casual + ngoko + familiar && formal + krama > 0 ? "formal" : casual + ngoko + familiar > 0 ? "casual" : "formal";
  return { register, formal: formal + krama, casual: casual + ngoko, regional: regional && (jv.length || su.length || md.length) ? regional : null, regionalMarkers: [...jv, ...su, ...md], englishLoanwords: w.filter((x) => ID_EN.has(x) || LOANWORDS.has(x)), confident: formal + casual + jv.length + su.length + md.length >= 1 };
}
