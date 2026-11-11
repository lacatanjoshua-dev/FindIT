import { useEffect, useMemo, useRef, useState } from 'react';
import type { FC, KeyboardEvent } from 'react';

import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonModal,
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
  calendarOutline,
  chatbubbleEllipsesOutline,
  chatbubblesOutline,
  chevronForward,
  clipboardOutline,
  closeOutline,
  documentTextOutline,
  homeOutline,
  locationOutline,
  notificationsOutline,
  personCircleOutline,
  personOutline,
  searchOutline,
  timeOutline,
} from 'ionicons/icons';

import { collection, onSnapshot } from 'firebase/firestore';

import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { startConversation } from '../services/messagingService';
import { normalizeCategory } from '../constants/categories';
import type { ItemCategory } from '../constants/categories';
import './Home.css';

type ReportStatus = 'Active' | 'Claimed' | 'Resolved';

type LostFoundItem = {
  id: string;
  name: string;
  type: 'Lost' | 'Found';
  category: ItemCategory;
  location: string;
  date: string;
  description: string;
  userId?: string;
  reporterName: string;
  status: ReportStatus;
  imageUrl: string;
};

type NavigationTab =
  | 'home'
  | 'search'
  | 'report'
  | 'myreports'
  | 'messages'
  | 'profile'
  | 'notifications';

type HomeProps = {
  activeTab: 'home';
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenChat: (conversationId: string) => void;
  unreadNotificationsCount: number;
  onActiveTabChange: (tab: NavigationTab) => void;
  // Kept optional so App.tsx can still pass it. Not used anymore.
  searchRequest?: number;
};

type ItemPhotoProps = {
  src: string;
  type: 'Lost' | 'Found';
  variant: 'card' | 'details';
};

