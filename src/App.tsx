import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { IonApp, setupIonicReact } from '@ionic/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';

import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

import { auth, db } from './firebase';
import { ensureMyPublicProfile } from './services/photoService';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Report from './pages/Report';
import Profile from './pages/Profile';
import Messages from './pages/Messages';
import Chat from './pages/Chat';
import Search from './pages/Search';
import Notifications from './pages/Notifications';
import MyReports from './pages/MyReports';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminReports from './pages/admin/AdminReports';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

import './theme/variables.css';
import './pages/Auth.css';

setupIonicReact();

type AppPage = 'login' | 'register' | 'app';
type AdminView = 'dashboard' | 'reports';

export type AppTab =
  | 'home'
  | 'search'
  | 'report'
  | 'myreports'
  | 'messages'
  | 'chat'
  | 'profile'
  | 'notifications';

const App: FC = () => {
  const [page, setPage] = useState<AppPage>('login');
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [activeConversationId, setActiveConversationId] = useState('');

  const [searchRequest, setSearchRequest] = useState(0);

  const [unreadNotificationsCount, setUnreadNotificationsCount] =
    useState(0);

  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [adminView, setAdminView] = useState<AdminView>('dashboard');

  // Check Firebase authentication and user role.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAdmin(false);
        setAdminView('dashboard');
        setCheckingRole(false);
        return;
      }

      // Make sure this user has a public profile (name and photo only)
      // so other users can see it in chats.
      void ensureMyPublicProfile(user);

      setCheckingRole(true);

      try {
        const tokenResult = await user.getIdTokenResult(true);
        setIsAdmin(tokenResult.claims.admin === true);
      } catch (error) {
        console.error('Could not check user role:', error);
        setIsAdmin(false);
      } finally {
        setCheckingRole(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen to the current user's unread notifications in real time.
  useEffect(() => {
    let unsubscribeNotifications: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeNotifications?.();
      unsubscribeNotifications = undefined;

      if (!user) {
        setUnreadNotificationsCount(0);
        return;
      }

      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid)
      );

      unsubscribeNotifications = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          const unreadCount = snapshot.docs.filter(
            (notificationDoc) =>
              notificationDoc.data().isRead !== true
          ).length;

          setUnreadNotificationsCount(unreadCount);
        },
        (error) => {
          console.error(
            'Unread notifications listener error:',
            error
          );

          setUnreadNotificationsCount(0);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeNotifications?.();
    };
  }, []);

  const handleTabChange = (tab: AppTab) => {
    setSearchRequest(0);
    setActiveTab(tab);
  };

  const handleOpenChat = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setSearchRequest(0);
    setActiveTab('chat');
  };

  const handleLogin = () => {
    setActiveTab('home');
    setSearchRequest(0);
    setAdminView('dashboard');
    setPage('app');
  };

  const handleCreateAccount = () => {
    setPage('register');
  };

  const handleBackToLogin = () => {
    setPage('login');
  };

  const handleAccountCreated = () => {
    setPage('login');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);

      setIsAdmin(false);
      setAdminView('dashboard');
      setActiveTab('home');
      setActiveConversationId('');
      setSearchRequest(0);
      setUnreadNotificationsCount(0);
      setPage('login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <IonApp>
      {page === 'login' && (
        <Login
          onLogin={handleLogin}
          onCreateAccount={handleCreateAccount}
        />
      )}

      {page === 'register' && (
        <Register
          onBackToLogin={handleBackToLogin}
          onAccountCreated={handleAccountCreated}
        />
      )}

      {page === 'app' && (
        checkingRole ? (
          <div className="ion-padding">
            Checking account permissions...
          </div>
        ) : isAdmin ? (
          adminView === 'dashboard' ? (
            <AdminDashboard
              onLogout={handleLogout}
              onOpenReports={() => setAdminView('reports')}
            />
          ) : (
            <AdminReports
              onBack={() => setAdminView('dashboard')}
            />
          )
        ) : activeTab === 'notifications' ? (
          <Notifications
            userId={auth.currentUser?.uid ?? ''}
            onBack={() => setActiveTab('home')}
          />
        ) : activeTab === 'profile' ? (
          <Profile
            onLogout={handleLogout}
            onTabChange={handleTabChange}
          />
        ) : activeTab === 'chat' ? (
          <Chat
            conversationId={activeConversationId}
            onBack={() => setActiveTab('messages')}
          />
        ) : activeTab === 'search' ? (
          <Search
            onTabChange={handleTabChange}
            onOpenChat={handleOpenChat}
          />
        ) : activeTab === 'messages' ? (
          <Messages
            onTabChange={handleTabChange}
            onOpenChat={handleOpenChat}
          />
        ) : activeTab === 'myreports' ? (
          <MyReports
            onTabChange={handleTabChange}
          />
        ) : activeTab === 'report' ? (
          <Report
            onTabChange={handleTabChange}
          />
        ) : (
          <Home
            activeTab="home"
            onOpenProfile={() => handleTabChange('profile')}
            onOpenNotifications={() =>
              handleTabChange('notifications')
            }
            onOpenChat={handleOpenChat}
            onActiveTabChange={handleTabChange}
            searchRequest={searchRequest}
            unreadNotificationsCount={unreadNotificationsCount}
          />
        )
      )}
    </IonApp>
  );
};

export default App;