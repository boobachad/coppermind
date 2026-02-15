import { Sun, Moon, Palette } from 'lucide-react';
import { useTheme, type Theme } from '@/lib/ThemeContext';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const themeConfig: Record<Theme, { label: string; icon: typeof Sun }> = {
    'solarized-light': { label: 'Solarized Light', icon: Sun },
    'blue-light': { label: 'Blue Light', icon: Palette },
    'dark': { label: 'Dark', icon: Moon },
};

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const CurrentIcon = themeConfig[theme].icon;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 border border-transparent hover:bg-glass-border/30 hover:border-glass-border text-glass-text-secondary hover:text-glass-text transition-all duration-300"
                >
                    <CurrentIcon className="h-[1.2rem] w-[1.2rem]" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-panel border-glass-border bg-glass-bg backdrop-blur-xl">
                {(Object.keys(themeConfig) as Theme[]).map((themeKey) => {
                    const { label, icon: Icon } = themeConfig[themeKey];
                    return (
                        <DropdownMenuItem
                            key={themeKey}
                            onClick={() => setTheme(themeKey)}
                            className="flex items-center cursor-pointer text-glass-text focus:bg-glass-border/30 focus:text-glass-text"
                        >
                            <Icon className="mr-2 h-4 w-4" />
                            <span>{label}</span>
                            {theme === themeKey && (
                                <span className="ml-auto text-xs text-glass-text-secondary">✓</span>
                            )}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
