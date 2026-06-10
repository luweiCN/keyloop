import { describe, expect, test } from "bun:test";

import { miniEntriesFromCsv } from "../src/tools/buildDictionaryMini";

describe("miniEntriesFromCsv", () => {
  test("maps word to phonetic and translation, lowercases key, joins multiline", () => {
    const csv = [
      "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
      "Abandon,ə'bændən,\"to leave\",\"v. 放弃\\n n. 放任\",,,,,,,,,",
      "the,ðə,,art. 那,,,,,,,,,",
    ].join("\n");
    expect(miniEntriesFromCsv(csv)).toEqual({
      abandon: { p: "ə'bændən", t: "v. 放弃; n. 放任" },
      the: { p: "ðə", t: "art. 那" },
    });
  });

  test("handles quoted fields with embedded commas and quotes", () => {
    const csv = [
      "word,phonetic,definition,translation",
      `bank,bæŋk,"a place, with ""money""","n. 银行, 河岸"`,
    ].join("\n");
    expect(miniEntriesFromCsv(csv)).toEqual({
      bank: { p: "bæŋk", t: "n. 银行, 河岸" },
    });
  });

  test("skips rows without translation", () => {
    const csv = "word,phonetic,definition,translation\nfoo,,,";
    expect(miniEntriesFromCsv(csv)).toEqual({});
  });

  test("commonOnly keeps tagged/starred/frequent words and drops obscure ones", () => {
    const csv = [
      "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
      "abandon,ə'bændən,,v. 放弃,,3,1,cet4 ky,1234,1500,,,",
      "the,ðə,,art. 那,,,,,1,1,,,",
      "obscureword,,,n. 某生僻词,,0,0,,99999,0,,,",
      "taggedonly,,,n. 仅标签词,,0,0,gre,0,0,,,",
    ].join("\n");
    expect(miniEntriesFromCsv(csv, { commonOnly: true })).toEqual({
      abandon: { p: "ə'bændən", t: "v. 放弃" },
      the: { p: "ðə", t: "art. 那" },
      taggedonly: { t: "n. 仅标签词" },
    });
  });
});
