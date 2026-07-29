import { EditProfileScreen } from "@features/profile";

// Same shared EditProfileScreen as (student)/edit-profile.tsx — only the
// route wrapper differs (spec section 2: "route wrapper'ları farklı
// olabilir, ekran implementasyonu ortak olmalı").
export default function TeacherEditProfile() {
  return <EditProfileScreen />;
}
