const ERROR_MAP: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/user-disabled': 'This account has been disabled. Contact an administrator.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/invalid-email': 'Please enter a valid email address.',
};

export function friendlyAuthError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: string }).code;
    return ERROR_MAP[code] ?? 'Sign-in failed. Please try again.';
  }
  return 'Sign-in failed. Please try again.';
}
