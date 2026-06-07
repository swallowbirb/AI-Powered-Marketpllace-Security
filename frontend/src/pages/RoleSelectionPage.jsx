import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCustomUser } from "../context/CustomUserContext";
import { ShoppingBag, Store } from "lucide-react";

export default function RoleSelectionPage() {
  const { role, updateRole, isLoadingRole } = useCustomUser();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoadingRole && role && role !== "pending") {
      navigate(role === "seller" ? "/dashboard" : "/");
    }
  }, [role, isLoadingRole, navigate]);

  const handleRoleSelect = async (selectedRole) => {
    setIsSubmitting(true);
    const success = await updateRole(selectedRole);
    if (success) {
      navigate(selectedRole === "seller" ? "/dashboard" : "/");
    } else {
      setIsSubmitting(false);
      // Optional: show an error toast here
    }
  };

  if (isLoadingRole) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome to the Marketplace!</h1>
          <p className="text-muted-foreground">How do you want to use the platform?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            disabled={isSubmitting}
            onClick={() => handleRoleSelect("buyer")}
            className="flex flex-col items-center justify-center p-8 border-2 border-border rounded-xl hover:border-primary hover:bg-muted/50 transition-all group disabled:opacity-50"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <ShoppingBag className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">I want to buy</h2>
            <p className="text-sm text-muted-foreground text-center">
              Browse products, read reviews, and make secure purchases.
            </p>
          </button>

          <button
            disabled={isSubmitting}
            onClick={() => handleRoleSelect("seller")}
            className="flex flex-col items-center justify-center p-8 border-2 border-border rounded-xl hover:border-primary hover:bg-muted/50 transition-all group disabled:opacity-50"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <Store className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">I want to sell</h2>
            <p className="text-sm text-muted-foreground text-center">
              Create listings, manage your products, and grow your business.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
