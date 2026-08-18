import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NavigationProvider } from './app/navigator';
import WelcomeScreen from './app/screens/WelcomeScreen';
import LoginScreen from './app/screens/LoginScreen';
import DashboardScreen from './app/screens/DashboardScreen';
import ExamCodeScreen from './app/screens/ExamCodeScreen';
import ExamScreen from './app/screens/ExamScreen';
import ExamFeedbackScreen from './app/screens/ExamFeedbackScreen';
import './index.css';

/**
 * The screen stack, matching exam-portal/src/navigation/AppNavigator.js.
 *
 * ExamPreview and Profile from the mobile app are not here: preview duplicates
 * what the code screen already validates, and the desktop shows the student on
 * the dashboard bar rather than behind another screen.
 */
const screens = {
  Welcome: WelcomeScreen,
  Login: LoginScreen,
  Dashboard: DashboardScreen,
  ExamCode: ExamCodeScreen,
  Exam: ExamScreen,
  ExamFeedback: ExamFeedbackScreen,
};

/*
 * A right-click menu on an exam machine is an invitation to reload, inspect or
 * copy a question. Removed everywhere in the app rather than only during a
 * paper, since nothing here needs one.
 */
window.addEventListener('contextmenu', (e) => e.preventDefault());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NavigationProvider initialRouteName="Welcome" screens={screens} />
  </StrictMode>,
);
