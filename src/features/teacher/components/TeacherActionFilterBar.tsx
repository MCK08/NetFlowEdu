import { memo } from "react";
import { View } from "react-native";

import { SearchInput } from "@components/ui/SearchInput";
import { SegmentedPills } from "@features/studentAnalytics/components/SegmentedPills";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

import type { TeacherActionCenterItem } from "../services/teacherActionCenter";
import {
  ActionFilter,
  actionFilterLabel,
  actionFilterOptions,
  ActionFilterValue,
} from "../services/teacherActionFilter";

export const ACTION_SEARCH_PLACEHOLDER = "Öğrenci, konu veya aksiyon ara";

interface TeacherActionFilterBarProps {
  /** The complete canonical list — what the chips are derived from, so a kind
   *  with no actions never gets a chip that leads nowhere. */
  items: readonly TeacherActionCenterItem[];
  filter: ActionFilter;
  onChange: (filter: ActionFilter) => void;
}

// Phase 121 — finding one action in a long list, without changing the list.
//
// Both controls are local: the chips narrow by the kind each row already
// announces, and the field matches the words those rows already print. Neither
// reads anything, and neither can reorder the Action Center — see
// teacherActionFilter.ts, which returns a subsequence of the canonical list.
//
// The chips come from the loaded actions rather than from a fixed set, so
// this bar never offers a category the class does not have. With fewer than
// two kinds present there is nothing to choose between and the row is not
// drawn at all; the search field stays, because a long single-kind list is
// exactly where looking someone up helps.
export const TeacherActionFilterBar = memo(function TeacherActionFilterBar({
  items,
  filter,
  onChange,
}: TeacherActionFilterBarProps) {
  useThemeSubscription();
  const options = actionFilterOptions(items);

  return (
    <View style={styles.bar}>
      {options.length > 0 ? (
        <SegmentedPills
          options={options}
          value={filter.kind}
          onChange={(kind: ActionFilterValue) => onChange({ ...filter, kind })}
          labelFor={actionFilterLabel}
          accessibilityLabel="Aksiyon türü filtresi"
        />
      ) : null}

      <SearchInput
        value={filter.query}
        onChangeText={(query) => onChange({ ...filter, query })}
        placeholder={ACTION_SEARCH_PLACEHOLDER}
        accessibilityLabel={ACTION_SEARCH_PLACEHOLDER}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
    </View>
  );
});

const styles = themedStyles(() => ({
  bar: {
    gap: spacing.sm,
  },
}));
