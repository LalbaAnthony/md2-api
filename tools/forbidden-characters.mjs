export const EMOJI_PATTERN = /[\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}]|️|‍[\p{Emoji}]/u;
export const EN_DASH = "–";
export const EM_DASH = "—";

const GLOBAL_EMOJI_PATTERN = new RegExp(EMOJI_PATTERN.source, "gu");

export const findForbiddenCharacters = (text) => {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, lineIndex) => {
    GLOBAL_EMOJI_PATTERN.lastIndex = 0;
    let match = GLOBAL_EMOJI_PATTERN.exec(line);
    while (match !== null) {
      findings.push({
        line: lineIndex + 1,
        column: match.index + 1,
        kind: "emoji",
        text: match[0],
      });
      match = GLOBAL_EMOJI_PATTERN.exec(line);
    }
    for (let column = 0; column < line.length; column += 1) {
      const character = line[column];
      if (character === EN_DASH || character === EM_DASH) {
        findings.push({
          line: lineIndex + 1,
          column: column + 1,
          kind: character === EN_DASH ? "en-dash" : "em-dash",
          text: character,
        });
      }
    }
  });
  return findings;
};

export const describeFinding = (finding) => {
  if (finding.kind === "emoji") {
    return `Emoji are forbidden (found U+${finding.text.codePointAt(0).toString(16).toUpperCase()}).`;
  }
  if (finding.kind === "en-dash") {
    return "En dash (U+2013) is forbidden, use a hyphen or a comma.";
  }
  return "Em dash (U+2014) is forbidden, use a hyphen or a comma.";
};
