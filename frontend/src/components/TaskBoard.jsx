import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const STATUSES = ['pending', 'in_progress', 'done'];
const NEXT = { pending: 'in_progress', in_progress: 'done', done: 'pending' };

export default function TaskBoard({ onDbState }) {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listTasks(filter);
      setTasks(data.items || []);
      setError('');
      onDbState?.(false);
    } catch (e) {
      if (e.status === 503) onDbState?.(true);
      else setError(e.message);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filter, onDbState]);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createTask({ title: title.trim(), description: description.trim() || undefined });
      setTitle('');
      setDescription('');
      load();
    } catch (e) {
      setError(e.details ? e.details.join(', ') : e.message);
    }
  };

  const cycle = async (t) => {
    try { await api.updateTask(t.id, { status: NEXT[t.status] }); load(); }
    catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    try { await api.deleteTask(id); load(); }
    catch (e) { setError(e.message); }
  };

  return (
    <section className="board">
      <form className="new-task" onSubmit={create}>
        <input
          className="in"
          placeholder="New task title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
        />
        <input
          className="in"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button className="btn primary" type="submit">Add</button>
      </form>

      <div className="board-head">
        <h2>Tasks {tasks.length > 0 && <span className="count">{tasks.length}</span>}</h2>
        <div className="filters">
          <button className={`chip ${filter === '' ? 'on' : ''}`} onClick={() => setFilter('')}>all</button>
          {STATUSES.map((s) => (
            <button key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="banner err">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="muted">No tasks yet. Add one above.</p>
      ) : (
        <ul className="tasks">
          {tasks.map((t) => (
            <li key={t.id} className="task">
              <button className={`status ${t.status}`} title="click to advance status" onClick={() => cycle(t)}>
                {t.status.replace('_', ' ')}
              </button>
              <div className="task-body">
                <span className="task-title">{t.title}</span>
                {t.description && <span className="task-desc">{t.description}</span>}
              </div>
              <button className="btn ghost" onClick={() => remove(t.id)} title="delete">✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
