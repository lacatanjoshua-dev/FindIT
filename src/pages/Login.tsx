import { useState } from 'react';
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
  arrowForward,
  checkmarkCircleOutline,
  eyeOffOutline,
  eyeOutline,
  location,
  lockClosedOutline,
  mailOutline,
} from 'ionicons/icons';

import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';

import { auth } from '../firebase';
import './Auth.css';

type LoginProps = {
  onLogin: () => void;
  onCreateAccount: () => void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getErrorCode = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

const Login: FC<LoginProps> = ({ onLogin, onCreateAccount }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setInfo('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      onLogin();
    } catch (loginError: unknown) {
      const code = getErrorCode(loginError);

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password'
      ) {
        setError('Invalid email or password.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('Login failed. Please check your connection and try again.');
        console.error('Firebase login error:', loginError);
      }
    } finally {
      setLoading(false);
    }
  };

  // Send a password reset email to the address typed in the Email field.
  const handleForgotPassword = async () => {
    setError('');
    setInfo('');

    if (!email.trim()) {
      setError('Enter your email address first, then tap "Forgot password?".');
      return;
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());

      // The same message is shown whether or not the account exists.
      setInfo(
        'If an account exists for that email, a password reset link has been sent. Please check your inbox and spam folder.'
      );
    } catch (resetError: unknown) {
      const code = getErrorCode(resetError);

      if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Check your internet connection.');
      } else {
        // Do not reveal whether the email is registered.
        setInfo(
          'If an account exists for that email, a password reset link has been sent. Please check your inbox and spam folder.'
        );
        console.error('Password reset error:', resetError);
      }
    } finally {
      setLoading(false);
    }
  };

  // Pressing Enter in any field logs in.
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!loading) {
      void handleLogin();
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen className="auth-content">
        <div className="auth-hero">
          <div className="auth-logo">
            <IonIcon icon={location} />
          </div>
          <h1>FindIt</h1>
          <p>University Lost &amp; Found</p>
        </div>

        <div className="auth-wrapper">
          <form className="auth-card" onSubmit={handleSubmit} noValidate>
            <p className="auth-eyebrow">WELCOME BACK</p>
            <h2>Log in to your account</h2>
            <p className="auth-subtitle">
              Find your lost items and help others find theirs.
            </p>

            <div className="auth-field">
              <span className="auth-label">Email address</span>
              <div className="auth-input-wrap">
                <IonIcon icon={mailOutline} className="auth-input-icon" />
                <IonInput
                  className="auth-input"
                  aria-label="Email address"
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
              <div className="auth-label-row">
                <span className="auth-label">Password</span>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => void handleForgotPassword()}
                  disabled={loading}
                >
                  Forgot password?
                </button>
              </div>

              <div className="auth-input-wrap">
                <IonIcon icon={lockClosedOutline} className="auth-input-icon" />
                <IonInput
                  className="auth-input"
                  aria-label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autocomplete="current-password"
                  value={password}
                  disabled={loading}
                  onIonInput={(e) => setPassword(String(e.detail.value ?? ''))}
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                </button>
              </div>
            </div>

            {error && (
              <div className="auth-alert auth-alert-error" role="alert">
                <IonIcon icon={alertCircleOutline} />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="auth-alert auth-alert-info" role="status">
                <IonIcon icon={checkmarkCircleOutline} />
                <span>{info}</span>
              </div>
            )}

            <IonButton
              type="submit"
              expand="block"
              className="auth-primary"
              disabled={loading}
            >
              {loading ? (
                <IonSpinner name="crescent" />
              ) : (
                <>
                  Log In
                  <IonIcon icon={arrowForward} slot="end" />
                </>
              )}
            </IonButton>

            <div className="auth-divider">
              <span>New to FindIt?</span>
            </div>

            <IonButton
              expand="block"
              fill="outline"
              className="auth-secondary"
              onClick={onCreateAccount}
              disabled={loading}
            >
              Create an account
            </IonButton>
          </form>

          <p className="auth-footer">
            Lost something? Found something? Let's help it find its way home.
          </p>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Login;