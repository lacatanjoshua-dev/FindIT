import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';

import {
  IonAlert,
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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import {
  arrowBackOutline,
  calendarOutline,
  closeOutline,
  downloadOutline,
  eyeOutline,
  locationOutline,
  personCircleOutline,
  pricetagOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

import { auth, db } from '../../firebase';
import { supabase } from '../../supabase';
import { ITEM_CATEGORIES, normalizeCategory } from '../../constants/categories';
import { downloadCsv, todayStamp } from '../../services/csv';

import '../Home.css';
import './Admin.css';

type ReportStatus = 'Active' | 'Claimed' | 'Resolved';

const STATUSES: ReportStatus[] = ['Active', 'Claimed', 'Resolved'];

type ReportItem = {
  id: string;
  name: string;
  type: 'Lost' | 'Found';
  category: string;
  location: string;
  date: string;
  description: string;
  status: ReportStatus;
  userId: string;
  reporterName: string;
  imageUrl: string;
  imagePath: string;
  createdAt: Date | null;
};

type AdminReportsProps = {
  onBack: () => void;
};

const statusClass = (status: ReportStatus) =>
  status === 'Claimed'
    ? 'item-status-claimed'
    : status === 'Resolved'
      ? 'item-status-resolved'
      : 'item-status-active';

const formatShortDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (!match) {
    return value || 'No date';
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Item photo. Falls back to an emoji if there is no photo or it fails to load.
const ReportPhoto: FC<{ src: string; type: 'Lost' | 'Found'; fit?: 'cover' | 'contain' }> = ({
  src,
  type,
  fit = 'cover',
}) => {
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
        objectFit: fit,
        borderRadius: 'inherit',
      }}
    />
  );
};

