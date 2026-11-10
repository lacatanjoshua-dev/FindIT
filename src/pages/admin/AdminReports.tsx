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
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

import {
  locationOutline,
  calendarOutline,
  trashOutline,
  searchOutline,
  arrowBackOutline,
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
import './Admin.css';

type ReportStatus = 'Active' | 'Claimed' | 'Resolved';

type ReportItem = {
  id: string;
  name: string;
  type: 'Lost' | 'Found';
  location: string;
  date: string;
  description: string;
  status: ReportStatus;
  userId: string;
  imageUrl: string;
  imagePath: string;
};

type AdminReportsProps = {
  onBack: () => void;
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
        borderRadius: '12px',
        margin: '8px 0',
      }}
    />
  );
};

const AdminReports: FC<AdminReportsProps> = ({ onBack }) => {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [selectedItem, setSelectedItem] = useState<ReportItem | null>(null);
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

          const status: ReportStatus =
            data.status === 'Claimed' || data.status === 'Resolved'
              ? data.status
              : 'Active';

          return {
            id: document.id,
            name: String(data.name ?? 'Unnamed item'),
            type:
              String(data.type ?? 'Lost').toLowerCase() === 'found'
                ? 'Found'
                : 'Lost',
            location: String(data.location ?? 'Unknown location'),
            date: String(data.date ?? ''),
            description: String(data.description ?? ''),
            status,
            userId: String(data.userId ?? ''),
            imageUrl:
              typeof data.imageUrl === 'string' ? data.imageUrl : '',
            imagePath:
              typeof data.imagePath === 'string' ? data.imagePath : '',
          };
        });

        reports.sort((a, b) => b.date.localeCompare(a.date));

        setItems(reports);
        setLoading(false);
        setError('');
      },
      (err) => {
        console.error('Admin reports listener error:', err);
        setError('Could not load reports. Check Firestore rules.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Search and filter reports.
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesFilter = filter === 'All' || item.type === filter;

      const matchesSearch =
        item.name.toLowerCase().includes(query) ||
        item.location.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [items, search, filter]);

  // Update report status and notify the student.
  const updateReportStatus = async (
    item: ReportItem,
    newStatus: ReportStatus,
  ) => {
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
      // Update the report status in Firestore.
      await updateDoc(doc(db, 'items', item.id), {
        status: newStatus,
      });

      // Update local state.
      setItems((previousItems) =>
        previousItems.map((previousItem) =>
          previousItem.id === item.id
            ? { ...previousItem, status: newStatus }
            : previousItem,
        ),
      );

      setSelectedItem((previousItem) =>
        previousItem?.id === item.id
          ? { ...previousItem, status: newStatus }
          : previousItem,
      );

      // Create a notification for the student who submitted the report.
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
        } catch (notificationError) {
          console.error('Create notification error:', notificationError);
          setError(
            'Report status updated, but the notification could not be created. Check Firestore rules.',
          );
        }
      } else {
        setError(
          'Report status updated, but no student UID was found for this report.',
        );
      }
    } catch (err) {
      console.error('Update report status error:', err);
      setError(
        'Could not update report status. Verify your admin Firestore permission.',
      );
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
      //    The admin Storage policy allows deleting any file in item-photos.
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

      if (selectedItem?.id === item.id) {
        setSelectedItem(null);
      }

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
        <main className="admin-main">
          <div className="admin-welcome">
            <p className="admin-eyebrow">ADMINISTRATION</p>
            <h1>Lost &amp; Found Reports</h1>
            <p>View and manage reports submitted by FindIt users.</p>
          </div>

          <div className="admin-report-tools">
            <IonInput
              className="admin-report-search"
              value={search}
              placeholder="Search item, location, or description..."
              onIonInput={(event) =>
                setSearch(String(event.detail.value ?? ''))
              }
            >
              <IonIcon icon={searchOutline} slot="start" />
            </IonInput>

            <IonSegment
              value={filter}
              onIonChange={(event) =>
                setFilter(String(event.detail.value ?? 'All'))
              }
            >
              <IonSegmentButton value="All">All</IonSegmentButton>
              <IonSegmentButton value="Lost">Lost</IonSegmentButton>
              <IonSegmentButton value="Found">Found</IonSegmentButton>
            </IonSegment>
          </div>

          {error && (
            <p className="findit-message error-message" role="alert">
              {error}
            </p>
          )}

          <div className="admin-report-count">
            {filteredItems.length}{' '}
            {filteredItems.length === 1 ? 'report' : 'reports'}
          </div>

          {loading ? (
            <div className="empty-state">
              <IonSpinner name="crescent" />
              <p>Loading reports...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="admin-welcome-card">
              <h2>No reports found</h2>
              <p>Try changing your search or filter.</p>
            </div>
          ) : (
            <div className="admin-report-list">
              {filteredItems.map((item) => (
                <article className="admin-report-card" key={item.id}>
                  <div className="admin-report-card-top">
                    <IonBadge
                      className={
                        item.type === 'Lost' ? 'status-lost' : 'status-found'
                      }
                    >
                      {item.type}
                    </IonBadge>

                    <div className="admin-report-actions">
                      <IonButton
                        size="small"
                        fill="clear"
                        color="danger"
                        aria-label={`Delete ${item.name}`}
                        onClick={() => setDeletingItem(item)}
                      >
                        <IonIcon icon={trashOutline} />
                      </IonButton>
                    </div>
                  </div>

                  <ReportPhoto src={item.imageUrl} />

                  <h2>{item.name}</h2>
                  <p>{item.description || 'No description provided.'}</p>

                  <div className="admin-report-meta">
                    <span>
                      <IonIcon icon={locationOutline} />
                      {item.location}
                    </span>
                    <span>
                      <IonIcon icon={calendarOutline} />
                      {item.date || 'Date not provided'}
                    </span>
                  </div>

                  <div className="admin-report-status-control">
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

                    <IonSelect
                      label="Report Status"
                      labelPlacement="stacked"
                      value={item.status}
                      interface="popover"
                      disabled={updatingStatusId === item.id}
                      onIonChange={(event) => {
                        const value = event.detail.value as ReportStatus;

                        if (
                          value === 'Active' ||
                          value === 'Claimed' ||
                          value === 'Resolved'
                        ) {
                          void updateReportStatus(item, value);
                        }
                      }}
                    >
                      <IonSelectOption value="Active">
                        Active
                      </IonSelectOption>
                      <IonSelectOption value="Claimed">
                        Claimed
                      </IonSelectOption>
                      <IonSelectOption value="Resolved">
                        Resolved
                      </IonSelectOption>
                    </IonSelect>

                    {updatingStatusId === item.id && (
                      <IonSpinner name="crescent" />
                    )}
                  </div>

                  <IonButton
                    size="small"
                    fill="outline"
                    onClick={() => setSelectedItem(item)}
                  >
                    View Details
                  </IonButton>
                </article>
              ))}
            </div>
          )}
        </main>
      </IonContent>

      <IonAlert
        isOpen={deletingItem !== null}
        header="Delete Report?"
        message={`Are you sure you want to delete "${deletingItem?.name ?? 'this report'}"? This cannot be undone.`}
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
        onDidDismiss={() => setDeletingItem(null)}
      />

      <IonAlert
        isOpen={selectedItem !== null}
        header={selectedItem?.name ?? 'Report Details'}
        message={
          selectedItem
            ? `Type: ${selectedItem.type}\nStatus: ${selectedItem.status}\nLocation: ${selectedItem.location}\nDate: ${selectedItem.date}\nDescription: ${selectedItem.description}\nReporter UID: ${selectedItem.userId}`
            : ''
        }
        buttons={['Close']}
        onDidDismiss={() => setSelectedItem(null)}
      />
    </IonPage>
  );
};

export default AdminReports;