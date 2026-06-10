export function isNumberedTemplateIdentifier(token: string): boolean {
  const chars = Array.from(token);
  let index = 1;

  while (index + 1 < chars.length) {
    const current = chars[index];
    const previous = chars[index - 1];
    if (
      current === undefined ||
      previous === undefined ||
      !isAsciiDigit(current) ||
      !isAsciiLowercase(previous)
    ) {
      index += 1;
      continue;
    }

    let stemLen = 0;
    for (let stemIndex = index - 1; stemIndex >= 0; stemIndex -= 1) {
      const stemChar = chars[stemIndex];
      if (stemChar === undefined || !isAsciiAlphabetic(stemChar)) {
        break;
      }
      stemLen += 1;
    }

    let afterDigits = index + 1;
    while (afterDigits < chars.length && isAsciiDigit(chars[afterDigits] ?? "")) {
      afterDigits += 1;
    }

    const after = chars[afterDigits];
    if (
      stemLen >= 5 &&
      after !== undefined &&
      (isAsciiAlphabetic(after) || after === "_" || after === "-")
    ) {
      return true;
    }

    index = afterDigits;
  }

  return false;
}

function isAsciiDigit(value: string): boolean {
  return /^[0-9]$/u.test(value);
}

function isAsciiLowercase(value: string): boolean {
  return /^[a-z]$/u.test(value);
}

function isAsciiAlphabetic(value: string): boolean {
  return /^[A-Za-z]$/u.test(value);
}
