import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { ThemeProvider } from './lib/ThemeProvider';

// Pages
import HomePage from './pages/HomePage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-background font-sans antialiased text-foreground">
        {/* Navigation could go here */}
        <main className="flex-1 flex flex-col">
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
        </main>
      </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