// Turns "2026-11-10" into "Today", "Yesterday", "3 days ago" or "Nov 3".
const formatRelativeDate = (value: string): string => {
  if (!value) {
    return 'No date';
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const parsed = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  const diffDays = Math.round(
    (today.getTime() - parsed.getTime()) / 86400000
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year:
      parsed.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

// Shows the item's photo. Falls back to the emoji if there is no photo
// or if the image fails to load.
const ItemPhoto: FC<ItemPhotoProps> = ({ src, type, variant }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const emoji = type === 'Lost' ? '🔎' : '🎒';

  if (!src || failed) {
    return <span className="item-photo-fallback">{emoji}</span>;
  }

  return (
    <img
      src={src}
      alt=""
      loading={variant === 'card' ? 'lazy' : undefined}
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: variant === 'card' ? 'cover' : 'contain',
        borderRadius: 'inherit',
      }}
    />
  );
};

const Home: FC<HomeProps> = ({
  activeTab,
  onOpenProfile,
  onOpenNotifications,
  onOpenChat,
  unreadNotificationsCount,
  onActiveTabChange,
}) => {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [selectedItem, setSelectedItem] =
    useState<LostFoundItem | null>(null);

  const [messagingItemId, setMessagingItemId] = useState<string | null>(null);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUser = auth.currentUser;

  const showNotice = (message: string) => {
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
    }

    setNotice(message);

    noticeTimer.current = setTimeout(() => {
      setNotice('');
      noticeTimer.current = null;
    }, 4000);
  };

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  // Listen for Firebase Authentication and Firestore updates.
  useEffect(() => {
    let unsubscribeItems: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeItems?.();

      if (!user) {
        setItems([]);
        setLoading(false);
        setError('Please log in to view item reports.');
        return;
      }

      setLoading(true);
      setError('');

      unsubscribeItems = onSnapshot(
        collection(db, 'items'),
        (snapshot) => {
          const loadedItems: LostFoundItem[] = snapshot.docs.map(
            (document) => {
              const data = document.data();

              return {
                id: document.id,
                name: String(data.name ?? 'Unnamed item'),
                type:
                  String(data.type ?? 'Lost').toLowerCase() === 'found'
                    ? 'Found'
                    : 'Lost',
                category: normalizeCategory(data.category),
                location: String(data.location ?? 'Unknown location'),
                date: String(data.date ?? ''),
                description: String(data.description ?? ''),
                userId:
                  typeof data.userId === 'string'
                    ? data.userId
                    : undefined,
                reporterName:
                  typeof data.reporterName === 'string'
                    ? data.reporterName
                    : '',
                status:
                  data.status === 'Claimed' || data.status === 'Resolved'
                    ? data.status
                    : 'Active',
                imageUrl:
                  typeof data.imageUrl === 'string' ? data.imageUrl : '',
              };
            }
          );

          loadedItems.sort((a, b) => b.date.localeCompare(a.date));

          setItems(loadedItems);
          setLoading(false);
          setError('');
        },
        (err) => {
          console.error('Firestore read error:', err);
          setError('Could not load reports. Check your Firestore rules.');
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeItems?.();
    };
  }, []);

  // Home only filters by Lost / Found. Searching is done on the Search page.
  const filteredItems = useMemo(
    () =>
      items.filter((item) => filter === 'All' || item.type === filter),
    [items, filter]
  );

  const lostCount = useMemo(
    () => items.filter((item) => item.type === 'Lost').length,
    [items]
  );

  const foundCount = items.length - lostCount;

  const returnedCount = useMemo(
    () => items.filter((item) => item.status !== 'Active').length,
    [items]
  );

  // Open a conversation with the reporter of the item.
  const handleMessage = async (item: LostFoundItem) => {
    setMessagingItemId(item.id);
    setNotice('');

    try {
      const conversationId = await startConversation({
        id: item.id,
        name: item.name,
        type: item.type,
        userId: item.userId,
        reporterName: item.reporterName,
      });

      setSelectedItem(null);
      onOpenChat(conversationId);
    } catch (err) {
      console.error('Start conversation error:', err);

      showNotice(
        err instanceof Error
          ? err.message
          : 'Could not open the conversation. Please try again.'
      );
    } finally {
      setMessagingItemId(null);
    }
  };

  const canMessage = (item: LostFoundItem) =>
    Boolean(currentUser) &&
    Boolean(item.userId) &&
    item.userId !== currentUser?.uid &&
    item.status === 'Active';

  const handleItemKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    item: LostFoundItem
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedItem(item);
    }
  };

  const statusClass = (status: ReportStatus) =>
    status === 'Claimed' ? 'item-status-claimed' : 'item-status-resolved';

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonTitle>
            <span className="brand-pin">●</span> FindIt
          </IonTitle>

          <IonButton
            slot="end"
            fill="clear"
            className="notification-button"
            aria-label={
              unreadNotificationsCount > 0
                ? `Notifications, ${unreadNotificationsCount} unread`
                : 'Notifications'
            }
            onClick={onOpenNotifications}
          >
            <IonIcon icon={notificationsOutline} />

            {unreadNotificationsCount > 0 && (
              <IonBadge color="danger" className="notification-count">
                {unreadNotificationsCount > 99
                  ? '99+'
                  : unreadNotificationsCount}
              </IonBadge>
            )}
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="findit-content">
        {/* Hero with live counts */}
        <section className="welcome-section">
          <p className="eyebrow">UNIVERSITY LOST &amp; FOUND</p>

          <h1>Find what you've lost.</h1>

          <p className="welcome-description">
            Lost something? Found something? Let's help it find its way home.
          </p>

          <div className="hero-stats">
            <div className="hero-stat">
              <strong>{loading ? '–' : lostCount}</strong>
              <span>Lost</span>
            </div>
            <div className="hero-stat">
              <strong>{loading ? '–' : foundCount}</strong>
              <span>Found</span>
            </div>
            <div className="hero-stat">
              <strong>{loading ? '–' : returnedCount}</strong>
              <span>Claimed</span>
            </div>
          </div>
        </section>

        {/* Tapping the search bar opens the Search page. */}
        <div className="search-section">
          <IonSearchbar
            className="findit-search"
            placeholder="Search items or locations..."
            onIonFocus={() => onActiveTabChange('search')}
          />
        </div>

        <div className="filter-section">
          <IonSegment
            value={filter}
            onIonChange={(event) =>
              setFilter(String(event.detail.value ?? 'All'))
            }
          >
            <IonSegmentButton value="All">
              <IonLabel>All</IonLabel>
            </IonSegmentButton>

            <IonSegmentButton value="Lost">
              <IonLabel>Lost</IonLabel>
            </IonSegmentButton>

            <IonSegmentButton value="Found">
              <IonLabel>Found</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </div>

        {notice && (
          <p className="findit-message success-message" role="status">
            {notice}
          </p>
        )}

        {error && (
          <p className="findit-message error-message" role="alert">
            {error}
          </p>
        )}

        <div className="section-heading">
          <div>
            <h2>Recent Items</h2>
            <p>Items reported around your campus</p>
          </div>

          {!loading && (
            <span className="item-count">
              {filteredItems.length}{' '}
              {filteredItems.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="items-list" aria-busy="true" aria-label="Loading reports">
            {[0, 1, 2].map((key) => (
              <div className="item-card skeleton-card" key={key}>
                <div className="skeleton-block skeleton-thumb" />
                <div className="skeleton-lines">
                  <div className="skeleton-block skeleton-line short" />
                  <div className="skeleton-block skeleton-line" />
                  <div className="skeleton-block skeleton-line" />
                  <div className="skeleton-block skeleton-line medium" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="items-list">
            {filteredItems.map((item) => {
              const isMine = item.userId === currentUser?.uid;
              const showMessage = canMessage(item);

              return (
                <article
                  className="item-card item-card-clickable home-item-card"
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${item.name}`}
                  onClick={() => setSelectedItem(item)}
                  onKeyDown={(event) => handleItemKeyDown(event, item)}
                >
                  <div className="item-emoji item-thumb">
                    <ItemPhoto
                      src={item.imageUrl}
                      type={item.type}
                      variant="card"
                    />

                    <span
                      className={`type-tag ${
                        item.type === 'Lost' ? 'type-tag-lost' : 'type-tag-found'
                      }`}
                    >
                      {item.type}
                    </span>
                  </div>

                  <div className="item-info item-body">
                    <div className="item-topline">
                      <span className="item-category">{item.category}</span>

                      {item.status !== 'Active' && (
                        <span
                          className={`item-status-tag ${statusClass(item.status)}`}
                        >
                          {item.status}
                        </span>
                      )}
                    </div>

                    <h3>{item.name}</h3>

                    {item.description && (
                      <p className="item-desc">{item.description}</p>
                    )}

                    <div className="item-meta">
                      <span>
                        <IonIcon icon={locationOutline} />
                        {item.location}
                      </span>

                      <span>
                        <IonIcon icon={timeOutline} />
                        {formatRelativeDate(item.date)}
                      </span>
                    </div>

                    <div
                      className="item-card-footer"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {isMine ? (
                        <span className="item-mine-tag">Your report</span>
                      ) : (
                        <span />
                      )}

                      {showMessage ? (
                        <IonButton
                          size="small"
                          className="item-message-btn"
                          disabled={messagingItemId === item.id}
                          onClick={() => void handleMessage(item)}
                        >
                          <IonIcon
                            icon={chatbubbleEllipsesOutline}
                            slot="start"
                          />
                          {messagingItemId === item.id
                            ? 'Opening...'
                            : 'Message'}
                        </IonButton>
                      ) : (
                        <IonIcon
                          icon={chevronForward}
                          className="item-chevron"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

            {filteredItems.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <IonIcon icon={searchOutline} />
                </div>
                <h3>No items found</h3>
                <p>Try another filter or submit a report.</p>

                <IonButton
                  className="empty-state-button"
                  onClick={() => onActiveTabChange('report')}
                >
                  <IonIcon icon={addCircleOutline} slot="start" />
                  Report an Item
                </IonButton>
              </div>
            )}
          </div>
        )}

        <div className="report-banner">
          <div>
            <h3>Lost or found something?</h3>
            <p>Submit a report to help reunite items with their owners.</p>
          </div>

          <IonButton onClick={() => onActiveTabChange('report')}>
            <IonIcon icon={addCircleOutline} slot="start" />
            Report
          </IonButton>
        </div>

        <div className="bottom-space" />
      </IonContent>

      {/* Bottom navigation (no Search tab; use the search bar instead) */}
      <IonTabBar slot="bottom" className="findit-tabbar">
        <IonTabButton
          tab="home"
          selected={activeTab === 'home'}
          onClick={() => onActiveTabChange('home')}
        >
          <IonIcon icon={homeOutline} />
          <IonLabel>Home</IonLabel>
        </IonTabButton>

        <IonTabButton
          tab="report"
          onClick={() => onActiveTabChange('report')}
        >
          <IonIcon icon={addCircleOutline} />
          <IonLabel>Report</IonLabel>
        </IonTabButton>

        <IonTabButton
          tab="myreports"
          onClick={() => onActiveTabChange('myreports')}
        >
          <IonIcon icon={clipboardOutline} />
          <IonLabel>My Reports</IonLabel>
        </IonTabButton>

        <IonTabButton
          tab="messages"
          onClick={() => onActiveTabChange('messages')}
        >
          <IonIcon icon={chatbubblesOutline} />
          <IonLabel>Messages</IonLabel>
        </IonTabButton>

        <IonTabButton tab="profile" onClick={onOpenProfile}>
          <IonIcon icon={personOutline} />
          <IonLabel>Profile</IonLabel>
        </IonTabButton>
      </IonTabBar>

      {/* Item Details Modal */}
      <IonModal
        isOpen={selectedItem !== null}
        onDidDismiss={() => setSelectedItem(null)}
      >
        <IonHeader className="findit-header">
          <IonToolbar>
            <IonTitle>Item Details</IonTitle>

            <IonButton
              slot="end"
              fill="clear"
              aria-label="Close item details"
              onClick={() => setSelectedItem(null)}
            >
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonToolbar>
        </IonHeader>

        <IonContent className="ion-padding item-details-content">
          {selectedItem && (
            <div className="item-details-panel">
              <div className="item-details-photo">
                <ItemPhoto
                  src={selectedItem.imageUrl}
                  type={selectedItem.type}
                  variant="details"
                />

                <span
                  className={`type-tag type-tag-large ${
                    selectedItem.type === 'Lost'
                      ? 'type-tag-lost'
                      : 'type-tag-found'
                  }`}
                >
                  {selectedItem.type}
                </span>
              </div>

              <div className="item-topline">
                <span className="item-category">{selectedItem.category}</span>

                {selectedItem.status !== 'Active' && (
                  <span
                    className={`item-status-tag ${statusClass(
                      selectedItem.status
                    )}`}
                  >
                    {selectedItem.status}
                  </span>
                )}
              </div>

              <h1 className="item-details-title">{selectedItem.name}</h1>

              <p className="item-details-description">
                {selectedItem.description || 'No description provided.'}
              </p>

              <div className="item-details-row">
                <IonIcon icon={locationOutline} />
                <div>
                  <strong>Location</strong>
                  <p>{selectedItem.location}</p>
                </div>
              </div>

              <div className="item-details-row">
                <IonIcon icon={calendarOutline} />
                <div>
                  <strong>Date reported</strong>
                  <p>
                    {selectedItem.date
                      ? `${formatRelativeDate(selectedItem.date)} · ${selectedItem.date}`
                      : 'Date not provided'}
                  </p>
                </div>
              </div>

              <div className="item-details-row">
                <IonIcon icon={documentTextOutline} />
                <div>
                  <strong>Report type</strong>
                  <p>
                    {selectedItem.type} item · {selectedItem.category}
                  </p>
                </div>
              </div>

              {selectedItem.reporterName && (
                <div className="item-details-row">
                  <IonIcon icon={personCircleOutline} />
                  <div>
                    <strong>Reported by</strong>
                    <p>
                      {selectedItem.userId === currentUser?.uid
                        ? 'You'
                        : selectedItem.reporterName}
                    </p>
                  </div>
                </div>
              )}

              {selectedItem.status !== 'Active' && (
                <p className="item-details-note">
                  This item has already been claimed, so messaging is closed.
                </p>
              )}

              <div className="item-details-actions">
                {canMessage(selectedItem) && (
                  <IonButton
                    expand="block"
                    className="item-primary-action"
                    disabled={messagingItemId === selectedItem.id}
                    onClick={() => void handleMessage(selectedItem)}
                  >
                    <IonIcon icon={chatbubbleEllipsesOutline} slot="start" />
                    {messagingItemId === selectedItem.id
                      ? 'Opening...'
                      : selectedItem.type === 'Found'
                        ? 'This is mine – message the finder'
                        : 'I found this – message the owner'}
                  </IonButton>
                )}

                <IonButton
                  expand="block"
                  fill="outline"
                  className="item-secondary-action"
                  onClick={() => setSelectedItem(null)}
                >
                  Close
                </IonButton>
              </div>
            </div>
          )}
        </IonContent>
      </IonModal>
    </IonPage>
  );
};

export default Home;