
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { User } from './types';
import { cloudService } from './services/cloudService';
import AuthPage from './components/AuthPage';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import ProjectBuilder from './components/ProjectBuilder';
import PreviewPage from './components/PreviewPage';
import CloudManagementPage from './components/CloudManagementPage';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Initial check
    const initSession = async () => {
      try {
        const currentUser = await cloudService.getCurrentUser();
        setUser(currentUser);
      } catch (e) {
        console.error("Session check failed", e);
      } finally {
        setLoading(false);
      }
    };
    initSession();

    // Subscribe to auth changes to handle redirects dynamically
    const unsubscribe = cloudService.onAuthStateChange((u) => {
      setUser(u);
      setLoading(false);
    });

    return () => unsubscribe();
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
            user ? <Dashboard user={user} onLogout={handleLogout} view="active" /> : <Navigate to="/auth" state={{ from: location }} />
        } />

        <Route path="/dashboard/trash" element={
            user ? <Dashboard user={user} onLogout={handleLogout} view="trash" /> : <Navigate to="/auth" state={{ from: location }} />
        } />
        
        <Route path="/project/:projectId" element={
            user ? <ProjectBuilder user={user} /> : <Navigate to="/auth" state={{ from: location }} />
        } />
        
        <Route path="/cloud/:projectId" element={
            user ? <CloudManagementPage user={user} /> : <Navigate to="/auth" state={{ from: location }} />
        } />

        <Route path="/preview/:projectId" element={<PreviewPage />} />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

export default App;
