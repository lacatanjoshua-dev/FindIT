import { useEffect, useRef, useState } from 'react';
import type { FC, ChangeEvent } from 'react';

import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonTabBar,
  IonTabButton,
  IonTitle,
  IonToolbar,
  IonSpinner,
  IonInput,
  IonItem,
  IonToast,
} from '@ionic/react';

import {
  homeOutline,
  addCircleOutline,
  clipboardOutline,
  chatbubblesOutline,
  personOutline,
  logOutOutline,
  mailOutline,
  personCircleOutline,
  createOutline,
  cameraOutline,
  saveOutline,
} from 'ionicons/icons';

import {
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { auth, db } from '../firebase';
import { supabase } from '../supabase';
import { useUnreadMessagesCount } from '../services/useUnreadMessages';

import './Home.css';
import './Profile.css';
import './ProfileFacebook.css';

type NavigationTab =
  | 'home'
  | 'search'
  | 'report'
  | 'myreports'
  | 'messages'
  | 'profile';

type ProfileProps = {
  onLogout: () => void;
  onTabChange: (tab: NavigationTab) => void;
};

const BUCKET_NAME = 'profile-photos';

const MISSING_ROLE_ERROR = 'MISSING_AUTHENTICATED_ROLE';

const Profile: FC<ProfileProps> = ({ onLogout, onTabChange }) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [checkingAuth, setCheckingAuth] = useState(!auth.currentUser);

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoPath, setPhotoPath] = useState('');

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [, setRefreshTick] = useState(0);

  const [toastMessage, setToastMessage] = useState('');
  const [toastColor, setToastColor] = useState('success');

  const quickFileInputRef = useRef<HTMLInputElement>(null);

  const unreadMessages = useUnreadMessagesCount();

  // Load Firebase user and their saved Supabase photo path.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setDisplayName(currentUser?.displayName || '');
      setPhotoPreview(currentUser?.photoURL || '');
      setPhotoPath('');

      if (!currentUser) {
        setCheckingAuth(false);
        return;
      }

      try {
        const profileRef = doc(db, 'users', currentUser.uid);
        const profileSnapshot = await getDoc(profileRef);

        const savedPhotoPath = profileSnapshot.exists()
          ? String(profileSnapshot.data().photoPath || '')
          : '';

        if (savedPhotoPath) {
          const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(savedPhotoPath, 60 * 60);

          if (error) throw error;

          setPhotoPath(savedPhotoPath);
          setPhotoPreview(data.signedUrl);
        }
      } catch (error) {
        console.error('Profile photo loading error:', error);
        setToastMessage('Hindi ma-load ang profile photo.');
        setToastColor('warning');
      } finally {
        setCheckingAuth(false);
      }
    });

    return unsubscribe;
  }, []);

  const showMessage = (message: string, color = 'success') => {
    setToastMessage(message);
    setToastColor(color);
  };

  const validateImage = (file: File): string => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      return 'JPG, PNG, o WEBP images lamang ang puwede.';
    }

    if (file.size > 5 * 1024 * 1024) {
      return 'Maximum na laki ng larawan ay 5 MB.';
    }

    return '';
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setDisplayName(user?.displayName || '');
  };

  // Turn any error into a clear message for the user.
  const getSaveErrorMessage = (error: unknown) => {
    const code = (error as { code?: string } | null)?.code;
    const rawMessage =
      error instanceof Error
        ? error.message
        : String((error as { message?: string } | null)?.message ?? error);

    if (rawMessage === MISSING_ROLE_ERROR) {
      return 'Kulang pa ang permiso ng account na ito para mag-upload. Mag-log out, mag-log in ulit, at subukan muli.';
    }

    if (code === 'permission-denied') {
      return 'Hindi pinayagan ng Firestore rules ang pag-save ng profile.';
    }

    if (rawMessage.toLowerCase().includes('row-level security')) {
      return 'Hindi pinayagan ng Supabase Storage policy ang upload.';
    }

    return `Hindi na-save ang profile: ${rawMessage}`;
  };

  // Camera button on the profile picture: upload and save right away.
  const handleQuickPhotoChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !user) return;

    const problem = validateImage(file);

    if (problem) {
      showMessage(problem, 'danger');
      return;
    }

    setUploadingPhoto(true);

    let uploadedPath = '';

    try {
      // Refresh the token so the latest custom claims are included.
      await user.getIdToken(true);
      const tokenResult = await user.getIdTokenResult();

      if (tokenResult.claims.role !== 'authenticated') {
        throw new Error(MISSING_ROLE_ERROR);
      }

      const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      uploadedPath = `${user.uid}/${Date.now()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(uploadedPath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const nameForProfile = (
        user.displayName?.trim() ||
        user.email?.split('@')[0] ||
        'FindIt Student'
      ).slice(0, 60);

      // Private profile (Firestore "users").
      const profileRef = doc(db, 'users', user.uid);
      const existingProfile = await getDoc(profileRef);

      const profileData: Record<string, unknown> = {
        photoPath: uploadedPath,
        updatedAt: new Date(),
      };

      if (!existingProfile.exists()) {
        profileData.displayName = nameForProfile;
        profileData.uid = user.uid;
        profileData.email = user.email || '';
        profileData.role = 'Student';
      }

      await setDoc(profileRef, profileData, { merge: true });

      // Public copy so other users see the new picture in chats.
      await setDoc(
        doc(db, 'publicProfiles', user.uid),
        {
          displayName: nameForProfile,
          photoPath: uploadedPath,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      const { data, error: signedError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(uploadedPath, 60 * 60);

      if (signedError) throw signedError;

      const previousPath = photoPath;

      setPhotoPath(uploadedPath);
      setPhotoPreview(data.signedUrl);

      // Remove the previous photo after the new path is saved.
      if (previousPath && previousPath !== uploadedPath) {
        const { error: deleteError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([previousPath]);

        if (deleteError) {
          console.warn('Old profile photo could not be deleted:', deleteError);
        }
      }

      showMessage('Na-update na ang iyong profile picture!');
    } catch (error) {
      console.error('Profile photo update error:', error);

      // Clean up the new upload if saving failed.
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([uploadedPath]);

        if (cleanupError) {
          console.warn('Uploaded photo cleanup failed:', cleanupError);
        }
      }

      showMessage(getSaveErrorMessage(error), 'danger');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Edit Profile only changes the display name.
  // The profile picture is changed with the camera button on the picture.
  const handleSaveProfile = async () => {
    if (!user) {
      showMessage('Mag-log in muna para ma-update ang profile.', 'danger');
      return;
    }

    const cleanedName = displayName.trim();

    if (!cleanedName) {
      showMessage('Hindi puwedeng walang display name.', 'danger');
      return;
    }

    if (cleanedName.length > 60) {
      showMessage('Maximum na 60 characters ang pangalan.', 'danger');
      return;
    }

    setSaving(true);

    try {
      // Update the display name in Firebase Authentication.
      await updateProfile(user, {
        displayName: cleanedName,
      });

      // Save the profile in Firestore.
      // If the user has no profile document yet, create it with the fields
      // required by the Firestore rules (uid and role).
      const profileRef = doc(db, 'users', user.uid);
      const existingProfile = await getDoc(profileRef);

      const savedPhotoPath = existingProfile.exists()
        ? String(existingProfile.data().photoPath || '')
        : photoPath;

      const profileData: Record<string, unknown> = {
        displayName: cleanedName,
        updatedAt: new Date(),
      };

      if (!existingProfile.exists()) {
        profileData.uid = user.uid;
        profileData.email = user.email || '';
        profileData.role = 'Student';
      }

      await setDoc(profileRef, profileData, { merge: true });

      // Public copy (name and photo only) so other users can see it in chats.
      await setDoc(
        doc(db, 'publicProfiles', user.uid),
        {
          displayName: cleanedName,
          photoPath: savedPhotoPath,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      await user.reload();

      setUser(auth.currentUser);
      setDisplayName(cleanedName);
      setEditing(false);

      showMessage('Matagumpay na na-update ang iyong profile!');
    } catch (error) {
      console.error('Profile update error:', error);
      showMessage(getSaveErrorMessage(error), 'danger');
    } finally {
      setSaving(false);
    }
  };

  // Send (or resend) the email verification link.
  const handleSendVerification = async () => {
    if (!user) return;

    setSendingVerification(true);

    try {
      await sendEmailVerification(user);
      showMessage(
        'Verification email sent. Please check your inbox and spam folder.'
      );
    } catch (error) {
      console.error('Send verification error:', error);

      const code = (error as { code?: string } | null)?.code;

      showMessage(
        code === 'auth/too-many-requests'
          ? 'Too many requests. Please wait a few minutes and try again.'
          : 'Could not send the verification email. Please try again.',
        'danger'
      );
    } finally {
      setSendingVerification(false);
    }
  };

  // Reload the user to check if the email was verified.
  const handleRefreshVerification = async () => {
    if (!user) return;

    try {
      await user.reload();
      setRefreshTick((previous) => previous + 1);

      showMessage(
        auth.currentUser?.emailVerified
          ? 'Your email is verified.'
          : 'Your email is not verified yet.',
        auth.currentUser?.emailVerified ? 'success' : 'warning'
      );
    } catch (error) {
      console.error('Refresh verification error:', error);
      showMessage('Could not check verification status.', 'danger');
    }
  };

  const currentName =
    user?.displayName?.trim() ||
    user?.email?.split('@')[0] ||
    'FindIt Student';

  const initials = currentName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <IonPage>
      <IonHeader className="findit-header">
        <IonToolbar>
          <IonTitle>
            <span className="brand-pin">●</span> FindIt
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="findit-content profile-content">
        {checkingAuth ? (
          <div className="fb-body">
            <div className="profile-loading">
              <IonSpinner name="crescent" />
              <p>Loading profile...</p>
            </div>
          </div>
        ) : !user ? (
          <div className="fb-body">
            <section className="profile-card profile-not-signed-in">
              <IonIcon icon={personCircleOutline} />
              <h2>You are not signed in</h2>
              <p>Please log in to view your account information.</p>
            </section>
          </div>
        ) : (
          <>
            {/* Facebook-style header: cover, avatar with camera, name */}
            <section className="fb-header">
              <div className="fb-cover" />

              <div className="fb-avatar-row">
                <div className="fb-avatar-wrap">
                  <div className="fb-avatar">
                    {photoPreview ? (
                      <img src={photoPreview} alt="Profile" />
                    ) : (
                      <span>{initials || 'S'}</span>
                    )}
                  </div>

                  {uploadingPhoto && (
                    <div className="fb-avatar-loading">
                      <IonSpinner name="crescent" />
                    </div>
                  )}

                  <input
                    ref={quickFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void handleQuickPhotoChange(event)}
                    style={{ display: 'none' }}
                    aria-label="Choose a new profile photo"
                  />

                  <button
                    type="button"
                    className="fb-camera-button"
                    aria-label="Change profile photo"
                    disabled={uploadingPhoto || saving}
                    onClick={() => quickFileInputRef.current?.click()}
                  >
                    <IonIcon icon={cameraOutline} />
                  </button>
                </div>
              </div>

              <div className="fb-identity">
                <h2 className="fb-name">{currentName}</h2>
                <p className="fb-subtitle">FindIt Student</p>

                {!editing && (
                  <div className="fb-actions">
                    <IonButton
                      fill="outline"
                      className="profile-edit-button"
                      disabled={uploadingPhoto}
                      onClick={() => {
                        setDisplayName(user.displayName || '');
                        setEditing(true);
                      }}
                    >
                      <IonIcon icon={createOutline} slot="start" />
                      Edit Profile
                    </IonButton>
                  </div>
                )}
              </div>
            </section>

            <div className="fb-body">
              {editing ? (
                <section className="profile-card profile-information">
                  <h2>Edit Profile</h2>

                  <p className="profile-help-text" style={{ color: '#718582' }}>
                    Para magpalit ng larawan, pindutin ang camera icon sa
                    profile picture.
                  </p>

                  <IonItem className="profile-input-item">
                    <IonInput
                      label="Display Name"
                      labelPlacement="stacked"
                      placeholder="Ilagay ang iyong pangalan"
                      value={displayName}
                      maxlength={60}
                      onIonInput={(event) =>
                        setDisplayName(String(event.detail.value ?? ''))
                      }
                      disabled={saving}
                    />
                  </IonItem>

                  <IonItem className="profile-input-item">
                    <IonInput
                      label="Email Address"
                      labelPlacement="stacked"
                      value={user.email || ''}
                      readonly
                    />
                  </IonItem>

                  <div className="profile-edit-actions">
                    <IonButton
                      expand="block"
                      className="profile-save-button"
                      onClick={handleSaveProfile}
                      disabled={saving || uploadingPhoto}
                    >
                      {saving ? (
                        <IonSpinner name="crescent" />
                      ) : (
                        <>
                          <IonIcon icon={saveOutline} slot="start" />
                          Save Changes
                        </>
                      )}
                    </IonButton>

                    <IonButton
                      expand="block"
                      fill="outline"
                      className="profile-cancel-button"
                      onClick={handleCancelEdit}
                      disabled={saving}
                    >
                      Cancel
                    </IonButton>
                  </div>
                </section>
              ) : (
                <section className="profile-card profile-information">
                  <h2>Account Information</h2>

                  <div className="profile-info-row">
                    <div className="profile-info-icon">
                      <IonIcon icon={personCircleOutline} />
                    </div>
                    <div className="profile-info-text">
                      <span>Display Name</span>
                      <strong>{currentName}</strong>
                    </div>
                  </div>

                  <div className="profile-info-row">
                    <div className="profile-info-icon">
                      <IonIcon icon={mailOutline} />
                    </div>
                    <div className="profile-info-text">
                      <span>Email Address</span>
                      <strong>{user.email || 'No email available'}</strong>
                    </div>
                  </div>

                  <div className="profile-info-row">
                    <div className="profile-info-icon">
                      <IonIcon icon={personOutline} />
                    </div>
                    <div className="profile-info-text">
                      <span>Account Provider</span>
                      <strong>
                        {user.providerData[0]?.providerId === 'google.com'
                          ? 'Google'
                          : user.providerData[0]?.providerId === 'password'
                            ? 'Email and Password'
                            : user.providerData[0]?.providerId || 'Firebase'}
                      </strong>
                    </div>
                  </div>
                </section>
              )}

              {!editing && (
                <section className="profile-card profile-information">
                  <h2>Account Status</h2>

                  <div className="profile-info-row">
                    <div className="profile-info-icon">
                      <IonIcon icon={mailOutline} />
                    </div>
                    <div className="profile-info-text">
                      <span>Email Verification</span>
                      <strong>
                        {user.emailVerified ? 'Verified' : 'Not verified'}
                      </strong>
                    </div>
                  </div>

                  {!user.emailVerified && (
                    <>
                      <IonButton
                        expand="block"
                        fill="outline"
                        onClick={() => void handleSendVerification()}
                        disabled={sendingVerification}
                      >
                        {sendingVerification
                          ? 'Sending...'
                          : 'Send verification email'}
                      </IonButton>

                      <IonButton
                        expand="block"
                        fill="clear"
                        onClick={() => void handleRefreshVerification()}
                      >
                        I have verified my email
                      </IonButton>
                    </>
                  )}
                </section>
              )}

              {!editing && (
                <section className="profile-logout-section">
                  <IonButton
                    expand="block"
                    className="profile-logout-button"
                    onClick={onLogout}
                  >
                    <IonIcon icon={logOutOutline} slot="start" />
                    Log Out
                  </IonButton>

                  <p className="profile-footer-note">
                    Thank you for being part of FindIt.
                  </p>
                </section>
              )}
            </div>
          </>
        )}

        <div className="bottom-space" />

        <IonToast
          isOpen={Boolean(toastMessage)}
          message={toastMessage}
          color={toastColor}
          duration={3000}
          position="top"
          onDidDismiss={() => setToastMessage('')}
        />
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

        <IonTabButton tab="myreports" onClick={() => onTabChange('myreports')}>
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

        <IonTabButton
          tab="profile"
          selected
          onClick={() => onTabChange('profile')}
        >
          <IonIcon icon={personOutline} />
          <IonLabel>Profile</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonPage>
  );
};

export default Profile;