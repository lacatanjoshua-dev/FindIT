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
  arrowForward,
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

type AdminView = 'dashboard' | 'activity' | 'history' | 'users';

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

type ChartDay = {
  date: Date;
  key: string;
  lost: number;
  found: number;
};

// ---------- Helpers ----------

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

const shortDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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

const claimShortDate = (record: ClaimRecord) => {
  const date = record.claimedAt?.toDate?.();
  return date ? shortDate(date) : '';
};

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

// Builds one bucket per day for the last `days` days, with Lost/Found counts.
const buildDays = (items: ItemSummary[], days: number): ChartDay[] => {
  const today = startOfToday();

  const result = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    return { date, key: dayKey(date), lost: 0, found: 0 };
  });

  const byKey = new Map(result.map((day) => [day.key, day]));

  items.forEach((item) => {
    if (!item.reportedOn) return;

    const day = byKey.get(dayKey(item.reportedOn));

    if (day) {
      if (item.type === 'Lost') day.lost += 1;
      else day.found += 1;
    }
  });

  return result;
};

const getUserName = (user: AdminUser) =>
  user.displayName?.trim() ||
  user.fullName?.trim() ||
  user.name?.trim() ||
  '';

// ---------- Small components ----------

type ReportsChartProps = {
  days: ChartDay[];
  compact?: boolean;
};

