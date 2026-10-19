import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { UserProfile } from '../../types/auth';
import { SendDirectMessageInput } from '../../types/message';

interface DirectMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  workspaceUsers: UserProfile[];
  onSendMessage: (data: SendDirectMessageInput) => Promise<unknown>;
  preselectedRecipientId?: string;
}

export const DirectMessageModal: React.FC<DirectMessageModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  workspaceUsers,
  onSendMessage,
  preselectedRecipientId,
}) => {
  const [recipientId, setRecipientId] = useState<string>(preselectedRecipientId || '');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Eligible recipients: active workspace users excluding the current user
  const eligibleRecipients = workspaceUsers.filter(
    u => u.uid !== currentUser?.uid && u.status === 'active'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!recipientId) {
      setError('Please select a recipient.');
      return;
    }
    if (!body.trim()) {
      setError('Message body cannot be empty.');
      return;
    }
    if (body.trim().length > 2000) {
      setError('Message body must not exceed 2000 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSendMessage({
        recipientId,
        subject: subject.trim() || undefined,
        body: body.trim(),
      });
      // Reset form on success
      setSubject('');
      setBody('');
      setRecipientId('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Direct Message" maxWidth="580px" zIndex={1300}>
      <form onSubmit={handleSubmit} className="direct-message-form">
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--status-blocked, #ef4444)',
              color: 'var(--status-blocked, #ef4444)',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label
            htmlFor="dm-recipient-select"
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary, #f0f6fc)',
              marginBottom: '6px',
            }}
          >
            To (Recipient) <span style={{ color: 'var(--status-blocked, #ef4444)' }}>*</span>
          </label>
          <select
            id="dm-recipient-select"
            className="form-input"
            value={recipientId}
            onChange={e => setRecipientId(e.target.value)}
            disabled={isSubmitting}
            required
            style={{ width: '100%' }}
          >
            <option value="">Select an active workspace member...</option>
            {eligibleRecipients.map(u => (
              <option key={u.uid} value={u.uid}>
                {u.displayName} ({u.email}) — {u.role.replace('_', ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label
            htmlFor="dm-subject-input"
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary, #f0f6fc)',
              marginBottom: '6px',
            }}
          >
            Subject <span style={{ fontSize: '11px', color: 'var(--text-muted, #8b949e)' }}>(Optional)</span>
          </label>
          <input
            id="dm-subject-input"
            type="text"
            className="form-input"
            placeholder="e.g. Project timeline update, review request..."
            value={subject}
            onChange={e => setSubject(e.target.value)}
            disabled={isSubmitting}
            maxLength={100}
            style={{ width: '100%' }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label
              htmlFor="dm-body-input"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary, #f0f6fc)',
              }}
            >
              Message <span style={{ color: 'var(--status-blocked, #ef4444)' }}>*</span>
            </label>
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #8b949e)' }}>
              {body.length} / 2000
            </span>
          </div>
          <textarea
            id="dm-body-input"
            className="form-textarea"
            rows={5}
            placeholder="Write your private message or paste links here (e.g. docs, specs, websites)..."
            value={body}
            onChange={e => setBody(e.target.value)}
            disabled={isSubmitting}
            required
            maxLength={2000}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={!recipientId || !body.trim() || isSubmitting}
            id="send-dm-btn"
          >
            Send Message
          </Button>
        </div>
      </form>
    </Modal>
  );
};
