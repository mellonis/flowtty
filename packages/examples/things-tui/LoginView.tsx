/** @jsxImportSource react */
import { useState } from 'react';
import { Box, TextInput, Button, FocusGroup, useInput } from '@flowtty/react';
import { login, setToken, ApiError, BASE } from './api.js';

interface LoginViewProps {
  onSuccess: () => void;
  onExit: () => void;
}

export function LoginView({ onSuccess, onExit }: LoginViewProps) {
  const [loginValue, setLoginValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc anywhere on the login screen exits the app (login is the entry point —
  // there's nowhere to go "back" to). Sub-components (TextInput, Button) also
  // own keys; useInput here is a global fallback for keys they don't consume.
  useInput((key) => {
    if (key.name === 'escape') onExit();
  });

  const submit = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await login(loginValue, passwordValue);
      setToken(res.accessToken);
      onSuccess();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`Login failed (${e.status})`);
      } else {
        setError(String(e));
      }
      setLoading(false);
    }
  };

  // Outer Box centers the inline bordered "dialog" horizontally + vertically
  // in the terminal. We can't use openDialog here because LoginView is the
  // App root (no DialogHost stack); the same chrome (border + borderTitle) is
  // hand-rolled below.
  return (
    <Box height="100%" justifyContent="center" alignItems="center">
      <Box
        flexDirection="column"
        border="single"
        borderTitle={`Login to ${new URL(BASE).host}`}
        minWidth={50}
        maxWidth="80%"
        padding={1}
        backgroundColor="default"
      >
        <FocusGroup>
          <Box>Login (username):</Box>
          <TextInput value={loginValue} onChange={setLoginValue} onSubmit={() => { /* Tab advances to password */ }} />
          <Box>Password:</Box>
          <TextInput value={passwordValue} onChange={setPasswordValue} mask onSubmit={submit} />
          <Box marginTop={1} flexDirection="row" gap={2}>
            <Button label={loading ? 'Logging in…' : 'Login'} shortcut="return" onPress={submit} />
          </Box>
          {error && <Box color="red">{error}</Box>}
        </FocusGroup>
      </Box>
    </Box>
  );
}
