import { useAuth, useUser } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import api from "../services/api";
import { useDarkMode } from "../hooks/useDarkMode";

const HomePage = () => {
  const { isSignedIn, isLoaded, signOut } = useAuth();
  const { user } = useUser();
  const { isDark, toggleDarkMode } = useDarkMode();

  const { getToken } = useAuth();

  // Sync user with backend on login
  useEffect(() => {
    if (isSignedIn && user) {
      const syncUser = async () => {
        try {
          const token = await getToken();
          //TODO: REMOVE TOKEN LOGGING!
          console.log("MY TOKEN:", token);
          await api.post(
            "/users/sync",
            {},
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          console.log("User synced with backend");
        } catch (error) {
          console.error("Failed to sync user:", error);
        }
      };
      syncUser();
    }
  }, [isSignedIn, user, getToken]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-background relative">
      {/* Dark Mode Toggle */}
      <button
        onClick={toggleDarkMode}
        className="absolute top-8 right-8 p-2 rounded-lg bg-secondary text-secondary-foreground hover:opacity-80 transition-opacity"
        aria-label="Toggle dark mode"
      >
        {isDark ? <Sun size={24} /> : <Moon size={24} />}
      </button>

      <h1 className="text-5xl font-bold mb-6 text-foreground tracking-tight">
        AI Powered Marketplace
      </h1>
      <p className="text-xl text-muted-foreground max-w-2xl mb-12">
        A secure, next-generation platform for buying and selling AI tools and
        models.
      </p>

      {isSignedIn ? (
        <div className="flex flex-col items-center gap-4 p-8 border border-border rounded-xl bg-card shadow-sm">
          <p className="text-lg">
            Welcome back,{" "}
            <span className="font-semibold">
              {user.firstName || user.emailAddresses[0].emailAddress}
            </span>
            !
          </p>
          <div className="flex gap-4 mt-4">
            <Link
              to="/dashboard"
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 transition-opacity"
            >
              Go to Dashboard
            </Link>
            <button
              onClick={() => signOut()}
              className="px-6 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:opacity-90 transition-opacity"
            >
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-4">
          <Link
            to="/sign-in"
            className="px-8 py-3 bg-primary text-primary-foreground rounded-md font-medium text-lg hover:opacity-90 transition-opacity"
          >
            Sign In
          </Link>
          <Link
            to="/sign-up"
            className="px-8 py-3 bg-secondary text-secondary-foreground border border-border rounded-md font-medium text-lg hover:bg-muted transition-colors"
          >
            Sign Up
          </Link>
        </div>
      )}
    </div>
  );
};

export default HomePage;
