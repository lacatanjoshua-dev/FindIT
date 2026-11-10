import { useState } from 'react';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonText,
} from '@ionic/react';

import {
  locationOutline,
  personOutline,
  mailOutline,
  idCardOutline,
  lockClosedOutline,
} from 'ionicons/icons';

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';

import {
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '../firebase';
import './Auth.css';

type RegisterProps = {
  onBackToLogin: () => void;
  onAccountCreated: () => void;
};

const Register: React.FC<RegisterProps> = ({
  onBackToLogin,
  onAccountCreated,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError('');

    if (
      !fullName.trim() ||
      !email.trim() ||
      !studentId.trim() ||
      !password ||
      !confirmPassword
    ) {
      setError('Please complete all fields.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // 1. Create account in Firebase Authentication.
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      // 2. Save the user's name in Firebase Authentication profile.
      await updateProfile(credential.user, {
        displayName: fullName.trim(),
      });

      // 3. Save the user's information in Firestore.
      await setDoc(doc(db, 'users', credential.user.uid), {
        uid: credential.user.uid,
        fullName: fullName.trim(),
        email: email.trim(),
        studentId: studentId.trim(),
        role: 'Student',
        createdAt: serverTimestamp(),
      });

      // 4. Send a verification email. A failure here must not block
      //    registration; the user can resend it from the Profile page.
      try {
        await sendEmailVerification(credential.user);
      } catch (verificationError) {
        console.warn(
          'Could not send verification email:',
          verificationError
        );
      }

      // 5. Registration completed.
      onAccountCreated();
    } catch (error: unknown) {
      console.error('Firebase registration error:', error);

      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? String(error.code)
          : '';

      if (code === 'auth/email-already-in-use') {
        setError(
          'This email is already registered. Please log in.'
        );
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        setError(
          'Your password is too weak. Use at least 6 characters.'
        );
      } else if (code === 'auth/operation-not-allowed') {
        setError(
          'Email/Password sign-in is not enabled in Firebase.'
        );
      } else if (code === 'auth/invalid-api-key') {
        setError(
          'Firebase API key is invalid. Check src/firebase.ts.'
        );
      } else if (code === 'auth/network-request-failed') {
        setError(
          'Network error. Check your internet connection.'
        );
      } else if (
        code === 'permission-denied' ||
        code === 'firestore/permission-denied'
      ) {
        setError(
          'Account was created, but saving student details was blocked by Firestore rules.'
        );
      } else {
        setError(
          `Registration failed: ${code || 'unknown error'}. Please check the browser console.`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen className="auth-content">
        <div className="auth-wrapper register-wrapper">
          <div className="auth-brand">
            <div className="auth-logo">
              <IonIcon icon={locationOutline} />
            </div>

            <h1>Join FindIt</h1>
            <p>Your campus lost and found community.</p>
          </div>

          <section className="auth-card">
            <p className="auth-eyebrow">GET STARTED</p>

            <h2>Create your account</h2>

            <p className="auth-subtitle">
              Register as a student to report and claim items.
            </p>

            <div className="auth-field">
              <IonLabel>Full Name</IonLabel>

              <IonItem className="auth-input" lines="none">
                <IonIcon icon={personOutline} slot="start" />

                <IonInput
                  placeholder="Enter your full name"
                  autocomplete="name"
                  value={fullName}
                  onIonInput={(e) =>
                    setFullName(e.detail.value ?? '')
                  }
                />
              </IonItem>
            </div>

            <div className="auth-field">
              <IonLabel>Student Email</IonLabel>

              <IonItem className="auth-input" lines="none">
                <IonIcon icon={mailOutline} slot="start" />

                <IonInput
                  type="email"
                  placeholder="you@university.edu"
                  autocomplete="email"
                  value={email}
                  onIonInput={(e) =>
                    setEmail(e.detail.value ?? '')
                  }
                />
              </IonItem>
            </div>

            <div className="auth-field">
              <IonLabel>Student ID</IonLabel>

              <IonItem className="auth-input" lines="none">
                <IonIcon icon={idCardOutline} slot="start" />

                <IonInput
                  placeholder="Enter your student ID"
                  value={studentId}
                  onIonInput={(e) =>
                    setStudentId(e.detail.value ?? '')
                  }
                />
              </IonItem>
            </div>

            <div className="auth-field">
              <IonLabel>Password</IonLabel>

              <IonItem className="auth-input" lines="none">
                <IonIcon icon={lockClosedOutline} slot="start" />

                <IonInput
                  type="password"
                  placeholder="At least 6 characters"
                  autocomplete="new-password"
                  value={password}
                  onIonInput={(e) =>
                    setPassword(e.detail.value ?? '')
                  }
                />
              </IonItem>
            </div>

            <div className="auth-field">
              <IonLabel>Confirm Password</IonLabel>

              <IonItem className="auth-input" lines="none">
                <IonIcon icon={lockClosedOutline} slot="start" />

                <IonInput
                  type="password"
                  placeholder="Re-enter your password"
                  autocomplete="new-password"
                  value={confirmPassword}
                  onIonInput={(e) =>
                    setConfirmPassword(e.detail.value ?? '')
                  }
                />
              </IonItem>
            </div>

            {error && (
              <IonText color="danger">
                <p className="auth-error">{error}</p>
              </IonText>
            )}

            <IonButton
              expand="block"
              className="auth-primary"
              onClick={handleRegister}
              disabled={loading}
            >
              {loading
                ? 'Creating account...'
                : 'Create Account'}
            </IonButton>

            <p className="auth-switch">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onBackToLogin}
                disabled={loading}
              >
                Login
              </button>
            </p>
          </section>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Register;