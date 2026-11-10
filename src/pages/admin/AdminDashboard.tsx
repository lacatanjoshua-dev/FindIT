import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FC } from 'react';

import {
  IonButton,
  IonCard,
  IonCardContent,
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
  checkmarkCircleOutline,
  closeOutline,
  documentTextOutline,
  gridOutline,
  logOutOutline,
  menuOutline,
  peopleOutline,
  timeOutline,
} from 'ionicons/icons';

import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

import { db } from '../../firebase';
import UserAvatar, { useUserProfile } from '../../components/UserAvatar';

import './Admin.css';

type AdminDashboardProps = {
  onLogout: () => void;
  onOpenReports: () => void;
};

type TimestampLike = {
  toDate?: () => Date;
} | null;

type ItemSummary = {
  id: string;
  type: 'Lost' | 'Found';
  status: 'Active' | 'Claimed' | 'Resolved';
};

type ClaimRecord = {
  id: string;
  itemName: string;
  itemType: 'Lost' | 'Found';
  ownerName: string;
  finderName: string;
  claimedAt?: TimestampLike;
};

type AdminUser = {
  id: string;
  displayName?: string;
  fullName?: string;
  name?: string;
  email?: string;
  studentId?: string;
  role?: string;
};

const formatDateTime = (value?: TimestampLike) => {
  const date = value?.toDate?.();

  if (!date) {
    return 'Date not available';
  }

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getUserName = (user: AdminUser) =>
  user.displayName?.trim() ||
  user.fullName?.trim() ||
  user.name?.trim() ||
  '';

// Styles for the claim history table.
const tableWrapperStyle: CSSProperties = {
  width: '100%',
  overflowX: 'auto',
  background: '#ffffff',
  border: '1px solid #e1ece9',
  borderRadius: '16px',
  marginTop: '4px',
  boxShadow: '0 4px 14px rgba(24, 59, 57, 0.05)',
};

const tableStyle: CSSProperties = {
  width: '100%',
  minWidth: '720px',
  borderCollapse: 'collapse',
  fontSize: '14px',
  color: '#183B39',
};

const headerCellStyle: CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  background: '#E6F7F3',
  color: '#0F766E',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid #d3e8e2',
};

const bodyCellStyle: CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'top',
  borderBottom: '1px solid #eef4f2',
};

type BreakdownProps = {
  label: string;
  tone: 'lost' | 'found';
  claimed: number;
  unclaimed: number;
  loading: boolean;
};

