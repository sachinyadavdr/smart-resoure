'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import AuthFrame from '../components/AuthFrame';
import styles from '../components/PhaseOne.module.css';
import { apiErrorMessage, requestJson } from '../lib/api';
import { completeAuthentication } from '../lib/auth-session.mjs';

type RegisterResponse = { token: string; user: { name: string; role: string } };

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [message, setMessage] = useState('');
  const [emailAlreadyExists, setEmailAlreadyExists] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setEmailAlreadyExists(false);
    setIsSubmitting(true);

    try {
      const { response, data } = await requestJson<RegisterResponse & { error?: string; code?: string }>('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      let result: ReturnType<typeof completeAuthentication>;
      try {
        result = completeAuthentication(response, data);
      } catch {
        setMessage('Your account was created, but automatic sign-in could not be completed. Please log in.');
        return;
      }
      if (result.kind === 'duplicate') {
        setEmailAlreadyExists(true);
        return;
      }
      if (result.kind === 'error') return setMessage(result.message);
      if (result.kind === 'incomplete') return setMessage('Registration succeeded, but the server returned an incomplete response. Please try logging in.');
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Registration failed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return <AuthFrame register><p className={styles.authKicker}>Start something worthwhile</p><h1 >Create your account</h1><p className={styles.authIntro}>Join the shared resource community.</p><form onSubmit={submit} className={styles.authForm}><label className="block text-sm font-semibold">Name<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><div><label htmlFor="register-email" className="block text-sm font-semibold">Email<input id="register-email" className="input mt-1" type="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setEmailAlreadyExists(false); }} aria-invalid={emailAlreadyExists || undefined} aria-describedby={emailAlreadyExists ? 'register-email-error' : undefined} required /></label>{emailAlreadyExists && <p id="register-email-error" role="alert" className={styles.emailError}>This email is already registered. Please <Link href="/login" aria-label="Log in">log in</Link> or use a different email.</p>}</div><label className="block text-sm font-semibold">Password<input className="input mt-1" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label><label className="block text-sm font-semibold">I am a<select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="student">Student</option><option value="owner">Resource owner</option></select></label><button className="btn-primary w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}</button></form>{message && <p role="status" className={styles.feedback}>{message}</p>}<p className={styles.authSwitch}>Already registered? <Link href="/login" className="font-semibold text-primary">Log in</Link></p></AuthFrame>;
}
