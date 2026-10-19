import React from 'react';
import { ExternalLink } from 'lucide-react';
import { tokenizeTextWithUrlsAndMentions } from '../../domain/linkUtils';

interface UserMentionReference {
  readonly uid: string;
  readonly displayName: string;
  readonly email?: string;
  readonly role?: string;
}

interface LinkifiedTextProps {
  readonly text?: string | null;
  readonly users?: readonly UserMentionReference[];
  readonly className?: string;
  readonly isCurrentSender?: boolean;
}

/**
 * LinkifiedText turns raw pasted URLs and @user mentions into rich, interactive elements:
 * 1. URLs (http://, https://, www.) become clickable hyperlinks that open in a new tab safely.
 * 2. @mentions become styled mention pills with user info.
 * 3. Line breaks are preserved.
 */
export const LinkifiedText: React.FC<LinkifiedTextProps> = ({
  text,
  users,
  className = '',
  isCurrentSender = false,
}) => {
  if (!text) return null;

  const tokens = tokenizeTextWithUrlsAndMentions(
    text,
    users ? [...users] : undefined
  );

  return (
    <span className={`linkified-content ${className}`}>
      {tokens.map((token, index) => {
        if (token.type === 'newline') {
          return <br key={`br-${index}`} />;
        }

        if (token.type === 'url') {
          return (
            <a
              key={`url-${index}`}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`clickable-web-link ${isCurrentSender ? 'link-inverted' : ''}`}
              title={`Visit ${token.href} (opens in new tab)`}
              onClick={e => {
                // Ensure clicking link does not trigger parent row/card selection
                e.stopPropagation();
              }}
            >
              <span className="link-text-label">{token.value}</span>
              <ExternalLink
                size={11}
                className="link-inline-icon"
                aria-hidden="true"
                style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '3px', flexShrink: 0 }}
              />
            </a>
          );
        }

        if (token.type === 'mention') {
          const u = token.user;
          const tooltip = u
            ? `${u.displayName}${u.email ? ` • ${u.email}` : ''} (${u.role ? u.role.replace('_', ' ') : 'Member'})`
            : token.value;

          return (
            <span
              key={`mention-${index}`}
              className="comment-mention-pill"
              title={tooltip}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                background: isCurrentSender ? 'rgba(255, 255, 255, 0.25)' : 'rgba(99, 102, 241, 0.18)',
                color: isCurrentSender ? '#ffffff' : 'var(--accent-primary-light, #818cf8)',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: '5px',
                margin: '0 2px',
                border: isCurrentSender ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(99, 102, 241, 0.3)',
                fontSize: '12px',
                verticalAlign: 'baseline',
              }}
            >
              <span style={{ opacity: 0.75 }}>@</span>
              <span>{token.displayName}</span>
            </span>
          );
        }

        return <React.Fragment key={`txt-${index}`}>{token.value}</React.Fragment>;
      })}
    </span>
  );
};
