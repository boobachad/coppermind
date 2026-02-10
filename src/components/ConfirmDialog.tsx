import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmOptions {
    title?: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
}

interface ConfirmDialogContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    alert: (message: string, title?: string) => Promise<void>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null);

export function useConfirmDialog() {
    const context = useContext(ConfirmDialogContext);
    if (!context) {
        throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
    }
    return context;
}

interface ConfirmDialogProviderProps {
    children: ReactNode;
}

export function ConfirmDialogProvider({ children }: ConfirmDialogProviderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);
    const [isAlert, setIsAlert] = useState(false);

    const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setOptions(opts);
            setIsAlert(false);
            setResolveRef(() => resolve);
            setIsOpen(true);
        });
    }, []);

    const alert = useCallback((message: string, title?: string): Promise<void> => {
        return new Promise((resolve) => {
            setOptions({
                title: title || 'Notice',
                description: message,
                confirmText: 'OK',
            });
            setIsAlert(true);
            setResolveRef(() => () => resolve());
            setIsOpen(true);
        });
    }, []);

    const handleConfirm = () => {
        setIsOpen(false);
        resolveRef?.(true);
    };

    const handleCancel = () => {
        setIsOpen(false);
        resolveRef?.(false);
    };

    return (
        <ConfirmDialogContext.Provider value={{ confirm, alert }}>
            {children}
            <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
                <AlertDialogContent className="bg-themed-surface border-themed-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-themed-text-primary">
                            {options?.title || 'Confirm'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-themed-text-secondary">
                            {options?.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        {!isAlert && (
                            <AlertDialogCancel
                                onClick={handleCancel}
                                className="bg-themed-bg text-themed-text-primary hover:bg-themed-bg/80 border-themed-border"
                            >
                                {options?.cancelText || 'Cancel'}
                            </AlertDialogCancel>
                        )}
                        <AlertDialogAction
                            onClick={handleConfirm}
                            className={
                                options?.variant === 'destructive'
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-themed-text-primary text-themed-surface hover:opacity-90'
                            }
                        >
                            {options?.confirmText || 'Confirm'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmDialogContext.Provider>
    );
}
