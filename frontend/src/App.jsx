import { useState } from 'react';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';

// Top-level component: decides whether to show the login screen or the dashboard.
export default function App() {
  // useState holds data, and changing it makes React redraw. This is only in memory,
  // so refreshing the page returns to the login screen.
  const [session, setSession] = useState(null); // Stores { code, userProfile }

  const handleLogin = (code, profile) => {
    setSession({ code, profile });
  };

  return (
    <div className="min-h-screen bg-cyber-black text-white font-sans selection:bg-neon-blue selection:text-black">
      {/* No session yet: show login. After login: show the dashboard. */}
      {!session ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <Dashboard userProfile={session.profile} />
      )}
    </div>
  );
}