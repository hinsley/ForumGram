// Utilities to escape and unescape Markdown characters so Telegram doesn't strip them

// Telegram MarkdownV2 special characters plus '"' to avoid issues in JSON contexts
const TELEGRAM_MD_CHARS = '_*[]()~`>#+-=|{}.!"';

function isTelegramMdChar(ch: string): boolean {
  return TELEGRAM_MD_CHARS.includes(ch);
}

/**
 * Prefix Telegram Markdown special characters with a backslash when not already escaped
 * by an odd number of preceding backslashes.
 */
export function escapeMarkdownForTelegram(input: string): string {
  if (!input) return input;
  let result = '';
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (isTelegramMdChar(character)) {
      // Count consecutive backslashes immediately before this character
      let backslashCount = 0;
      let lookbackIndex = index - 1;
      while (lookbackIndex >= 0 && input[lookbackIndex] === '\\') {
        backslashCount++;
        lookbackIndex--;
      }
      if (backslashCount % 2 === 0) {
        // Even number of preceding backslashes means it's not escaped yet
        result += '\\' + character;
      } else {
        // Already escaped by user input
        result += character;
      }
    } else {
      result += character;
    }
  }
  return result;
}

/**
 * Remove a single escaping backslash before Telegram Markdown characters when that backslash
 * is not itself escaped by an odd number of preceding backslashes.
 */
export function unescapeMarkdownFromTelegram(input: string): string {
  if (!input) return input;
  let result = '';
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (
      character === '\\' &&
      index + 1 < input.length &&
      isTelegramMdChar(input[index + 1])
    ) {
      // Count consecutive backslashes immediately before this backslash
      let backslashCount = 0;
      let lookbackIndex = index - 1;
      while (lookbackIndex >= 0 && input[lookbackIndex] === '\\') {
        backslashCount++;
        lookbackIndex--;
      }
      if (backslashCount % 2 === 0) {
        // This is our escaping backslash – drop it and let the next character be appended by loop
        continue;
      }
    }
    result += character;
  }
  return result;
}