// Stacked bar chart: Lost (red) and Found (green) reports per day.
const ReportsChart: FC<ReportsChartProps> = ({ days, compact = false }) => {
  const max = Math.max(1, ...days.map((day) => day.lost + day.found));
  const total = days.reduce((sum, day) => sum + day.lost + day.found, 0);

  // Show fewer date labels when there are many bars.
  const labelEvery = days.length <= 7 ? 1 : days.length <= 14 ? 2 : 5;

  return (
    <div
      className={`admin-chart ${compact ? 'compact' : ''} ${
        days.length > 14 ? 'dense' : ''
      }`}
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`Bar chart of Lost and Found reports per day for the last ${days.length} days. ${total} reports in total.`}
    >
      {days.map((day, index) => {
        const count = day.lost + day.found;
        const showLabel = (days.length - 1 - index) % labelEvery === 0;

        return (
          <div
            className="admin-chart-col"
            key={day.key}
            title={`${shortDate(day.date)}: ${day.lost} lost, ${day.found} found`}
          >
            <span className="admin-chart-value">{count > 0 ? count : ''}</span>

            <div className="admin-chart-track">
              <div
                className="admin-chart-stack"
                style={{ height: `${(count / max) * 100}%` }}
              >
                {day.found > 0 && (
                  <div className="admin-chart-seg found" style={{ flexGrow: day.found }} />
                )}
                {day.lost > 0 && (
                  <div className="admin-chart-seg lost" style={{ flexGrow: day.lost }} />
                )}
              </div>
            </div>

            <span className="admin-chart-label">
              {showLabel
                ? days.length <= 7
                  ? day.date.toLocaleDateString('en-US', { weekday: 'short' })
                  : shortDate(day.date)
                : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const ChartLegend: FC = () => (
  <div className="admin-legend" aria-hidden="true">
    <span><i className="lost" /> Lost</span>
    <span><i className="found" /> Found</span>
  </div>
);

type BreakdownProps = {
  label: string;
  tone: 'lost' | 'found';
  claimed: number;
  unclaimed: number;
  loading: boolean;
};

// Progress card: how many Lost (or Found) items were already claimed.
const Breakdown: FC<BreakdownProps> = ({ label, tone, claimed, unclaimed, loading }) => {
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
        {loading ? 'Loading...' : `${claimed} claimed · ${unclaimed} not yet claimed`}
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

// ======================================================

const AdminDashboard: FC<AdminDashboardProps> = ({ onLogout, onOpenReports }) => {
  const [view, setView] = useState<AdminView>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

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

  const [activityDays, setActivityDays] = useState(14);

  const contentRef = useRef<HTMLIonContentElement>(null);

  const goTo = (next: AdminView) => {
    setMenuOpen(false);
    setView(next);
    void contentRef.current?.scrollToTop(0);
  };

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
      setUsersError('Unable to load registered users. Please check your Firestore rules.');
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
              type: String(data.type ?? 'Lost').toLowerCase() === 'found' ? 'Found' : 'Lost',
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
        setItemsError('Unable to load report statistics. Please check your Firestore rules.');
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
        setRecordsError('Unable to load the claim history. Please check your Firestore rules.');
        setRecordsLoading(false);
      }
    );

    void loadUsers();

    return () => {
      unsubscribeItems();
      unsubscribeRecords();
    };
  }, []);

  // ---------- Overall statistics ----------

  const isClaimed = (item: ItemSummary) => item.status !== 'Active';

  const totalReports = items.length;
  const claimedReports = items.filter(isClaimed).length;
  const lostItems = items.filter((item) => item.type === 'Lost');
  const foundItems = items.filter((item) => item.type === 'Found');
  const lostClaimed = lostItems.filter(isClaimed).length;
  const foundClaimed = foundItems.filter(isClaimed).length;

  // ---------- Activity ----------

  const weekDays = useMemo(() => buildDays(items, 7), [items]);
  const weekTotal = weekDays.reduce((sum, day) => sum + day.lost + day.found, 0);

  const activityChart = useMemo(() => buildDays(items, activityDays), [items, activityDays]);

  const activityStats = useMemo(() => {
    const lost = activityChart.reduce((sum, day) => sum + day.lost, 0);
    const found = activityChart.reduce((sum, day) => sum + day.found, 0);

    const busiest = activityChart.reduce<ChartDay | null>(
      (best, day) =>
        day.lost + day.found > (best ? best.lost + best.found : 0) ? day : best,
      null
    );

    const since = activityChart[0]?.date ?? startOfToday();
    const claimsInPeriod = records.filter((record) => {
      const date = record.claimedAt?.toDate?.();
      return date ? date >= since : false;
    }).length;

    return { lost, found, total: lost + found, busiest, claimsInPeriod };
  }, [activityChart, records]);

  // All categories with Lost / Found / Claimed counts.
  const categoryRows = useMemo(() => {
    const rows = new Map<string, { name: string; lost: number; found: number; claimed: number }>();

    items.forEach((item) => {
      const row = rows.get(item.category) ?? {
        name: item.category,
        lost: 0,
        found: 0,
        claimed: 0,
      };

      if (item.type === 'Lost') row.lost += 1;
      else row.found += 1;
      if (isClaimed(item)) row.claimed += 1;

      rows.set(item.category, row);
    });

    return [...rows.values()].sort(
      (a, b) => b.lost + b.found - (a.lost + a.found)
    );
  }, [items]);

  const categoryMax = categoryRows[0] ? categoryRows[0].lost + categoryRows[0].found : 1;

  // ---------- Claim history ----------

  const historyStats = useMemo(() => {
    const now = new Date();
    const thisMonth = records.filter((record) => {
      const date = record.claimedAt?.toDate?.();
      return (
        date &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    }).length;

    return {
      total: records.length,
      thisMonth,
      lost: records.filter((record) => record.itemType === 'Lost').length,
      found: records.filter((record) => record.itemType === 'Found').length,
    };
  }, [records]);

  const filteredRecords = records.filter((record) => {
    const searchText = historySearch.trim().toLowerCase();

    const matchesFilter = historyFilter === 'All' || record.itemType === historyFilter;

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

  const exportActivity = () => {
    downloadCsv(`findit-activity-${activityDays}-days-${todayStamp()}`, [
      ['Date', 'Lost reports', 'Found reports', 'Total'],
      ...activityChart.map((day) => [
        day.date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        day.lost,
        day.found,
        day.lost + day.found,
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

  // ---------- Navigation ----------

  const navItems: { view: AdminView | 'reports'; label: string; icon: string }[] = [
    { view: 'dashboard', label: 'Dashboard', icon: gridOutline },
    { view: 'reports', label: 'Lost & Found Reports', icon: documentTextOutline },
    { view: 'activity', label: 'Activity', icon: barChartOutline },
    { view: 'history', label: 'Claim History', icon: timeOutline },
    { view: 'users', label: 'Users', icon: peopleOutline },
  ];

  const pageTitles: Record<AdminView, string> = {
    dashboard: 'FindIt Admin',
    activity: 'Activity',
    history: 'Claim History',
    users: 'Users',
  };

  // ======================= VIEWS =======================

  const dashboardView = (
    <>
      <section className="admin-hero">
        <p className="admin-eyebrow">ADMINISTRATION</p>
        <h1>Dashboard Overview</h1>
        <p>A quick look at reports, returns and users. Open a section for details.</p>

        <div className="admin-hero-actions">
          <button type="button" className="admin-btn admin-btn-light" onClick={onOpenReports}>
            <IonIcon icon={documentTextOutline} />
            Manage Reports
          </button>
        </div>
      </section>

      {itemsError && <div className="admin-message error">{itemsError}</div>}

      <div className="admin-stat-grid">
        <div className="admin-stat">
          <div className="admin-stat-icon teal">
            <IonIcon icon={documentTextOutline} />
          </div>
          <p>Total Reports</p>
          <strong>{itemsLoading ? '–' : totalReports}</strong>
          <span>
            {itemsLoading ? 'Loading...' : `${lostItems.length} lost · ${foundItems.length} found`}
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
          <strong>{itemsLoading ? '–' : totalReports - claimedReports}</strong>
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

      <div className="admin-two-col even">
        {/* This week (preview of Activity) */}
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>This week</h2>
              <p>
                {itemsLoading
                  ? 'Loading...'
                  : `${weekTotal} ${weekTotal === 1 ? 'report' : 'reports'} in the last 7 days`}
              </p>
            </div>
            <ChartLegend />
          </div>

          <ReportsChart days={weekDays} compact />

          <button type="button" className="admin-panel-link" onClick={() => goTo('activity')}>
            Open Activity
            <IonIcon icon={arrowForward} />
          </button>
        </section>

        {/* Recent claims (preview of Claim History) */}
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>Recent claims</h2>
              <p>
                {recordsLoading
                  ? 'Loading...'
                  : `${records.length} ${records.length === 1 ? 'item' : 'items'} returned in total`}
              </p>
            </div>
          </div>

          {recordsLoading ? (
            <div className="admin-empty small">Loading...</div>
          ) : records.length === 0 ? (
            <div className="admin-empty small">No items have been claimed yet.</div>
          ) : (
            <ul className="admin-recent-list">
              {records.slice(0, 3).map((record) => (
                <li key={record.id}>
                  <span className={`admin-recent-dot ${record.itemType === 'Lost' ? 'lost' : 'found'}`} />
                  <div>
                    <strong>{record.itemName}</strong>
                    <span>
                      {record.ownerName} received from {record.finderName}
                    </span>
                  </div>
                  <small>{claimShortDate(record)}</small>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="admin-panel-link" onClick={() => goTo('history')}>
            View all claims
            <IonIcon icon={arrowForward} />
          </button>
        </section>
      </div>

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
    </>
  );

  const activityView = (
    <>
      <section className="admin-hero">
        <p className="admin-eyebrow">ANALYTICS</p>
        <h1>Activity</h1>
        <p>How many items are reported each day, and what kinds of items they are.</p>

        <div className="admin-hero-stats">
          <div>
            <strong>{itemsLoading ? '–' : activityStats.total}</strong>
            <span>Reports</span>
          </div>
          <div>
            <strong>{itemsLoading ? '–' : activityStats.lost}</strong>
            <span>Lost</span>
          </div>
          <div>
            <strong>{itemsLoading ? '–' : activityStats.found}</strong>
            <span>Found</span>
          </div>
          <div>
            <strong>{recordsLoading ? '–' : activityStats.claimsInPeriod}</strong>
            <span>Returned</span>
          </div>
        </div>
      </section>

      {itemsError && <div className="admin-message error">{itemsError}</div>}

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Reports per day</h2>
            <p>
              Last {activityDays} days
              {activityStats.busiest
                ? ` · busiest: ${shortDate(activityStats.busiest.date)} (${
                    activityStats.busiest.lost + activityStats.busiest.found
                  })`
                : ''}
            </p>
          </div>

          <div className="admin-panel-tools">
            <div className="admin-range" role="group" aria-label="Time range">
              {[7, 14, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={activityDays === days ? 'active' : ''}
                  aria-pressed={activityDays === days}
                  onClick={() => setActivityDays(days)}
                >
                  {days} days
                </button>
              ))}
            </div>

            <button
              type="button"
              className="admin-btn"
              onClick={exportActivity}
              disabled={itemsLoading}
            >
              <IonIcon icon={downloadOutline} />
              CSV
            </button>
          </div>
        </div>

        <ChartLegend />
        <ReportsChart days={activityChart} />
      </section>

      <section className="admin-panel admin-section-gap">
        <div className="admin-panel-head">
          <div>
            <h2>Categories</h2>
            <p>All reports by kind of item, with how many were claimed</p>
          </div>
        </div>

        {itemsLoading ? (
          <div className="admin-empty small">Loading...</div>
        ) : categoryRows.length === 0 ? (
          <div className="admin-empty small">No reports yet.</div>
        ) : (
          <ul className="admin-cat-list">
            {categoryRows.map((row) => {
              const total = row.lost + row.found;

              return (
                <li key={row.name}>
                  <div className="admin-cat-row">
                    <span>
                      <IonIcon icon={pricetagOutline} />
                      {row.name}
                    </span>
                    <strong>{total}</strong>
                  </div>

                  <div className="admin-cat-bar split">
                    <div
                      className="lost"
                      style={{ width: `${(row.lost / categoryMax) * 100}%` }}
                    />
                    <div
                      className="found"
                      style={{ width: `${(row.found / categoryMax) * 100}%` }}
                    />
                  </div>

                  <p className="admin-cat-meta">
                    {row.lost} lost · {row.found} found · {row.claimed} claimed
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );

  const historyView = (
    <>
      <section className="admin-hero">
        <p className="admin-eyebrow">RECORDS</p>
        <h1>Claim History</h1>
        <p>
          Items that owners confirmed they received in the app. Each record is
          saved automatically and cannot be edited.
        </p>

        <div className="admin-hero-stats">
          <div>
            <strong>{recordsLoading ? '–' : historyStats.total}</strong>
            <span>All time</span>
          </div>
          <div>
            <strong>{recordsLoading ? '–' : historyStats.thisMonth}</strong>
            <span>This month</span>
          </div>
          <div>
            <strong>{recordsLoading ? '–' : historyStats.lost}</strong>
            <span>Lost items</span>
          </div>
          <div>
            <strong>{recordsLoading ? '–' : historyStats.found}</strong>
            <span>Found items</span>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-toolbar">
          <IonSearchbar
            className="findit-search admin-search"
            placeholder="Search item, owner or finder..."
            value={historySearch}
            debounce={150}
            onIonInput={(event) => setHistorySearch(event.detail.value || '')}
          />

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

        <IonSegment
          className="admin-segment"
          value={historyFilter}
          onIonChange={(event) => setHistoryFilter(String(event.detail.value ?? 'All'))}
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
      </section>

      {recordsError && <div className="admin-message error">{recordsError}</div>}

      <p className="admin-count">
        {filteredRecords.length} {filteredRecords.length === 1 ? 'record' : 'records'}
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
        <>
          <p className="admin-table-hint">Swipe the table sideways to see all columns.</p>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col" className="num">#</th>
                  <th scope="col" className="sticky">Item</th>
                  <th scope="col">Type</th>
                  <th scope="col">Owner (Received)</th>
                  <th scope="col">Finder (Returned)</th>
                  <th scope="col">Date Claimed</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map((record, index) => (
                  <tr key={record.id}>
                    <td className="num">{index + 1}</td>
                    <td className="strong sticky">{record.itemName}</td>
                    <td>
                      <span className={`admin-pill ${record.itemType === 'Lost' ? 'lost' : 'found'}`}>
                        {record.itemType}
                      </span>
                    </td>
                    <td>{record.ownerName}</td>
                    <td>{record.finderName}</td>
                    <td className="nowrap">{formatDateTime(record.claimedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );

  const usersView = (
    <>
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

      <section className="admin-panel">
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
      </section>

      <p className="admin-count">
        Showing {filteredUsers.length} of {users.length} users
      </p>

      {usersError && <div className="admin-message error">{usersError}</div>}

      {usersLoading ? (
        <div className="admin-empty">Loading registered users...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="admin-empty">
          {users.length === 0 ? 'No registered users found.' : 'No users match your search.'}
        </div>
      ) : (
        <div className="admin-users-list">
          {filteredUsers.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      )}
    </>
  );

  // ======================= PAGE =======================

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

          <IonTitle>
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
              {pageTitles[view]}
            </span>
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content" ref={contentRef}>
        <div className="admin-layout">
          {menuOpen && (
            <button
              type="button"
              className="admin-menu-backdrop"
              onClick={() => setMenuOpen(false)}
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
            </div>

            <nav className="admin-nav" aria-label="Admin">
              {navItems.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  className={`admin-nav-item ${view === item.view ? 'active' : ''}`}
                  aria-current={view === item.view ? 'page' : undefined}
                  onClick={() => {
                    if (item.view === 'reports') {
                      setMenuOpen(false);
                      onOpenReports();
                    } else {
                      goTo(item.view);
                    }
                  }}
                >
                  <IonIcon icon={item.icon} />
                  <IonLabel>{item.label}</IonLabel>
                </button>
              ))}
            </nav>

            <button type="button" className="admin-nav-item admin-nav-logout" onClick={onLogout}>
              <IonIcon icon={logOutOutline} />
              <IonLabel>Log Out</IonLabel>
            </button>
          </aside>

          <main className="admin-main">
            {view === 'dashboard' && dashboardView}
            {view === 'activity' && activityView}
            {view === 'history' && historyView}
            {view === 'users' && usersView}
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminDashboard;