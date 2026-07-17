import { router } from "expo-router";

import { DashboardPlaceholder } from "@components/ui/DashboardPlaceholder";
import { useAuth } from "@features/authentication";

export default function AdminDashboard() {
  const { firebaseUser, signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    router.replace("/");
  }

  return (
    <DashboardPlaceholder
      panelTitle="Yönetici paneli"
      displayName={firebaseUser?.displayName ?? ""}
      onLogout={handleLogout}
    />
  );
}
