import React, { useState, useEffect } from 'react';
import {
  Radio,
  X,
  Bell,
  BellOff,
  Zap,
  Laptop,
  CheckCircle2,
  AlertCircle,
  Info,
  Lock,
} from 'lucide-react';
import { UserProfile } from '../../types/auth';
import { StoredPushSubscription } from '../../types/push';
import { webPushClient } from '../../services/webPushClient';
import { Button } from '../../components/common/Button';

interface WebPushSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
}

export const WebPushSettingsModal: React.FC<WebPushSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [subscriptions, setSubscriptions] = useState<StoredPushSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const supported = webPushClient.isSupported();
    setIsSupported(supported);
    setPermission(webPushClient.getPermission());
    setDeviceLabel(webPushClient.detectDeviceLabel());

    // Check if this device is subscribed
    webPushClient.getExistingSubscription().then(sub => {
      setIsSubscribed(!!sub);
    });

    // Load all user's registered devices
    loadSubscriptions();
  }, [isOpen, currentUser]);

  const loadSubscriptions = async () => {
    const list = await webPushClient.fetchUserSubscriptions(currentUser);
    setSubscriptions(list);
  };

  const handleSubscribe = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await webPushClient.subscribeUser(currentUser, deviceLabel.trim());
      if (res.success) {
        setIsSubscribed(true);
        setPermission(webPushClient.getPermission());
        setFeedback({
          type: 'success',
          message: 'Web Push enabled on this device! You will receive OS alerts even when TeamFlow is closed.',
        });
        await loadSubscriptions();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to enable Web Push subscription.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Subscription failed.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await webPushClient.unsubscribeUser(currentUser);
      if (res.success) {
        setIsSubscribed(false);
        setFeedback({
          type: 'info',
          message: 'Web Push notifications disabled for this device.',
        });
        await loadSubscriptions();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to unsubscribe.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to unsubscribe.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await webPushClient.sendTestNotification(currentUser, deviceLabel);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Test push sent! Check your Windows/macOS notification tray (delivered to ${res.count || 1} registered device(s)).`,
        });
        await loadSubscriptions();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to send test push notification.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to trigger test push.' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-container"
        style={{
          width: '560px',
          maxWidth: '100%',
          background: 'var(--bg-surface, #FFFFFF)',
          border: '1px solid var(--border-default, #E8DED5)',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-default, #E8DED5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-elevated, #FAF5F0)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: 'var(--accent-primary, #C9662F)', display: 'flex', alignItems: 'center' }}>
              <Radio size={20} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary, #1E293B)' }}>
                Native Web Push Notifications (VAPID)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-secondary, #64748B)' }}>
                Standard W3C Browser Push • Zero Third-Party Cloud • Multi-Device
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted, #94a3b8)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              borderRadius: '4px',
            }}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-surface, #FFFFFF)' }}>
          {/* Feedback Banner */}
          {feedback && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                lineHeight: 1.4,
                background:
                  feedback.type === 'success'
                    ? 'rgba(34, 197, 94, 0.1)'
                    : feedback.type === 'error'
                    ? 'rgba(239, 68, 68, 0.1)'
                    : 'rgba(56, 189, 248, 0.1)',
                border: `1px solid ${
                  feedback.type === 'success'
                    ? 'rgba(34, 197, 94, 0.3)'
                    : feedback.type === 'error'
                    ? 'rgba(239, 68, 68, 0.3)'
                    : 'rgba(56, 189, 248, 0.3)'
                }`,
                color:
                  feedback.type === 'success'
                    ? '#15803d'
                    : feedback.type === 'error'
                    ? '#b91c1c'
                    : '#0369a1',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 size={16} />
              ) : feedback.type === 'error' ? (
                <AlertCircle size={16} />
              ) : (
                <Info size={16} />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Current Device Status */}
          <div
            style={{
              background: 'var(--surface-elevated, #FAF5F0)',
              border: '1px solid var(--border-default, #E8DED5)',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary, #1E293B)', marginBottom: '12px' }}>
              This Browser & Device Status
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px', marginBottom: '16px' }}>
              <div>
                <span style={{ color: 'var(--color-text-secondary, #64748B)' }}>Web Push Support: </span>
                <span style={{ fontWeight: 600, color: isSupported ? 'var(--status-done, #10b981)' : 'var(--status-overdue, #ef4444)' }}>
                  {isSupported ? 'Supported' : 'Unsupported'}
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--color-text-secondary, #64748B)' }}>OS Permission: </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: permission === 'granted' ? 'var(--status-done, #10b981)' : permission === 'denied' ? 'var(--status-overdue, #ef4444)' : 'var(--status-blocked, #f59e0b)',
                  }}
                >
                  {permission.toUpperCase()}
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--color-text-secondary, #64748B)' }}>Subscription State: </span>
                <span style={{ fontWeight: 600, color: isSubscribed ? 'var(--status-done, #10b981)' : 'var(--color-text-secondary, #64748B)' }}>
                  {isSubscribed ? 'Active (Subscribed)' : 'Inactive'}
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--color-text-secondary, #64748B)' }}>Authentication: </span>
                <span style={{ fontWeight: 600, color: 'var(--accent-primary, #C9662F)' }}>
                  VAPID (RFC 8292)
                </span>
              </div>
            </div>

            {/* Device Label Input */}
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="device-label-input"
                style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary, #64748B)', marginBottom: '4px' }}
              >
                Device Friendly Label
              </label>
              <input
                id="device-label-input"
                type="text"
                value={deviceLabel}
                onChange={e => setDeviceLabel(e.target.value)}
                placeholder="e.g. Work Laptop (Chrome)"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-default, #E8DED5)',
                  color: 'var(--color-text-primary, #1E293B)',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Actions for this device */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {!isSubscribed ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubscribe}
                  disabled={isLoading || !isSupported}
                  id="enable-web-push-btn"
                >
                  <Bell size={14} style={{ marginRight: 6 }} /> Enable Web Push on This Device
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleUnsubscribe}
                    disabled={isLoading}
                    id="disable-web-push-btn"
                  >
                    <BellOff size={14} style={{ marginRight: 6 }} /> Disable on This Device
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSendTestPush}
                    disabled={isLoading}
                    id="send-test-push-btn"
                  >
                    <Zap size={14} style={{ marginRight: 6 }} /> Send Test Push Alert
                  </Button>
                </>
              )}
            </div>

            {/* In-Browser Unblock Helper (when permission is denied) */}
            {permission === 'denied' && (
              <div
                style={{
                  marginTop: '14px',
                  padding: '12px 14px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary, #64748B)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ color: '#b91c1c', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} /> Notifications are blocked in this browser
                </div>
                <div>
                  Your browser remembers that notification permission was declined for this site. To unblock:
                </div>
                <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                  <li>Click the <strong>tune / padlock icon</strong> on the left side of your URL bar.</li>
                  <li>Find <strong>Notifications</strong> and change it from <em>Block</em> to <strong>Allow</strong>.</li>
                  <li>Refresh this tab, open this modal, and click <strong>Enable Web Push</strong>.</li>
                </ol>
              </div>
            )}
          </div>

          {/* Registered Devices List */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary, #1E293B)', marginBottom: '8px' }}>
              Active Subscriptions ({subscriptions.length})
            </div>

            {subscriptions.length === 0 ? (
              <div
                style={{
                  padding: '16px',
                  borderRadius: '6px',
                  background: 'var(--surface-sunken, #F5EFEB)',
                  border: '1px dashed var(--border-default, #E8DED5)',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary, #64748B)',
                  textAlign: 'center',
                }}
              >
                No registered Web Push subscriptions for this account yet. Click "Enable Web Push on This Device" above.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {subscriptions.map(s => (
                  <div
                    key={s.id}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--surface-elevated, #FAF5F0)',
                      border: '1px solid var(--border-default, #E8DED5)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12.5px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary, #1E293B)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Laptop size={14} style={{ color: 'var(--accent-primary, #C9662F)' }} />
                        {s.deviceLabel || 'Browser Device'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #64748B)', marginTop: '2px' }}>
                        Created: {new Date(s.createdAt).toLocaleDateString()} • Endpoint:{' '}
                        {s.endpoint.split('/')[2] || 'push.service'}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: 'rgba(34, 197, 94, 0.12)',
                        color: 'var(--status-done, #10b981)',
                        fontWeight: 600,
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                      }}
                    >
                      Active
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Privacy & Architecture Notice */}
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              background: 'rgba(201, 102, 47, 0.08)',
              border: '1px solid rgba(201, 102, 47, 0.2)',
              fontSize: '11.5px',
              color: 'var(--color-text-secondary, #64748B)',
              lineHeight: 1.45,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <Lock size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Architecture & Cost Compliance:</strong> Native Web Push operates using voluntary application server identification (VAPID) directly with your browser's native push daemon (Windows Action Center / macOS Notifications). Free to use, zero third-party push subscriptions (no FCM, OneSignal, or Pusher), and fully private.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-default, #E8DED5)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--surface-elevated, #FAF5F0)',
          }}
        >
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