// Progress card: how many Lost (or Found) items were already claimed.
const Breakdown: FC<BreakdownProps> = ({
  label,
  tone,
  claimed,
  unclaimed,
  loading,
}) => {
  const total = claimed + unclaimed;
  const percent = total > 0 ? Math.round((claimed / total) * 100) : 0;

  return (
    <div className="admin-breakdown-card">
      <div className="admin-breakdown-top">
        <span className={`admin-pill ${tone}`}>{label}</span>
        <strong>{loading ? '—' : `${percent}%`}</strong>
      </div>

      <div
        className="admin-progress"
        role="progressbar"
        aria-label={`${label} claimed`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="admin-progress-fill"
          style={{ width: `${loading ? 0 : percent}%` }}
        />
      </div>

      <p>
        {loading
          ? 'Loading...'
          : `${claimed} claimed · ${unclaimed} not yet claimed`}
      </p>
    </div>
  );
};

type UserCardProps = {
  user: AdminUser;
};

// One registered user, with their profile picture.
const UserCard: FC<UserCardProps> = ({ user }) => {
  const profile = useUserProfile(user.id);
  const name = getUserName(user) || profile.name || 'Unnamed User';

  return (
    <article className="admin-user-card">
      <UserAvatar name={name} photoUrl={profile.photoUrl} size={52} />

      <div className="admin-user-info">
        <h3>{name}</h3>

        <p>
          <strong>Email:</strong> {user.email || 'Not provided'}
        </p>

        {user.studentId && (
          <p>
            <strong>Student ID:</strong> {user.studentId}
          </p>
        )}

        <span className="admin-user-role">{user.role || 'Student'}</span>

        <p className="admin-user-id">User ID: {user.id}</p>
      </div>
    </article>
  );
};

const AdminDashboard: FC<AdminDashboardProps> = ({
  onLogout,
  onOpenReports,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUsersPage, setShowUsersPage] = useState(false);

  const [items, setItems] = useState<ItemSummary[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState('');

  const [records, setRecords] = useState<ClaimRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('All');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const historySectionRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const handleOpenReports = () => {
    closeMenu();
    onOpenReports();
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError('');

    try {
      const snapshot = await getDocs(query(collection(db, 'users')));

      const loadedUsers = snapshot.docs.map((userDoc) => ({
        id: userDoc.id,
        ...userDoc.data(),
      })) as AdminUser[];

      setUsers(loadedUsers);
    } catch (error) {
      console.error('Error loading users:', error);

      setUsersError(
        'Unable to load registered users. Please check your Firestore rules.'
      );
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    // Live statistics from all reports.
    const unsubscribeItems = onSnapshot(
      collection(db, 'items'),
      (snapshot) => {
        setItems(
          snapshot.docs.map((itemDoc) => {
            const data = itemDoc.data();

            return {
              id: itemDoc.id,
              type:
                String(data.type ?? 'Lost').toLowerCase() === 'found'
                  ? 'Found'
                  : 'Lost',
              status:
                data.status === 'Claimed' || data.status === 'Resolved'
                  ? data.status
                  : 'Active',
            } as ItemSummary;
          })
        );

        setItemsError('');
        setItemsLoading(false);
      },
      (error) => {
        console.error('Error loading report statistics:', error);
        setItemsError(
          'Unable to load report statistics. Please check your Firestore rules.'
        );
        setItemsLoading(false);
      }
    );

    // Live history of items that were claimed.
    const recordsQuery = query(
      collection(db, 'claimRecords'),
      orderBy('claimedAt', 'desc')
    );

    const unsubscribeRecords = onSnapshot(
      recordsQuery,
      (snapshot) => {
        setRecords(
          snapshot.docs.map((recordDoc) => {
            const data = recordDoc.data();

            return {
              id: recordDoc.id,
              itemName: String(data.itemName ?? 'Unnamed item'),
              itemType: data.itemType === 'Found' ? 'Found' : 'Lost',
              ownerName: String(data.ownerName ?? 'Unknown'),
              finderName: String(data.finderName ?? 'Unknown'),
              claimedAt: data.claimedAt ?? null,
            };
          })
        );

        setRecordsError('');
        setRecordsLoading(false);
      },
      (error) => {
        console.error('Error loading claim history:', error);
        setRecordsError(
          'Unable to load the claim history. Please check your Firestore rules.'
        );
        setRecordsLoading(false);
      }
    );

    void loadUsers();

    return () => {
      unsubscribeItems();
      unsubscribeRecords();
    };
  }, []);

  const handleOpenHistory = () => {
    closeMenu();

    window.setTimeout(() => {
      historySectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 100);
  };

  const handleOpenUsers = () => {
    closeMenu();
    setShowUsersPage(true);
  };

  // Statistics.
  const isClaimed = (item: ItemSummary) => item.status !== 'Active';

  const totalReports = items.length;
  const claimedReports = items.filter(isClaimed).length;
  const unclaimedReports = totalReports - claimedReports;

  const lostItems = items.filter((item) => item.type === 'Lost');
  const foundItems = items.filter((item) => item.type === 'Found');

  const lostClaimed = lostItems.filter(isClaimed).length;
  const lostUnclaimed = lostItems.length - lostClaimed;
  const foundClaimed = foundItems.filter(isClaimed).length;
  const foundUnclaimed = foundItems.length - foundClaimed;

  const filteredRecords = records.filter((record) => {
    const searchText = historySearch.trim().toLowerCase();

    const matchesFilter =
      historyFilter === 'All' || record.itemType === historyFilter;

    const matchesSearch =
      record.itemName.toLowerCase().includes(searchText) ||
      record.ownerName.toLowerCase().includes(searchText) ||
      record.finderName.toLowerCase().includes(searchText);

    return matchesFilter && matchesSearch;
  });

  const filteredUsers = users
    .filter((user) => {
      const searchText = userSearch.trim().toLowerCase();

      return (
        getUserName(user).toLowerCase().includes(searchText) ||
        (user.email || '').toLowerCase().includes(searchText) ||
        (user.studentId || '').toLowerCase().includes(searchText) ||
        (user.role || 'Student').toLowerCase().includes(searchText)
      );
    })
    .sort((a, b) => getUserName(a).localeCompare(getUserName(b)));

  // SEPARATE MANAGE USERS PAGE
  if (showUsersPage) {
    return (
      <IonPage>
        <IonHeader className="findit-header">
          <IonToolbar>
            <IonButton
              slot="start"
              fill="clear"
              onClick={() => setShowUsersPage(false)}
            >
              <IonIcon icon={gridOutline} slot="start" />
              Back
            </IonButton>

            <IonTitle>Manage Users</IonTitle>

            <IonButton
              slot="end"
              fill="clear"
              onClick={onLogout}
              aria-label="Logout"
            >
              <IonIcon icon={logOutOutline} slot="start" />
              <span className="admin-logout-label">Logout</span>
            </IonButton>
          </IonToolbar>
        </IonHeader>

        <IonContent className="admin-content">
          <main className="admin-main">
            <div className="admin-welcome">
              <p className="admin-eyebrow">ACCOUNT MANAGEMENT</p>
              <h1>Manage Users</h1>
              <p>View and search registered FindIt student accounts.</p>
            </div>

            <div className="admin-users-section">
              <div className="admin-users-heading">
                <div>
                  <h2>Registered Users</h2>
                  <p>All accounts registered in FindIt.</p>
                </div>

                <IonButton
                  fill="outline"
                  onClick={() => void loadUsers()}
                  disabled={usersLoading}
                >
                  {usersLoading ? 'Loading...' : 'Refresh'}
                </IonButton>
              </div>

              <IonSearchbar
                className="admin-report-search"
                placeholder="Search name, email, student ID..."
                value={userSearch}
                onIonInput={(event) => setUserSearch(event.detail.value || '')}
              />

              <div className="admin-report-count">
                Showing {filteredUsers.length} of {users.length} users
              </div>

              {usersError && (
                <div className="admin-claims-message error">{usersError}</div>
              )}

              {usersLoading ? (
                <div className="admin-claims-empty">
                  Loading registered users...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="admin-claims-empty">
                  {users.length === 0
                    ? 'No registered users found.'
                    : 'No users match your search.'}
                </div>
              ) : (
                <div className="admin-users-list">
                  {filteredUsers.map((user) => (
                    <UserCard key={user.id} user={user} />
                  ))}
                </div>
              )}
            </div>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  // ADMIN DASHBOARD PAGE
  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonButton
            slot="start"
            fill="clear"
            className="admin-hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <IonIcon icon={menuOpen ? closeOutline : menuOutline} />
          </IonButton>

          <IonTitle>FindIt Admin</IonTitle>

          <IonButton
            slot="end"
            fill="clear"
            onClick={onLogout}
            aria-label="Logout"
          >
            <IonIcon icon={logOutOutline} slot="start" />
            <span className="admin-logout-label">Logout</span>
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        <div className="admin-layout">
          {menuOpen && (
            <button
              type="button"
              className="admin-menu-backdrop"
              onClick={closeMenu}
              aria-label="Close navigation menu"
            />
          )}

          <aside
            className={`admin-sidebar ${
              menuOpen ? 'admin-sidebar-open' : ''
            }`}
          >
            <div className="admin-sidebar-mobile-heading">
              <div>
                <h2>FindIt</h2>
                <p>Administrator Panel</p>
              </div>

              <button
                type="button"
                className="admin-close-menu"
                onClick={closeMenu}
                aria-label="Close menu"
              >
                <IonIcon icon={closeOutline} />
              </button>
            </div>

            <div className="admin-brand">
              <h2>FindIt</h2>
              <p>Administrator Panel</p>
            </div>

            <div className="admin-nav">
              <button
                type="button"
                className="admin-nav-item active"
                onClick={closeMenu}
              >
                <IonIcon icon={gridOutline} />
                <IonLabel>Dashboard</IonLabel>
              </button>

              <button
                type="button"
                className="admin-nav-item"
                onClick={handleOpenReports}
              >
                <IonIcon icon={documentTextOutline} />
                <IonLabel>Lost &amp; Found Reports</IonLabel>
              </button>

              <button
                type="button"
                className="admin-nav-item"
                onClick={handleOpenHistory}
              >
                <IonIcon icon={timeOutline} />
                <IonLabel>Claim History</IonLabel>
              </button>

              <button
                type="button"
                className="admin-nav-item"
                onClick={handleOpenUsers}
              >
                <IonIcon icon={peopleOutline} />
                <IonLabel>Users</IonLabel>
              </button>
            </div>
          </aside>

          <main className="admin-main">
            <div className="admin-welcome">
              <p className="admin-eyebrow">ADMINISTRATION</p>
              <h1>Dashboard Overview</h1>
              <p>
                Monitor reports, see how many items were claimed, and review
                the claim history.
              </p>
            </div>

            {itemsError && (
              <div className="admin-claims-message error">{itemsError}</div>
            )}

            <div className="admin-stat-grid">
              <IonCard className="admin-stat-card">
                <IonCardContent>
                  <div className="admin-stat-icon teal">
                    <IonIcon icon={documentTextOutline} />
                  </div>
                  <p>Total Reports</p>
                  <h2>{itemsLoading ? '—' : totalReports}</h2>
                  <span>Lost &amp; Found items</span>
                </IonCardContent>
              </IonCard>

              <IonCard className="admin-stat-card">
                <IonCardContent>
                  <div className="admin-stat-icon mint">
                    <IonIcon icon={checkmarkCircleOutline} />
                  </div>
                  <p>Claimed Items</p>
                  <h2>{itemsLoading ? '—' : claimedReports}</h2>
                  <span>Returned to owners</span>
                </IonCardContent>
              </IonCard>

              <IonCard className="admin-stat-card">
                <IonCardContent>
                  <div className="admin-stat-icon amber">
                    <IonIcon icon={timeOutline} />
                  </div>
                  <p>Not Yet Claimed</p>
                  <h2>{itemsLoading ? '—' : unclaimedReports}</h2>
                  <span>Waiting for the owner</span>
                </IonCardContent>
              </IonCard>

              <IonCard className="admin-stat-card">
                <IonCardContent>
                  <div className="admin-stat-icon blue">
                    <IonIcon icon={peopleOutline} />
                  </div>
                  <p>Registered Users</p>
                  <h2>{usersLoading ? '—' : users.length}</h2>
                  <span>FindIt accounts</span>
                </IonCardContent>
              </IonCard>
            </div>

            {/* CLAIM PROGRESS */}
            <div className="admin-section-title">
              <h2>Claim Progress</h2>
              <p>How many reports were already claimed.</p>
            </div>

            <div className="admin-breakdown-grid">
              <Breakdown
                label="Lost items"
                tone="lost"
                claimed={lostClaimed}
                unclaimed={lostUnclaimed}
                loading={itemsLoading}
              />

              <Breakdown
                label="Found items"
                tone="found"
                claimed={foundClaimed}
                unclaimed={foundUnclaimed}
                loading={itemsLoading}
              />
            </div>

            {/* CLAIM HISTORY SECTION */}
            <div className="admin-claims-section" ref={historySectionRef}>
              <div className="admin-claims-heading">
                <div>
                  <p className="admin-eyebrow">RECORDS</p>
                  <h2>Claim History</h2>
                  <p>
                    Items that owners confirmed they received. Owners and
                    finders arrange the handover through in-app messages.
                  </p>
                </div>
              </div>

              <IonSearchbar
                className="admin-report-search"
                placeholder="Search item, owner or finder..."
                value={historySearch}
                onIonInput={(event) =>
                  setHistorySearch(event.detail.value || '')
                }
              />

              <IonSegment
                value={historyFilter}
                onIonChange={(event) =>
                  setHistoryFilter(String(event.detail.value ?? 'All'))
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

              {recordsError && (
                <div className="admin-claims-message error">
                  {recordsError}
                </div>
              )}

              <div className="admin-report-count">
                {filteredRecords.length}{' '}
                {filteredRecords.length === 1 ? 'record' : 'records'}
              </div>

              {recordsLoading ? (
                <div className="admin-claims-empty">
                  Loading claim history...
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="admin-claims-empty">
                  {records.length === 0
                    ? 'No items have been claimed yet.'
                    : 'No records match your search or filter.'}
                </div>
              ) : (
                <div style={tableWrapperStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={headerCellStyle}>Date Claimed</th>
                        <th style={headerCellStyle}>Item</th>
                        <th style={headerCellStyle}>Type</th>
                        <th style={headerCellStyle}>Owner (Received)</th>
                        <th style={headerCellStyle}>Finder (Returned)</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredRecords.map((record) => (
                        <tr key={record.id}>
                          <td
                            style={{ ...bodyCellStyle, whiteSpace: 'nowrap' }}
                          >
                            {formatDateTime(record.claimedAt)}
                          </td>

                          <td style={{ ...bodyCellStyle, fontWeight: 700 }}>
                            {record.itemName}
                          </td>

                          <td style={bodyCellStyle}>
                            <span
                              className={`admin-pill ${
                                record.itemType === 'Lost' ? 'lost' : 'found'
                              }`}
                            >
                              {record.itemType}
                            </span>
                          </td>

                          <td style={bodyCellStyle}>{record.ownerName}</td>

                          <td style={bodyCellStyle}>{record.finderName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <IonCard className="admin-welcome-card">
              <IonCardContent>
                <h2>Admin Workspace</h2>
                <p>
                  Use Lost &amp; Found Reports to manage listings. Items are
                  recorded here automatically when an owner confirms that
                  they received their item.
                </p>
              </IonCardContent>
            </IonCard>
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminDashboard;