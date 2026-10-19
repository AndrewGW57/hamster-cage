export const SESSION_EXPIRED_MESSAGE = 'Your admin session expired. Log in again.'
export const SESSION_EXPIRED_FLAG = 'adminSessionExpired'

// fetch() for admin routes. On 401: clear the browser session, go to the login screen
// with a message, and throw so the caller stops.
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    try {
      sessionStorage.removeItem('adminSession')
      sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1')
    } catch {}
    window.location.assign('/admin')
    throw new Error(SESSION_EXPIRED_MESSAGE)
  }
  return res
}
