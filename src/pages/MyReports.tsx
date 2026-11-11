import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';

import {
  IonAlert,
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonModal,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  IonTabBar,
  IonTabButton,
} from '@ionic/react';

import {
  addCircleOutline,
  bagHandleOutline,
  calendarOutline,
  chatbubblesOutline,
  clipboardOutline,
  closeOutline,
  createOutline,
  documentTextOutline,
  homeOutline,
  locationOutline,
  personOutline,
  pricetagOutline,
  searchOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';

import { onAuthStateChanged } from 'firebase/auth';

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

import { auth, db } from '../firebase';
import { supabase } from '../supabase';
import {
  ITEM_CATEGORIES,
  DEFAULT_CATEGORY,
  normalizeCategory,
} from '../constants/categories';
import type { ItemCategory } from '../constants/categories';
import { useUnreadMessagesCount } from '../services/useUnreadMessages';

import './Home.css';
import './Report.css';
import './MyReports.css';

type MyReportsTab =
  | 'home'
  | 'search'
  | 'report'
  | 'myreports'
  | 'messages'
  | 'profile';

type MyReportsProps = {
  onTabChange: (tab: MyReportsTab) => void;
};

type ReportType = 'Lost' | 'Found';

interface MyReport {
  id: string;
  name?: string;
  itemName?: string;
  type?: ReportType | string;
  location?: string;
  description?: string;
  status?: string;
  date?: string;
  userId?: string;
  imageUrl?: string;
  imagePath?: string;
  // Item category (Electronics, Bags, etc.). Old reports may not have it.
  category?: string;
  createdAt?: {
    toDate?: () => Date;
  };
}

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

// Returns 'Lost' or 'Found' for a report.
// Very old reports may have stored Lost/Found in "category" instead of "type",
// so that is checked as a fallback.
const getReportType = (report: MyReport): ReportType => {
  const rawType = (report.type || '').toLowerCase();
  if (rawType === 'found') return 'Found';
  if (rawType === 'lost') return 'Lost';

  const legacy = (report.category || '').toLowerCase();
  if (legacy === 'found') return 'Found';

  return 'Lost';
};

const getStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'claimed':
      return 'item-status-claimed';
    case 'resolved':
      return 'item-status-resolved';
    default:
      return 'item-status-active';
  }
};

