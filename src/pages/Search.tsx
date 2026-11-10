import { useEffect, useMemo, useRef, useState } from 'react';
import type { FC } from 'react';

import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import {
  arrowBackOutline,
  chatbubbleEllipsesOutline,
  locationOutline,
  searchOutline,
  timeOutline,
} from 'ionicons/icons';

import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';

import { auth, db } from '../firebase';
import { ITEM_CATEGORIES, normalizeCategory } from '../constants/categories';
import type { ItemCategory } from '../constants/categories';
import { startConversation } from '../services/messagingService';
import type { AppTab } from '../App';

import './Home.css';

type SearchProps = {
  onTabChange: (tab: AppTab) => void;
  onOpenChat: (conversationId: string) => void;
};

type ReportStatus = 'Active' | 'Claimed' | 'Resolved';

type SearchItem = {
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

// Shows the item's photo, or the emoji if there is no photo.
const ItemPhoto: FC<{ src: string; type: 'Lost' | 'Found' }> = ({
  src,
  type,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <span>{type === 'Lost' ? '🔎' : '🎒'}</span>;
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

const Search: FC<SearchProps> = ({ onTabChange, onOpenChat }) => {
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const [messagingItemId, setMessagingItemId] = useState<string | null>(null);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchbarRef = useRef<HTMLIonSearchbarElement>(null);

  const currentUser = auth.currentUser;

  // Focus the search bar when this page opens from Home.
  useEffect(() => {
    const timer = setTimeout(() => {
      void searchbarRef.current?.setFocus();
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    let unsubscribeItems: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeItems?.();
      unsubscribeItems = undefined;

      if (!user) {
        setItems([]);
        setLoading(false);
        setError('Please log in to search items.');
        return;
      }

      setLoading(true);
      setError('');

      unsubscribeItems = onSnapshot(
        collection(db, 'items'),
        (snapshot) => {
          const loaded: SearchItem[] = snapshot.docs.map((itemDoc) => {
            const data = itemDoc.data();

            return {
              id: itemDoc.id,
              name: String(data.name ?? 'Unnamed item'),
              type:
                String(data.type ?? 'Lost').toLowerCase() === 'found'
                  ? 'Found'
                  : 'Lost',
              category: normalizeCategory(data.category),
              location: String(data.location ?? 'Unknown location'),
              date: String(data.date ?? ''),
              description: String(data.description ?? ''),
              userId: typeof data.userId === 'string' ? data.userId : undefined,
              reporterName:
                typeof data.reporterName === 'string' ? data.reporterName : '',
              status:
                data.status === 'Claimed' || data.status === 'Resolved'
                  ? data.status
                  : 'Active',
              imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
            };
          });

          loaded.sort((a, b) => b.date.localeCompare(a.date));

          setItems(loaded);
          setLoading(false);
          setError('');
        },
        (snapshotError) => {
          console.error('Search items listener error:', snapshotError);
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

  const results = useMemo(() => {
    const text = search.trim().toLowerCase();

    return items.filter((item) => {
      if (categoryFilter !== 'All' && item.category !== categoryFilter) {
        return false;
      }

      if (statusFilter === 'Unclaimed' && item.status !== 'Active') {
        return false;
      }

      if (statusFilter === 'Claimed' && item.status === 'Active') {
        return false;
      }

      if (
        text &&
        !(
          item.name.toLowerCase().includes(text) ||
          item.description.toLowerCase().includes(text) ||
          item.location.toLowerCase().includes(text) ||
          item.category.toLowerCase().includes(text)
        )
      ) {
        return false;
      }

      return true;
    });
  }, [items, search, categoryFilter, statusFilter]);

  const activeFilterCount = [
    categoryFilter !== 'All',
    statusFilter !== 'All',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('All');
    setStatusFilter('All');
  };

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

  const canMessage = (item: SearchItem) =>
    Boolean(currentUser) &&
    Boolean(item.userId) &&
    item.userId !== currentUser?.uid &&
    item.status === 'Active';

  const handleMessage = async (item: SearchItem) => {
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

      onOpenChat(conversationId);
    } catch (messageError) {
      console.error('Start conversation error:', messageError);

      showNotice(
        messageError instanceof Error
          ? messageError.message
          : 'Could not open the conversation. Please try again.'
      );
    } finally {
      setMessagingItemId(null);
    }
  };

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton aria-label="Back" onClick={() => onTabChange('home')}>
              <IonIcon icon={arrowBackOutline} />
            </IonButton>
          </IonButtons>

          <IonTitle>
            <span className="brand-pin">●</span> Search
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="findit-content">
        <div className="search-section">
          <IonSearchbar
            ref={searchbarRef}
            className="findit-search"
            placeholder="Search items, locations, categories..."
            value={search}
            onIonInput={(event) => setSearch(event.detail.value ?? '')}
            debounce={150}
          />
        </div>

        <div style={{ padding: '8px 16px' }}>
          <IonSelect
            label="Category"
            labelPlacement="stacked"
            interface="popover"
            value={categoryFilter}
            onIonChange={(event) =>
              setCategoryFilter(String(event.detail.value ?? 'All'))
            }
          >
            <IonSelectOption value="All">All categories</IonSelectOption>
            {ITEM_CATEGORIES.map((category) => (
              <IonSelectOption key={category} value={category}>
                {category}
              </IonSelectOption>
            ))}
          </IonSelect>

          <IonSelect
            label="Status"
            labelPlacement="stacked"
            interface="popover"
            value={statusFilter}
            onIonChange={(event) =>
              setStatusFilter(String(event.detail.value ?? 'All'))
            }
          >
            <IonSelectOption value="All">All</IonSelectOption>
            <IonSelectOption value="Unclaimed">Not yet claimed</IonSelectOption>
            <IonSelectOption value="Claimed">Claimed</IonSelectOption>
          </IonSelect>

          {(activeFilterCount > 0 || search.trim() !== '') && (
            <IonButton size="small" fill="clear" onClick={clearFilters}>
              Clear filters
            </IonButton>
          )}
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
            <h2>Search Results</h2>
            <p>Items that match your search and filters</p>
          </div>

          <span className="item-count">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            <IonSpinner name="crescent" />
            <p>Loading items...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <IonIcon icon={searchOutline} />
            <h3>No items found</h3>
            <p>Try a different keyword or remove some filters.</p>

            {(activeFilterCount > 0 || search.trim() !== '') && (
              <IonButton onClick={clearFilters}>Clear filters</IonButton>
            )}
          </div>
        ) : (
          <div className="items-list">
            {results.map((item) => (
              <article className="item-card" key={item.id}>
                <div
                  className="item-emoji"
                  style={{
                    overflow: 'hidden',
                    padding: item.imageUrl ? 0 : undefined,
                  }}
                >
                  <ItemPhoto src={item.imageUrl} type={item.type} />
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
                    <div className="bookmark-action">
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

                  {item.userId === currentUser?.uid && (
                    <small className="item-details-hint">Your report</small>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="bottom-space" />
      </IonContent>
    </IonPage>
  );
};

export default Search;