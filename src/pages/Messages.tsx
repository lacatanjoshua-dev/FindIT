import { useEffect, useState } from 'react';
import type { FC } from 'react';

import {
  IonBadge,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonTabBar,
  IonTabButton,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import {
  addCircleOutline,
  chatbubbleEllipsesOutline,
  chatbubblesOutline,
  clipboardOutline,
  homeOutline,
  personOutline,
} from 'ionicons/icons';

import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

import { auth, db } from '../firebase';
import UserAvatar, { useUserProfile } from '../components/UserAvatar';
import type { AppTab } from '../App';

import './Home.css';

type MessagesProps = {
  onTabChange: (tab: AppTab) => void;
  onOpenChat: (conversationId: string) => void;
};

type TimestampLike = {
  toDate?: () => Date;
} | null;

type Conversation = {
  id: string;
  itemName: string;
  itemType: 'Lost' | 'Found';
  reporterId: string;
  reporterName: string;
  otherId: string;
  otherName: string;
  lastMessage: string;
  lastMessageAt?: TimestampLike;
  lastSenderId: string;
  readAt: Record<string, TimestampLike>;
};

const getTime = (value?: TimestampLike) =>
  value?.toDate?.()?.getTime?.() ?? 0;

const formatTime = (value?: TimestampLike) => {
  const date = value?.toDate?.();

  if (!date) {
    return '';
  }

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

type ConversationRowProps = {
  conversation: Conversation;
  me: string;
  onOpen: (conversationId: string) => void;
};

// One row in the list, with the other user's profile picture.
const ConversationRow: FC<ConversationRowProps> = ({
  conversation,
  me,
  onOpen,
}) => {
  const iAmReporter = me === conversation.reporterId;
  const otherUid = iAmReporter ? conversation.otherId : conversation.reporterId;
  const storedName = iAmReporter
    ? conversation.otherName
    : conversation.reporterName;

  const profile = useUserProfile(otherUid);
  const name = profile.name || storedName || 'FindIt user';

  const unread =
    Boolean(conversation.lastSenderId) &&
    conversation.lastSenderId !== me &&
    getTime(conversation.lastMessageAt) > getTime(conversation.readAt[me]);

  return (
    <IonItem
      button
      detail
      lines="full"
      onClick={() => onOpen(conversation.id)}
    >
      <div slot="start" style={{ marginInlineEnd: 12 }}>
        <UserAvatar name={name} photoUrl={profile.photoUrl} size={48} />
      </div>

      <IonLabel>
        <h2 style={{ fontWeight: unread ? 800 : 600 }}>{name}</h2>
        <p>
          <strong>{conversation.itemName}</strong> ({conversation.itemType})
        </p>
        <p
          style={{
            fontWeight: unread ? 700 : 400,
            color: unread ? '#183B39' : undefined,
          }}
        >
          {conversation.lastMessage || 'No messages yet.'}
        </p>
      </IonLabel>

      <div slot="end" style={{ textAlign: 'right' }}>
        <IonText color="medium">
          <small>{formatTime(conversation.lastMessageAt)}</small>
        </IonText>

        {unread && (
          <div>
            <IonBadge color="success">New</IonBadge>
          </div>
        )}
      </div>
    </IonItem>
  );
};

const Messages: FC<MessagesProps> = ({ onTabChange, onOpenChat }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const me = auth.currentUser?.uid ?? '';

  useEffect(() => {
    let unsubscribeConversations: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeConversations?.();
      unsubscribeConversations = undefined;

      if (!user) {
        setConversations([]);
        setLoading(false);
        setError('Please log in to view your messages.');
        return;
      }

      setLoading(true);
      setError('');

      // Users can read only conversations they take part in.
      const conversationsQuery = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', user.uid)
      );

      unsubscribeConversations = onSnapshot(
        conversationsQuery,
        (snapshot) => {
          const loaded: Conversation[] = snapshot.docs.map((conversationDoc) => {
            const data = conversationDoc.data();

            return {
              id: conversationDoc.id,
              itemName: String(data.itemName ?? 'Item'),
              itemType: data.itemType === 'Found' ? 'Found' : 'Lost',
              reporterId: String(data.reporterId ?? ''),
              reporterName: String(data.reporterName ?? ''),
              otherId: String(data.otherId ?? ''),
              otherName: String(data.otherName ?? ''),
              lastMessage: String(data.lastMessage ?? ''),
              lastMessageAt: data.lastMessageAt ?? null,
              lastSenderId: String(data.lastSenderId ?? ''),
              readAt: (data.readAt ?? {}) as Record<string, TimestampLike>,
            };
          });

          loaded.sort(
            (a, b) => getTime(b.lastMessageAt) - getTime(a.lastMessageAt)
          );

          setConversations(loaded);
          setLoading(false);
          setError('');
        },
        (snapshotError) => {
          console.error('Conversations listener error:', snapshotError);
          setError('Could not load your messages. Check your Firestore rules.');
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeConversations?.();
    };
  }, []);

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonTitle>
            <span className="brand-pin">●</span> Messages
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="findit-content">
        <section className="welcome-section">
          <p className="eyebrow">CHAT WITH OTHER USERS</p>
          <h1>Your Messages</h1>
          <p className="welcome-description">
            Talk to the owner or the finder of an item to arrange the handover.
          </p>
        </section>

        {error && (
          <p className="findit-message error-message" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div className="empty-state">
            <IonSpinner name="crescent" />
            <p>Loading messages...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="empty-state">
            <IonIcon icon={chatbubbleEllipsesOutline} />
            <h3>No conversations yet</h3>
            <p>
              Open an item on Home and tap Message to start a conversation.
            </p>
          </div>
        ) : (
          <IonList>
            {conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                me={me}
                onOpen={onOpenChat}
              />
            ))}
          </IonList>
        )}

        <div className="bottom-space" />
      </IonContent>

      <IonTabBar slot="bottom" className="findit-tabbar">
        <IonTabButton tab="home" onClick={() => onTabChange('home')}>
          <IonIcon icon={homeOutline} />
          <IonLabel>Home</IonLabel>
        </IonTabButton>

        <IonTabButton tab="report" onClick={() => onTabChange('report')}>
          <IonIcon icon={addCircleOutline} />
          <IonLabel>Report</IonLabel>
        </IonTabButton>

        <IonTabButton tab="myreports" onClick={() => onTabChange('myreports')}>
          <IonIcon icon={clipboardOutline} />
          <IonLabel>My Reports</IonLabel>
        </IonTabButton>

        <IonTabButton
          tab="messages"
          selected
          onClick={() => onTabChange('messages')}
        >
          <IonIcon icon={chatbubblesOutline} />
          <IonLabel>Messages</IonLabel>
        </IonTabButton>

        <IonTabButton tab="profile" onClick={() => onTabChange('profile')}>
          <IonIcon icon={personOutline} />
          <IonLabel>Profile</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonPage>
  );
};

export default Messages;