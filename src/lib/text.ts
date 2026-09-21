const EMOJI_PATTERN = /[\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}]|\uFE0F|\u200D\p{Emoji}/u;
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);

export const containsEmoji = (value: string): boolean => EMOJI_PATTERN.test(value);

export const containsLongDash = (value: string): boolean =>
  value.includes(EN_DASH) || value.includes(EM_DASH);

export const describeForbiddenCharacters = (value: string): string | null => {
  if (containsEmoji(value)) {
    return "Emoji are forbidden.";
  }
  if (value.includes(EN_DASH)) {
    return "The en dash (U+2013) is forbidden, use a hyphen or a comma.";
  }
  if (value.includes(EM_DASH)) {
    return "The em dash (U+2014) is forbidden, use a hyphen or a comma.";
  }
  return null;
};
