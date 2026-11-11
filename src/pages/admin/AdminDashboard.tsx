import { useEffect, useMemo, useRef, useState } from 'react';
import type { FC, RefObject } from 'react';

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
  barChartOutline,
  checkmarkCircleOutline,
  closeOutline,
  documentTextOutline,
  downloadOutline,
  gridOutline,
  logOutOutline,
  menuOutline,
  peopleOutline,
  pricetagOutline,
  refreshOutline,
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
import FindItLogo from '../../components/FindItLogo';
import { normalizeCategory } from '../../constants/categories';
import { downloadCsv, todayStamp } from '../../services/csv';

import '../Home.css';
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
  category: string;
  reportedOn: Date | null;
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

const CHART_DAYS = 14;

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

// When the report was made: createdAt if saved, else the "YYYY-MM-DD" date.
const getReportedOn = (data: Record<string, unknown>): Date | null => {
  const created = (data.createdAt as TimestampLike)?.toDate?.();

  if (created) {
    return created;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data.date ?? ''));

  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : null;
};

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const getUserName = (user: AdminUser) =>
  user.displayName?.trim() ||
  user.fullName?.trim() ||
  user.name?.trim() ||
  '';

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
        <strong>{loading ? '–' : `${percent}%`}</strong>
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
          className={`admin-progress-fill ${tone}`}
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

