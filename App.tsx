import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { User } from './types';
import { cloudService } from './services/cloudService';
import AuthPage from './components/AuthPage';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import ProjectBuilder from './components/ProjectBuilder';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkSession = async () => {
      try {
        const currentUser = await cloudService.getCurrentUser();
        setUser(currentUser);
      } catch (e) {
        console.error("Session check failed", e);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleLogin = (loggedInUser: User) => {
      setUser(loggedInUser);
      navigate('/dashboard');
  };

  const handleLogout = async () => {
      await cloudService.logout();
      setUser(null);
      navigate('/');
  };

  if (loading) {
      return (
          <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-indigo-500">
              <Loader2 className="animate-spin" size={48} />
          </div>
      );
  }

  return (
    <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LandingPage />} />
        
        <Route path="/auth" element={
            user ? <Navigate to="/dashboard" /> : <AuthPage onLogin={handleLogin} />
        } />
        
        <Route path="/dashboard" element={
            user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/auth" state={{ from: location }} />
        } />
        
        <Route path="/project/:projectId" element={
            user ? <ProjectBuilder user={user} /> : <Navigate to="/auth" state={{ from: location }} />
        } />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

export default App;