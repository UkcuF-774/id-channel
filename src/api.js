async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'Request failed');
  }
  return data;
}

export const api = {
  me: () => request('/auth/me'),
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  recover: (body) => request('/auth/recover', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/auth/logout', { method: 'POST', body: '{}' }),
  lookupId: (publicId) => request(`/users/by-id/${encodeURIComponent(publicId)}`),
  sendRequest: (publicId) =>
    request('/contacts/request', { method: 'POST', body: JSON.stringify({ publicId }) }),
  getRequests: () => request('/contacts/requests'),
  respondRequest: (id, action) =>
    request(`/contacts/requests/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  getContacts: () => request('/contacts'),
  getMessages: (otherUserId) => request(`/messages/${otherUserId}`),
  sendMessage: (toUserId, body) =>
    request('/messages', { method: 'POST', body: JSON.stringify({ toUserId, body }) }),
};
