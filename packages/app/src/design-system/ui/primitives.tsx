import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps
} from "react-native";
import { useAppTheme } from "@/application/providers/root-providers";

type AppTextProps = TextProps & {
  variant?: "title" | "subtitle" | "body" | "caption" | "label";
  tone?: "default" | "muted" | "primary" | "danger" | "accent";
};

export function Screen({ children, style, ...props }: ViewProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.screen, { backgroundColor: colors.background }, style]}
      {...props}
    >
      {children}
    </View>
  );
}

export function AppText({
  children,
  style,
  variant = "body",
  tone = "default",
  ...props
}: AppTextProps) {
  const { colors } = useAppTheme();
  const color =
    tone === "muted"
      ? colors.muted
      : tone === "primary"
        ? colors.primary
        : tone === "danger"
          ? colors.danger
          : tone === "accent"
            ? colors.accent
            : colors.foreground;

  return (
    <Text style={[styles.textBase, styles[variant], { color }, style]} {...props}>
      {children}
    </Text>
  );
}

export function Card({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.shadow
        },
        style
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

type ButtonProps = Omit<PressableProps, "children"> & {
  children?: ReactNode;
  title?: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
};

export function Button({
  title,
  icon,
  variant = "primary",
  loading,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const { colors } = useAppTheme();
  const isDisabled = disabled || loading;
  const backgroundColor =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
        ? colors.danger
        : variant === "secondary"
          ? colors.surfaceMuted
          : "transparent";
  const borderColor =
    variant === "ghost" ? "transparent" : variant === "primary" ? colors.primary : colors.border;
  const textColor =
    variant === "primary" || variant === "danger"
      ? colors.primaryForeground
      : variant === "ghost"
        ? colors.primary
        : colors.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor, opacity: isDisabled ? 0.55 : pressed ? 0.82 : 1 },
        style as object
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={textColor} /> : icon}
      {title ? (
        <Text style={[styles.buttonText, { color: textColor }]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function Field({ style, ...props }: TextInputProps) {
  const { colors } = useAppTheme();
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      style={[
        styles.field,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          color: colors.foreground
        },
        style
      ]}
      {...props}
    />
  );
}

export function SectionHeader({
  title,
  subtitle,
  right
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <AppText variant="title">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted" style={styles.sectionSubtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1
  },
  textBase: {
    letterSpacing: 0
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26
  },
  body: {
    fontSize: 16,
    lineHeight: 24
  },
  caption: {
    fontSize: 13,
    lineHeight: 18
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 16,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2
  },
  button: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 14
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700"
  },
  field: {
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0
  },
  sectionSubtitle: {
    marginTop: 4
  }
});
