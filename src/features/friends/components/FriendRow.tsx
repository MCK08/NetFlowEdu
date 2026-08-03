import { memo } from "react";

import { resolvePublicIdentity } from "@utils/publicIdentity";

import { useCachedPublicProfile } from "../hooks/useCachedPublicProfile";
import { RowActionButton } from "./RowActionButton";
import { SocialUserRow } from "./SocialUserRow";

export type FriendRowVariant = "friend" | "incoming" | "outgoing";

interface FriendRowProps {
  uid: string;
  variant: FriendRowVariant;
  isBusy: boolean;
  // Navigation is decided by the screen, not here: a per-row
  // useNavigationGuard would register one focus listener per rendered row,
  // so the guard lives once at the screen level instead.
  onOpenProfile: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
}

const VARIANT_CONTEXT: Record<FriendRowVariant, string> = {
  friend: "Arkadaş",
  incoming: "Gelen istek",
  outgoing: "Gönderilen istek",
};

// One row for all three FriendsScreen sections — only the trailing
// action(s) differ by `variant`. The layout, avatar and role pill come from
// SocialUserRow (and through it Avatar/RoleBadge), so this file no longer
// carries its own copies of those styles or its own hardcoded palette.
//
// The "friend" variant deliberately carries no destructive button: removing
// a friend is a confirmed action on the person's profile (one row tap
// away), which is both safer in a scrolling list and exactly how this row
// already behaved — the previous version accepted a remove callback it
// never rendered a control for.
export const FriendRow = memo(function FriendRow({
  uid,
  variant,
  isBusy,
  onOpenProfile,
  onAccept,
  onDecline,
}: FriendRowProps) {
  const profile = useCachedPublicProfile(uid);
  const identity = resolvePublicIdentity(profile);

  const roleSuffix =
    profile?.role === "teacher" ? ", Öğretmen" : profile?.role === "student" ? ", Öğrenci" : "";

  return (
    <SocialUserRow
      primaryName={identity.primaryName}
      usernameHandle={identity.usernameHandle}
      photoURL={profile?.photoURL ?? null}
      role={profile?.role ?? null}
      onPress={onOpenProfile}
      isBusy={isBusy}
      accessibilityLabel={`${VARIANT_CONTEXT[variant]}: ${identity.primaryName}${roleSuffix}`}
      actions={
        variant === "incoming" ? (
          <>
            <RowActionButton
              label="Kabul Et"
              accessibilityLabel={`${identity.primaryName} kişisinin arkadaşlık isteğini kabul et`}
              tone="primary"
              onPress={() => onAccept?.()}
            />
            <RowActionButton
              label="Reddet"
              accessibilityLabel={`${identity.primaryName} kişisinin arkadaşlık isteğini reddet`}
              tone="destructive"
              onPress={() => onDecline?.()}
            />
          </>
        ) : variant === "outgoing" ? (
          <RowActionButton
            label="İptal Et"
            accessibilityLabel={`${identity.primaryName} kişisine gönderdiğin isteği iptal et`}
            tone="destructive"
            onPress={() => onDecline?.()}
          />
        ) : undefined
      }
    />
  );
});
