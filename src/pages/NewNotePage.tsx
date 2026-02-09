import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDb } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';

export function NewNotePage() {
    const navigate = useNavigate();

    useEffect(() => {
        const createAndRedirect = async () => {
            try {
                const id = uuidv4();
                const db = await getDb();
                const now = Date.now();
                const initialContent = JSON.stringify([]);

                await db.execute(
                    'INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
                    [id, 'Untitled', initialContent, now, now]
                );

                window.dispatchEvent(new Event('notes-updated'));
                navigate(`/notes/${id}`, { replace: true });
            } catch (err) {
                console.error('Failed to create note:', err);
                navigate('/');
            }
        };

        createAndRedirect();
    }, [navigate]);

    return (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-dark-text-secondary">
            Creating note...
        </div>
    );
}
