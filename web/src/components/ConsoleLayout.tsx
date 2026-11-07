import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  SearchX,
  Settings as SettingsIcon,
  Store,
  UserRound,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api, ApiError } from '../lib/api';
import type { Page, Handoff, User } from '../lib/types';
import { Logo } from './Logo';
import { Button, useToast } from './ui';

const NAV = [
  { to: '/app', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/app/conversations', label: 'Conversations', icon: MessagesSquare },
  { to: '/app/handoffs', label: 'Handoffs', icon: UserRound },
  { to: '/app/knowledge', label: 'Knowledge', icon: BookOpen },
  { to: '/app/gaps', label: 'Knowledge gaps', icon: SearchX },
  { to: '/app/playground', label: 'Playground', icon: FlaskConical },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon },
];

export function PageHeader(props: { title: string; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {props.back}
        <h1>{props.title}</h1>
        {props.description ? <p>{props.description}</p> : null}
      </div>
      {props.actions ? <div className="page-head-actions">{props.actions}</div> : null}
    </header>
  );
}

export function ConsoleLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ user: User }>('/auth/me'), retry: false });
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;

  const handoffs = useQuery({
    queryKey: ['handoffs', 'open-count'],
    queryFn: () => api.get<Page<Handoff> & { openCount: number }>('/admin/handoffs?status=open&pageSize=1'),
    enabled: me.isSuccess,
    refetchInterval: 30_000,
  });

  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      client.clear();
      navigate('/login', { replace: true });
    },
    onError: (err) => toast.error(err),
  });

  useEffect(() => {
    if (unauthenticated) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    }
  }, [unauthenticated, navigate, location.pathname, location.search]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (me.isPending || unauthenticated) {
    return <div className="boot" role="status" aria-label="Loading"><span className="spinner" /></div>;
  }
  if (me.isError) {
    return (
      <div className="boot">
        <p>{me.error.message}</p>
        <Button onClick={() => me.refetch()}>Try again</Button>
      </div>
    );
  }

  const openCount = handoffs.data?.openCount ?? 0;

  return (
    <div className="console">
      <div className="topbar">
        <Link to="/app" aria-label="Groundline console home"><Logo /></Link>
        <Button size="icon" variant="ghost" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <Link to="/app" className="sidebar-logo" aria-label="Groundline console home"><Logo /></Link>
        <nav aria-label="Console">
          {NAV.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className="nav-item">
              <Icon aria-hidden />
              <span>{label}</span>
              {to === '/app/handoffs' && openCount > 0 ? (
                <span className="nav-count tnum" aria-label={`${openCount} open`}>{openCount}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Link to="/demo" className="nav-item" target="_blank"><Store aria-hidden /><span>Demo storefront</span></Link>
          <div className="account">
            <span className="truncate" title={me.data.user.email}>{me.data.user.email}</span>
            <Button size="icon" variant="ghost" aria-label="Sign out" title="Sign out" loading={logout.isPending} onClick={() => logout.mutate()}>
              {logout.isPending ? null : <LogOut />}
            </Button>
          </div>
        </div>
      </aside>

      <main className="content" id="main">
        <Outlet />
      </main>
    </div>
  );
}
