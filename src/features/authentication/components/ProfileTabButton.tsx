import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Pressable } from "react-native";

import { useAuth } from "../hooks/useAuth";

const LONG_PRESS_DELAY_MS = 2000;

// Passed as the Profile tab's `tabBarButton` in both role's tab layouts —
// a normal tap behaves exactly like every other tab button (forwards
// onPress unchanged), a ~2s long-press opens the Account Switcher instead
// of navigating. One shared component so the two tab layouts (student,
// teacher) never duplicate this gesture wiring.
export function ProfileTabButton(props: BottomTabBarButtonProps) {
  const { openAccountSwitcher } = useAuth();
  // PlatformPressable's ref type isn't structurally assignable to plain
  // RN Pressable's — this component never needs to forward the ref
  // (nothing above reads it), so it's dropped rather than fought.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ref: _ref, ...rest } = props;

  return (
    <Pressable
      {...rest}
      onLongPress={(event) => {
        openAccountSwitcher();
        props.onLongPress?.(event);
      }}
      delayLongPress={LONG_PRESS_DELAY_MS}
    />
  );
}