// "Today", "Yesterday", "3 days ago" or "Nov 3".
const formatDate = (report: MyReport) => {
  const created = report.createdAt?.toDate?.();
  let value: Date | null = created ?? null;

  if (!value && report.date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(report.date);
    value = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : null;
  }

  if (!value || Number.isNaN(value.getTime())) {
    return report.date || 'No date';
  }

  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startValue = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const diffDays = Math.round((startToday.getTime() - startValue.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;

  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: value.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

// The report's photo in the card. Falls back to an emoji.
const ReportThumb: FC<{ src: string; type: ReportType }> = ({ src, type }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span className="item-photo-fallback">{type === 'Lost' ? '🔎' : '🎒'}</span>
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

const MyReports: FC<MyReportsProps> = ({ onTabChange }) => {
  const [reports, setReports] = useState<MyReport[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const [editingReport, setEditingReport] = useState<MyReport | null>(null);
  const [deletingReport, setDeletingReport] = useState<MyReport | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<ReportType>('Lost');
  const [category, setCategory] = useState<ItemCategory>(DEFAULT_CATEGORY);
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(getTodayDate());
  const [description, setDescription] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const unreadMessages = useUnreadMessagesCount();

  useEffect(() => {
    let unsubscribeReports: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeReports?.();
      unsubscribeReports = undefined;

      if (!user) {
        setReports([]);
        setLoading(false);
        setPageError('Please log in to view your reports.');
        return;
      }

      setLoading(true);
      setPageError('');

      const reportsQuery = query(
        collection(db, 'items'),
        where('userId', '==', user.uid)
      );

      unsubscribeReports = onSnapshot(
        reportsQuery,
        (snapshot) => {
          const userReports: MyReport[] = snapshot.docs.map((reportDoc) => ({
            id: reportDoc.id,
            ...reportDoc.data(),
          }));

          userReports.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
            const dateB = b.createdAt?.toDate?.()?.getTime?.() ?? 0;

            return dateB - dateA;
          });

          setReports(userReports);
          setLoading(false);
          setPageError('');
        },
        (error) => {
          console.error('Error loading My Reports:', error);
          setPageError('Could not load your reports. Check your Firestore rules.');
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeReports?.();
    };
  }, []);

  // Hide the success message after a few seconds.
  useEffect(() => {
    if (!successMessage) return;

    const timer = setTimeout(() => setSuccessMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const stats = useMemo(() => {
    const active = reports.filter(
      (report) => (report.status || 'Active') === 'Active'
    ).length;

    return { total: reports.length, active, closed: reports.length - active };
  }, [reports]);

  const filteredReports = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return reports.filter((report) => {
      const itemName = report.name || report.itemName || '';
      const itemType = getReportType(report);
      const itemCategory = normalizeCategory(report.category);

      const matchesSearch =
        itemName.toLowerCase().includes(searchText) ||
        (report.location || '').toLowerCase().includes(searchText) ||
        (report.description || '').toLowerCase().includes(searchText) ||
        String(itemCategory).toLowerCase().includes(searchText);

      const matchesFilter =
        filter === 'All' || itemType.toLowerCase() === filter.toLowerCase();

      return matchesSearch && matchesFilter;
    });
  }, [reports, search, filter]);

  const openEditForm = (report: MyReport) => {
    const user = auth.currentUser;

    if (!user || report.userId !== user.uid) {
      setPageError('You can only edit your own reports.');
      return;
    }

    setName(report.name || report.itemName || '');
    setType(getReportType(report));
    setCategory(normalizeCategory(report.category));
    setLocation(report.location || '');
    setDate(report.date || getTodayDate());
    setDescription(report.description || '');

    setFormError('');
    setPageError('');
    setSuccessMessage('');
    setEditingReport(report);
  };

  const closeEditForm = () => {
    if (saving) return;

    setEditingReport(null);
    setFormError('');
  };

  const saveEditedReport = async () => {
    const user = auth.currentUser;
    const report = editingReport;

    if (!user || !report) {
      setFormError('Please log in and select a report.');
      return;
    }

    if (report.userId !== user.uid) {
      setFormError('You can only edit your own reports.');
      return;
    }

    if (
      !name.trim() ||
      !location.trim() ||
      !date ||
      !description.trim()
    ) {
      setFormError('Please fill in all required fields.');
      return;
    }

    setSaving(true);
    setFormError('');
    setPageError('');
    setSuccessMessage('');

    try {
      await updateDoc(doc(db, 'items', report.id), {
        name: name.trim(),
        type,
        category,
        location: location.trim(),
        date,
        description: description.trim(),
      });

      setEditingReport(null);
      setSuccessMessage('Your report was updated successfully.');
    } catch (error) {
      console.error('Error updating report:', error);
      setFormError(
        'Could not update your report. Check your connection and Firestore rules.'
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteReport = async () => {
    const user = auth.currentUser;
    const report = deletingReport;

    if (!user || !report) {
      setPageError('Please log in and select a report.');
      setDeletingReport(null);
      return;
    }

    if (report.userId !== user.uid) {
      setPageError('You can only delete your own reports.');
      setDeletingReport(null);
      return;
    }

    setSaving(true);
    setPageError('');
    setSuccessMessage('');

    try {
      // 1. Delete the photo from Supabase Storage first (if the report has one).
      //    Only paths inside the user's own folder are removed.
      if (report.imagePath && report.imagePath.startsWith(`${user.uid}/`)) {
        const { error: removeError } = await supabase.storage
          .from('item-photos')
          .remove([report.imagePath]);

        if (removeError) {
          // Do not block deleting the report if the photo could not be removed.
          console.error('Photo delete failed:', removeError.message);
        }
      }

      // 2. Delete the report document from Firestore.
      await deleteDoc(doc(db, 'items', report.id));

      setDeletingReport(null);
      setSuccessMessage('Your report was deleted successfully.');
    } catch (error) {
      console.error('Error deleting report:', error);
      setPageError(
        'Could not delete your report. Check your connection and Firestore rules.'
      );
      setDeletingReport(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonTitle>
            <span className="brand-pin">●</span> My Reports
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="findit-content my-reports-content">
        <section className="welcome-section">
          <p className="eyebrow">YOUR ACTIVITY</p>
          <h1>My Reports</h1>
          <p className="welcome-description">
            Keep track of the items you reported, and edit or remove them.
          </p>

          <div className="hero-stats">
            <div className="hero-stat">
              <strong>{loading ? '–' : stats.total}</strong>
              <span>Total</span>
            </div>
            <div className="hero-stat">
              <strong>{loading ? '–' : stats.active}</strong>
              <span>Active</span>
            </div>
            <div className="hero-stat">
              <strong>{loading ? '–' : stats.closed}</strong>
              <span>Claimed</span>
            </div>
          </div>
        </section>

        <div className="search-section">
          <IonSearchbar
            value={search}
            debounce={150}
            onIonInput={(event) => setSearch(event.detail.value || '')}
            placeholder="Search your reports..."
            className="findit-search"
          />
        </div>

        <div className="filter-section">
          <IonSegment
            value={filter}
            onIonChange={(event) =>
              setFilter(String(event.detail.value || 'All'))
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

        {successMessage && (
          <p className="findit-message success-message" role="status">
            {successMessage}
          </p>
        )}

        {pageError && (
          <p className="findit-message error-message" role="alert">
            {pageError}
          </p>
        )}

        <div className="section-heading">
          <div>
            <h2>Your Reports</h2>
            <p>Newest first</p>
          </div>

          {!loading && (
            <span className="item-count">
              {filteredReports.length}{' '}
              {filteredReports.length === 1 ? 'report' : 'reports'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="items-list" aria-busy="true" aria-label="Loading your reports">
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
        ) : filteredReports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IonIcon icon={clipboardOutline} />
            </div>

            {reports.length > 0 ? (
              <>
                <h3>No matching reports</h3>
                <p>Try another search or filter.</p>
              </>
            ) : (
              <>
                <h3>No reports yet</h3>
                <p>Your submitted Lost and Found reports will appear here.</p>

                <IonButton
                  className="empty-state-button"
                  onClick={() => onTabChange('report')}
                >
                  <IonIcon icon={addCircleOutline} slot="start" />
                  Create Report
                </IonButton>
              </>
            )}
          </div>
        ) : (
          <div className="items-list">
            {filteredReports.map((report) => {
              const itemName = report.name || report.itemName || 'Untitled Item';
              const itemType = getReportType(report);
              const itemCategory = normalizeCategory(report.category);
              const status = report.status || 'Active';

              return (
                <article className="item-card mr-card" key={report.id}>
                  <div className="item-emoji item-thumb">
                    <ReportThumb src={report.imageUrl || ''} type={itemType} />

                    <span
                      className={`type-tag ${
                        itemType === 'Lost' ? 'type-tag-lost' : 'type-tag-found'
                      }`}
                    >
                      {itemType}
                    </span>
                  </div>

                  <div className="item-info item-body">
                    <div className="item-topline">
                      <span className="item-category">{itemCategory}</span>
                      <span className={`item-status-tag ${getStatusClass(status)}`}>
                        {status}
                      </span>
                    </div>

                    <h3>{itemName}</h3>

                    {report.description && (
                      <p className="item-desc">{report.description}</p>
                    )}

                    <div className="item-meta">
                      <span>
                        <IonIcon icon={locationOutline} />
                        {report.location || 'No location'}
                      </span>

                      <span>
                        <IonIcon icon={timeOutline} />
                        {formatDate(report)}
                      </span>
                    </div>

                    <div className="mr-actions">
                      <button
                        type="button"
                        className="mr-btn mr-btn-edit"
                        disabled={saving}
                        onClick={() => openEditForm(report)}
                      >
                        <IonIcon icon={createOutline} />
                        Edit
                      </button>

                      <button
                        type="button"
                        className="mr-btn mr-btn-delete"
                        disabled={saving}
                        onClick={() => setDeletingReport(report)}
                      >
                        <IonIcon icon={trashOutline} />
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
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

        <IonTabButton
          tab="myreports"
          selected
          onClick={() => onTabChange('myreports')}
        >
          <IonIcon icon={clipboardOutline} />
          <IonLabel>My Reports</IonLabel>
        </IonTabButton>

        <IonTabButton tab="messages" onClick={() => onTabChange('messages')}>
          <IonIcon icon={chatbubblesOutline} />
          <IonLabel>Messages</IonLabel>
          {unreadMessages > 0 && (
            <IonBadge className="tab-unread-badge">
              {unreadMessages > 9 ? '9+' : unreadMessages}
            </IonBadge>
          )}
        </IonTabButton>

        <IonTabButton tab="profile" onClick={() => onTabChange('profile')}>
          <IonIcon icon={personOutline} />
          <IonLabel>Profile</IonLabel>
        </IonTabButton>
      </IonTabBar>

      {/* Edit Report Modal (same form style as the Report page) */}
      <IonModal
        isOpen={editingReport !== null}
        onDidDismiss={() => {
          if (!saving) {
            setEditingReport(null);
            setFormError('');
          }
        }}
      >
        <IonHeader className="findit-header">
          <IonToolbar>
            <IonTitle>Edit Report</IonTitle>

            <IonButton
              slot="end"
              fill="clear"
              aria-label="Close edit form"
              disabled={saving}
              onClick={closeEditForm}
            >
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonToolbar>
        </IonHeader>

        <IonContent className="findit-content">
          <div className="rp-body">
            <div className="rp-type-toggle" role="radiogroup" aria-label="Report type">
              <button
                type="button"
                role="radio"
                aria-checked={type === 'Lost'}
                className={`rp-type rp-type-lost ${type === 'Lost' ? 'is-active' : ''}`}
                disabled={saving}
                onClick={() => setType('Lost')}
              >
                <span className="rp-type-icon">
                  <IonIcon icon={searchOutline} />
                </span>
                <strong>Lost item</strong>
                <small>I lost this</small>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={type === 'Found'}
                className={`rp-type rp-type-found ${type === 'Found' ? 'is-active' : ''}`}
                disabled={saving}
                onClick={() => setType('Found')}
              >
                <span className="rp-type-icon">
                  <IonIcon icon={bagHandleOutline} />
                </span>
                <strong>Found item</strong>
                <small>I found this</small>
              </button>
            </div>

            <section className="rp-card">
              <h2 className="rp-card-title">
                <IonIcon icon={pricetagOutline} /> Item details
              </h2>

              <div className="rp-field">
                <span className="rp-label">
                  Item name <span className="rp-req">*</span>
                </span>
                <IonInput
                  className="rp-input"
                  aria-label="Item name"
                  value={name}
                  maxlength={80}
                  placeholder="e.g. Black backpack"
                  disabled={saving}
                  onIonInput={(event) => setName(String(event.detail.value ?? ''))}
                />
              </div>

              <div className="rp-field">
                <span className="rp-label">Category</span>
                <IonSelect
                  className="rp-input"
                  aria-label="Category"
                  value={category}
                  interface="popover"
                  disabled={saving}
                  onIonChange={(event) =>
                    setCategory(event.detail.value as ItemCategory)
                  }
                >
                  {ITEM_CATEGORIES.map((item) => (
                    <IonSelectOption key={item} value={item}>
                      {item}
                    </IonSelectOption>
                  ))}
                </IonSelect>
              </div>
            </section>

            <section className="rp-card">
              <h2 className="rp-card-title">
                <IonIcon icon={locationOutline} /> Where and when
              </h2>

              <div className="rp-field">
                <span className="rp-label">
                  Location <span className="rp-req">*</span>
                </span>
                <IonInput
                  className="rp-input"
                  aria-label="Location"
                  value={location}
                  maxlength={120}
                  placeholder="Where was it lost or found?"
                  disabled={saving}
                  onIonInput={(event) =>
                    setLocation(String(event.detail.value ?? ''))
                  }
                />
              </div>

              <div className="rp-field">
                <span className="rp-label">
                  <IonIcon icon={calendarOutline} /> Date{' '}
                  <span className="rp-req">*</span>
                </span>
                <IonInput
                  className="rp-input"
                  aria-label="Date"
                  type="date"
                  value={date}
                  max={getTodayDate()}
                  disabled={saving}
                  onIonInput={(event) => setDate(String(event.detail.value ?? ''))}
                />
              </div>
            </section>

            <section className="rp-card">
              <h2 className="rp-card-title">
                <IonIcon icon={documentTextOutline} /> Description{' '}
                <span className="rp-req">*</span>
              </h2>

              <IonTextarea
                className="rp-input rp-textarea"
                aria-label="Description"
                value={description}
                maxlength={500}
                counter
                autoGrow
                placeholder="Describe the item and useful details"
                disabled={saving}
                onIonInput={(event) =>
                  setDescription(String(event.detail.value ?? ''))
                }
              />
            </section>

            {formError && (
              <p className="findit-message error-message" role="alert">
                {formError}
              </p>
            )}

            <IonButton
              expand="block"
              className="rp-submit"
              disabled={saving}
              onClick={() => void saveEditedReport()}
            >
              {saving ? <IonSpinner name="crescent" /> : 'Save Changes'}
            </IonButton>

            <IonButton
              expand="block"
              fill="clear"
              className="rp-cancel"
              disabled={saving}
              onClick={closeEditForm}
            >
              Cancel
            </IonButton>
          </div>
        </IonContent>
      </IonModal>

      {/* Delete Confirmation */}
      <IonAlert
        isOpen={deletingReport !== null}
        header="Delete Report?"
        message={`Are you sure you want to delete "${deletingReport?.name || deletingReport?.itemName || 'this report'}"? This cannot be undone.`}
        buttons={[
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => setDeletingReport(null),
          },
          {
            text: 'Delete',
            role: 'destructive',
            handler: () => {
              void confirmDeleteReport();
            },
          },
        ]}
        onDidDismiss={() => setDeletingReport(null)}
      />
    </IonPage>
  );
};

export default MyReports;