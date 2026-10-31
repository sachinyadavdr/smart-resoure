'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage, requestJson } from '../lib/api';

type LoginResponse = { token: string; user: { role: string } };

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);
    try {
      const { response, data } = await requestJson<LoginResponse>('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!response.ok) return setMessage((data as { error?: string } | null)?.error || 'Login failed. Please check your email and password.');
      if (!data?.token || !data.user?.role) return setMessage('Login succeeded, but the server returned an incomplete response. Please try again.');
      localStorage.setItem('resourcebridge_token', data.token);
      window.location.href = data.user.role === 'student' ? '/dashboard/student' : data.user.role === 'owner' ? '/dashboard/owner' : '/dashboard/admin';
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Login failed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return <main className="mx-auto max-w-md px-6 py-16"><div className="card"><h1 className="text-3xl font-bold">Welcome back</h1><p className="mt-2 text-slate-600">Sign in to manage your ResourceBridge activity.</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-sm font-semibold">Email<input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label className="block text-sm font-semibold">Password<input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="btn-primary w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Log in'}</button></form>{message && <p role="alert" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-primary">{message}</p>}<p className="mt-6 text-sm text-slate-600">New here? <Link href="/register" className="font-semibold text-primary">Create an account</Link></p></div></main>;
}
