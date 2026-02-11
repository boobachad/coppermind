import { Breadcrumb } from './Breadcrumb';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
    breadcrumbItems: { label: string; href?: string }[];
}

export function Navbar({ breadcrumbItems }: NavbarProps) {
    return (
        <div className="h-14 border-b flex items-center justify-between px-6 bg-background shrink-0">
            <Breadcrumb items={breadcrumbItems} />
            <ThemeToggle />
        </div>
    );
}
