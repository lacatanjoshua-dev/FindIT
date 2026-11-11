import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';

import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import {
  alertCircleOutline,
  arrowBackOutline,
  checkmarkCircleOutline,
  checkmarkDoneOutline,
  closeCircleOutline,
  handRightOutline,
  notificationsOutline,
  refreshCircleOutline,
} from 'ionicons/icons';

import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '../firebase';
import type { FindItNotification } from '../services/notificationService';

import './Home.css';
import './Notifications.css';

type NotificationsProps = {
  userId: string;
  onBack: () => void;
};

type TimestampLike = { toDate?: () => Date; seconds?: number } | null | undefined;

const getDate = (value: unknown): Date | null => {
  const stamp = value as TimestampLike;

  if (stamp?.toDate) return stamp.toDate();
  if (typeof stamp?.seconds === 'number') return new Date(stamp.seconds * 1000);

  return null;
};

// "Just now", "5m ago", "3h ago", "Yesterday" or "Nov 3".
const timeAgo = (date: Date | null) => {
  if (!date) return '';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return 'Yesterday';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Icon and color for each status. Notifications can come from report status
// updates (Active / Claimed / Resolved) and old claim decisions (Approved / Rejected).
const getTone = (status?: string) => {
  switch (status) {
    case 'Claimed':
      return { tone: 'claimed', icon: handRightOutline };
    case 'Resolved':
      return { tone: 'resolved', icon: checkmarkCircleOutline };
    case 'Approved':
      return { tone: 'approved', icon: checkmarkCircleOutline };
    case 'Rejected':
      return { tone: 'rejected', icon: closeCircleOutline };
    case 'Active':
      return { tone: 'active', icon: refreshCircleOutline };
    default:
      return { tone: 'default', icon: notificationsOutline };
  }
};

type NotificationWithDate = FindItNotification & { date: Date | null };

const Notifications: FC<NotificationsProps> = ({ userId, onBack }) => {
  const [notifications, setNotifications] = useState<NotificationWithDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      setError('Please sign in to view notifications.');
      return;
    }

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const loaded = snapshot.docs.map((notificationDoc) => {
          const data = notificationDoc.data();

          return {
            id: notificationDoc.id,
            ...data,
            date: getDate(data.createdAt),
          };
        }) as NotificationWithDate[];

        loaded.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

        setNotifications(loaded);
        setLoading(false);
        setError('');
      },
      (snapshotError) => {
        console.error('Notifications listener error:', snapshotError);
        setError('Unable to load notifications. Please check Firestore rules.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  const visible = useMemo(
    () =>
      filter === 'unread'
        ? notifications.filter((notification) => !notification.isRead)
        : notifications,
    [notifications, filter]
  );

  // Split into "Today" and "Earlier".
  const groups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayItems = visible.filter((n) => n.date && n.date >= today);
    const earlierItems = visible.filter((n) => !n.date || n.date < today);

    return [
      { label: 'Today', items: todayItems },
      { label: 'Earlier', items: earlierItems },
    ].filter((group) => group.items.length > 0);
  }, [visible]);

  const markAsRead = async (notification: NotificationWithDate) => {
    if (notification.isRead) return;

    try {
      await updateDoc(doc(db, 'notifications', notification.id), { isRead: true });
    } catch (markError) {
      console.error('Error marking notification as read:', markError);
      setError('Unable to update this notification.');
    }
  };

  const markAllAsRead = async () => {
    setMarkingAll(true);

    try {
      await Promise.all(
        notifications
          .filter((notification) => !notification.isRead)
          .map((notification) =>
            updateDoc(doc(db, 'notifications', notification.id), { isRead: true })
          )
      );
    } catch (markError) {
      console.error('Error marking all notifications as read:', markError);
      setError('Unable to mark all notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonButton slot="start" fill="clear" onClick={onBack} aria-label="Back">
            <IonIcon icon={arrowBackOutline} />
          </IonButton>

          <IonTitle>Notifications</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="findit-content">
        <section className="welcome-section nt-hero">
          <p className="eyebrow">FINDIT UPDATES</p>
          <h1>Notifications</h1>
          <p className="welcome-description">
            {loading
              ? 'Loading your updates...'
              : unreadCount > 0
                ? `You have ${unreadCount} unread ${unreadCount === 1 ? 'update' : 'updates'} about your reports.`
                : "You're all caught up."}
          </p>

          {unreadCount > 0 && (
            <button
              type="button"
              className="nt-mark-all"
              onClick={() => void markAllAsRead()}
              disabled={markingAll}
            >
              <IonIcon icon={checkmarkDoneOutline} />
              {markingAll ? 'Marking...' : 'Mark all as read'}
            </button>
          )}
        </section>

        <div className="filter-section nt-filter">
          <IonSegment
            value={filter}
            onIonChange={(event) =>
              setFilter(event.detail.value === 'unread' ? 'unread' : 'all')
            }
          >
            <IonSegmentButton value="all">
              <IonLabel>All</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="unread">
              <IonLabel>Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </div>

        {error && (
          <p className="findit-message error-message" role="alert">
            <IonIcon icon={alertCircleOutline} /> {error}
          </p>
        )}

        {loading ? (
          <div className="nt-list" aria-busy="true" aria-label="Loading notifications">
            {[0, 1, 2].map((key) => (
              <div className="nt-card nt-skeleton" key={key}>
                <div className="skeleton-block nt-skeleton-icon" />
                <div className="skeleton-lines">
                  <div className="skeleton-block skeleton-line short" />
                  <div className="skeleton-block skeleton-line" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IonIcon icon={notificationsOutline} />
            </div>

            {filter === 'unread' && notifications.length > 0 ? (
              <>
                <h3>No unread notifications</h3>
                <p>You've read everything.</p>
              </>
            ) : (
              <>
                <h3>No notifications yet</h3>
                <p>Updates about your reports will appear here.</p>
              </>
            )}
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="nt-group">
              <h2 className="nt-group-label">{group.label}</h2>

              <ul className="nt-list">
                {group.items.map((notification) => {
                  const { tone, icon } = getTone(notification.status);

                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        className={`nt-card ${notification.isRead ? 'is-read' : 'is-unread'}`}
                        onClick={() => void markAsRead(notification)}
                        aria-label={`${notification.title}. ${notification.message}${
                          notification.isRead ? '' : '. Unread, tap to mark as read'
                        }`}
                      >
                        <span className={`nt-icon tone-${tone}`}>
                          <IonIcon icon={icon} />
                        </span>

                        <span className="nt-body">
                          <span className="nt-top">
                            <strong>{notification.title}</strong>
                            <small>{timeAgo(notification.date)}</small>
                          </span>

                          <span className="nt-message">{notification.message}</span>

                          {notification.status && (
                            <span className={`nt-status tone-${tone}`}>
                              {notification.status}
                            </span>
                          )}
                        </span>

                        {!notification.isRead && <span className="nt-dot" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        <div className="bottom-space" />
      </IonContent>
    </IonPage>
  );
};

export default Notifications;