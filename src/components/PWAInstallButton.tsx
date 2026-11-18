import React, {useState} from 'react';
import {Download, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({compact = false}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`flex items-center justify-center gap-2 rounded-xl bg-orange-500 text-white font-semibold shadow-sm hover:bg-orange-600 transition-colors min-h-[44px] whitespace-nowrap shrink-0 ${
          compact ? 'px-3 py-2 text-xs' : 'w-full px-4 py-2.5 text-sm'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Pasang Aplikasi</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center justify-center gap-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors min-h-[44px] whitespace-nowrap shrink-0 ${
            compact ? 'px-3 py-2 text-xs' : 'w-full px-4 py-2.5 text-sm'
          }`}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Pasang di iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Pasang SajiPOS di iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-stone-600 dark:text-stone-300 list-decimal list-inside">
                <li>Ketuk tombol <strong>Bagikan (Share)</strong> di bilah Safari.</li>
                <li>Gulir ke bawah lalu ketuk <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 min-h-[48px]"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
