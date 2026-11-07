import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Logo } from '../components/Logo';
import { Button, Field, fieldErrors } from '../components/ui';
import { api } from '../lib/api';
import type { User } from '../lib/types';

/** Only follow same-site paths, so a crafted ?next= can't redirect off the site. */
export function safeNext(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : '/app';
}

export function LoginPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => api.post<{ user: User }>('/auth/login', { email, password }),
    onSuccess: (data) => {
      client.setQueryData(['me'], data);
      navigate(safeNext(params.get('next')), { replace: true });
    },
  });
  const errors = fieldErrors(login.error);
  const generalError = login.isError && Object.keys(errors).length === 0 ? login.error.message : null;

  return (
    <div className="auth">
      <div className="auth-card">
        <Link to="/" aria-label="Groundline home"><Logo /></Link>
        <h1>Sign in to the console</h1>
        <form
          className="form-stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          {generalError ? <div className="form-banner" role="alert">{generalError}</div> : null}
          <Field label="Email" error={errors.email}>
            {(a) => <input {...a} className="input" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Password" error={errors.password}>
            {(a) => <input {...a} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={login.isPending}>Sign in</Button>
        </form>
      </div>
    </div>
  );
}
