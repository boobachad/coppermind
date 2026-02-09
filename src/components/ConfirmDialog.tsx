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
                <AlertDialogContent className="bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-gray-900 dark:text-white">
                            {options?.title || 'Confirm'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-600 dark:text-dark-text-secondary">
                            {options?.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        {!isAlert && (
                            <AlertDialogCancel
                                onClick={handleCancel}
                                className="bg-gray-100 dark:bg-dark-node-bg text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-dark-border border-gray-200 dark:border-dark-border"
                            >
                                {options?.cancelText || 'Cancel'}
                            </AlertDialogCancel>
                        )}
                        <AlertDialogAction
                            onClick={handleConfirm}
                            className={
                                options?.variant === 'destructive'
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900'
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
