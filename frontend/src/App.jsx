import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, useAuth } from '@clerk/clerk-react';
import { ThemeProvider } from './lib/ThemeProvider';
import { CustomUserProvider, useCustomUser } from './context/CustomUserContext';

// Pages
import HomePage from './pages/HomePage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import RoleSelectionPage from './pages/RoleSelectionPage';

// A wrapper to ensure users have selected a role
function RoleGuard({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { role, isLoadingRole } = useCustomUser();
  const location = useLocation();

  if (!isLoaded || isLoadingRole) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  // If signed in and role is pending, force them to role selection unless they are already there
  if (isSignedIn && role === 'pending' && location.pathname !== '/role-selection') {
    return <Navigate to="/role-selection" replace />;
  }

  return children;
}

function App() {
  return (
    <ThemeProvider>
      <CustomUserProvider>
        <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-background font-sans antialiased text-foreground">
        {/* Navigation could go here */}
        <main className="flex-1 flex flex-col">
          <RoleGuard>
            <Routes>
              <Route path="/" element={<HomePage />} />
              
              <Route 
                path="/sign-in/*" 
                element={
                  <SignedOut>
                    <SignInPage />
                  </SignedOut>
                } 
              />
              
              <Route 
                path="/sign-up/*" 
                element={
                  <SignedOut>
                    <SignUpPage />
                  </SignedOut>
                } 
              />

              <Route 
                path="/role-selection" 
                element={
                  <SignedIn>
                    <RoleSelectionPage />
                  </SignedIn>
                } 
              />

              {/* Protected Routes Example */}
              <Route 
                path="/dashboard" 
                element={
                  <>
                    <SignedIn>
                      <div className="p-8">Protected Dashboard Area, but you're allowed darlin</div>
                    </SignedIn>
                    <SignedOut>
                      <Navigate to="/sign-in" />
                    </SignedOut>
                  </>
                } 
              />
            </Routes>
          </RoleGuard>
        </main>
      </div>
      </BrowserRouter>
      </CustomUserProvider>
    </ThemeProvider>
  );
}

export default App;
