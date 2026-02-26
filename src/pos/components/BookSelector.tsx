import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Search, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { BookMetadata, Book } from '../lib/types';

interface BookSelectorProps {
    onBookSelected: (bookId: string) => void;
    selectedBookId?: string | null;
}

export function BookSelector({ onBookSelected, selectedBookId }: BookSelectorProps) {
    const [mode, setMode] = useState<'search' | 'isbn' | 'manual'>('search');
    const [isbn, setIsbn] = useState('');
    const [fetchedMetadata, setFetchedMetadata] = useState<BookMetadata | null>(null);
    const [loading, setLoading] = useState(false);
    const [existingBooks, setExistingBooks] = useState<Book[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Manual entry fields
    const [manualTitle, setManualTitle] = useState('');
    const [manualAuthors, setManualAuthors] = useState('');
    const [manualPages, setManualPages] = useState('');

    useEffect(() => {
        fetchExistingBooks();
    }, []);

    const fetchExistingBooks = async () => {
        try {
            // Get all books from database
            const books = await invoke<Book[]>('get_all_books');
            setExistingBooks(books);
        } catch (error) {
            console.error('Failed to fetch books:', error);
        }
    };

    const handleFetchByIsbn = async () => {
        if (!isbn.trim()) {
            toast.error('Please enter an ISBN');
            return;
        }

        setLoading(true);
        try {
            const metadata = await invoke<BookMetadata>('fetch_book_by_isbn', { isbn: isbn.trim() });
            setFetchedMetadata(metadata);
            toast.success('Book metadata fetched successfully');
        } catch (error) {
            toast.error('Failed to fetch book metadata', {
                description: 'Try manual entry instead'
            });
            setMode('manual');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFromMetadata = async () => {
        if (!fetchedMetadata) return;

        setLoading(true);
        try {
            const book = await invoke<Book>('create_or_get_book', {
                req: {
                    isbn: fetchedMetadata.isbn,
                    title: fetchedMetadata.title,
                    authors: fetchedMetadata.authors,
                    numberOfPages: fetchedMetadata.numberOfPages,
                    publisher: fetchedMetadata.publisher,
                    publishDate: fetchedMetadata.publishDate,
                    coverUrl: fetchedMetadata.coverUrl,
                }
            });
            
            onBookSelected(book.id);
            toast.success('Book added successfully');
            setFetchedMetadata(null);
            setIsbn('');
            await fetchExistingBooks();
        } catch (error) {
            toast.error('Failed to create book', {
                description: String(error)
            });
        } finally {
            setLoading(false);
        }
    };

    const handleManualCreate = async () => {
        if (!manualTitle.trim()) {
            toast.error('Please enter a book title');
            return;
        }

        const authorsArray = manualAuthors
            .split(',')
            .map(a => a.trim())
            .filter(a => a.length > 0);

        if (authorsArray.length === 0) {
            toast.error('Please enter at least one author');
            return;
        }

        setLoading(true);
        try {
            const book = await invoke<Book>('create_or_get_book', {
                req: {
                    isbn: null,
                    title: manualTitle.trim(),
                    authors: authorsArray,
                    numberOfPages: manualPages ? parseInt(manualPages) : null,
                    publisher: null,
                    publishDate: null,
                    coverUrl: null,
                }
            });
            
            onBookSelected(book.id);
            toast.success('Book added successfully');
            setManualTitle('');
            setManualAuthors('');
            setManualPages('');
            await fetchExistingBooks();
        } catch (error) {
            toast.error('Failed to create book', {
                description: String(error)
            });
        } finally {
            setLoading(false);
        }
    };

    const filteredBooks = existingBooks.filter(book =>
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.authors.some(a => a.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" style={{ color: 'var(--color-accent-primary)' }} />
                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Book Selection
                </label>
            </div>

            {/* Mode Selector */}
            <div className="flex gap-2">
                <Button
                    type="button"
                    variant={mode === 'search' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMode('search')}
                >
                    <Search className="w-4 h-4 mr-1" />
                    Search
                </Button>
                <Button
                    type="button"
                    variant={mode === 'isbn' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMode('isbn')}
                >
                    ISBN
                </Button>
                <Button
                    type="button"
                    variant={mode === 'manual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMode('manual')}
                >
                    <Plus className="w-4 h-4 mr-1" />
                    Manual
                </Button>
            </div>

            {/* Search Mode */}
            {mode === 'search' && (
                <div className="space-y-2">
                    <Input
                        placeholder="Search existing books..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {filteredBooks.length > 0 ? (
                        <Select
                            value={selectedBookId || 'none'}
                            onValueChange={(value) => {
                                if (value !== 'none') {
                                    onBookSelected(value);
                                }
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select a book" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60 overflow-y-auto">
                                <SelectItem value="none">-- No Book --</SelectItem>
                                {filteredBooks.map(book => (
                                    <SelectItem key={book.id} value={book.id}>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{book.title}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {book.authors.join(', ')}
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No books found. Try ISBN or manual entry.
                        </p>
                    )}
                </div>
            )}

            {/* ISBN Mode */}
            {mode === 'isbn' && (
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Enter ISBN (e.g., 9780134685991)"
                            value={isbn}
                            onChange={(e) => setIsbn(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleFetchByIsbn();
                                }
                            }}
                        />
                        <Button
                            type="button"
                            onClick={handleFetchByIsbn}
                            disabled={loading || !isbn.trim()}
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                'Fetch'
                            )}
                        </Button>
                    </div>

                    {fetchedMetadata && (
                        <div
                            className="p-4 rounded-lg border space-y-2"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: 'var(--border-primary)',
                            }}
                        >
                            <div className="flex gap-3">
                                {fetchedMetadata.coverUrl && (
                                    <img
                                        src={fetchedMetadata.coverUrl}
                                        alt={fetchedMetadata.title}
                                        className="w-16 h-24 object-cover rounded"
                                    />
                                )}
                                <div className="flex-1">
                                    <h4 className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                        {fetchedMetadata.title}
                                    </h4>
                                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                        {fetchedMetadata.authors.join(', ')}
                                    </p>
                                    {fetchedMetadata.numberOfPages && (
                                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                            {fetchedMetadata.numberOfPages} pages
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Button
                                type="button"
                                onClick={handleCreateFromMetadata}
                                disabled={loading}
                                className="w-full"
                            >
                                Add This Book
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Manual Mode */}
            {mode === 'manual' && (
                <div className="space-y-3">
                    <Input
                        placeholder="Book Title *"
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                    />
                    <Input
                        placeholder="Authors (comma-separated) *"
                        value={manualAuthors}
                        onChange={(e) => setManualAuthors(e.target.value)}
                    />
                    <Input
                        type="number"
                        placeholder="Number of Pages (optional)"
                        value={manualPages}
                        onChange={(e) => setManualPages(e.target.value)}
                    />
                    <Button
                        type="button"
                        onClick={handleManualCreate}
                        disabled={loading || !manualTitle.trim() || !manualAuthors.trim()}
                        className="w-full"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                            <Plus className="w-4 h-4 mr-2" />
                        )}
                        Add Book
                    </Button>
                </div>
            )}
        </div>
    );
}
