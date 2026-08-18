import { useEffect, useState } from 'react';
import { AppButton, InputField, KeyIcon, UserIcon } from '../components/ui';
import { currentApiBase, login } from '../api';
import { startSession } from '../session';
import logo from '../logo.png';

/**
 * Sign in, mirroring the mobile LoginScreen.
 *
 * The Google button is not carried over. On mobile it opens a "coming soon"
 * dialog; a button that exists only to say it does nothing is worse on a
 * desktop exam machine, where the student is usually mid-invigilation and
 * needs the shortest path to their paper.
 */
export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiHost, setApiHost] = useState('');

  // Only the host, not the whole URL — enough to tell local from production
  // at a glance without cluttering the form.
  useEffect(() => {
    currentApiBase()
      .then((base) => setApiHost(new URL(base).host))
      .catch(() => setApiHost(''));
  }, []);

  const handleLogin = async () => {
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const data = await login({ email: email.trim(), password });
      await startSession({
        name: data.user.name,
        email: data.user.email,
        token: data.token,
      });
      navigation.replace('Dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Enter submits from either field, which is how anyone types a login.
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) handleLogin();
  };

  return (
    <div className="screen">
      <div className="screen-center">
        <div className="card card-narrow">
          <div className="login-logo">
            <img src={logo} alt="" />
            <span>Student Exam Portal</span>
          </div>

          <h1 className="login-heading">Empowering your learning journey.</h1>
          <p className="login-sub">Sign in to access your exams</p>

          <InputField
            icon={<UserIcon />}
            value={email}
            onChange={setEmail}
            placeholder="Enter your email"
            type="email"
            autoComplete="username"
            autoFocus
            onKeyDown={onKeyDown}
          />

          <InputField
            icon={<KeyIcon />}
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
            type="password"
            autoComplete="current-password"
            onKeyDown={onKeyDown}
          />

          {error ? <p className="error">{error}</p> : null}

          <AppButton title="Sign In" onClick={handleLogin} loading={loading} className="btn-block" />

          <p className="login-note">
            No account? Contact your school administration to get your login details.
          </p>

          {apiHost ? <p className="api-host">Server: {apiHost}</p> : null}
        </div>
      </div>
    </div>
  );
}
