// Keep main-process messages intact; remove decorative prefixes only for display.
const leadingEmoji = new RegExp('^(?:\\s|\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|\\p{Emoji_Modifier}|[\\uFE0F\\uFE0E\\u200D])+', 'u');

export default (message: string): string => message.replace(leadingEmoji, '');
