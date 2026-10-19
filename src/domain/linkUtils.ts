/**
 * Utilities for URL validation, normalization, and rich link parsing.
 * Allows users to paste links across the app (messages, comments, descriptions, tasks)
 * and renders them safely as clickable links that open in a new tab.
 */

export interface LinkMatch {
  readonly raw: string;
  readonly url: string;
  readonly domain: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

export type TextToken =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'url'; readonly value: string; readonly href: string; readonly domain: string }
  | { readonly type: 'mention'; readonly value: string; readonly displayName: string; readonly user?: { uid: string; displayName: string; email?: string; role?: string } }
  | { readonly type: 'newline' };

/**
 * Checks if a string is a valid web URL (http, https, or www).
 * Rejects dangerous schemes like javascript:, data:, etc.
 */
export function isValidUrl(candidate: string): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();

  // Prevent script injections or non-http protocols
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return false;
  }

  // Must match http://, https://, or www.
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed) || /^www\.[a-z0-9-]+(\.[a-z0-9-]+)+[^\s]*$/i.test(trimmed);
}

/**
 * Normalizes a URL so it always has a valid protocol for an <a> href attribute.
 * If user pastes "www.github.com", converts it to "https://www.github.com".
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://${trimmed}`;
}

/**
 * Extracts the domain name from a URL for display purposes (e.g. 'github.com', 'figma.com').
 */
export function getDomainFromUrl(url: string): string {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return url.split('/')[0] || url;
  }
}

/**
 * Extracts a readable title/label from a URL when a user does not provide one.
 */
export function formatUrlTitle(url: string, customTitle?: string): string {
  if (customTitle && customTitle.trim()) {
    return customTitle.trim();
  }
  const domain = getDomainFromUrl(url);
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);
    const pathname = parsed.pathname.replace(/\/$/, '');
    if (pathname && pathname.length > 1) {
      const segments = pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && last.length > 2 && !/^[0-9a-f-]{30,}$/i.test(last)) {
        return `${domain} / ${decodeURIComponent(last)}`;
      }
    }
  } catch {
    // fallback to domain
  }
  return domain || url;
}

/**
 * Regex matching URLs in text.
 * Matches:
 * 1. http:// or https:// followed by valid URL characters
 * 2. www. followed by valid domain characters
 * Trailing punctuation (.,:;!?) and enclosing brackets are trimmed.
 */
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;?!"')\]\s]|www\.[^\s<]+[^<.,:;?!"')\]\s])/gi;

/**
 * Extracts all URLs from a block of text.
 */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  // Deduplicate and filter valid
  const seen = new Set<string>();
  const results: string[] = [];
  for (const m of matches) {
    const cleaned = m.trim();
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      results.push(cleaned);
    }
  }
  return results;
}

/**
 * Tokenizes text containing plain text, linebreaks, URLs, and optional @user mentions.
 * Used to render rich, interactive text where links are clickable and open in a new tab.
 */
export function tokenizeTextWithUrlsAndMentions(
  text: string,
  users?: Array<{ uid: string; displayName: string; email?: string; role?: string }>
): TextToken[] {
  if (!text) return [];

  // Match mention pattern if users provided
  let mentionPattern = '';
  if (users && users.length > 0) {
    const escapedNames = users
      .map(u => u.displayName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    if (escapedNames.length > 0) {
      mentionPattern = `|(@(?:${escapedNames.join('|')}|[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9._-]+|[a-zA-Z0-9._-]+))`;
    }
  }

  // Combined regex: newlines, URLs, mentions
  const masterRegex = new RegExp(
    `(\\r?\\n)|(https?:\\/\\/[^\\s<]+[^<.,:;?!"')\\]\\s]|www\\.[^\\s<]+[^<.,:;?!"')\\]\\s])${mentionPattern}`,
    'gi'
  );

  const tokens: TextToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = masterRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    const matchStr = match[0];

    // Push any preceding text
    if (matchIndex > lastIndex) {
      tokens.push({
        type: 'text',
        value: text.substring(lastIndex, matchIndex),
      });
    }

    if (match[1]) {
      // Newline
      tokens.push({ type: 'newline' });
    } else if (match[2]) {
      // URL
      const rawUrl = match[2];
      tokens.push({
        type: 'url',
        value: rawUrl,
        href: normalizeUrl(rawUrl),
        domain: getDomainFromUrl(rawUrl),
      });
    } else if (match[3] || matchStr.startsWith('@')) {
      // Mention
      const mentionStr = match[3] || matchStr;
      const stripped = mentionStr.slice(1).toLowerCase().trim();
      const matchedUser = users?.find(u => {
        const dName = u.displayName.toLowerCase().trim();
        const email = u.email?.toLowerCase().trim() || '';
        return (
          dName === stripped ||
          email === stripped ||
          stripped === dName.replace(/\s+/g, '') ||
          mentionStr.toLowerCase() === `@${dName}`
        );
      });

      tokens.push({
        type: 'mention',
        value: mentionStr,
        displayName: matchedUser ? matchedUser.displayName : mentionStr.slice(1),
        user: matchedUser,
      });
    }

    lastIndex = masterRegex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      value: text.substring(lastIndex),
    });
  }

  return tokens;
}
