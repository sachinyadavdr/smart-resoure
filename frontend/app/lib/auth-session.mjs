const dashboardRoutes = {
  student: '/dashboard/student',
  owner: '/dashboard/owner',
  admin: '/dashboard/admin',
};

export function completeAuthentication(response, data, {
  storage = window.localStorage,
  redirect = (destination) => { window.location.href = destination; },
  fallbackMessage = 'Authentication failed. Please try again.',
} = {}) {
  if (response.status === 409 && data?.code === 'EMAIL_ALREADY_EXISTS') {
    return { kind: 'duplicate', message: data.error || 'This email is already registered.' };
  }
  if (!response.ok) {
    return { kind: 'error', message: data?.error || fallbackMessage };
  }
  const destination = data?.user?.role && Object.prototype.hasOwnProperty.call(dashboardRoutes, data.user.role)
    ? dashboardRoutes[data.user.role]
    : null;
  if (!data?.token || !destination) {
    return { kind: 'incomplete' };
  }

  storage.setItem('resourcebridge_token', data.token);
  redirect(destination);
  return { kind: 'authenticated', destination };
}
