import { EditProfileScreen } from "@features/profile";
import { useThemeSubscription } from "@theme/ThemeProvider";

// Same shared EditProfileScreen as (student)/edit-profile.tsx — only the
// route wrapper differs (spec section 2: "route wrapper'ları farklı
// olabilir, ekran implementasyonu ortak olmalı").
export default function TeacherEditProfile() {
  useThemeSubscription();
  return <EditProfileScreen />;
}