// One registered user, with their profile picture.
const UserCard: FC<{ user: AdminUser }> = ({ user }) => {
  const profile = useUserProfile(user.id);
  const name = getUserName(user) || profile.name || 'Unnamed User';

  return (
    <article className="admin-user-card">
      <UserAvatar name={name} photoUrl={profile.photoUrl} size={52} />

      <div className="admin-user-info">
        <div className="admin-user-name-row">
          <h3>{name}</h3>
          <span className="admin-user-role">{user.role || 'Student'}</span>
        </div>

        <p>{user.email || 'No email'}</p>

        {user.studentId && <p>Student ID: {user.studentId}</p>}

        <p className="admin-user-id">UID: {user.id}</p>
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
  const chartSectionRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => setMenuOpen(false);

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError('');

    try {
      const snapshot = await getDocs(query(collection(db, 'users')));

      setUsers(
        snapshot.docs.map((userDoc) => ({
          id: userDoc.id,
          ...userDoc.data(),
        })) as AdminUser[]
      );
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
          snapshot.docs.map((itemDoc): ItemSummary => {
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
              category: String(normalizeCategory(data.category)),
              reportedOn: getReportedOn(data),
            };
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
    const unsubscribeRecords = onSnapshot(
      query(collection(db, 'claimRecords'), orderBy('claimedAt', 'desc')),
      (snapshot) => {
        setRecords(
          snapshot.docs.map((recordDoc): ClaimRecord => {
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

  const scrollTo = (ref: RefObject<HTMLDivElement | null>) => {
    closeMenu();

    window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // ---------- Statistics ----------

  const isClaimed = (item: ItemSummary) => item.status !== 'Active';

  const totalReports = items.length;
  const claimedReports = items.filter(isClaimed).length;
  const unclaimedReports = totalReports - claimedReports;

  const lostItems = items.filter((item) => item.type === 'Lost');
  const foundItems = items.filter((item) => item.type === 'Found');

  const lostClaimed = lostItems.filter(isClaimed).length;
  const foundClaimed = foundItems.filter(isClaimed).length;

  // Reports per day for the last 14 days.
  const chartDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Array.from({ length: CHART_DAYS }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (CHART_DAYS - 1 - index));

      return { date, key: dayKey(date), lost: 0, found: 0 };
    });

    const byKey = new Map(days.map((day) => [day.key, day]));

    items.forEach((item) => {
      if (!item.reportedOn) return;

      const day = byKey.get(dayKey(item.reportedOn));

      if (day) {
        if (item.type === 'Lost') day.lost += 1;
        else day.found += 1;
      }
    });

    return days;
  }, [items]);

  const chartMax = Math.max(1, ...chartDays.map((day) => day.lost + day.found));
  const chartTotal = chartDays.reduce((sum, day) => sum + day.lost + day.found, 0);

  // Most reported categories.
  const topCategories = useMemo(() => {
    const counts = new Map<string, number>();

    items.forEach((item) => {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [items]);

  const topCategoryMax = topCategories[0]?.count ?? 1;

  // ---------- Claim history ----------

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

  const exportClaimHistory = () => {
    downloadCsv(`findit-claim-history-${todayStamp()}`, [
      ['Date Claimed', 'Item', 'Type', 'Owner (Received)', 'Finder (Returned)'],
      ...filteredRecords.map((record) => [
        formatDateTime(record.claimedAt),
        record.itemName,
        record.itemType,
        record.ownerName,
        record.finderName,
      ]),
    ]);
  };

  // ---------- Users ----------

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

  const exportUsers = () => {
    downloadCsv(`findit-users-${todayStamp()}`, [
      ['Name', 'Email', 'Student ID', 'Role', 'User ID'],
      ...filteredUsers.map((user) => [
        getUserName(user),
        user.email || '',
        user.studentId || '',
        user.role || 'Student',
        user.id,
      ]),
    ]);
  };

  const brandTitle = (text: string) => (
    <span
      className="brand-title"
      style={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '10px',
        verticalAlign: 'middle',
      }}
    >
      <FindItLogo
        size={28}
        background="#ffffff"
        foreground="#0f766e"
        radius={32}
        label=""
      />
      {text}
    </span>
  );

  // ================= MANAGE USERS PAGE =================
  if (showUsersPage) {
    return (
      <IonPage>
        <IonHeader className="findit-header">
          <IonToolbar>
            <IonButton
              slot="start"
              fill="clear"
              aria-label="Back to dashboard"
              onClick={() => setShowUsersPage(false)}
            >
              <IonIcon icon={arrowBackOutline} />
            </IonButton>

            <IonTitle>Manage Users</IonTitle>

            <IonButton slot="end" fill="clear" onClick={onLogout} aria-label="Logout">
              <IonIcon icon={logOutOutline} slot="start" />
              <span className="admin-logout-label">Logout</span>
            </IonButton>
          </IonToolbar>
        </IonHeader>

        <IonContent className="admin-content">
          <main className="admin-main admin-main-narrow">
            <section className="admin-hero">
              <p className="admin-eyebrow">ACCOUNT MANAGEMENT</p>
              <h1>Registered Users</h1>
              <p>View and search FindIt student accounts.</p>

              <div className="admin-hero-stats">
                <div>
                  <strong>{usersLoading ? '–' : users.length}</strong>
                  <span>Accounts</span>
                </div>
              </div>
            </section>

            <div className="admin-toolbar">
              <IonSearchbar
                className="findit-search admin-search"
                placeholder="Search name, email, student ID..."
                value={userSearch}
                debounce={150}
                onIonInput={(event) => setUserSearch(event.detail.value || '')}
              />

              <div className="admin-toolbar-actions">
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => void loadUsers()}
                  disabled={usersLoading}
                >
                  <IonIcon icon={refreshOutline} />
                  {usersLoading ? 'Loading...' : 'Refresh'}
                </button>

                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={exportUsers}
                  disabled={usersLoading || filteredUsers.length === 0}
                >
                  <IonIcon icon={downloadOutline} />
                  Export CSV
                </button>
              </div>
            </div>

            <p className="admin-count">
              Showing {filteredUsers.length} of {users.length} users
            </p>

            {usersError && <div className="admin-message error">{usersError}</div>}

            {usersLoading ? (
              <div className="admin-empty">Loading registered users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="admin-empty">
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
          </main>
        </IonContent>
      </IonPage>
    );
  }

  // ================= DASHBOARD PAGE =================
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

          <IonTitle>{brandTitle('FindIt Admin')}</IonTitle>

          <IonButton slot="end" fill="clear" onClick={onLogout} aria-label="Logout">
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

          <aside className={`admin-sidebar ${menuOpen ? 'admin-sidebar-open' : ''}`}>
            <div className="admin-brand">
              <FindItLogo
                size={44}
                background="#ffffff"
                foreground="#0f766e"
                radius={30}
                label=""
              />
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

            <nav className="admin-nav" aria-label="Admin">
              <button type="button" className="admin-nav-item active" onClick={closeMenu}>
                <IonIcon icon={gridOutline} />
                <IonLabel>Dashboard</IonLabel>
              </button>

              <button
                type="button"
                className="admin-nav-item"
                onClick={() => {
                  closeMenu();
                  onOpenReports();
                }}
              >
                <IonIcon icon={documentTextOutline} />
                <IonLabel>Lost &amp; Found Reports</IonLabel>
              </button>

              <button
                type="button"
                className="admin-nav-item"
                onClick={() => scrollTo(chartSectionRef)}
              >
                <IonIcon icon={barChartOutline} />
                <IonLabel>Activity</IonLabel>
              </button>

              <button
                type="button"
                className="admin-nav-item"
                onClick={() => scrollTo(historySectionRef)}
              >
                <IonIcon icon={timeOutline} />
                <IonLabel>Claim History</IonLabel>
              </button>

              <button
                type="button"
                className="admin-nav-item"
                onClick={() => {
                  closeMenu();
                  setShowUsersPage(true);
                }}
              >
                <IonIcon icon={peopleOutline} />
                <IonLabel>Users</IonLabel>
              </button>
            </nav>

            <button type="button" className="admin-nav-item admin-nav-logout" onClick={onLogout}>
              <IonIcon icon={logOutOutline} />
              <IonLabel>Log Out</IonLabel>
            </button>
          </aside>

          <main className="admin-main">
            <section className="admin-hero">
              <p className="admin-eyebrow">ADMINISTRATION</p>
              <h1>Dashboard Overview</h1>
              <p>
                Monitor reports, see how many items were returned, and review
                the claim history.
              </p>

              <div className="admin-hero-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-light"
                  onClick={onOpenReports}
                >
                  <IonIcon icon={documentTextOutline} />
                  Manage Reports
                </button>
              </div>
            </section>

            {itemsError && <div className="admin-message error">{itemsError}</div>}

            {/* STAT CARDS */}
            <div className="admin-stat-grid">
              <div className="admin-stat">
                <div className="admin-stat-icon teal">
                  <IonIcon icon={documentTextOutline} />
                </div>
                <p>Total Reports</p>
                <strong>{itemsLoading ? '–' : totalReports}</strong>
                <span>
                  {itemsLoading
                    ? 'Loading...'
                    : `${lostItems.length} lost · ${foundItems.length} found`}
                </span>
              </div>

              <div className="admin-stat">
                <div className="admin-stat-icon mint">
                  <IonIcon icon={checkmarkCircleOutline} />
                </div>
                <p>Claimed</p>
                <strong>{itemsLoading ? '–' : claimedReports}</strong>
                <span>Returned to owners</span>
              </div>

              <div className="admin-stat">
                <div className="admin-stat-icon amber">
                  <IonIcon icon={timeOutline} />
                </div>
                <p>Still Active</p>
                <strong>{itemsLoading ? '–' : unclaimedReports}</strong>
                <span>Waiting for the owner</span>
              </div>

              <div className="admin-stat">
                <div className="admin-stat-icon blue">
                  <IonIcon icon={peopleOutline} />
                </div>
                <p>Users</p>
                <strong>{usersLoading ? '–' : users.length}</strong>
                <span>Registered accounts</span>
              </div>
            </div>

            {/* ACTIVITY CHART + CATEGORIES */}
            <div className="admin-two-col" ref={chartSectionRef}>
              <section className="admin-panel admin-panel-wide">
                <div className="admin-panel-head">
                  <div>
                    <h2>Reports in the last {CHART_DAYS} days</h2>
                    <p>
                      {itemsLoading
                        ? 'Loading...'
                        : `${chartTotal} ${chartTotal === 1 ? 'report' : 'reports'} in this period`}
                    </p>
                  </div>

                  <div className="admin-legend" aria-hidden="true">
                    <span><i className="lost" /> Lost</span>
                    <span><i className="found" /> Found</span>
                  </div>
                </div>

                <div
                  className="admin-chart"
                  role="img"
                  aria-label={`Bar chart of Lost and Found reports per day for the last ${CHART_DAYS} days. ${chartTotal} reports in total.`}
                >
                  {chartDays.map((day, index) => {
                    const total = day.lost + day.found;
                    const showLabel = index % 2 === (CHART_DAYS - 1) % 2;

                    return (
                      <div
                        className="admin-chart-col"
                        key={day.key}
                        title={`${day.date.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}: ${day.lost} lost, ${day.found} found`}
                      >
                        <span className="admin-chart-value">{total > 0 ? total : ''}</span>

                        <div className="admin-chart-track">
                          <div
                            className="admin-chart-stack"
                            style={{ height: `${(total / chartMax) * 100}%` }}
                          >
                            {day.found > 0 && (
                              <div
                                className="admin-chart-seg found"
                                style={{ flexGrow: day.found }}
                              />
                            )}
                            {day.lost > 0 && (
                              <div
                                className="admin-chart-seg lost"
                                style={{ flexGrow: day.lost }}
                              />
                            )}
                          </div>
                        </div>

                        <span className="admin-chart-label">
                          {showLabel
                            ? day.date.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })
                            : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-head">
                  <div>
                    <h2>Top Categories</h2>
                    <p>Most reported kinds of items</p>
                  </div>
                </div>

                {itemsLoading ? (
                  <div className="admin-empty small">Loading...</div>
                ) : topCategories.length === 0 ? (
                  <div className="admin-empty small">No reports yet.</div>
                ) : (
                  <ul className="admin-cat-list">
                    {topCategories.map((category) => (
                      <li key={category.name}>
                        <div className="admin-cat-row">
                          <span>
                            <IonIcon icon={pricetagOutline} />
                            {category.name}
                          </span>
                          <strong>{category.count}</strong>
                        </div>
                        <div className="admin-cat-bar">
                          <div
                            style={{
                              width: `${(category.count / topCategoryMax) * 100}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
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
                unclaimed={lostItems.length - lostClaimed}
                loading={itemsLoading}
              />

              <Breakdown
                label="Found items"
                tone="found"
                claimed={foundClaimed}
                unclaimed={foundItems.length - foundClaimed}
                loading={itemsLoading}
              />
            </div>

            {/* CLAIM HISTORY */}
            <section className="admin-panel admin-history" ref={historySectionRef}>
              <div className="admin-panel-head">
                <div>
                  <p className="admin-eyebrow">RECORDS</p>
                  <h2>Claim History</h2>
                  <p>Items that owners confirmed they received.</p>
                </div>

                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={exportClaimHistory}
                  disabled={recordsLoading || filteredRecords.length === 0}
                >
                  <IonIcon icon={downloadOutline} />
                  Export CSV
                </button>
              </div>

              <div className="admin-toolbar">
                <IonSearchbar
                  className="findit-search admin-search"
                  placeholder="Search item, owner or finder..."
                  value={historySearch}
                  debounce={150}
                  onIonInput={(event) => setHistorySearch(event.detail.value || '')}
                />

                <IonSegment
                  className="admin-segment"
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
              </div>

              {recordsError && <div className="admin-message error">{recordsError}</div>}

              <p className="admin-count">
                {filteredRecords.length}{' '}
                {filteredRecords.length === 1 ? 'record' : 'records'}
              </p>

              {recordsLoading ? (
                <div className="admin-empty">Loading claim history...</div>
              ) : filteredRecords.length === 0 ? (
                <div className="admin-empty">
                  {records.length === 0
                    ? 'No items have been claimed yet.'
                    : 'No records match your search or filter.'}
                </div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Date Claimed</th>
                        <th scope="col">Item</th>
                        <th scope="col">Type</th>
                        <th scope="col">Owner (Received)</th>
                        <th scope="col">Finder (Returned)</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredRecords.map((record) => (
                        <tr key={record.id}>
                          <td className="nowrap">{formatDateTime(record.claimedAt)}</td>
                          <td className="strong">{record.itemName}</td>
                          <td>
                            <span
                              className={`admin-pill ${
                                record.itemType === 'Lost' ? 'lost' : 'found'
                              }`}
                            >
                              {record.itemType}
                            </span>
                          </td>
                          <td>{record.ownerName}</td>
                          <td>{record.finderName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminDashboard;