'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage, requestJson } from '../lib/api';

type RegisterResponse = { token: string; user: { name: string } };

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      const { response, data } = await requestJson<RegisterResponse>('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) return setMessage((data as { error?: string } | null)?.error || 'Registration failed. Please check your details.');
      if (!data?.token || !data.user) return setMessage('Registration succeeded, but the server returned an incomplete response. Please try logging in.');
      localStorage.setItem('resourcebridge_token', data.token);
      setMessage(`Account created for ${data.user.name}.`);
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Registration failed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return <main className="mx-auto max-w-md px-6 py-16"><div className="card"><h1 className="text-3xl font-bold">Create your account</h1><p className="mt-2 text-slate-600">Join the shared resource community.</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-sm font-semibold">Name<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label className="block text-sm font-semibold">Email<input className="input mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label><label className="block text-sm font-semibold">Password<input className="input mt-1" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label><label className="block text-sm font-semibold">I am a<select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="student">Student</option><option value="owner">Resource owner</option></select></label><button className="btn-primary w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</button></form>{message && <p role="status" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-primary">{message}</p>}<p className="mt-6 text-sm text-slate-600">Already registered? <Link href="/login" className="font-semibold text-primary">Log in</Link></p></div></main>;
}
