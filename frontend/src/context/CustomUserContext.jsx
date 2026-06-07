import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";

const CustomUserContext = createContext();

export function CustomUserProvider({ children }) {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const [role, setRole] = useState(null);
  const [mongoUser, setMongoUser] = useState(null);
  const [isLoadingRole, setIsLoadingRole] = useState(true);

  const fetchMongoUser = async () => {
    setIsLoadingRole(true);
    if (!isSignedIn) {
      setRole(null);
      setMongoUser(null);
      setIsLoadingRole(false);
      return;
    }

    try {
      const token = await getToken();
      
      // First, try to sync user to make sure they exist in Mongo
      await fetch("http://localhost:5000/api/users/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      // Then get the user profile
      const response = await fetch("http://localhost:5000/api/users/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMongoUser(data.data);
        setRole(data.data.role);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setIsLoadingRole(false);
    }
  };

  useEffect(() => {
    if (isLoaded) {
      fetchMongoUser();
    }
  }, [isLoaded, isSignedIn]);

  const updateRole = async (newRole) => {
    try {
      const token = await getToken();
      const response = await fetch("http://localhost:5000/api/users/role", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        const data = await response.json();
        setMongoUser(data.data);
        setRole(data.data.role);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error updating role:", error);
      return false;
    }
  };

  return (
    <CustomUserContext.Provider value={{ role, mongoUser, updateRole, isLoadingRole }}>
      {children}
    </CustomUserContext.Provider>
  );
}

export function useCustomUser() {
  return useContext(CustomUserContext);
}
