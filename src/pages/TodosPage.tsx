import React, { useEffect, useState } from 'react';
import { getDb } from '../lib/db';
import { Todo } from '../lib/types';
import { Plus, Trash2 } from 'lucide-react';

export function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');

  useEffect(() => {
    loadTodos();
  }, []);

  const loadTodos = async () => {
    try {
      const db = await getDb();
      const result = await db.select<Todo[]>('SELECT * FROM todos ORDER BY id DESC');
      setTodos(result);
    } catch (err) {
      console.error("Error loading todos:", err);
    }
  };

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    try {
      const db = await getDb();
      await db.execute('INSERT INTO todos (text, completed) VALUES ($1, 0)', [newTodo]);
      setNewTodo('');
      loadTodos();
    } catch (err) {
      console.error("Error adding todo:", err);
    }
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      const db = await getDb();
      // SQLite boolean is usually 0 or 1.
      await db.execute('UPDATE todos SET completed = $1 WHERE id = $2', [!todo.completed, todo.id]);
      loadTodos();
    } catch (err) {
      console.error("Error toggling todo:", err);
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM todos WHERE id = $1', [id]);
      loadTodos();
    } catch (err) {
      console.error("Error deleting todo:", err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">To-Dos</h1>
      
      <form onSubmit={addTodo} className="flex gap-2 mb-6">
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          <Plus className="w-5 h-5" />
        </button>
      </form>

      <div className="space-y-2">
        {todos.map(todo => (
          <div key={todo.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <input
              type="checkbox"
              checked={!!todo.completed} // Ensure boolean
              onChange={() => toggleTodo(todo)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
            />
            <span className={`flex-1 ${todo.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
              {todo.text}
            </span>
            <button onClick={() => deleteTodo(todo.id)} className="text-gray-400 hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {todos.length === 0 && (
          <p className="text-gray-400 text-center py-4">No tasks yet.</p>
        )}
      </div>
    </div>
  );
}
