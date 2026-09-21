// Phase 114 — Profil's own routes, owned by the feature.
//
// Same reasoning as ANALYTICS_ROUTES / PLAN_ROUTES: none of these is an auth
// landing target, so none belongs in ROUTES (whose values form the union
// RouteGuard may redirect to). Call sites cast with `as never`, the pattern
// every router.push in this app uses, because expo-router's typed-route
// union is generated into a gitignored cache and does not know a new route
// until the dev server regenerates it.
export const PROFILE_ROUTES = {
  studentProfileTab: "/(student)/(tabs)/profile",
  teacherProfileTab: "/(teacher)/(tabs)/profile",
  studentSettings: "/(student)/settings",
  teacherSettings: "/(teacher)/settings",
  // Phase 115 — Ayarlar's two nested subjects.
  studentAppearance: "/(student)/settings/appearance",
  teacherAppearance: "/(teacher)/settings/appearance",
  studentAccountInfo: "/(student)/settings/account",
  teacherAccountInfo: "/(teacher)/settings/account",
  studentEditProfile: "/(student)/edit-profile",
  teacherEditProfile: "/(teacher)/edit-profile",
  studentFriends: "/(student)/friends",
  // PHASE 111 LOCK — the teacher's Friends is a plain stack screen, NOT a
  // tab. "/(teacher)/(tabs)/friends" resolves to the Bugün tab instead,
  // which is how a friend-request notification silently misrouted before.
  teacherFriends: "/(teacher)/friends",
  studentFindFriends: "/(student)/find-friends",
  teacherFindFriends: "/(teacher)/find-friends",
} as const;

export interface ProfileRoleRoutes {
  profileTab: string;
  settings: string;
  appearance: string;
  accountInfo: string;
  editProfile: string;
  friends: string;
  findFriends: string;
}

/** One place that answers "which copy of this screen does this role use",
 *  so no screen has to assemble a path from a role flag by hand. */
export function profileRoutesFor(role: string | undefined): ProfileRoleRoutes {
  return role === "teacher"
    ? {
        profileTab: PROFILE_ROUTES.teacherProfileTab,
        settings: PROFILE_ROUTES.teacherSettings,
        appearance: PROFILE_ROUTES.teacherAppearance,
        accountInfo: PROFILE_ROUTES.teacherAccountInfo,
        editProfile: PROFILE_ROUTES.teacherEditProfile,
        friends: PROFILE_ROUTES.teacherFriends,
        findFriends: PROFILE_ROUTES.teacherFindFriends,
      }
    : {
        profileTab: PROFILE_ROUTES.studentProfileTab,
        settings: PROFILE_ROUTES.studentSettings,
        appearance: PROFILE_ROUTES.studentAppearance,
        accountInfo: PROFILE_ROUTES.studentAccountInfo,
        editProfile: PROFILE_ROUTES.studentEditProfile,
        friends: PROFILE_ROUTES.studentFriends,
        findFriends: PROFILE_ROUTES.studentFindFriends,
      };
}
