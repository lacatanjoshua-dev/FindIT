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
  mailOutline,
  lockClosedOutline,
  eyeOutline,
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

const Login: React.FC<LoginProps> = ({
  onLogin,
  onCreateAccount,
}) => {
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      onLogin();
    } catch (error: unknown) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? String(error.code)
          : '';

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
        console.error('Firebase login error:', error);
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
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
    } catch (error: unknown) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? String(error.code)
          : '';

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
        console.error('Password reset error:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen className="auth-content">
        <div className="auth-wrapper">
          <div className="auth-brand">
            <div className="auth-logo">
              <IonIcon icon={locationOutline} />
            </div>
            <h1>FindIt</h1>
            <p>Lost and Found Management System</p>
          </div>

          <section className="auth-card">
            <p className="auth-eyebrow">WELCOME BACK</p>
            <h2>Login to your account</h2>
            <p className="auth-subtitle">
              Find your lost items and help others find theirs.
            </p>

            <div className="auth-field">
              <IonLabel>Email Address</IonLabel>
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
              <IonLabel>Password</IonLabel>
              <IonItem className="auth-input" lines="none">
                <IonIcon icon={lockClosedOutline} slot="start" />
                <IonInput
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autocomplete="current-password"
                  value={password}
                  onIonInput={(e) =>
                    setPassword(e.detail.value ?? '')
                  }
                />
                <IonButton
                  fill="clear"
                  slot="end"
                  className="password-toggle"
                  aria-label="Toggle password visibility"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <IonIcon icon={eyeOutline} />
                </IonButton>
              </IonItem>
            </div>

            <div style={{ textAlign: 'right' }}>
              <IonButton
                fill="clear"
                size="small"
                onClick={() => void handleForgotPassword()}
                disabled={loading}
              >
                Forgot password?
              </IonButton>
            </div>

            {error && (
              <IonText color="danger">
                <p className="auth-error">{error}</p>
              </IonText>
            )}

            {info && (
              <IonText color="success">
                <p className="auth-error">{info}</p>
              </IonText>
            )}

            <IonButton
              expand="block"
              className="auth-primary"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? 'Please wait...' : 'Login'}
            </IonButton>

            <div className="auth-divider">
              <span>NEW TO FINDIT?</span>
            </div>

            <IonButton
              expand="block"
              fill="outline"
              className="auth-secondary"
              onClick={onCreateAccount}
              disabled={loading}
            >
              Create Account
            </IonButton>

            <p className="auth-footer">
              University Lost &amp; Found
            </p>
          </section>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Login;