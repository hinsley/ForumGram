import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@state/session';
import { assertAccountGeneration, getAccountGeneration, invalidateAccount, onAuthInvalidate } from '@lib/accountScope';

export default function LoginPage({ redirectTo = '/' }: { redirectTo?: string }) {
	const navigate = useNavigate();
	const { isAuthenticated, isBootstrapping, bootstrapError, bootstrap } = useSessionStore();
	const [step, setStep] = useState<'phone' | 'code' | 'password'>('phone');
	const [phone, setPhoneVal] = useState('');
	const [code, setCode] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const attempt = useRef<{ phoneCodeHash: string; generation: number } | null>(null);
	const mounted = useRef(false);
	const operation = useRef(0);
	useEffect(() => {
		mounted.current = true;
		const unsubscribe = onAuthInvalidate(() => {
			attempt.current = null;
			setCode(''); setPassword(''); setStep('phone');
		});
		return () => {
			mounted.current = false;
			operation.current += 1;
			unsubscribe();
			if (attempt.current && !useSessionStore.getState().isAuthenticated && getAccountGeneration() === attempt.current.generation) void invalidateAccount();
		};
	}, []);

	useEffect(() => {
		if (isAuthenticated) navigate(redirectTo);
	}, [isAuthenticated, navigate, redirectTo]);

	async function onSendCode() {
		const operationId = ++operation.current;
		try {
			setError(null); setLoading(true);
			// Intentionally split GramJS from the initial signed-out shell.
			const { sendCode } = await import('@lib/telegram/client');
			if (!mounted.current || operation.current !== operationId) return;
			const pending = sendCode(phone);
			attempt.current = { phoneCodeHash: '', generation: getAccountGeneration() };
			const result = await pending;
			assertAccountGeneration(result.generation);
			if (!mounted.current || operation.current !== operationId) return;
			attempt.current = result;
			setStep('code');
		} catch (error) {
			if (mounted.current && operation.current === operationId && !(error instanceof DOMException && error.name === 'AbortError')) setError(error instanceof Error ? error.message : 'Failed to send code');
		} finally {
			if (mounted.current && operation.current === operationId) setLoading(false);
		}
	}

	async function onSignIn() {
		const currentAttempt = attempt.current;
		if (!currentAttempt) return;
		const operationId = ++operation.current;
		try {
			setError(null); setLoading(true);
			// Intentionally split GramJS from the initial signed-out shell.
			const { signIn } = await import('@lib/telegram/client');
			assertAccountGeneration(currentAttempt.generation);
			if (!mounted.current || operation.current !== operationId) return;
			await signIn(phone, code, currentAttempt.phoneCodeHash, password || undefined, currentAttempt.generation);
			assertAccountGeneration(currentAttempt.generation);
			if (mounted.current && operation.current === operationId) { setCode(''); setPassword(''); navigate(redirectTo); }
		} catch (error) {
			if (!mounted.current || operation.current !== operationId || getAccountGeneration() !== currentAttempt.generation) return;
			if (error && typeof error === 'object' && 'errorMessage' in error && error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
				setStep('password');
			} else setError(error instanceof Error ? error.message : 'Failed to sign in');
		} finally {
			if (mounted.current && operation.current === operationId) setLoading(false);
		}
	}

	return (
		<main className="login-layout">
			<section className="login-intro">
				<h1>ForumGram</h1>
				<p className="lead">Forums on the Telegram network.</p>
			</section>
			<section className="card login-card" aria-labelledby="login-title">
				<h2 id="login-title">{step === 'phone' ? 'Log in' : step === 'code' ? 'Check your Telegram' : 'Two-step verification'}</h2>
				<form className="col login-form" onSubmit={(event) => { event.preventDefault(); if (!loading && !isBootstrapping) void (step === 'phone' ? onSendCode() : onSignIn()); }}>
					{step === 'phone' && (
						<div className="field">
							<label className="label" htmlFor="phone">Phone number</label>
							<input id="phone" className="input" type="tel" autoComplete="tel" placeholder="+1 555 555 5555" value={phone} onChange={(e) => setPhoneVal(e.target.value)} required />
						</div>
					)}
					{step === 'code' && (
						<div className="field">
							<label className="label" htmlFor="login-code">Sign-in code</label>
							<input id="login-code" className="input" inputMode="numeric" autoComplete="one-time-code" placeholder="12345" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
						</div>
					)}
					{step === 'password' && (
						<div className="field">
							<label className="label" htmlFor="login-password">Password</label>
							<input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
						</div>
					)}
					<button className="btn primary" type="submit" disabled={loading || isBootstrapping || !(step === 'phone' ? phone.trim() : step === 'code' ? code.trim() : password)}>{loading || isBootstrapping ? 'Connecting…' : step === 'phone' ? 'Send code' : 'Sign in'}</button>
					{error && <div className="alert" role="alert">{error}</div>}
					{bootstrapError && <div className="alert" role="alert">{bootstrapError} <button className="btn ghost" type="button" onClick={() => void bootstrap()}>Retry saved session</button></div>}
				</form>
			</section>
		</main>
	);
}