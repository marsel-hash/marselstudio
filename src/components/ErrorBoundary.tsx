import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Terjadi kesalahan tak terduga.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Gallery ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-[#FAF9F6] text-[#141413] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="font-serif-editorial text-2xl font-medium">
              Terjadi Gangguan Tampilan
            </h1>
            <p className="text-sm text-[#6B6A65] leading-relaxed">
              Muat ulang halaman untuk memulihkan sesi galeri.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-6 py-2 text-[13px] font-medium bg-[#141413] text-[#FAF9F6] rounded-md hover:bg-[#2C2C2A] transition-colors"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
