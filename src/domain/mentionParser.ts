import { UserProfile } from '../types/auth';
import { Project } from '../types/project';

export interface ResolvedMention {
  readonly token: string;
  readonly user: UserProfile;
}

export interface MentionResolutionResult {
  readonly resolvedUsers: UserProfile[];
  readonly ambiguousTokens: string[];
  readonly unresolvedTokens: string[];
}

/**
 * Parses a comment text for @mentions and resolves them against active workspace users.
 * Supports:
 * - Full email mentions (e.g. @alex@ojix.local)
 * - Email local-part shorthand (e.g. @marcus from member@ojix.local or @rajpandith from rajpandith@gmail.com)
 * - Display name slug shorthand (e.g. @sarahchen or @sarah.chen or @Sarah)
 *
 * Rules:
 * 1. Excludes commenter from receiving notifications for mentioning themselves.
 * 2. Excludes blocked and terminated accounts.
 * 3. Enforces project membership / access.
 * 4. Deduplicates multiple mentions of the same user.
 * 5. Flags ambiguous shorthand tokens if they match more than one user.
 */
export function extractMentionTokens(text: string): string[] {
  if (!text) return [];
  // Match @email or @word-with-dots-and-dashes
  const regex = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+|[a-zA-Z0-9._-]+)/g;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim();
    if (raw && !tokens.includes(raw.toLowerCase())) {
      tokens.push(raw.toLowerCase());
    }
  }

  return tokens;
}

export function resolveCommentMentions(
  commentText: string,
  workspaceUsers: readonly UserProfile[],
  project: Project | null | undefined,
  commenter: UserProfile
): MentionResolutionResult {
  const tokens = extractMentionTokens(commentText);
  const resolvedUsersMap = new Map<string, UserProfile>();
  const ambiguousTokens: string[] = [];
  const unresolvedTokens: string[] = [];

  // Active workspace users (excluding commenter)
  const candidateUsers = workspaceUsers.filter(
    u => u.uid !== commenter.uid && u.status === 'active'
  );

  // Check direct full display name mentions in commentText (e.g. "@Marcus Vance" or "@Sarah Chen")
  const commentLower = commentText.toLowerCase();
  for (const user of candidateUsers) {
    const fullPattern = `@${user.displayName.toLowerCase()}`;
    if (commentLower.includes(fullPattern)) {
      const hasAccess = !project || project.memberIds.includes(user.uid) || user.role === 'workspace_admin';
      if (hasAccess) {
        resolvedUsersMap.set(user.uid, user);
      }
    }
  }

  for (const token of tokens) {
    const matches = candidateUsers.filter(u => {
      const emailLower = u.email.toLowerCase();
      const localPart = emailLower.split('@')[0];
      const nameNoSpaces = u.displayName.toLowerCase().replace(/\s+/g, '');
      const nameWithDots = u.displayName.toLowerCase().replace(/\s+/g, '.');
      const parts = u.displayName.toLowerCase().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.length > 1 ? parts[parts.length - 1] : '';

      return (
        emailLower === token ||
        localPart === token ||
        nameNoSpaces === token ||
        nameWithDots === token ||
        firstName === token ||
        (Boolean(lastName) && lastName === token)
      );
    });

    if (matches.length === 1) {
      const target = matches[0];
      // Enforce project access: user must be in project.memberIds or be a workspace admin
      const hasAccess = !project || project.memberIds.includes(target.uid) || target.role === 'workspace_admin';
      if (hasAccess) {
        resolvedUsersMap.set(target.uid, target);
      }
    } else if (matches.length > 1) {
      ambiguousTokens.push(token);
    } else {
      unresolvedTokens.push(token);
    }
  }

  return {
    resolvedUsers: Array.from(resolvedUsersMap.values()),
    ambiguousTokens,
    unresolvedTokens,
  };
}

/**
 * Returns autocomplete suggestion list for mentions given a partial query.
 */
export function getMentionSuggestions(
  query: string,
  workspaceUsers: readonly UserProfile[],
  project: Project | null | undefined,
  commenter: UserProfile
): UserProfile[] {
  const cleanQuery = query.toLowerCase().replace(/^@/, '').trim();
  const candidates = workspaceUsers.filter(u => {
    if (u.uid === commenter.uid) return false;
    if (u.status !== 'active') return false;
    if (project && !project.memberIds.includes(u.uid) && u.role !== 'workspace_admin') return false;
    return true;
  });

  if (!cleanQuery) {
    return candidates.slice(0, 8);
  }

  return candidates
    .filter(u => {
      const emailLower = u.email.toLowerCase();
      const localPart = emailLower.split('@')[0];
      const nameLower = u.displayName.toLowerCase();
      return (
        nameLower.includes(cleanQuery) ||
        emailLower.includes(cleanQuery) ||
        localPart.includes(cleanQuery)
      );
    })
    .slice(0, 8);
}
