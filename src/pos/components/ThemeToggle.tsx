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
                    variant="outline"
                    size="icon"
                    className="border transition-colors"
                    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                >
                    <CurrentIcon className="h-[1.2rem] w-[1.2rem] transition-all" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                {(Object.keys(themeConfig) as Theme[]).map((themeKey) => {
                    const { label, icon: Icon } = themeConfig[themeKey];
                    return (
                        <DropdownMenuItem
                            key={themeKey}
                            onClick={() => setTheme(themeKey)}
                            className="cursor-pointer"
                        >
                            <Icon className="mr-2 h-4 w-4" />
                            <span>{label}</span>
                            {theme === themeKey && (
                                <span className="ml-auto text-xs">✓</span>
                            )}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
