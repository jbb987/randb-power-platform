import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <span className="text-2xl">Something went wrong</span>
            <p className="text-sm text-[#7A756E] max-w-sm">
              The app encountered an error. Try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 rounded-lg bg-white text-[#C1121F] border border-[#C1121F] hover:bg-[#C1121F] hover:text-white px-5 py-2 text-sm font-medium transition"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
