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
  IonSpinner,
} from '@ionic/react';

import {
  addCircleOutline,
  calendarOutline,
  chatbubbleEllipsesOutline,
  chatbubblesOutline,
  clipboardOutline,
  closeOutline,
  documentTextOutline,
  homeOutline,
  locationOutline,
  notificationsOutline,
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

// Shows the item's photo. Falls back to the emoji if there is no photo
// or if the image fails to load.
const ItemPhoto: FC<ItemPhotoProps> = ({ src, type, variant }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const emoji = type === 'Lost' ? '🔎' : '🎒';

  if (!src || failed) {
    return <span>{emoji}</span>;
  }

  if (variant === 'details') {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        style={{
          display: 'block',
          width: '100%',
          maxHeight: '280px',
          objectFit: 'contain',
          borderRadius: '12px',
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
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
        <section className="welcome-section">
          <p className="eyebrow">UNIVERSITY LOST &amp; FOUND</p>

          <h1>Find what you've lost.</h1>

          <p className="welcome-description">
            Lost something? Found something? Let's help it find its way home.
          </p>
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
              <IonLabel>All Items</IonLabel>
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

          <span className="item-count">
            {filteredItems.length}{' '}
            {filteredItems.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            <IonSpinner name="crescent" />
            <p>Loading reports...</p>
          </div>
        ) : (
          <div className="items-list">
            {filteredItems.map((item) => (
              <article
                className="item-card item-card-clickable"
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`View details for ${item.name}`}
                onClick={() => setSelectedItem(item)}
                onKeyDown={(event) => handleItemKeyDown(event, item)}
              >
                <div
                  className="item-emoji"
                  style={{
                    overflow: 'hidden',
                    padding: item.imageUrl ? 0 : undefined,
                  }}
                >
                  <ItemPhoto
                    src={item.imageUrl}
                    type={item.type}
                    variant="card"
                  />
                </div>

                <div className="item-info">
                  <IonBadge
                    className={
                      item.type === 'Lost' ? 'status-lost' : 'status-found'
                    }
                  >
                    {item.type}
                  </IonBadge>

                  <IonBadge
                    color={
                      item.status === 'Active'
                        ? 'primary'
                        : item.status === 'Claimed'
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {item.status}
                  </IonBadge>

                  <IonBadge color="light">{item.category}</IonBadge>

                  <h3>{item.name}</h3>
                  <p>{item.description}</p>

                  <div className="item-meta">
                    <span>
                      <IonIcon icon={locationOutline} />
                      {item.location}
                    </span>

                    <span>
                      <IonIcon icon={timeOutline} />
                      {item.date}
                    </span>
                  </div>

                  {canMessage(item) && (
                    <div
                      className="bookmark-action"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <IonButton
                        size="small"
                        fill="outline"
                        disabled={messagingItemId === item.id}
                        onClick={() => void handleMessage(item)}
                      >
                        <IonIcon
                          icon={chatbubbleEllipsesOutline}
                          slot="start"
                        />
                        {messagingItemId === item.id ? 'Opening...' : 'Message'}
                      </IonButton>
                    </div>
                  )}

                  <small className="item-details-hint">
                    {item.userId === currentUser?.uid ? 'Your report · ' : ''}
                    Tap to view details
                  </small>
                </div>
              </article>
            ))}

            {filteredItems.length === 0 && (
              <div className="empty-state">
                <IonIcon icon={searchOutline} />
                <h3>No items found</h3>
                <p>Try another filter or submit a report.</p>

                <IonButton onClick={() => onActiveTabChange('report')}>
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
        <IonHeader>
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
              <div className="item-details-emoji">
                <ItemPhoto
                  src={selectedItem.imageUrl}
                  type={selectedItem.type}
                  variant="details"
                />
              </div>

              <IonBadge
                className={
                  selectedItem.type === 'Lost'
                    ? 'status-lost'
                    : 'status-found'
                }
              >
                {selectedItem.type}
              </IonBadge>

              <IonBadge
                color={
                  selectedItem.status === 'Active'
                    ? 'primary'
                    : selectedItem.status === 'Claimed'
                      ? 'warning'
                      : 'success'
                }
              >
                Status: {selectedItem.status}
              </IonBadge>

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
                  <p>{selectedItem.date || 'Date not provided'}</p>
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

              {canMessage(selectedItem) && (
                <IonButton
                  expand="block"
                  fill="outline"
                  disabled={messagingItemId === selectedItem.id}
                  onClick={() => void handleMessage(selectedItem)}
                >
                  <IonIcon icon={chatbubbleEllipsesOutline} slot="start" />
                  {messagingItemId === selectedItem.id
                    ? 'Opening...'
                    : selectedItem.type === 'Found'
                      ? 'This is mine - message the finder'
                      : 'I found this - message the owner'}
                </IonButton>
              )}

              {selectedItem.status !== 'Active' && (
                <p>This item has already been claimed, so messaging is closed.</p>
              )}

              <IonButton
                expand="block"
                className="submit-report-button"
                onClick={() => setSelectedItem(null)}
              >
                Close Details
              </IonButton>
            </div>
          )}
        </IonContent>
      </IonModal>
    </IonPage>
  );
};

export default Home;