// Book tracking types.
// Mirror of src-tauri/src/books.rs

export interface BookMetadata {
    isbn: string;
    title: string;
    authors: string[];
    numberOfPages: number | null;
    publisher: string | null;
    publishDate: string | null;
    coverUrl: string | null;
}

export interface Book {
    id: string;
    isbn: string | null;
    title: string;
    authors: string[];
    numberOfPages: number | null;
    publisher: string | null;
    publishDate: string | null;
    coverUrl: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
}

export interface BookActivitySummary {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    pagesRead: number | null;
}

export interface BookReadingHistory {
    book: Book;
    activities: BookActivitySummary[];
    totalPagesRead: number;
    totalReadingTimeMinutes: number;
    firstReadDate: string | null;
    lastReadDate: string | null;
}
