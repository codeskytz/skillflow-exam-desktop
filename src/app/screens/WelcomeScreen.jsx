import { useEffect } from 'react';
import { getSession, isSessionExpired } from '../session';
import logo from '../logo.png';

const WELCOME_MS = 2200;

/**
 * The splash, mirroring the mobile WelcomeScreen.
 *
 * It also does the one useful piece of work the mobile version does not: while
 * the splash is showing, an unexpired session skips the login screen, so a
 * student who reopens the app mid-session lands straight on their dashboard.
 */
export default function WelcomeScreen({ navigation }) {
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;

      const session = await getSession();
      const expired = await isSessionExpired();

      navigation.replace(session && !expired ? 'Dashboard' : 'Login');
    }, WELCOME_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigation]);

  return (
    <div className="welcome">
      <img src={logo} alt="" />
      <h1>Skillflow</h1>
      <p>Student Exam Portal</p>
      <div className="welcome-bar"><span /></div>
    </div>
  );
}
