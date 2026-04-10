import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BookOpen, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Book } from '@/pos/lib/types-book';

export function BooksPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    invoke<Book[]>('get_all_books')
      .then(setBooks)
      .catch(err => toast.error('Failed to load books', { description: String(err) }))
      .finally(() => setLoading(false));
  }, []);

  const filtered = books.filter(b =>
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    b.authors.some(a => a.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-5xl mx-auto px-8 py-6 space-y-6">

        {/* Page header — matches BriefingPage pattern */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Books</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {loading ? '…' : `${books.length} book${books.length !== 1 ? 's' : ''} tracked`}
            </p>
          </div>
        </div>

        {/* Search — glass input, no extra wrapper border */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl border"
          style={{ backgroundColor: 'var(--glass-bg-subtle)', borderColor: 'var(--glass-border)' }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or author…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24" style={{ color: 'var(--text-tertiary)' }}>
            <span className="text-sm">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-24 gap-4 rounded-2xl border"
            style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg-subtle)' }}
          >
            <BookOpen className="w-10 h-10 opacity-20" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {search ? 'No books match your search.' : 'No books yet. Log a reading activity to add books.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(book => {
              const authors = Array.isArray(book.authors) ? book.authors : [];
              return (
                <button
                  key={book.id}
                  onClick={() => navigate(`/books/${book.id}`)}
                  className="flex gap-4 p-4 rounded-2xl border text-left transition-all duration-150 hover:scale-[1.01] group"
                  style={{
                    backgroundColor: 'var(--glass-bg)',
                    borderColor: 'var(--glass-border)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--glass-border-highlight)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
                >
                  {/* Cover */}
                  <div
                    className="flex-shrink-0 w-12 h-18 rounded-lg overflow-hidden border flex items-center justify-center"
                    style={{
                      width: '3rem',
                      height: '4.5rem',
                      borderColor: 'var(--glass-border)',
                      backgroundColor: 'var(--glass-bg-subtle)',
                    }}
                  >
                    {book.coverUrl ? (
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <BookOpen
                        className="w-5 h-5 opacity-25"
                        style={{ color: 'var(--text-tertiary)' }}
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="space-y-0.5">
                      <p
                        className="text-sm font-semibold leading-snug line-clamp-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {book.title}
                      </p>
                      {authors.length > 0 && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {authors.join(', ')}
                        </p>
                      )}
                    </div>

                    {book.numberOfPages && (
                      <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                        {book.numberOfPages} pages
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
