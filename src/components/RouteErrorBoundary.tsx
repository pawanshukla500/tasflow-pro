import { Component, type ErrorInfo, type ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import { LayoutGrid } from "lucide-react";

type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null };

/** Keeps the app shell visible when a lazy route throws during render. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route render failed", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <EmptyState
            icon={LayoutGrid}
            title="This page failed to load"
            description="Try again, or go back to Projects."
            action={{
              label: "Try again",
              onClick: () => this.setState({ error: null }),
            }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
