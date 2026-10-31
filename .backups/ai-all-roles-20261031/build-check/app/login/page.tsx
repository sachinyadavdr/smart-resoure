'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import AuthFrame from '../components/AuthFrame';
import styles from '../components/PhaseOne.module.css';
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

  return <AuthFrame><p className={styles.authKicker}>Your community, connected</p><h1 >Welcome back</h1><p className={styles.authIntro}>Sign in to manage your ResourceBridge activity.</p><form onSubmit={submit} className={styles.authForm}><label className="block text-sm font-semibold">Email<input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label className="block text-sm font-semibold">Password<input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="btn-primary w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Log in'}</button></form>{message && <p role="alert" className={styles.feedback}>{message}</p>}<p className={styles.authSwitch}>New here? <Link href="/register" className="font-semibold text-primary">Create an account</Link></p></AuthFrame>;
}
