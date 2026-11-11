import { useEffect, useMemo, useRef, useState } from 'react';
import type { FC } from 'react';

import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import {
  arrowBackOutline,
  chatbubbleEllipsesOutline,
  closeCircle,
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
import './Search.css';

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

type StatusFilter = 'All' | 'Unclaimed' | 'Claimed';

// "Today", "Yesterday", "3 days ago" or "Nov 3".
const formatRelativeDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (!match) {
    return value || 'No date';
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

// Shows the item's photo, or an emoji if there is no photo.
const ItemPhoto: FC<{ src: string; type: 'Lost' | 'Found' }> = ({ src, type }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <span className="item-photo-fallback">{type === 'Lost' ? '🔎' : '🎒'}</span>;
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
  const [typeFilter, setTypeFilter] = useState<'All' | 'Lost' | 'Found'>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | ItemCategory>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');

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
                String(data.type ?? 'Lost').toLowerCase() === 'found' ? 'Found' : 'Lost',
              category: normalizeCategory(data.category),
              location: String(data.location ?? 'Unknown location'),
              date: String(data.date ?? ''),
              description: String(data.description ?? ''),
              userId: typeof data.userId === 'string' ? data.userId : undefined,
              reporterName: typeof data.reporterName === 'string' ? data.reporterName : '',
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

  // How many items each category has (shown on the chips).
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
    return counts;
  }, [items]);

  const results = useMemo(() => {
    const text = search.trim().toLowerCase();

    return items.filter((item) => {
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
      if (statusFilter === 'Unclaimed' && item.status !== 'Active') return false;
      if (statusFilter === 'Claimed' && item.status === 'Active') return false;

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
  }, [items, search, typeFilter, categoryFilter, statusFilter]);

  const hasFilters =
    search.trim() !== '' ||
    typeFilter !== 'All' ||
    categoryFilter !== 'All' ||
    statusFilter !== 'All';

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('All');
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

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'All', label: 'Any status' },
    { value: 'Unclaimed', label: 'Not yet claimed' },
    { value: 'Claimed', label: 'Claimed' },
  ];

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonButton
            slot="start"
            fill="clear"
            aria-label="Back to Home"
            onClick={() => onTabChange('home')}
          >
            <IonIcon icon={arrowBackOutline} />
          </IonButton>

          <IonTitle>Search</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="findit-content">
        {/* Search bar on a teal band, like the hero on Home */}
        <div className="sr-top">
          <IonSearchbar
            ref={searchbarRef}
            className="findit-search sr-searchbar"
            placeholder="Search items, locations, categories..."
            value={search}
            onIonInput={(event) => setSearch(event.detail.value ?? '')}
            debounce={150}
          />
        </div>

        <div className="sr-filters">
          <IonSegment
            className="sr-segment"
            value={typeFilter}
            onIonChange={(event) => {
              const value = String(event.detail.value ?? 'All');
              setTypeFilter(value === 'Lost' || value === 'Found' ? value : 'All');
            }}
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

          <p className="sr-filter-label">Category</p>
          <div className="sr-chips" role="group" aria-label="Filter by category">
            <button
              type="button"
              className={`sr-chip ${categoryFilter === 'All' ? 'active' : ''}`}
              aria-pressed={categoryFilter === 'All'}
              onClick={() => setCategoryFilter('All')}
            >
              All
            </button>

            {ITEM_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`sr-chip ${categoryFilter === category ? 'active' : ''}`}
                aria-pressed={categoryFilter === category}
                onClick={() => setCategoryFilter(category)}
              >
                {category}
                {(categoryCounts.get(category) ?? 0) > 0 && (
                  <span>{categoryCounts.get(category)}</span>
                )}
              </button>
            ))}
          </div>

          <p className="sr-filter-label">Status</p>
          <div className="sr-chips" role="group" aria-label="Filter by status">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`sr-chip ${statusFilter === option.value ? 'active' : ''}`}
                aria-pressed={statusFilter === option.value}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
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
            <h2>{hasFilters ? 'Results' : 'All Items'}</h2>
            <p>
              {search.trim()
                ? `Matching "${search.trim()}"`
                : hasFilters
                  ? 'Items that match your filters'
                  : 'Type above or pick a filter'}
            </p>
          </div>

          <div className="sr-heading-right">
            {!loading && (
              <span className="item-count">
                {results.length} {results.length === 1 ? 'item' : 'items'}
              </span>
            )}

            {hasFilters && (
              <button type="button" className="sr-clear" onClick={clearFilters}>
                <IonIcon icon={closeCircle} />
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="items-list" aria-busy="true" aria-label="Loading items">
            {[0, 1, 2].map((key) => (
              <div className="item-card skeleton-card" key={key}>
                <div className="skeleton-block skeleton-thumb" />
                <div className="skeleton-lines">
                  <div className="skeleton-block skeleton-line short" />
                  <div className="skeleton-block skeleton-line" />
                  <div className="skeleton-block skeleton-line medium" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IonIcon icon={searchOutline} />
            </div>
            <h3>No items found</h3>
            <p>Try a different keyword or remove some filters.</p>

            {hasFilters && (
              <IonButton className="empty-state-button" onClick={clearFilters}>
                Clear filters
              </IonButton>
            )}
          </div>
        ) : (
          <div className="items-list">
            {results.map((item) => {
              const isMine = item.userId === currentUser?.uid;

              return (
                <article className="item-card" key={item.id}>
                  <div className="item-emoji item-thumb">
                    <ItemPhoto src={item.imageUrl} type={item.type} />
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
                          className={`item-status-tag ${
                            item.status === 'Claimed'
                              ? 'item-status-claimed'
                              : 'item-status-resolved'
                          }`}
                        >
                          {item.status}
                        </span>
                      )}
                    </div>

                    <h3>{item.name}</h3>

                    {item.description && <p className="item-desc">{item.description}</p>}

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

                    {(isMine || canMessage(item)) && (
                      <div className="item-card-footer">
                        {isMine ? <span className="item-mine-tag">Your report</span> : <span />}

                        {canMessage(item) && (
                          <IonButton
                            size="small"
                            className="item-message-btn"
                            disabled={messagingItemId === item.id}
                            onClick={() => void handleMessage(item)}
                          >
                            <IonIcon icon={chatbubbleEllipsesOutline} slot="start" />
                            {messagingItemId === item.id ? 'Opening...' : 'Message'}
                          </IonButton>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="bottom-space" />
      </IonContent>
    </IonPage>
  );
};

export default Search;