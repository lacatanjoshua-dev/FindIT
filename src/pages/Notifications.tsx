import './Notifications.css';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import {
  checkmarkCircleOutline,
  notificationsOutline,
  arrowBackOutline,
  mailOpenOutline,
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

type NotificationsProps = {
  userId: string;
  onBack: () => void;
};

// Notifications can come from claim decisions (Approved / Rejected)
// and from report status updates (Active / Claimed / Resolved).
// This helper accepts any status text, so it works with both.
const isPositiveStatus = (status?: string) =>
  status === 'Approved' || status === 'Resolved';

const Notifications: FC<NotificationsProps> = ({
  userId,
  onBack,
}) => {
  const [notifications, setNotifications] = useState<FindItNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        const loadedNotifications = snapshot.docs.map((notificationDoc) => ({
          id: notificationDoc.id,
          ...notificationDoc.data(),
        })) as FindItNotification[];

        loadedNotifications.sort((a, b) => {
          const dateA =
            (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
          const dateB =
            (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;

          return dateB - dateA;
        });

        setNotifications(loadedNotifications);
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

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  const markAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        isRead: true,
      });
    } catch (markError) {
      console.error('Error marking notification as read:', markError);
      setError('Unable to update this notification.');
    }
  };

  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter(
      (notification) => !notification.isRead
    );

    try {
      await Promise.all(
        unreadNotifications.map((notification) =>
          updateDoc(doc(db, 'notifications', notification.id), {
            isRead: true,
          })
        )
      );
    } catch (markError) {
      console.error('Error marking all notifications as read:', markError);
      setError('Unable to mark all notifications as read.');
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'Approved':
      case 'Resolved':
        return 'success';
      case 'Claimed':
        return 'warning';
      case 'Active':
        return 'primary';
      default:
        return 'medium';
    }
  };

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonButton
            slot="start"
            fill="clear"
            onClick={onBack}
            aria-label="Back"
          >
            <IonIcon icon={arrowBackOutline} />
          </IonButton>

          <IonTitle>Notifications</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="notifications-content">
        <div className="notifications-page">
          <div className="notifications-heading">
            <div>
              <p className="notifications-eyebrow">FINDIT UPDATES</p>
              <h1>Your Notifications</h1>
              <p>Updates about your lost and found items.</p>
            </div>

            {unreadCount > 0 && (
              <IonButton
                fill="outline"
                size="small"
                onClick={() => void markAllAsRead()}
              >
                Mark all read
              </IonButton>
            )}
          </div>

          <div className="notifications-count">
            <IonIcon icon={notificationsOutline} />
            <span>
              {notifications.length} notification
              {notifications.length === 1 ? '' : 's'}
            </span>

            {unreadCount > 0 && (
              <IonBadge color="success">
                {unreadCount} unread
              </IonBadge>
            )}
          </div>

          {loading ? (
            <div className="notifications-state">
              <IonSpinner name="crescent" />
              <p>Loading notifications...</p>
            </div>
          ) : error ? (
            <div className="notifications-state">
              <IonText color="danger">{error}</IonText>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notifications-empty">
              <IonIcon icon={notificationsOutline} />
              <h2>No notifications yet</h2>
              <p>
                When there are updates about your claims,
                they will appear here.
              </p>
            </div>
          ) : (
            <IonList className="notifications-list">
              {notifications.map((notification) => (
                <IonItem
                  key={notification.id}
                  className={`notification-item ${
                    notification.isRead ? 'read' : 'unread'
                  }`}
                  lines="none"
                >
                  <div className="notification-icon" slot="start">
                    <IonIcon
                      icon={
                        isPositiveStatus(notification.status)
                          ? checkmarkCircleOutline
                          : notificationsOutline
                      }
                    />
                  </div>

                  <IonLabel>
                    <h2>{notification.title}</h2>
                    <p>{notification.message}</p>

                    <div className="notification-item-footer">
                      {notification.status && (
                        <IonBadge color={getStatusColor(notification.status)}>
                          {notification.status}
                        </IonBadge>
                      )}

                      {!notification.isRead && (
                        <span className="notification-unread-label">
                          Unread
                        </span>
                      )}
                    </div>
                  </IonLabel>

                  {!notification.isRead && (
                    <IonButton
                      slot="end"
                      fill="clear"
                      size="small"
                      onClick={() => void markAsRead(notification.id)}
                      aria-label="Mark as read"
                    >
                      <IonIcon icon={mailOpenOutline} />
                    </IonButton>
                  )}
                </IonItem>
              ))}
            </IonList>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Notifications;
