const ERRORS: Record<string, string> = {
  not_allowed: 'That Google account isn’t on the list of people who can use this Music Radar. Ask the person who runs it to add you.',
  email: 'Google didn’t confirm an email address for that account.',
  access_denied: 'Sign-in was cancelled.',
};

export function SignIn() {
  const error = new URLSearchParams(location.search).get('signin_error');
  return (
    <div className="signin">
      <span className="logo" aria-hidden="true">◉</span>
      <h1>Music Radar</h1>
      <p className="sub">New releases, upcoming albums, shows and news for the artists you follow.</p>
      {error && <p className="bad">{ERRORS[error] ?? 'Sign-in didn’t work. Please try again.'}</p>}
      <a className="btn" href="/auth/google">
        Sign in with Google
      </a>
      <p className="muted small">Your artist list is saved to your account. Music Radar only sees your name, email and profile picture.</p>
    </div>
  );
}
