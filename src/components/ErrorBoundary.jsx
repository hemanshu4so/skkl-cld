// src/components/ErrorBoundary.jsx
import { Component } from "react";

/**
 * Catches render-time errors in any child route so a single bad page
 * doesn't blank the entire app. Wrap individual <Route element={...}>
 * pages or wrap the whole router output in App.js.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
    // TODO(P3): forward to /activityLogs or Sentry-style sink.
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-silver-50">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-card p-6">
          <div className="text-4xl mb-3">💥</div>
          <h1 className="text-lg font-bold text-navy-900 mb-1">
            Something went wrong on this page
          </h1>
          <p className="text-sm text-silver-600 mb-4">
            The rest of the app is fine. Try going back, or reload to recover.
          </p>

          <pre className="text-xs bg-silver-100 text-silver-700 rounded-lg p-3 overflow-auto max-h-40 mb-4">
{String(this.state.error?.message || this.state.error)}
          </pre>

          <div className="flex gap-2">
            <button onClick={this.handleReset} className="btn btn-secondary">
              Try again
            </button>
            <button onClick={this.handleReload} className="btn btn-primary">
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
