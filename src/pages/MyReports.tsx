import { supabase } from '../supabase';
import './MyReports.css';

import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';

import {
  IonAlert,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
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
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  IonTabBar,
  IonTabButton,
} from '@ionic/react';

import {
  locationOutline,
  timeOutline,
  documentTextOutline,
  homeOutline,
  searchOutline,
  addCircleOutline,
  clipboardOutline,
  chatbubblesOutline,
  personOutline,
  createOutline,
  trashOutline,
  closeOutline,
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
import {
  ITEM_CATEGORIES,
  DEFAULT_CATEGORY,
  normalizeCategory,
} from '../constants/categories';
import type { ItemCategory } from '../constants/categories';
import { useUnreadMessagesCount } from '../services/useUnreadMessages';

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

// Shows the report's photo at the top of its card.
// Renders nothing if there is no photo or if the image fails to load.
const ReportPhoto: FC<{ src: string }> = ({ src }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return null;
  }

  return (
    <img
      src={src}
      alt="Reported item"
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        width: '100%',
        maxHeight: '200px',
        objectFit: 'cover',
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

  const getStatusColor = (status?: string) => {
    switch ((status || 'Active').toLowerCase()) {
      case 'claimed':
        return 'warning';
      case 'resolved':
        return 'success';
      case 'active':
        return 'primary';
      default:
        return 'medium';
    }
  };

  const formatDate = (report: MyReport) => {
    if (report.createdAt?.toDate) {
      return report.createdAt.toDate().toLocaleDateString();
    }

    if (report.date) {
      return report.date;
    }

    return 'Date not available';
  };

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
      setFormError('Please fill in all report fields.');
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
          <IonTitle>My Reports</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding my-reports-content">
        <div className="my-reports-heading">
          <IonText color="medium">
            <p>Keep track of the items you reported.</p>
          </IonText>
        </div>

        <IonSearchbar
          value={search}
          onIonInput={(event) => setSearch(event.detail.value || '')}
          placeholder="Search your reports..."
          className="findit-search"
        />

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

        <div className="my-reports-list-heading">
          <h2>Your Reports</h2>
          <IonBadge color="medium">{filteredReports.length}</IonBadge>
        </div>

        {loading ? (
          <div className="my-reports-empty">
            <IonSpinner name="crescent" />
            <p>Loading your reports...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="my-reports-empty">
            <IonIcon icon={documentTextOutline} />
            <h3>No reports found</h3>

            <IonText color="medium">
              Your submitted Lost and Found reports will appear here.
            </IonText>

            <IonButton
              className="ion-margin-top"
              onClick={() => onTabChange('report')}
            >
              <IonIcon icon={addCircleOutline} slot="start" />
              Create Report
            </IonButton>
          </div>
        ) : (
          filteredReports.map((report) => {
            const itemName = report.name || report.itemName || 'Untitled Item';
            const itemType = getReportType(report);
            const itemCategory = normalizeCategory(report.category);
            const status = report.status || 'Active';

            return (
              <IonCard key={report.id} className="my-report-card">
                <ReportPhoto src={report.imageUrl || ''} />

                <IonCardHeader>
                  <div className="my-report-card-top">
                    <IonBadge
                      color={itemType === 'Found' ? 'success' : 'tertiary'}
                    >
                      {itemType}
                    </IonBadge>

                    <IonBadge color="medium">{itemCategory}</IonBadge>

                    <IonBadge color={getStatusColor(status)}>
                      {status}
                    </IonBadge>
                  </div>

                  <IonCardTitle>{itemName}</IonCardTitle>

                  <IonCardSubtitle>
                    <IonIcon icon={locationOutline} />
                    {' '}
                    {report.location || 'Location not specified'}
                  </IonCardSubtitle>
                </IonCardHeader>

                <IonCardContent>
                  {report.description && (
                    <p className="my-report-description">
                      {report.description}
                    </p>
                  )}

                  <div className="my-report-date">
                    <IonIcon icon={timeOutline} />
                    <span>{formatDate(report)}</span>
                  </div>

                  <div className="my-report-actions">
                    <IonButton
                      size="small"
                      fill="outline"
                      onClick={() => openEditForm(report)}
                    >
                      <IonIcon icon={createOutline} slot="start" />
                      Edit
                    </IonButton>

                    <IonButton
                      size="small"
                      color="danger"
                      fill="outline"
                      onClick={() => setDeletingReport(report)}
                    >
                      <IonIcon icon={trashOutline} slot="start" />
                      Delete
                    </IonButton>
                  </div>
                </IonCardContent>
              </IonCard>
            );
          })
        )}
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

      {/* Edit Report Modal */}
      <IonModal
        isOpen={editingReport !== null}
        onDidDismiss={() => {
          if (!saving) {
            setEditingReport(null);
            setFormError('');
          }
        }}
      >
        <IonHeader>
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

        <IonContent className="ion-padding">
          <p>Update the details of your report.</p>

          <IonLabel position="stacked">Item name</IonLabel>
          <IonInput
            className="report-input"
            value={name}
            placeholder="e.g. Black backpack"
            onIonInput={(event) =>
              setName(String(event.detail.value ?? ''))
            }
          />

          <IonLabel position="stacked">Report type</IonLabel>
          <IonSelect
            className="report-input"
            value={type}
            interface="popover"
            onIonChange={(event) =>
              setType(event.detail.value as ReportType)
            }
          >
            <IonSelectOption value="Lost">Lost item</IonSelectOption>
            <IonSelectOption value="Found">Found item</IonSelectOption>
          </IonSelect>

          <IonLabel position="stacked">Category</IonLabel>
          <IonSelect
            className="report-input"
            value={category}
            interface="popover"
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

          <IonLabel position="stacked">Location</IonLabel>
          <IonInput
            className="report-input"
            value={location}
            placeholder="Where was it lost or found?"
            onIonInput={(event) =>
              setLocation(String(event.detail.value ?? ''))
            }
          />

          <IonLabel position="stacked">Date</IonLabel>
          <IonInput
            className="report-input"
            type="date"
            value={date}
            onIonInput={(event) =>
              setDate(String(event.detail.value ?? ''))
            }
          />

          <IonLabel position="stacked">Description</IonLabel>
          <IonTextarea
            className="report-input"
            value={description}
            placeholder="Describe the item and useful details"
            autoGrow
            onIonInput={(event) =>
              setDescription(String(event.detail.value ?? ''))
            }
          />

          {formError && (
            <p className="findit-message error-message" role="alert">
              {formError}
            </p>
          )}

          <IonButton
            expand="block"
            className="submit-report-button"
            disabled={saving}
            onClick={() => void saveEditedReport()}
          >
            {saving ? (
              <IonSpinner name="crescent" />
            ) : (
              'Save Changes'
            )}
          </IonButton>
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