import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, Clock, FileText, ArrowLeft } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { toast } from 'sonner';
import type { BookReadingHistory } from '../lib/types';
import { parseActivityTime } from '../lib/time';

export function BookDetailPage() {
    const { bookId } = useParams<{ bookId: string }>();
    const navigate = useNavigate();
    const [history, setHistory] = useState<BookReadingHistory | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (bookId) {
            fetchBookHistory();
        }
    }, [bookId]);

    const fetchBookHistory = async () => {
        if (!bookId) return;

        setLoading(true);
        try {
            const data = await invoke<BookReadingHistory>('get_book_reading_history', {
                bookId,
            });
            setHistory(data);
        } catch (error) {
            toast.error('Failed to load book history', {
                description: String(error),
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <Navbar breadcrumbItems={[{ label: 'Books' }, { label: 'Loading...' }]} />
                <div className="container mx-auto p-6">
                    <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
                </div>
            </div>
        );
    }

    if (!history) {
        return (
            <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <Navbar breadcrumbItems={[{ label: 'Books' }, { label: 'Not Found' }]} />
                <div className="container mx-auto p-6">
                    <p style={{ color: 'var(--text-secondary)' }}>Book not found</p>
                </div>
            </div>
        );
    }

    const { book, activities, totalPagesRead, totalReadingTimeMinutes } = history;
    const authors = Array.isArray(book.authors) ? book.authors : [];
    const totalHours = Math.floor(totalReadingTimeMinutes / 60);
    const remainingMinutes = totalReadingTimeMinutes % 60;

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <Navbar breadcrumbItems={[{ label: 'Books' }, { label: book.title }]} />
            <div className="container mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(-1)}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                </div>

                {/* Book Metadata Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5" />
                            Book Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-6">
                            {book.coverUrl && (
                                <img
                                    src={book.coverUrl}
                                    alt={book.title}
                                    className="w-32 h-48 object-cover rounded shadow-lg"
                                />
                            )}
                            <div className="flex-1 space-y-3">
                                <div>
                                    <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                                        {book.title}
                                    </h2>
                                    <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                                        {authors.join(', ')}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    {book.isbn && (
                                        <div>
                                            <span style={{ color: 'var(--text-tertiary)' }}>ISBN:</span>
                                            <span className="ml-2" style={{ color: 'var(--text-primary)' }}>
                                                {book.isbn}
                                            </span>
                                        </div>
                                    )}
                                    {book.numberOfPages && (
                                        <div>
                                            <span style={{ color: 'var(--text-tertiary)' }}>Pages:</span>
                                            <span className="ml-2" style={{ color: 'var(--text-primary)' }}>
                                                {book.numberOfPages}
                                            </span>
                                        </div>
                                    )}
                                    {book.publisher && (
                                        <div>
                                            <span style={{ color: 'var(--text-tertiary)' }}>Publisher:</span>
                                            <span className="ml-2" style={{ color: 'var(--text-primary)' }}>
                                                {book.publisher}
                                            </span>
                                        </div>
                                    )}
                                    {book.publishDate && (
                                        <div>
                                            <span style={{ color: 'var(--text-tertiary)' }}>Published:</span>
                                            <span className="ml-2" style={{ color: 'var(--text-primary)' }}>
                                                {book.publishDate}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Reading Stats Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            Reading Statistics
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--surface-secondary)' }}>
                                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Total Pages Read</p>
                                <p className="text-2xl font-bold" style={{ color: 'var(--color-accent-primary)' }}>
                                    {totalPagesRead}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--surface-secondary)' }}>
                                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Total Time</p>
                                <p className="text-2xl font-bold" style={{ color: 'var(--color-accent-primary)' }}>
                                    {totalHours}h {remainingMinutes}m
                                </p>
                            </div>
                            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--surface-secondary)' }}>
                                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Reading Sessions</p>
                                <p className="text-2xl font-bold" style={{ color: 'var(--color-accent-primary)' }}>
                                    {activities.length}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--surface-secondary)' }}>
                                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Progress</p>
                                <p className="text-2xl font-bold" style={{ color: 'var(--color-accent-primary)' }}>
                                    {book.numberOfPages ? Math.round((totalPagesRead / book.numberOfPages) * 100) : 0}%
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Reading History Timeline */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            Reading History
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {activities.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)' }}>No reading activities yet</p>
                        ) : (
                            <div className="space-y-3">
                                {activities.map((activity) => {
                                    const startTime = parseActivityTime(activity.startTime);
                                    const endTime = parseActivityTime(activity.endTime);
                                    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

                                    return (
                                        <div
                                            key={activity.id}
                                            className="p-4 rounded-lg border"
                                            style={{
                                                backgroundColor: 'var(--surface-secondary)',
                                                borderColor: 'var(--border-primary)',
                                            }}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                                        {activity.date}
                                                    </p>
                                                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                        {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        <span className="ml-2">({duration} min)</span>
                                                    </p>
                                                    {activity.pagesRead !== null && activity.pagesRead !== undefined && (
                                                        <p className="text-sm mt-1" style={{ color: 'var(--color-accent-primary)' }}>
                                                            📖 {activity.pagesRead} pages
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
