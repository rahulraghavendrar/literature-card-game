import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  testId,
}: {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-walnut-950/75 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && onClose) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            data-testid={testId}
            className={`folio max-h-[90dvh] w-full overflow-y-auto p-6 outline-none scrollbar-thin sm:p-8 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold text-vellum-50">{title}</h2>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="-mr-2 -mt-1 rounded-full p-2 text-vellum-300 hover:bg-white/5 hover:text-vellum-50"
                  aria-label="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
