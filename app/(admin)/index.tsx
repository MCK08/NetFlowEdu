import { DashboardPlaceholder } from "@components/ui/DashboardPlaceholder";
import { useAuth } from "@features/authentication";
import { useSignOut } from "@features/authentication/hooks/useSignOut";

export default function AdminDashboard() {
  const { firebaseUser } = useAuth();
  const { signOut, isSigningOut } = useSignOut();

  return (
    <DashboardPlaceholder
      panelTitle="Yönetici paneli"
      displayName={firebaseUser?.displayName ?? ""}
      onLogout={signOut}
      isLoggingOut={isSigningOut}
    />
  );
}
