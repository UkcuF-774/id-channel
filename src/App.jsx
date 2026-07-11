import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">ID</div>
      <div>
        <h1>ID Channel</h1>
        <p>Text anyone by their public ID — no email or phone</p>
      </div>
    </div>
  );
}

function AuthScreen({ onAuthed }) {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phrase, setPhrase] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (tab === 'login') {
        const data = await api.login({ username, password });
        onAuthed(data.user);
      } else if (tab === 'join') {
        const data = await api.register({ username, password, displayName });
        setReveal({
          publicId: data.publicId,
          recoveryPhrase: data.recoveryPhrase,
          user: data.user,
        });
      } else {
        const data = await api.recover({
          username,
          recoveryPhrase: phrase,
          newPassword,
        });
        onAuthed(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (reveal) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <Brand />
          <div className="success">
            Account created. Copy these now — the recovery phrase is shown only once.
          </div>
          <div className="reveal-box">
            <h3>Your public ID (share this to get messages)</h3>
            <p className="id-line mono">{reveal.publicId}</p>
            <h3>Recovery phrase (keep private)</h3>
            <p className="phrase mono">{reveal.recoveryPhrase}</p>
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Login uses your <strong>username + password</strong>. Your public ID is how others
              find you. The recovery phrase resets a lost password.
            </p>
          </div>
          <div className="row-actions">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(reveal.publicId)}
              className="ghost"
            >
              Copy ID
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(reveal.recoveryPhrase)}
              className="ghost"
            >
              Copy phrase
            </button>
            <button type="button" onClick={() => onAuthed(reveal.user)}>
              Enter channel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <Brand />
        <div className="tabs">
          <button
            type="button"
            className={tab === 'login' ? 'active' : ''}
            onClick={() => setTab('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={tab === 'join' ? 'active' : ''}
            onClick={() => setTab('join')}
          >
            Join
          </button>
          <button
            type="button"
            className={tab === 'recover' ? 'active' : ''}
            onClick={() => setTab('recover')}
          >
            Recover
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="e.g. skywalker"
              required
            />
          </div>

          {tab === 'join' && (
            <div className="field">
              <label>Display name (optional)</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How contacts see you"
              />
            </div>
          )}

          {tab !== 'recover' && (
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={tab === 'join' ? 'new-password' : 'current-password'}
                required
                minLength={6}
              />
            </div>
          )}

          {tab === 'recover' && (
            <>
              <div className="field">
                <label>Recovery phrase</label>
                <input
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder="eight word phrase from signup"
                  required
                />
              </div>
              <div className="field">
                <label>New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </>
          )}

          <button type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy
              ? 'Please wait…'
              : tab === 'login'
                ? 'Sign in'
                : tab === 'join'
                  ? 'Create account & get ID'
                  : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  // SQLite datetime is UTC-ish without Z; treat as local-friendly display
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MainApp({ user, onLogout }) {
  const [tab, setTab] = useState('chats');
  const [contacts, setContacts] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [addId, setAddId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const activeRef = useRef(null);
  activeRef.current = active;

  const loadContacts = useCallback(async () => {
    const data = await api.getContacts();
    setContacts(data.contacts);
  }, []);

  const loadRequests = useCallback(async () => {
    const data = await api.getRequests();
    setIncoming(data.incoming);
    setOutgoing(data.outgoing);
  }, []);

  const loadMessages = useCallback(async (contact) => {
    if (!contact) return;
    const data = await api.getMessages(contact.userId);
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    loadContacts().catch((e) => setError(e.message));
    loadRequests().catch((e) => setError(e.message));
  }, [loadContacts, loadRequests]);

  useEffect(() => {
    const socket = io({
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('message:new', (msg) => {
      const otherId = msg.fromMe ? msg.receiverId : msg.senderId;
      if (activeRef.current?.userId === otherId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [
            ...prev,
            {
              id: msg.id,
              body: msg.body,
              createdAt: msg.createdAt,
              fromMe: msg.fromMe,
              senderId: msg.senderId,
            },
          ];
        });
      }
      loadContacts().catch(() => {});
    });

    socket.on('contact:request', () => {
      loadRequests().catch(() => {});
      setNotice('New contact request');
    });

    socket.on('contact:response', (payload) => {
      loadRequests().catch(() => {});
      loadContacts().catch(() => {});
      if (payload.status === 'accepted') setNotice('Contact request accepted');
      if (payload.status === 'rejected') setNotice('Contact request declined');
    });

    socket.on('contact:new', () => {
      loadContacts().catch(() => {});
    });

    return () => socket.disconnect();
  }, [loadContacts, loadRequests]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, active]);

  async function openChat(contact) {
    setActive(contact);
    setError('');
    try {
      await loadMessages(contact);
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendRequest(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api.sendRequest(addId.trim().toUpperCase());
      setAddId('');
      setNotice('Request sent');
      await loadRequests();
      setTab('requests');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function respond(id, action) {
    setError('');
    try {
      const data = await api.respondRequest(id, action);
      await loadRequests();
      await loadContacts();
      if (action === 'accept' && data.contact) {
        setNotice(`You are now connected with ${data.contact.displayName}`);
        setTab('chats');
        openChat(data.contact);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    const body = draft.trim();
    setDraft('');
    try {
      const data = await api.sendMessage(active.userId, body);
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      loadContacts().catch(() => {});
    } catch (err) {
      setError(err.message);
      setDraft(body);
    }
  }

  async function logout() {
    await api.logout();
    onLogout();
  }

  const requestCount = incoming.length;

  const emptyHint = useMemo(
    () => (
      <div className="empty-chat">
        <div>
          <strong>Pick a contact or add someone by ID</strong>
          Share your public ID <span className="mono">{user.publicId}</span> so others can request
          you. Messaging only opens after both sides connect.
        </div>
      </div>
    ),
    [user.publicId]
  );

  return (
    <div className={`app ${active ? 'chat-open' : ''}`}>
      <aside className="sidebar">
        <div className="side-header">
          <div className="you">
            <div>
              <h2>{user.displayName || user.username}</h2>
              <div className="public-id mono" title="Your public ID">
                {user.publicId}
              </div>
              <div className="muted">@{user.username}</div>
            </div>
            <button type="button" className="ghost" onClick={logout}>
              Out
            </button>
          </div>
          <button
            type="button"
            className="ghost"
            style={{ width: '100%', marginTop: '0.65rem' }}
            onClick={() => navigator.clipboard.writeText(user.publicId)}
          >
            Copy my ID
          </button>
        </div>

        <div className="side-tools">
          <form className="inline" onSubmit={sendRequest}>
            <input
              className="mono"
              value={addId}
              onChange={(e) => setAddId(e.target.value.toUpperCase())}
              placeholder="Their ID e.g. AX7K-9M2P"
              maxLength={12}
            />
            <button type="submit" disabled={busy || !addId.trim()}>
              Add
            </button>
          </form>
          {notice && <div className="success" style={{ margin: 0 }}>{notice}</div>}
          {error && <div className="error" style={{ margin: 0 }}>{error}</div>}
        </div>

        <div className="side-nav">
          <button
            type="button"
            className={tab === 'chats' ? 'active' : ''}
            onClick={() => setTab('chats')}
          >
            Chats
          </button>
          <button
            type="button"
            className={tab === 'requests' ? 'active' : ''}
            onClick={() => setTab('requests')}
          >
            Requests{requestCount ? ` (${requestCount})` : ''}
          </button>
        </div>

        <div className="list">
          {tab === 'chats' &&
            (contacts.length === 0 ? (
              <p className="muted" style={{ padding: '0.75rem' }}>
                No contacts yet. Send a request with their public ID.
              </p>
            ) : (
              contacts.map((c) => (
                <button
                  key={c.userId}
                  type="button"
                  className={`list-item ${active?.userId === c.userId ? 'active' : ''}`}
                  onClick={() => openChat(c)}
                >
                  <div className="title">
                    <span>{c.displayName}</span>
                    <span className="mono muted" style={{ fontSize: '0.75rem' }}>
                      {c.publicId}
                    </span>
                  </div>
                  <div className="sub">
                    {c.lastMessage
                      ? `${c.lastMessage.fromMe ? 'You: ' : ''}${c.lastMessage.body}`
                      : 'Say hi'}
                  </div>
                </button>
              ))
            ))}

          {tab === 'requests' && (
            <>
              <p className="muted" style={{ padding: '0.35rem 0.5rem' }}>
                Incoming
              </p>
              {incoming.length === 0 && (
                <p className="muted" style={{ padding: '0 0.5rem 0.75rem' }}>
                  No pending requests
                </p>
              )}
              {incoming.map((r) => (
                <div key={r.id} className="request-card">
                  <div className="title">
                    <strong>{r.fromDisplayName}</strong>
                  </div>
                  <div className="mono" style={{ color: '#7ec8ff', marginTop: 4 }}>
                    {r.fromPublicId}
                  </div>
                  <div className="actions">
                    <button type="button" className="good" onClick={() => respond(r.id, 'accept')}>
                      Accept
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => respond(r.id, 'reject')}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}

              <p className="muted" style={{ padding: '0.75rem 0.5rem 0.35rem' }}>
                Outgoing
              </p>
              {outgoing.length === 0 && (
                <p className="muted" style={{ padding: '0 0.5rem' }}>
                  No pending outgoing requests
                </p>
              )}
              {outgoing.map((r) => (
                <div key={r.id} className="request-card">
                  <div>
                    <strong>{r.toDisplayName}</strong>
                  </div>
                  <div className="mono" style={{ color: '#7ec8ff', marginTop: 4 }}>
                    {r.toPublicId}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Waiting for them to accept…
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>

      <main className="chat-pane">
        {!active ? (
          emptyHint
        ) : (
          <>
            <div className="chat-top">
              <button type="button" className="ghost back" onClick={() => setActive(null)}>
                ←
              </button>
              <div>
                <div style={{ fontWeight: 600 }}>{active.displayName}</div>
                <div className="mono muted" style={{ fontSize: '0.85rem' }}>
                  {active.publicId}
                  {active.username ? ` · @${active.username}` : ''}
                </div>
              </div>
            </div>
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id} className={`bubble ${m.fromMe ? 'me' : 'them'}`}>
                  {m.body}
                  <span className="time">{formatTime(m.createdAt)}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e);
                  }
                }}
              />
              <button type="submit" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="auth-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthed={setUser} />;
  }

  return <MainApp user={user} onLogout={() => setUser(null)} />;
}
