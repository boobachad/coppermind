import { Breadcrumb } from './Breadcrumb';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
    breadcrumbItems: { label: string; href?: string }[];
}

export function Navbar({ breadcrumbItems }: NavbarProps) {
    return (
        <div className="h-14 border-b border-glass-border bg-glass-bg/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 transition-colors duration-300">
            <Breadcrumb items={breadcrumbItems} />
            <ThemeToggle />
        </div>
    );
}
