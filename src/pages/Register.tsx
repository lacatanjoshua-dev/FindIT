import { useMemo, useState } from 'react';
import type { FC, FormEvent } from 'react';

import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonPage,
  IonSpinner,
} from '@ionic/react';

import {
  alertCircleOutline,
  arrowBackOutline,
  checkmarkCircle,
  closeCircle,
  eyeOffOutline,
  eyeOutline,
  idCardOutline,
  location,
  lockClosedOutline,
  mailOutline,
  personOutline,
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple password strength: 0 = empty, 1 weak … 4 strong.
const getPasswordStrength = (value: string) => {
  if (!value) return 0;

  let score = 0;
  if (value.length >= 6) score += 1;
  if (value.length >= 10) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score += 1;

  return Math.max(1, Math.min(score, 4));
};

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

const Register: FC<RegisterProps> = ({ onBackToLogin, onAccountCreated }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsDiffer = confirmPassword.length > 0 && password !== confirmPassword;

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

    if (!EMAIL_PATTERN.test(email.trim())) {
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
        console.warn('Could not send verification email:', verificationError);
      }

      // 5. Registration completed.
      onAccountCreated();
    } catch (registerError: unknown) {
      console.error('Firebase registration error:', registerError);

      const code =
        typeof registerError === 'object' &&
        registerError !== null &&
        'code' in registerError
          ? String((registerError as { code: unknown }).code)
          : '';

      if (code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please log in.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        setError('Your password is too weak. Use at least 6 characters.');
      } else if (code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is not enabled in Firebase.');
      } else if (code === 'auth/invalid-api-key') {
        setError('Firebase API key is invalid. Check src/firebase.ts.');
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Check your internet connection.');
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!loading) {
      void handleRegister();
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen className="auth-content">
        <div className="auth-hero auth-hero-compact">
          <button
            type="button"
            className="auth-back"
            aria-label="Back to login"
            onClick={onBackToLogin}
            disabled={loading}
          >
            <IonIcon icon={arrowBackOutline} />
          </button>

          <div className="auth-logo">
            <IonIcon icon={location} />
          </div>
          <h1>Join FindIt</h1>
          <p>Your campus lost and found community</p>
        </div>

        <div className="auth-wrapper">
          <form className="auth-card" onSubmit={handleSubmit} noValidate>
            <p className="auth-eyebrow">GET STARTED</p>
            <h2>Create your account</h2>
            <p className="auth-subtitle">
              Register as a student to report and claim items.
            </p>

            <div className="auth-field">
              <span className="auth-label">Full name</span>
              <div className="auth-input-wrap">
                <IonIcon icon={personOutline} className="auth-input-icon" />
                <IonInput
                  className="auth-input"
                  aria-label="Full name"
                  placeholder="Juan Dela Cruz"
                  autocomplete="name"
                  maxlength={60}
                  value={fullName}
                  disabled={loading}
                  onIonInput={(e) => setFullName(String(e.detail.value ?? ''))}
                />
              </div>
            </div>

            <div className="auth-field">
              <span className="auth-label">Student email</span>
              <div className="auth-input-wrap">
                <IonIcon icon={mailOutline} className="auth-input-icon" />
                <IonInput
                  className="auth-input"
                  aria-label="Student email"
                  type="email"
                  inputmode="email"
                  placeholder="you@university.edu"
                  autocomplete="email"
                  value={email}
                  disabled={loading}
                  onIonInput={(e) => setEmail(String(e.detail.value ?? ''))}
                />
              </div>
            </div>

            <div className="auth-field">
              <span className="auth-label">Student ID</span>
              <div className="auth-input-wrap">
                <IonIcon icon={idCardOutline} className="auth-input-icon" />
                <IonInput
                  className="auth-input"
                  aria-label="Student ID"
                  placeholder="e.g. 2024-12345"
                  value={studentId}
                  disabled={loading}
                  onIonInput={(e) => setStudentId(String(e.detail.value ?? ''))}
                />
              </div>
            </div>

            <div className="auth-field">
              <span className="auth-label">Password</span>
              <div className="auth-input-wrap">
                <IonIcon icon={lockClosedOutline} className="auth-input-icon" />
                <IonInput
                  className="auth-input"
                  aria-label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  autocomplete="new-password"
                  value={password}
                  disabled={loading}
                  onIonInput={(e) => setPassword(String(e.detail.value ?? ''))}
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                </button>
              </div>

              {password && (
                <div className={`auth-strength strength-${strength}`}>
                  <div className="auth-strength-bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <small>{STRENGTH_LABELS[strength]} password</small>
                </div>
              )}
            </div>

            <div className="auth-field">
              <span className="auth-label">Confirm password</span>
              <div
                className={`auth-input-wrap ${
                  passwordsDiffer ? 'is-invalid' : passwordsMatch ? 'is-valid' : ''
                }`}
              >
                <IonIcon icon={lockClosedOutline} className="auth-input-icon" />
                <IonInput
                  className="auth-input"
                  aria-label="Confirm password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  autocomplete="new-password"
                  value={confirmPassword}
                  disabled={loading}
                  onIonInput={(e) =>
                    setConfirmPassword(String(e.detail.value ?? ''))
                  }
                />
              </div>

              {passwordsMatch && (
                <small className="auth-hint auth-hint-ok">
                  <IonIcon icon={checkmarkCircle} /> Passwords match
                </small>
              )}

              {passwordsDiffer && (
                <small className="auth-hint auth-hint-bad">
                  <IonIcon icon={closeCircle} /> Passwords don't match yet
                </small>
              )}
            </div>

            {error && (
              <div className="auth-alert auth-alert-error" role="alert">
                <IonIcon icon={alertCircleOutline} />
                <span>{error}</span>
              </div>
            )}

            <IonButton
              type="submit"
              expand="block"
              className="auth-primary"
              disabled={loading}
            >
              {loading ? <IonSpinner name="crescent" /> : 'Create Account'}
            </IonButton>

            <p className="auth-switch">
              Already have an account?{' '}
              <button type="button" onClick={onBackToLogin} disabled={loading}>
                Log in
              </button>
            </p>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Register;