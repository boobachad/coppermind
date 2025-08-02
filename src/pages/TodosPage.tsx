import React, { useEffect, useState, useMemo } from 'react';
import { getDb } from '../lib/db';
import { Todo } from '../lib/types';
import { 
  Plus, 
  Trash2, 
  Search, 
  Filter, 
  AlertCircle, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Circle,
  X,
  Tag
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as chrono from 'chrono-node';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

// Smart Parsing Helper
const parseSmartInput = (text: string) => {
  const parsedDate = chrono.parseDate(text);
  const isUrgent = /urgent|asap|immediately/i.test(text);
  const isHighPriority = /high priority|priority high|important/i.test(text) || isUrgent;
  
  // Clean text by removing detected keywords (optional, keeping it simple for now)
  // Ideally we would strip the date string from the text, but user might want to keep it.
  
  return {
    date: parsedDate,
    urgent: isUrgent,
    priority: isHighPriority ? 'high' : 'medium' as 'low' | 'medium' | 'high'
  };
};

export function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'urgent'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'priority' | 'due'>('newest');

  // Form State
  const [formText, setFormText] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formUrgent, setFormUrgent] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');

  useEffect(() => {
    loadTodos();
  }, []);

  // Smart Input Effect
  useEffect(() => {
    const smart = parseSmartInput(formText);
    if (smart.urgent) setFormUrgent(true);
    if (smart.priority === 'high') setFormPriority('high');
    if (smart.date) {
      setFormDate(format(smart.date, 'yyyy-MM-dd'));
      setFormTime(format(smart.date, 'HH:mm'));
    }
  }, [formText]);

  const loadTodos = async () => {
    try {
      const db = await getDb();
      const result = await db.select<any[]>('SELECT * FROM todos ORDER BY created_at DESC');
      // Parse labels and ensure types
      const parsed = result.map(t => ({
        ...t,
        labels: t.labels ? JSON.parse(t.labels) : [],
        completed: !!t.completed,
        urgent: !!t.urgent
      }));
      setTodos(parsed);
    } catch (err) {
      console.error("Error loading todos:", err);
    }
  };

  const handleAddTodo = async () => {
    if (!formText.trim()) return;
    
    const id = uuidv4();
    const now = Date.now();
    let dueDate = undefined;
    
    if (formDate) {
      const d = new Date(`${formDate}T${formTime || '00:00'}`);
      dueDate = d.getTime();
    }

    const newTodo: Todo = {
      id,
      text: formText,
      description: formDesc,
      priority: formPriority,
      labels: [], // Future: Add tags support
      urgent: formUrgent,
      completed: false,
      due_date: dueDate,
      created_at: now
    };

    try {
      const db = await getDb();
      await db.execute(
        `INSERT INTO todos (id, text, description, priority, labels, urgent, due_date, completed, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newTodo.id,
          newTodo.text,
          newTodo.description,
          newTodo.priority,
          JSON.stringify(newTodo.labels),
          newTodo.urgent ? 1 : 0,
          newTodo.due_date,
          0,
          newTodo.created_at
        ]
      );
      loadTodos();
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      console.error("Error adding todo:", err);
    }
  };

  const resetForm = () => {
    setFormText('');
    setFormDesc('');
    setFormPriority('medium');
    setFormUrgent(false);
    setFormDate('');
    setFormTime('');
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      const db = await getDb();
      await db.execute('UPDATE todos SET completed = $1 WHERE id = $2', [!todo.completed ? 1 : 0, todo.id]);
      loadTodos();
    } catch (err) {
      console.error("Error toggling todo:", err);
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM todos WHERE id = $1', [id]);
      loadTodos();
    } catch (err) {
      console.error("Error deleting todo:", err);
    }
  };

  // Filtering & Sorting
  const filteredTodos = useMemo(() => {
    let res = todos;

    // Search
    if (search) {
      res = res.filter(t => t.text.toLowerCase().includes(search.toLowerCase()));
    }

    // Filter
    if (filter === 'active') res = res.filter(t => !t.completed);
    if (filter === 'completed') res = res.filter(t => t.completed);
    if (filter === 'urgent') res = res.filter(t => t.urgent);

    // Sort
    return res.sort((a, b) => {
      if (sortBy === 'priority') {
        const pMap = { high: 3, medium: 2, low: 1 };
        return pMap[b.priority] - pMap[a.priority];
      }
      if (sortBy === 'due') {
        return (a.due_date || Infinity) - (b.due_date || Infinity);
      }
      return b.created_at - a.created_at;
    });
  }, [todos, search, filter, sortBy]);

  // Stats
  const stats = {
    total: todos.length,
    completed: todos.filter(t => t.completed).length,
    pending: todos.filter(t => !t.completed).length,
  };

  const chartData = [
    { name: 'Completed', value: stats.completed, color: '#10B981' },
    { name: 'Pending', value: stats.pending, color: '#EF4444' },
  ];

  return (
    <div className="h-full bg-gray-50 flex flex-col overflow-hidden">
      {/* Dashboard Header */}
      <div className="bg-white border-b border-gray-200 p-8 shadow-sm">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1">Manage your tasks and priorities</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Task
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Stats Cards */}
          <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
            <p className="text-sm font-medium text-blue-600 uppercase tracking-wider">Total Tasks</p>
            <p className="text-4xl font-bold text-blue-900 mt-2">{stats.total}</p>
          </div>
          <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
            <p className="text-sm font-medium text-green-600 uppercase tracking-wider">Completed</p>
            <p className="text-4xl font-bold text-green-900 mt-2">{stats.completed}</p>
          </div>
          <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
            <p className="text-sm font-medium text-red-600 uppercase tracking-wider">Pending</p>
            <p className="text-4xl font-bold text-red-900 mt-2">{stats.pending}</p>
          </div>
          
          {/* Chart */}
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={50}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-8 py-4 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search tasks..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['all', 'active', 'completed', 'urgent'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-all",
                  filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 border-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="newest">Newest First</option>
            <option value="priority">Priority</option>
            <option value="due">Due Date</option>
          </select>
        </div>
      </div>

      {/* Tasks List */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="space-y-3 max-w-5xl mx-auto">
          {filteredTodos.map(todo => (
            <div 
              key={todo.id} 
              className={clsx(
                "group bg-white p-4 rounded-xl border transition-all hover:shadow-md flex items-center gap-4",
                todo.completed ? "border-gray-100 opacity-60" : "border-gray-200",
                todo.urgent && !todo.completed && "border-l-4 border-l-red-500"
              )}
            >
              <button 
                onClick={() => toggleTodo(todo)}
                className={clsx(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                  todo.completed ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-green-500"
                )}
              >
                {todo.completed && <CheckCircle2 className="w-4 h-4 text-white" />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={clsx("font-medium truncate", todo.completed && "line-through text-gray-500")}>
                    {todo.text}
                  </h3>
                  {todo.urgent && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full uppercase">Urgent</span>}
                  {todo.priority === 'high' && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full uppercase">High</span>}
                </div>
                {todo.description && <p className="text-sm text-gray-500 truncate">{todo.description}</p>}
                
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  {todo.due_date && (
                    <span className="flex items-center text-gray-500">
                      <Calendar className="w-3 h-3 mr-1" />
                      {format(new Date(todo.due_date), 'MMM d, yyyy HH:mm')}
                    </span>
                  )}
                  <span>Created {format(new Date(todo.created_at), 'MMM d')}</span>
                </div>
              </div>

              <button 
                onClick={() => deleteTodo(todo.id)}
                className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          
          {filteredTodos.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No tasks found</p>
            </div>
          )}
        </div>
      </div>

      {/* New Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">New Task</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Task Name</label>
                <input 
                  autoFocus
                  type="text" 
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="e.g. Submit report by Friday urgent"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                <p className="text-xs text-blue-600 mt-1 italic">
                  Tip: Try typing "tomorrow" or "urgent" to auto-fill
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Description</label>
                <textarea 
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg h-20 resize-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Priority</label>
                  <select 
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center space-x-2 cursor-pointer p-2 border border-gray-200 rounded-lg w-full hover:bg-red-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={formUrgent}
                      onChange={(e) => setFormUrgent(e.target.checked)}
                      className="w-4 h-4 text-red-600 rounded focus:ring-red-500" 
                    />
                    <span className="text-sm font-medium text-red-700">Mark Urgent</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Date</label>
                  <input 
                    type="date" 
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Time</label>
                  <input 
                    type="time" 
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddTodo}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm"
              >
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
