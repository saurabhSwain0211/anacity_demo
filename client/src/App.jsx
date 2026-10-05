import React, { useEffect, useState } from 'react';
import { api } from './api';

import {
  Home,
  LogOut,
  Plus,
  RefreshCw,
  ClipboardList,
  ShieldCheck,
  UserRound,
  Bot,
  Send,
  FileUp,
  CheckCircle2,
  Clock3,
  AlertCircle,
  ArrowRight,
  Building2,
  X,
} from 'lucide-react';

const badge = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-800',
  needs_information: 'bg-orange-100 text-orange-800',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};

const label = (s) =>
  s?.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function App() {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('anacity-session'));
    } catch {
      return null;
    }
  });

  const [email, setEmail] = useState('resident@anacity.demo');
  const [password, setPassword] = useState('Resident123!');
  const [loginError, setLoginError] = useState('');

  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    type: 'move_in',
    residentName: '',
    unitNumber: '',
    plannedDate: '',
    phone: '',
    vehicleDetails: '',
    notes: '',
  });

  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState('');
  const [adminNote, setAdminNote] = useState('');

  // NEW: Controls the floating AI chat window
  const [chatOpen, setChatOpen] = useState(false);

  const token = session?.token;
  const user = session?.user;
  const admin = user?.role === 'admin';

  async function refresh() {
    if (!token) return;

    setLoading(true);

    try {
      const d = await api('/requests', { token });

      setRequests(d.requests);

      if (selected) {
        setSelected(
          d.requests.find((x) => x.id === selected.id) || null
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  function logout() {
    localStorage.removeItem('anacity-session');

    setSession(null);
    setRequests([]);
    setSelected(null);
    setPage('dashboard');

    // Close AI chat on logout
    setChatOpen(false);
    setChat([]);
  }

  async function login(e) {
    e.preventDefault();
    setLoginError('');

    try {
      const d = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      });

      localStorage.setItem('anacity-session', JSON.stringify(d));
      setSession(d);
    } catch (e) {
      setLoginError(e.message);
    }
  }

  async function createRequest(e) {
    e.preventDefault();

    try {
      const d = await api('/requests', {
        token,
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          details: form,
        }),
      });

      setSelected(d.request);
      setChat([]);
      setPage('detail');

      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateRequest() {
    try {
      const d = await api(`/requests/${selected.id}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          type: form.type,
          details: form,
        }),
      });

      setSelected(d.request);

      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitRequest() {
    try {
      await updateRequest();

      await api(`/requests/${selected.id}/submit`, {
        token,
        method: 'POST',
        body: '{}',
      });

      await refresh();

      setPage('dashboard');
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendChat(e) {
    e.preventDefault();
  
    const m = message.trim();
    if (!m) return;
  
    setMessage('');
  
    setChat(prev => [
      ...prev,
      {
        role: 'user',
        content: m
      }
    ]);
  
    try {
      const d = await api('/agent/chat', {
        token: session.token,
        method: 'POST',
        body: JSON.stringify({
          message: m,
          requestId: selected?.id || null
        })
      });
  
      setChat(prev => [
        ...prev,
        {
          role: 'assistant',
          content: d.reply
        }
      ]);
  
      if (d.createdRequest) {
        setSelected(d.createdRequest);
        await refresh();
        setPage('detail');
      }
  
    } catch (err) {
      console.error('Agent chat error:', err);
  
      setChat(prev => [
        ...prev,
        {
          role: 'assistant',
          content: err.message || 'Something went wrong.'
        }
      ]);
    }
  }

  async function changeStatus(status) {
    try {
      await api(`/requests/${selected.id}/status`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({
          status,
          note: adminNote,
        }),
      });

      setAdminNote('');

      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function uploadDoc(e) {
    const file = e.target.files?.[0];

    if (!file || !selected) return;

    const fd = new FormData();

    fd.append('file', file);

    try {
      await api(`/requests/${selected.id}/documents`, {
        token,
        method: 'POST',
        body: fd,
      });

      setError('Document uploaded successfully.');
    } catch (e) {
      setError(e.message);
    }

    e.target.value = '';
  }

  function openRequest(r) {
    setSelected(r);

    setForm({
      ...{
        type: r.type,
        ...r.details,
      },
      type: r.type,
    });

    setChat([]);

    setPage('detail');
  }

  /*
   * ---------------------------------------------------------
   * LOGIN SCREEN
   * ---------------------------------------------------------
   */

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form
          onSubmit={login}
          className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-brand text-white rounded-xl p-3">
              <Building2 />
            </div>

            <div>
              <h1 className="text-2xl font-bold">ANACITY</h1>

              <p className="text-slate-500 text-sm">
                Move-in / Move-out Assistant
              </p>
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-2">
            Welcome back
          </h2>

          <p className="text-slate-500 text-sm mb-6">
            Sign in to manage community requests.
          </p>

          <label className="field-label">Email</label>

          <input
            className="field mb-4"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="field-label">Password</label>

          <input
            className="field mb-4"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {loginError && (
            <p className="text-rose-600 text-sm mb-3">
              {loginError}
            </p>
          )}

          <button className="primary w-full">
            Sign in
            <ArrowRight size={17} />
          </button>

          <div className="mt-6 p-4 rounded-xl bg-slate-50 text-xs text-slate-500 leading-6">
            <b>Demo access</b>
            <br />
            Resident: resident@anacity.demo / Resident123!
            <br />
            Admin: admin@anacity.demo / Admin123!
          </div>
        </form>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * MAIN APPLICATION
   * ---------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-slate-50">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="bg-brand text-white p-2 rounded-xl">
            <Building2 />
          </div>

          <div>
            <b className="text-lg">ANACITY</b>

            <p className="text-xs text-slate-400">
              Community portal
            </p>
          </div>
        </div>

        <div className="px-4 mt-4">
          <p className="nav-caption">WORKSPACE</p>

          <button
            onClick={() => {
              setPage('dashboard');
              setSelected(null);
            }}
            className={`nav ${
              page === 'dashboard' ? 'nav-active' : ''
            }`}
          >
            <Home size={18} />
            Overview
          </button>

          <button
            onClick={() => setPage('new')}
            className={`nav ${
              page === 'new' ? 'nav-active' : ''
            }`}
          >
            <Plus size={18} />
            New request
          </button>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-2xl bg-slate-800 p-4 text-white mb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-slate-600 p-2">
                <UserRound size={17} />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {user.name}
                </p>

                <p className="text-xs text-slate-400 capitalize">
                  {user.role}
                </p>
              </div>
            </div>
          </div>

          <button
            className="nav w-full"
            onClick={logout}
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        <header className="topbar">
          <div>
            <p className="text-xs text-slate-500">
              ANACITY / {label(page)}
            </p>

            <h1 className="font-semibold text-xl">
              {page === 'dashboard'
                ? admin
                  ? 'Admin overview'
                  : 'Resident overview'
                : page === 'new'
                ? 'Create a request'
                : 'Request details'}
            </h1>
          </div>

          <button
            className="icon-btn"
            onClick={refresh}
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </header>

        <div className="content">
          {error && (
            <div className="mb-4 rounded-xl bg-blue-50 text-blue-800 px-4 py-3 text-sm flex justify-between">
              {error}

              <button onClick={() => setError('')}>
                ×
              </button>
            </div>
          )}

          {/* DASHBOARD */}
          {page === 'dashboard' && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold">
                  Good{' '}
                  {new Date().getHours() < 12
                    ? 'morning'
                    : new Date().getHours() < 18
                    ? 'afternoon'
                    : 'evening'}
                  , {user.name.split(' ')[0]}
                </h2>

                <p className="text-slate-500 mt-1">
                  {admin
                    ? 'Review requests and keep resident journeys moving.'
                    : 'Manage your move-in and move-out requests in one place.'}
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-4 mb-7">
                {[
                  {
                    title: 'Total requests',
                    value: requests.length,
                    icon: ClipboardList,
                    color: 'text-brand',
                    bg: 'bg-violet-50',
                  },
                  {
                    title: 'In progress',
                    value: requests.filter((r) =>
                      [
                        'submitted',
                        'under_review',
                        'needs_information',
                      ].includes(r.status)
                    ).length,
                    icon: Clock3,
                    color: 'text-amber-600',
                    bg: 'bg-amber-50',
                  },
                  {
                    title: 'Completed',
                    value: requests.filter((r) =>
                      ['approved', 'rejected'].includes(r.status)
                    ).length,
                    icon: CheckCircle2,
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50',
                  },
                ].map((s, i) => (
                  <div
                    className="panel flex items-center gap-4"
                    key={i}
                  >
                    <div
                      className={`${s.bg} ${s.color} p-3 rounded-xl`}
                    >
                      <s.icon size={21} />
                    </div>

                    <div>
                      <p className="text-sm text-slate-500">
                        {s.title}
                      </p>

                      <p className="text-2xl font-bold">
                        {s.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="panel">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {admin
                        ? 'Incoming requests'
                        : 'My requests'}
                    </h3>

                    <p className="text-sm text-slate-500">
                      Track and manage your requests
                    </p>
                  </div>

                  {!admin && (
                    <button
                      className="primary"
                      onClick={() => setPage('new')}
                    >
                      <Plus size={17} />
                      New request
                    </button>
                  )}
                </div>

                {loading ? (
                  <p className="p-8 text-center text-slate-500">
                    Loading requests...
                  </p>
                ) : requests.length === 0 ? (
                  <div className="text-center py-12">
                    <ClipboardList
                      className="mx-auto text-slate-300 mb-3"
                      size={38}
                    />

                    <p className="font-medium">
                      No requests yet
                    </p>

                    <p className="text-sm text-slate-500 mt-1">
                      Start a move-in or move-out request to see
                      it here.
                    </p>

                    {!admin && (
                      <button
                        className="primary mt-4"
                        onClick={() => setPage('new')}
                      >
                        Create request
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b">
                          <th className="py-3 font-medium">
                            Request
                          </th>

                          {admin && (
                            <th className="py-3 font-medium">
                              Resident
                            </th>
                          )}

                          <th className="py-3 font-medium">
                            Unit
                          </th>

                          <th className="py-3 font-medium">
                            Planned date
                          </th>

                          <th className="py-3 font-medium">
                            Status
                          </th>

                          <th></th>
                        </tr>
                      </thead>

                      <tbody>
                        {requests.map((r) => (
                          <tr
                            key={r.id}
                            className="border-b last:border-0 hover:bg-slate-50"
                          >
                            <td className="py-4">
                              <button
                                className="font-semibold text-brand hover:underline"
                                onClick={() =>
                                  openRequest(r)
                                }
                              >
                                {r.type === 'move_in'
                                  ? 'Move-in'
                                  : 'Move-out'}

                                <span className="text-slate-400 font-normal">
                                  {' '}
                                  · {r.id.slice(0, 8)}
                                </span>
                              </button>
                            </td>

                            {admin && (
                              <td>{r.resident_name}</td>
                            )}

                            <td>
                              {r.unit_number ||
                                r.details?.unitNumber ||
                                '—'}
                            </td>

                            <td>
                              {r.planned_date
                                ? String(
                                    r.planned_date
                                  ).slice(0, 10)
                                : r.details?.plannedDate ||
                                  '—'}
                            </td>

                            <td>
                              <span
                                className={`status ${
                                  badge[r.status] ||
                                  badge.draft
                                }`}
                              >
                                {label(r.status)}
                              </span>
                            </td>

                            <td>
                              <button
                                className="text-brand font-medium"
                                onClick={() =>
                                  openRequest(r)
                                }
                              >
                                View →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* NEW REQUEST */}
          {page === 'new' && (
            <div className="max-w-3xl mx-auto panel">
              <button
                className="text-sm text-slate-500 mb-4"
                onClick={() => setPage('dashboard')}
              >
                ← Back to overview
              </button>

              <h2 className="text-xl font-bold">
                Start a request
              </h2>

              <p className="text-sm text-slate-500 mb-6">
                Provide the details below. The assistant can
                help if you are unsure.
              </p>

              <form onSubmit={createRequest}>
                <label className="field-label">
                  Request type
                </label>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  {['move_in', 'move_out'].map((t) => (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          type: t,
                        }))
                      }
                      className={`p-4 border rounded-xl text-left ${
                        form.type === t
                          ? 'border-brand bg-violet-50 ring-1 ring-brand'
                          : 'border-slate-200'
                      }`}
                      key={t}
                    >
                      <b>
                        {t === 'move_in'
                          ? 'Move-in'
                          : 'Move-out'}
                      </b>

                      <p className="text-xs text-slate-500 mt-1">
                        {t === 'move_in'
                          ? 'Joining a community'
                          : 'Leaving a community'}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">
                      Resident full name *
                    </label>

                    <input
                      className="field"
                      required
                      value={form.residentName}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          residentName: e.target.value,
                        }))
                      }
                      placeholder="Full name"
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Unit / Flat number *
                    </label>

                    <input
                      className="field"
                      required
                      value={form.unitNumber}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          unitNumber: e.target.value,
                        }))
                      }
                      placeholder="e.g. B-1204"
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Planned date *
                    </label>

                    <input
                      className="field"
                      required
                      type="date"
                      value={form.plannedDate}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          plannedDate: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Phone number *
                    </label>

                    <input
                      className="field"
                      required
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          phone: e.target.value,
                        }))
                      }
                      placeholder="Contact number"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="field-label">
                    Vehicle / moving details
                  </label>

                  <input
                    className="field"
                    value={form.vehicleDetails}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        vehicleDetails: e.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>

                <div className="mt-4">
                  <label className="field-label">
                    Additional notes
                  </label>

                  <textarea
                    className="field min-h-24"
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="Anything else the admin should know?"
                  />
                </div>

                <button className="primary mt-6">
                  Create draft
                  <ArrowRight size={17} />
                </button>
              </form>
            </div>
          )}

          {/* REQUEST DETAILS */}
          {page === 'detail' && selected && (
            <div className="max-w-5xl mx-auto">
              <div className="space-y-5">
                <div className="panel">
                  <button
                    className="text-sm text-slate-500 mb-4"
                    onClick={() =>
                      setPage('dashboard')
                    }
                  >
                    ← Back to requests
                  </button>

                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        REQUEST ID · {selected.id}
                      </p>

                      <h2 className="text-2xl font-bold mt-1">
                        {selected.type === 'move_in'
                          ? 'Move-in request'
                          : 'Move-out request'}
                      </h2>
                    </div>

                    <span
                      className={`status h-fit ${
                        badge[selected.status] ||
                        badge.draft
                      }`}
                    >
                      {label(selected.status)}
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 mt-6">
                    {[
                      [
                        'Resident',
                        selected.details?.residentName ||
                          selected.resident_name,
                      ],
                      [
                        'Unit',
                        selected.unit_number ||
                          selected.details?.unitNumber,
                      ],
                      [
                        'Planned date',
                        selected.planned_date
                          ? String(
                              selected.planned_date
                            ).slice(0, 10)
                          : selected.details?.plannedDate,
                      ],
                      ['Phone', selected.details?.phone],
                      [
                        'Vehicle',
                        selected.details?.vehicleDetails,
                      ],
                      ['Notes', selected.details?.notes],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="border-b border-slate-100 pb-3"
                      >
                        <p className="text-xs text-slate-500">
                          {k}
                        </p>

                        <p className="font-medium mt-1">
                          {v || '—'}
                        </p>
                      </div>
                    ))}
                  </div>

                  {!admin &&
                    !['approved', 'rejected'].includes(
                      selected.status
                    ) && (
                      <div className="mt-5 border-t pt-5">
                        <h3 className="font-semibold mb-3">
                          Update request details
                        </h3>

                        <div className="grid sm:grid-cols-2 gap-3">
                          {[
                            'residentName',
                            'unitNumber',
                            'plannedDate',
                            'phone',
                            'vehicleDetails',
                          ].map((k) => (
                            <div key={k}>
                              <label className="field-label">
                                {label(k)}
                              </label>

                              <input
                                className="field"
                                type={
                                  k === 'plannedDate'
                                    ? 'date'
                                    : 'text'
                                }
                                value={form[k] || ''}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    [k]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 mt-4 flex-wrap">
                          <button
                            className="secondary"
                            onClick={updateRequest}
                          >
                            Save changes
                          </button>

                          <label className="secondary cursor-pointer">
                            <FileUp size={16} />
                            Upload document

                            <input
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg"
                              className="hidden"
                              onChange={uploadDoc}
                            />
                          </label>

                          <button
                            className="primary"
                            onClick={submitRequest}
                          >
                            Submit request
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                </div>

                {/* ADMIN DECISION */}
                {admin && (
                  <div className="panel">
                    <div className="flex gap-2 items-center mb-3">
                      <ShieldCheck className="text-brand" />

                      <h3 className="font-semibold">
                        Admin decision
                      </h3>
                    </div>

                    <label className="field-label">
                      Review note
                    </label>

                    <textarea
                      className="field min-h-24"
                      value={adminNote}
                      onChange={(e) =>
                        setAdminNote(e.target.value)
                      }
                      placeholder="Add a note for the resident..."
                    />

                    <div className="grid grid-cols-1 gap-2 mt-4">
                      {selected.status === 'submitted' && (
                        <button
                          className="secondary"
                          onClick={() =>
                            changeStatus('under_review')
                          }
                        >
                          Start review
                        </button>
                      )}

                      {!['approved', 'rejected'].includes(
                        selected.status
                      ) && (
                        <>
                          <button
                            className="secondary"
                            onClick={() =>
                              changeStatus(
                                'needs_information'
                              )
                            }
                          >
                            Request more information
                          </button>

                          <button
                            className="primary bg-emerald-600 hover:bg-emerald-700"
                            onClick={() =>
                              changeStatus('approved')
                            }
                          >
                            <CheckCircle2 size={17} />
                            Approve request
                          </button>

                          <button
                            className="danger"
                            onClick={() =>
                              changeStatus('rejected')
                            }
                          >
                            Reject request
                          </button>
                        </>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mt-4">
                      Final decisions are made by an authorized
                      administrator.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* =====================================================
          FLOATING AI ASSISTANT
          ===================================================== */}

      {/* Floating Chat Window */}
      {chatOpen && (
        <div
          className="
            fixed
            right-6
            bottom-24
            z-50
            w-[380px]
            max-w-[calc(100vw-32px)]
            h-[560px]
            max-h-[calc(100vh-120px)]
            bg-white
            rounded-2xl
            shadow-2xl
            border
            border-slate-200
            flex
            flex-col
            overflow-hidden
          "
        >
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b px-4 py-3 bg-white">
            <div className="flex items-center gap-2">
              <div className="bg-violet-100 text-brand p-2 rounded-xl">
                <Bot size={20} />
              </div>

              <div>
                <h3 className="font-semibold">
                  AI workflow assistant
                </h3>

                <p className="text-xs text-slate-500">
                  Gemini · Context-aware assistance
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="
                p-2
                rounded-lg
                text-slate-400
                hover:text-slate-700
                hover:bg-slate-100
                transition
              "
              aria-label="Close AI assistant"
            >
              <X size={19} />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="chat-ai">
              Hi {user.name.split(' ')[0]}! I can help with
              this request, explain the next steps, or identify
              missing information.
            </div>

            {chat.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === 'user'
                    ? 'chat-user'
                    : 'chat-ai'
                }
              >
                {m.content}
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <form
            onSubmit={sendChat}
            className="flex gap-2 border-t p-3 bg-white"
          >
            <input
              className="field"
              value={message}
              onChange={(e) =>
                setMessage(e.target.value)
              }
              placeholder={
                selected
                  ? 'Ask about this request...'
                  : 'Ask the assistant...'
              }
            />

            <button
              className="primary px-3"
              aria-label="Send"
              type="submit"
            >
              <Send size={17} />
            </button>
          </form>
        </div>
      )}

      {/* Floating AI Icon */}
      <button
        type="button"
        onClick={() => setChatOpen((open) => !open)}
        className="
          fixed
          right-6
          bottom-6
          z-50
          w-14
          h-14
          rounded-full
          bg-brand
          text-white
          shadow-xl
          flex
          items-center
          justify-center
          hover:scale-105
          hover:shadow-2xl
          transition-all
        "
        aria-label={
          chatOpen
            ? 'Close AI assistant'
            : 'Open AI assistant'
        }
        title="AI workflow assistant"
      >
        {chatOpen ? (
          <X size={23} />
        ) : (
          <Bot size={25} />
        )}
      </button>
    </div>
  );
}

export default App;