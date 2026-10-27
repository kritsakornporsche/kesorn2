'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

export type ModalVariant = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmOptions {
  title: string;
  description?: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
  icon?: string;
}

export interface AlertOptions {
  title: string;
  description?: string | React.ReactNode;
  confirmText?: string;
  variant?: ModalVariant;
  icon?: string;
}

export interface PromptOptions {
  title: string;
  description?: string | React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
  required?: boolean;
  icon?: string;
}

interface ModalState {
  isOpen: boolean;
  mode: 'confirm' | 'alert' | 'prompt';
  title: string;
  description?: string | React.ReactNode;
  confirmText: string;
  cancelText?: string;
  variant: ModalVariant;
  icon?: string;
  inputValue?: string;
  placeholder?: string;
  required?: boolean;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
  prompt: (options: PromptOptions | string) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

// Global dispatcher to allow calling outside components if needed
let globalConfirmHandler: ((options: ConfirmOptions | string) => Promise<boolean>) | null = null;
let globalAlertHandler: ((options: AlertOptions | string) => Promise<void>) | null = null;
let globalPromptHandler: ((options: PromptOptions | string) => Promise<string | null>) | null = null;

export const confirmModal = (options: ConfirmOptions | string): Promise<boolean> => {
  if (globalConfirmHandler) return globalConfirmHandler(options);
  if (typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(typeof options === 'string' ? options : options.description ? `${options.title}\n\n${options.description}` : options.title));
  }
  return Promise.resolve(false);
};

export const alertModal = (options: AlertOptions | string): Promise<void> => {
  if (globalAlertHandler) return globalAlertHandler(options);
  if (typeof window !== 'undefined') {
    window.alert(typeof options === 'string' ? options : options.description ? `${options.title}\n\n${options.description}` : options.title);
  }
  return Promise.resolve();
};

export const promptModal = (options: PromptOptions | string): Promise<string | null> => {
  if (globalPromptHandler) return globalPromptHandler(options);
  if (typeof window !== 'undefined') {
    return Promise.resolve(window.prompt(typeof options === 'string' ? options : options.description ? `${options.title}\n\n${options.description}` : options.title));
  }
  return Promise.resolve(null);
};

export function ConfirmModalProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    mode: 'confirm',
    title: '',
    confirmText: 'ตกลง',
    cancelText: 'ยกเลิก',
    variant: 'info',
  });

  const [promptValue, setPromptValue] = useState('');
  const resolverRef = useRef<((value: any) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      const opts: ConfirmOptions = typeof options === 'string' ? { title: options } : options;
      setModal({
        isOpen: true,
        mode: 'confirm',
        title: opts.title,
        description: opts.description,
        confirmText: opts.confirmText || 'ยืนยัน',
        cancelText: opts.cancelText || 'ยกเลิก',
        variant: opts.variant || 'danger',
        icon: opts.icon,
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string): Promise<void> => {
    return new Promise((resolve) => {
      resolverRef.current = () => resolve();
      const opts: AlertOptions = typeof options === 'string' ? { title: options } : options;
      setModal({
        isOpen: true,
        mode: 'alert',
        title: opts.title,
        description: opts.description,
        confirmText: opts.confirmText || 'รับทราบ',
        variant: opts.variant || 'info',
        icon: opts.icon,
      });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions | string): Promise<string | null> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      const opts: PromptOptions = typeof options === 'string' ? { title: options } : options;
      setPromptValue(opts.defaultValue || '');
      setModal({
        isOpen: true,
        mode: 'prompt',
        title: opts.title,
        description: opts.description,
        confirmText: opts.confirmText || 'ตกลง',
        cancelText: opts.cancelText || 'ยกเลิก',
        variant: opts.variant || 'info',
        icon: opts.icon,
        placeholder: opts.placeholder,
        required: opts.required ?? false,
      });
    });
  }, []);

  useEffect(() => {
    globalConfirmHandler = confirm;
    globalAlertHandler = alert;
    globalPromptHandler = prompt;
    return () => {
      globalConfirmHandler = null;
      globalAlertHandler = null;
      globalPromptHandler = null;
    };
  }, [confirm, alert, prompt]);

  // Focus prompt input when open
  useEffect(() => {
    if (modal.isOpen && modal.mode === 'prompt') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [modal.isOpen, modal.mode]);

  const handleConfirm = () => {
    if (modal.mode === 'prompt') {
      if (modal.required && !promptValue.trim()) {
        inputRef.current?.focus();
        return;
      }
      resolverRef.current?.(promptValue.trim());
    } else {
      resolverRef.current?.(true);
    }
    setModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleCancel = () => {
    if (modal.mode === 'prompt') {
      resolverRef.current?.(null);
    } else if (modal.mode === 'confirm') {
      resolverRef.current?.(false);
    } else {
      resolverRef.current?.(undefined);
    }
    setModal((prev) => ({ ...prev, isOpen: false }));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!modal.isOpen) return;
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && modal.mode !== 'prompt') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modal.isOpen, modal.mode, promptValue]);

  const getVariantStyles = (variant: ModalVariant) => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-rose-500/15 border-rose-500/30 text-rose-500',
          confirmBtn: 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/25',
          defaultIcon: '🚨',
        };
      case 'warning':
        return {
          iconBg: 'bg-amber-500/15 border-amber-500/30 text-amber-500',
          confirmBtn: 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/25',
          defaultIcon: '⚠️',
        };
      case 'success':
        return {
          iconBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500',
          confirmBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25',
          defaultIcon: '✅',
        };
      case 'info':
      default:
        return {
          iconBg: 'bg-primary/15 border-primary/30 text-primary',
          confirmBtn: 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25',
          defaultIcon: 'ℹ️',
        };
    }
  };

  const styles = getVariantStyles(modal.variant);

  return (
    <ConfirmContext.Provider value={{ confirm, alert, prompt }}>
      {children}

      {modal.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={modal.mode === 'alert' ? handleConfirm : handleCancel}
          />
          <div className="relative w-full max-w-md bg-card border border-border shadow-2xl rounded-[2.2rem] p-6 sm:p-7 text-center space-y-4 animate-in zoom-in-95 duration-200 z-10">
            {/* Icon Badge */}
            <div
              className={`w-14 h-14 rounded-2xl border flex items-center justify-center text-2xl mx-auto shadow-inner ${styles.iconBg}`}
            >
              {modal.icon || styles.defaultIcon}
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                {modal.title}
              </h3>
              {modal.description && (
                <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {modal.description}
                </div>
              )}
            </div>

            {/* Prompt Input Field */}
            {modal.mode === 'prompt' && (
              <div className="pt-1 text-left">
                <input
                  ref={inputRef}
                  type="text"
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  placeholder={modal.placeholder || 'กรอกข้อมูล...'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-2xl bg-secondary border border-border text-xs sm:text-sm font-medium text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/50"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              {modal.mode !== 'alert' && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 py-3 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer border border-border/60"
                >
                  {modal.cancelText || 'ยกเลิก'}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                className={`flex-1 py-3 px-4 rounded-xl font-black text-xs sm:text-sm transition-all active:scale-95 cursor-pointer ${styles.confirmBtn}`}
              >
                {modal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    return {
      confirm: confirmModal,
      alert: alertModal,
      prompt: promptModal,
    };
  }
  return context;
}