const AdminReports: FC<AdminReportsProps> = ({ onBack }) => {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | ReportStatus>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<ReportItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // Load reports from Firestore.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'items'),
      (snapshot) => {
        const reports: ReportItem[] = snapshot.docs.map((document) => {
          const data = document.data();

          return {
            id: document.id,
            name: String(data.name ?? 'Unnamed item'),
            type:
              String(data.type ?? 'Lost').toLowerCase() === 'found'
                ? 'Found'
                : 'Lost',
            category: String(normalizeCategory(data.category)),
            location: String(data.location ?? 'Unknown location'),
            date: String(data.date ?? ''),
            description: String(data.description ?? ''),
            status:
              data.status === 'Claimed' || data.status === 'Resolved'
                ? data.status
                : 'Active',
            userId: String(data.userId ?? ''),
            reporterName:
              typeof data.reporterName === 'string' ? data.reporterName : '',
            imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
            imagePath: typeof data.imagePath === 'string' ? data.imagePath : '',
            createdAt: data.createdAt?.toDate?.() ?? null,
          };
        });

        // Newest first.
        reports.sort((a, b) => {
          const timeA = a.createdAt?.getTime() ?? 0;
          const timeB = b.createdAt?.getTime() ?? 0;

          return timeB - timeA || b.date.localeCompare(a.date);
        });

        setItems(reports);
        setLoading(false);
        setError('');
      },
      (err) => {
        console.error('Admin reports listener error:', err);
        setError('Could not load reports. Check Firestore rules.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Hide the notice after a few seconds.
  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Always show the latest data for the open report.
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  const counts = useMemo(
    () => ({
      All: items.length,
      Active: items.filter((item) => item.status === 'Active').length,
      Claimed: items.filter((item) => item.status === 'Claimed').length,
      Resolved: items.filter((item) => item.status === 'Resolved').length,
    }),
    [items]
  );

  // Search and filter reports.
  const filteredItems = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesType = typeFilter === 'All' || item.type === typeFilter;
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchesCategory =
        categoryFilter === 'All' || item.category === categoryFilter;

      const matchesSearch =
        !searchText ||
        item.name.toLowerCase().includes(searchText) ||
        item.location.toLowerCase().includes(searchText) ||
        item.description.toLowerCase().includes(searchText) ||
        item.reporterName.toLowerCase().includes(searchText);

      return matchesType && matchesStatus && matchesCategory && matchesSearch;
    });
  }, [items, search, typeFilter, statusFilter, categoryFilter]);

  const hasFilters =
    Boolean(search.trim()) ||
    typeFilter !== 'All' ||
    statusFilter !== 'All' ||
    categoryFilter !== 'All';

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('All');
    setStatusFilter('All');
    setCategoryFilter('All');
  };

  const exportReports = () => {
    downloadCsv(`findit-reports-${todayStamp()}`, [
      [
        'Item',
        'Type',
        'Category',
        'Status',
        'Location',
        'Date',
        'Reported by',
        'Description',
        'Report ID',
      ],
      ...filteredItems.map((item) => [
        item.name,
        item.type,
        item.category,
        item.status,
        item.location,
        item.date,
        item.reporterName,
        item.description,
        item.id,
      ]),
    ]);
  };

  // Update report status and notify the student.
  const updateReportStatus = async (item: ReportItem, newStatus: ReportStatus) => {
    if (!auth.currentUser) {
      setError('Please log in as an administrator.');
      return;
    }

    if (item.status === newStatus) {
      return;
    }

    setUpdatingStatusId(item.id);
    setError('');

    try {
      await updateDoc(doc(db, 'items', item.id), { status: newStatus });

      // Notify the student who submitted the report.
      if (item.userId) {
        const message =
          newStatus === 'Claimed'
            ? `Your report "${item.name}" has been claimed.`
            : newStatus === 'Resolved'
              ? `Your report "${item.name}" has been marked as resolved.`
              : `The status of your report "${item.name}" is now Active.`;

        try {
          await addDoc(collection(db, 'notifications'), {
            userId: item.userId,
            itemId: item.id,
            itemName: item.name,
            title: 'Report Status Updated',
            status: newStatus,
            message,
            isRead: false,
            createdAt: serverTimestamp(),
          });

          setNotice(`"${item.name}" is now ${newStatus}. The reporter was notified.`);
        } catch (notificationError) {
          console.error('Create notification error:', notificationError);
          setError(
            'Report status updated, but the notification could not be created. Check Firestore rules.'
          );
        }
      } else {
        setNotice(`"${item.name}" is now ${newStatus}.`);
      }
    } catch (err) {
      console.error('Update report status error:', err);
      setError('Could not update report status. Verify your admin Firestore permission.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Delete a report and its photo.
  const deleteReport = async () => {
    const user = auth.currentUser;
    const item = deletingItem;

    if (!user || !item) {
      setError('Please log in as an administrator.');
      setDeletingItem(null);
      return;
    }

    setDeleting(true);
    setError('');

    try {
      // 1. Delete the item's photo from Supabase Storage (if it has one).
      const safePath =
        item.imagePath &&
        !item.imagePath.startsWith('/') &&
        !item.imagePath.includes('..');

      if (safePath) {
        const { error: removeError } = await supabase.storage
          .from('item-photos')
          .remove([item.imagePath]);

        if (removeError) {
          // Do not block deleting the report if the photo could not be removed.
          console.error('Photo delete failed:', removeError.message);
        }
      }

      // 2. Delete the report document from Firestore.
      await deleteDoc(doc(db, 'items', item.id));

      if (selectedId === item.id) {
        setSelectedId(null);
      }

      setNotice(`"${item.name}" was deleted.`);
      setDeletingItem(null);
    } catch (err) {
      console.error('Admin report delete error:', err);
      setError('Could not delete report. Verify your admin permission.');
      setDeletingItem(null);
    } finally {
      setDeleting(false);
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
            aria-label="Back to admin dashboard"
          >
            <IonIcon icon={arrowBackOutline} />
          </IonButton>

          <IonTitle>Manage Reports</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        <main className="admin-main admin-main-narrow">
          <section className="admin-hero">
            <p className="admin-eyebrow">ADMINISTRATION</p>
            <h1>Lost &amp; Found Reports</h1>
            <p>View, update and remove reports submitted by FindIt users.</p>

            <div className="admin-hero-stats">
              <div>
                <strong>{loading ? '–' : counts.All}</strong>
                <span>Total</span>
              </div>
              <div>
                <strong>{loading ? '–' : counts.Active}</strong>
                <span>Active</span>
              </div>
              <div>
                <strong>{loading ? '–' : counts.Claimed}</strong>
                <span>Claimed</span>
              </div>
              <div>
                <strong>{loading ? '–' : counts.Resolved}</strong>
                <span>Resolved</span>
              </div>
            </div>
          </section>

          {/* SEARCH AND FILTERS */}
          <section className="admin-panel admin-filters">
            <div className="admin-toolbar">
              <IonSearchbar
                className="findit-search admin-search"
                value={search}
                debounce={150}
                placeholder="Search item, location, description or reporter..."
                onIonInput={(event) => setSearch(String(event.detail.value ?? ''))}
              />

              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={exportReports}
                disabled={loading || filteredItems.length === 0}
              >
                <IonIcon icon={downloadOutline} />
                Export CSV
              </button>
            </div>

            <div className="admin-filter-row">
              <IonSegment
                className="admin-segment"
                value={typeFilter}
                onIonChange={(event) =>
                  setTypeFilter(String(event.detail.value ?? 'All'))
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

              <IonSelect
                className="admin-select"
                aria-label="Category"
                value={categoryFilter}
                interface="popover"
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
            </div>

            <div className="admin-chips" role="group" aria-label="Filter by status">
              {(['All', ...STATUSES] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`admin-chip ${statusFilter === status ? 'active' : ''}`}
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                  <span>{loading ? '–' : counts[status]}</span>
                </button>
              ))}
            </div>
          </section>

          {notice && (
            <div className="admin-message success" role="status">
              {notice}
            </div>
          )}

          {error && (
            <div className="admin-message error" role="alert">
              {error}
            </div>
          )}

          <div className="admin-count-row">
            <p className="admin-count">
              {filteredItems.length} {filteredItems.length === 1 ? 'report' : 'reports'}
              {hasFilters ? ` of ${items.length}` : ''}
            </p>

            {hasFilters && (
              <button type="button" className="admin-link" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          {loading ? (
            <div className="admin-report-grid" aria-busy="true">
              {[0, 1, 2, 3].map((key) => (
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
          ) : filteredItems.length === 0 ? (
            <div className="admin-empty">
              {items.length === 0
                ? 'No reports have been submitted yet.'
                : 'No reports match your search or filters.'}
            </div>
          ) : (
            <div className="admin-report-grid">
              {filteredItems.map((item) => (
                <article className="item-card admin-report-card" key={item.id}>
                  <button
                    type="button"
                    className="item-emoji item-thumb admin-thumb-button"
                    aria-label={`View details for ${item.name}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <ReportPhoto src={item.imageUrl} type={item.type} />
                    <span
                      className={`type-tag ${
                        item.type === 'Lost' ? 'type-tag-lost' : 'type-tag-found'
                      }`}
                    >
                      {item.type}
                    </span>
                  </button>

                  <div className="item-info item-body">
                    <div className="item-topline">
                      <span className="item-category">{item.category}</span>
                      <span className={`item-status-tag ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>

                    <h3>{item.name}</h3>

                    <div className="item-meta">
                      <span>
                        <IonIcon icon={locationOutline} />
                        {item.location}
                      </span>
                      <span>
                        <IonIcon icon={calendarOutline} />
                        {formatShortDate(item.date)}
                      </span>
                      {item.reporterName && (
                        <span>
                          <IonIcon icon={personCircleOutline} />
                          {item.reporterName}
                        </span>
                      )}
                    </div>

                    <div className="admin-card-actions">
                      <button
                        type="button"
                        className="mr-btn mr-btn-edit"
                        onClick={() => setSelectedId(item.id)}
                      >
                        <IonIcon icon={eyeOutline} />
                        View
                      </button>

                      <button
                        type="button"
                        className="mr-btn mr-btn-delete"
                        onClick={() => setDeletingItem(item)}
                        aria-label={`Delete ${item.name}`}
                      >
                        <IonIcon icon={trashOutline} />
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </IonContent>

      {/* REPORT DETAILS */}
      <IonModal isOpen={selectedItem !== null} onDidDismiss={() => setSelectedId(null)}>
        <IonHeader className="findit-header">
          <IonToolbar>
            <IonTitle>Report Details</IonTitle>
            <IonButton
              slot="end"
              fill="clear"
              aria-label="Close details"
              onClick={() => setSelectedId(null)}
            >
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonToolbar>
        </IonHeader>

        <IonContent className="admin-content">
          {selectedItem && (
            <div className="admin-detail">
              <div className="admin-detail-photo">
                <ReportPhoto
                  src={selectedItem.imageUrl}
                  type={selectedItem.type}
                  fit="contain"
                />
                <span
                  className={`type-tag type-tag-large ${
                    selectedItem.type === 'Lost' ? 'type-tag-lost' : 'type-tag-found'
                  }`}
                >
                  {selectedItem.type}
                </span>
              </div>

              <div className="item-topline">
                <span className="item-category">{selectedItem.category}</span>
                <span className={`item-status-tag ${statusClass(selectedItem.status)}`}>
                  {selectedItem.status}
                </span>
              </div>

              <h1 className="admin-detail-title">{selectedItem.name}</h1>

              <p className="admin-detail-desc">
                {selectedItem.description || 'No description provided.'}
              </p>

              <dl className="admin-detail-rows">
                <div>
                  <dt>
                    <IonIcon icon={locationOutline} /> Location
                  </dt>
                  <dd>{selectedItem.location}</dd>
                </div>
                <div>
                  <dt>
                    <IonIcon icon={calendarOutline} /> Date lost / found
                  </dt>
                  <dd>{formatShortDate(selectedItem.date)}</dd>
                </div>
                <div>
                  <dt>
                    <IonIcon icon={timeOutline} /> Reported on
                  </dt>
                  <dd>
                    {selectedItem.createdAt
                      ? selectedItem.createdAt.toLocaleString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Not recorded'}
                  </dd>
                </div>
                <div>
                  <dt>
                    <IonIcon icon={pricetagOutline} /> Category
                  </dt>
                  <dd>{selectedItem.category}</dd>
                </div>
                <div>
                  <dt>
                    <IonIcon icon={personCircleOutline} /> Reported by
                  </dt>
                  <dd>
                    {selectedItem.reporterName || 'Unknown'}
                    <small>UID: {selectedItem.userId || 'none'}</small>
                  </dd>
                </div>
              </dl>

              <div className="admin-detail-status">
                <h2>Status</h2>
                <p>The reporter gets a notification when you change it.</p>

                <div className="admin-status-buttons" role="group" aria-label="Report status">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`admin-status-btn ${status.toLowerCase()} ${
                        selectedItem.status === status ? 'active' : ''
                      }`}
                      aria-pressed={selectedItem.status === status}
                      disabled={updatingStatusId === selectedItem.id}
                      onClick={() => void updateReportStatus(selectedItem, status)}
                    >
                      {status}
                    </button>
                  ))}

                  {updatingStatusId === selectedItem.id && <IonSpinner name="crescent" />}
                </div>
              </div>

              <button
                type="button"
                className="admin-btn admin-btn-danger admin-btn-block"
                onClick={() => setDeletingItem(selectedItem)}
              >
                <IonIcon icon={trashOutline} />
                Delete this report
              </button>
            </div>
          )}
        </IonContent>
      </IonModal>

      <IonAlert
        isOpen={deletingItem !== null}
        header="Delete Report?"
        message={`Are you sure you want to delete "${deletingItem?.name ?? 'this report'}"? Its photo will be removed too. This cannot be undone.`}
        buttons={[
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => setDeletingItem(null),
          },
          {
            text: deleting ? 'Deleting...' : 'Delete',
            role: 'destructive',
            handler: () => {
              if (!deleting) void deleteReport();
            },
          },
        ]}
        onDidDismiss={() => {
          if (!deleting) setDeletingItem(null);
        }}
      />
    </IonPage>
  );
};

export default AdminReports;