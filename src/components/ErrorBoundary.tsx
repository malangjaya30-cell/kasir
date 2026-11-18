import React from 'react';
import {AlertTriangle, RotateCcw} from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  ErrorBoundaryState
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, message: ''};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error.message || 'Terjadi kesalahan sistem.';
    try {
      const parsed = JSON.parse(message) as {error?: string; operationType?: string; path?: string};
      if (parsed.error) {
        message = `Akses data gagal (${parsed.operationType || 'operasi'} di ${parsed.path || 'database'}): ${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return {hasError: true, message};
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9] dark:bg-stone-950 p-6">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 shadow-sm text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-stone-900 dark:text-stone-100">
              Kendala Aplikasi
            </h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-300 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600 min-h-[48px]"
            >
              <RotateCcw className="w-4 h-4" />
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
