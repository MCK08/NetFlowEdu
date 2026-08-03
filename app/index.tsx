import { AuthBootstrapScreen } from "@features/authentication/components/AuthBootstrapScreen";

// RouteGuard (see app/_layout.tsx) redirects away from here based on auth
// state as soon as it settles — this screen is only ever visible for a
// single frame at most. It now renders the same bootstrap presentation the
// guard's own overlay uses, so that frame can't flash a differently-styled
// spinner on a differently-coloured background.
export default function Index() {
  return <AuthBootstrapScreen />;
}
