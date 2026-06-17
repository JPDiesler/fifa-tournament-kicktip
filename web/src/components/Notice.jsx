import { Alert } from "@heroui/react";

// Thin wrapper over HeroUI Alert for inline status/error messages. Renders nothing
// when empty. status: "danger" | "success" | "accent" | "warning" | default.
export default function Notice({ status, title, children, className = "" }) {
  if (!title && !children) return null;
  return (
    <Alert status={status} className={className}>
      <Alert.Indicator />
      <Alert.Content>
        {title && <Alert.Title>{title}</Alert.Title>}
        {children && <Alert.Description>{children}</Alert.Description>}
      </Alert.Content>
    </Alert>
  );
}
