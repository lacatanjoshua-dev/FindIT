import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';

import {
  IonBadge,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTabBar,
  IonTabButton,
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
import './Messages.css';

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

// "9:24 PM" for today, "Yesterday", "Mon" this week, otherwise "Nov 3".
const formatTime = (value?: TimestampLike) => {
  const date = value?.toDate?.();

  if (!date) {
    return '';
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86400000
  );

  if (diffDays <= 0) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  if (diffDays === 1) return 'Yesterday';

  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const isUnread = (conversation: Conversation, me: string) =>
  Boolean(conversation.lastSenderId) &&
  conversation.lastSenderId !== me &&
  getTime(conversation.lastMessageAt) > getTime(conversation.readAt[me]);

type ConversationRowProps = {
  conversation: Conversation;
  me: string;
  onOpen: (conversationId: string) => void;
};

// One conversation in the list, with the other user's profile picture.
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

  const unread = isUnread(conversation, me);
  const sentByMe = conversation.lastSenderId === me;

  const preview = conversation.lastMessage
    ? `${sentByMe ? 'You: ' : ''}${conversation.lastMessage}`
    : 'No messages yet. Say hello!';

  return (
    <button
      type="button"
      className={`convo-row ${unread ? 'convo-row-unread' : ''}`}
      onClick={() => onOpen(conversation.id)}
      aria-label={`Open chat with ${name} about ${conversation.itemName}${
        unread ? ', unread' : ''
      }`}
    >
      <div className="convo-avatar">
        <UserAvatar name={name} photoUrl={profile.photoUrl} size={52} />
        <span
          className={`convo-type-dot ${
            conversation.itemType === 'Found' ? 'is-found' : 'is-lost'
          }`}
          aria-hidden="true"
        />
      </div>

      <div className="convo-body">
        <div className="convo-top">
          <span className="convo-name">{name}</span>
          <span className="convo-time">
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>

        <div className="convo-item">
          <span
            className={`convo-item-tag ${
              conversation.itemType === 'Found' ? 'is-found' : 'is-lost'
            }`}
          >
            {conversation.itemType}
          </span>
          <span className="convo-item-name">{conversation.itemName}</span>
        </div>

        <div className="convo-bottom">
          <span
            className={`convo-preview ${
              conversation.lastMessage ? '' : 'convo-preview-empty'
            }`}
          >
            {preview}
          </span>

          {unread && <span className="convo-unread-dot" aria-hidden="true" />}
        </div>
      </div>
    </button>
  );
};

const Messages: FC<MessagesProps> = ({ onTabChange, onOpenChat }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [search, setSearch] = useState('');

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

  const unreadCount = useMemo(
    () => conversations.filter((conversation) => isUnread(conversation, me)).length,
    [conversations, me]
  );

  // Filter by All / Unread, then by the search text
  // (the other person's name, the item name, or the last message).
  const visibleConversations = useMemo(() => {
    const term = search.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (filter === 'unread' && !isUnread(conversation, me)) {
        return false;
      }

      if (!term) {
        return true;
      }

      const otherName =
        me === conversation.reporterId
          ? conversation.otherName
          : conversation.reporterName;

      return [otherName, conversation.itemName, conversation.lastMessage]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [conversations, filter, me, search]);

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
        <section className="welcome-section messages-hero">
          <p className="eyebrow">CHAT WITH OTHER USERS</p>
          <h1>Your Messages</h1>
          <p className="welcome-description">
            Talk to the owner or the finder of an item to arrange the handover.
          </p>
        </section>

        <div className="search-section">
          <IonSearchbar
            className="findit-search"
            placeholder="Search people or items..."
            value={search}
            debounce={150}
            onIonInput={(event) => setSearch(String(event.detail.value ?? ''))}
          />
        </div>

        <div className="filter-section messages-filter">
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
              <IonLabel>
                Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
              </IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </div>

        {error && (
          <p className="findit-message error-message" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div className="convo-list" aria-busy="true" aria-label="Loading messages">
            {[0, 1, 2, 3].map((key) => (
              <div className="convo-row convo-skeleton" key={key}>
                <div className="skeleton-block convo-skeleton-avatar" />
                <div className="convo-body">
                  <div className="skeleton-block convo-skeleton-line short" />
                  <div className="skeleton-block convo-skeleton-line" />
                  <div className="skeleton-block convo-skeleton-line medium" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IonIcon icon={chatbubbleEllipsesOutline} />
            </div>

            {search.trim() && conversations.length > 0 ? (
              <>
                <h3>No matching chats</h3>
                <p>Try another name or item.</p>
              </>
            ) : filter === 'unread' && conversations.length > 0 ? (
              <>
                <h3>You're all caught up</h3>
                <p>No unread messages right now.</p>
              </>
            ) : (
              <>
                <h3>No conversations yet</h3>
                <p>
                  Open an item on Home and tap Message to start a conversation.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="convo-list">
            {visibleConversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                me={me}
                onOpen={onOpenChat}
              />
            ))}
          </div>
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
          {unreadCount > 0 && (
            <IonBadge className="tab-unread-badge">
              {unreadCount > 9 ? '9+' : unreadCount}
            </IonBadge>
          )}
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