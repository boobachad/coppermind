import { Link } from 'react-router-dom';
import { Fragment } from 'react';

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
    return (
        <nav className="flex items-center text-sm text-muted-foreground">
            {items.map((item, index) => (
                <Fragment key={index}>
                    {index > 0 && <span className="mx-2 text-(--text-tertiary)">//</span>}
                    {item.href ? (
                        <Link
                            to={item.href}
                            className="hover:text-(--text-primary) transition-colors font-medium lowercase"
                        >
                            {item.label}
                        </Link>
                    ) : (
                        <span className="font-semibold text-(--text-primary) lowercase">
                            {item.label}
                        </span>
                    )}
                </Fragment>
            ))}
        </nav>
    );
}
