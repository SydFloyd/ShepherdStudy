function stripDiacritics(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stripHebrewMarks(input: string) {
  return input.replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, "");
}

function transliterateGreek(input: string) {
  const map: Record<string, string> = {
    α: "a",
    β: "b",
    γ: "g",
    δ: "d",
    ε: "e",
    ζ: "z",
    η: "e",
    θ: "th",
    ι: "i",
    κ: "k",
    λ: "l",
    μ: "m",
    ν: "n",
    ξ: "x",
    ο: "o",
    π: "p",
    ρ: "r",
    σ: "s",
    ς: "s",
    τ: "t",
    υ: "u",
    φ: "ph",
    χ: "ch",
    ψ: "ps",
    ω: "o"
  };

  const normalized = stripDiacritics(input).toLowerCase();
  let out = "";
  for (const char of normalized) {
    if (char === " ") {
      out += " ";
      continue;
    }
    out += map[char] ?? char;
  }
  return out.trim();
}

function transliterateHebrew(input: string) {
  const map: Record<string, string> = {
    א: "a",
    ב: "b",
    ג: "g",
    ד: "d",
    ה: "h",
    ו: "v",
    ז: "z",
    ח: "ch",
    ט: "t",
    י: "y",
    כ: "k",
    ך: "k",
    ל: "l",
    מ: "m",
    ם: "m",
    נ: "n",
    ן: "n",
    ס: "s",
    ע: "a",
    פ: "p",
    ף: "p",
    צ: "ts",
    ץ: "ts",
    ק: "q",
    ר: "r",
    ש: "sh",
    ת: "t"
  };

  const normalized = stripHebrewMarks(input);
  let out = "";
  for (const char of normalized) {
    if (char === " ") {
      out += " ";
      continue;
    }
    out += map[char] ?? "";
  }
  return out.trim();
}

export function transliterateToken(input: {
  sourceTranslation: string;
  tokenText: string;
  lemma: string | null;
  lexiconTranslit?: string | null;
}) {
  const source = input.sourceTranslation;
  const sourceText = input.tokenText.trim();
  const sourceLemma = input.lemma?.trim() ?? "";
  const value = sourceLemma || sourceText;

  if (input.lexiconTranslit?.trim()) {
    return input.lexiconTranslit.trim();
  }
  if (!value) {
    return "";
  }
  if (source === "ugnt") {
    return transliterateGreek(value);
  }
  if (source === "uhb") {
    return transliterateHebrew(value);
  }
  return value;
}

function mapGender(char: string) {
  const table: Record<string, string> = {
    m: "masculine",
    f: "feminine",
    n: "neuter",
    c: "common"
  };
  return table[char.toLowerCase()] ?? "";
}

function mapNumber(char: string) {
  const table: Record<string, string> = {
    s: "singular",
    p: "plural",
    d: "dual"
  };
  return table[char.toLowerCase()] ?? "";
}

function mapCaseOrState(char: string) {
  const table: Record<string, string> = {
    n: "nominative",
    g: "genitive",
    d: "dative",
    a: "accusative",
    v: "vocative",
    c: "construct",
    b: "absolute",
    e: "emphatic"
  };
  return table[char.toLowerCase()] ?? "";
}

function mapGreekPos(char: string) {
  const table: Record<string, string> = {
    n: "noun",
    v: "verb",
    a: "adjective",
    d: "adverb",
    p: "pronoun",
    r: "preposition",
    c: "conjunction",
    t: "article",
    i: "interjection",
    x: "particle"
  };
  return table[char.toLowerCase()] ?? "";
}

function mapHebrewPos(char: string) {
  const table: Record<string, string> = {
    n: "noun",
    v: "verb",
    a: "adjective",
    p: "pronoun",
    r: "preposition",
    c: "conjunction",
    t: "particle",
    d: "adverb",
    i: "interjection"
  };
  return table[char.toLowerCase()] ?? "";
}

export function parseMorphFields(input: {
  sourceTranslation: string;
  morph: string | null;
}) {
  const raw = input.morph?.trim() ?? "";
  if (!raw) {
    return {
      partOfSpeech: "",
      type: "",
      gender: "",
      number: "",
      state: "",
      long: ""
    };
  }

  // Hebrew pattern examples: He,Ncfsa | He,Vqp3ms
  if (input.sourceTranslation === "uhb") {
    const code = raw.split(",")[1] ?? raw;
    const pos = code.charAt(0);
    let type = "";
    let gender = "";
    let number = "";
    let state = "";
    if (/^N/i.test(code) && code.length >= 5) {
      type = code.charAt(1).toLowerCase();
      gender = mapGender(code.charAt(2));
      number = mapNumber(code.charAt(3));
      state = mapCaseOrState(code.charAt(4));
    } else if (/^V/i.test(code) && code.length >= 5) {
      type = code.slice(1, 3).toLowerCase();
      gender = mapGender(code.charAt(code.length - 2));
      number = mapNumber(code.charAt(code.length - 1));
    }

    return {
      partOfSpeech: mapHebrewPos(pos),
      type,
      gender,
      number,
      state,
      long: code
    };
  }

  function parseGreekMorph(rawMorph: string) {
    const parts = rawMorph.split(",").map((part) => part.trim());
    const posToken = parts[1] ?? "";
    const typeToken = parts[2] ?? "";
    const personCaseGenderNumberToken = parts[6] ?? parts[4] ?? "";
    const pos = posToken.charAt(0);

    let state = "";
    let gender = "";
    let number = "";

    const cgnMatch = personCaseGenderNumberToken.match(
      /(?:[123])?([NGDAV])([MFNC])([SPD])/i
    );
    if (cgnMatch) {
      state = mapCaseOrState(cgnMatch[1]);
      gender = mapGender(cgnMatch[2]);
      number = mapNumber(cgnMatch[3]);
    } else {
      const numberChar = personCaseGenderNumberToken.match(/[SPD]/i)?.[0];
      if (numberChar) {
        number = mapNumber(numberChar);
      }
    }

    return {
      partOfSpeech: mapGreekPos(pos),
      type: typeToken.toLowerCase(),
      gender,
      number,
      state,
      long: parts.slice(1).filter(Boolean).join(",")
    };
  }

  // Greek pattern examples:
  // Gr,N,,,,,NFS,
  // Gr,V,IAA3,,S,
  // Gr,RP,,,3GMS,
  // Gr,N-NSM
  if (input.sourceTranslation === "ugnt") {
    if (raw.includes(",")) {
      return parseGreekMorph(raw);
    }

    // Fallback for dash-style tags.
    const main = raw.split("-")[0] ?? "";
    const detail = raw.split("-")[1] ?? "";
    const pos = main.charAt(0);
    const detailMatch = detail.match(/^([NGDAV])([MFNC])([SPD])/i);
    return {
      partOfSpeech: mapGreekPos(pos),
      type: detail.toLowerCase(),
      gender: detailMatch ? mapGender(detailMatch[2]) : "",
      number: detailMatch ? mapNumber(detailMatch[3]) : "",
      state: detailMatch ? mapCaseOrState(detailMatch[1]) : "",
      long: raw
    };
  }

  return {
    partOfSpeech: "",
    type: "",
    gender: "",
    number: "",
    state: "",
    long: raw
  };
}
