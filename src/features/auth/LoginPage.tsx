import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendCode, signIn, getClient, getMe } from '@lib/telegram/client';
import { useSessionStore } from '@state/session';

export default function LoginPage({ redirectTo = '/' }: { redirectTo?: string }) {
	const navigate = useNavigate();
	const { isAuthenticated, setPhone, setPhoneCodeHash, setSessionString, setUser, initFromStorage } = useSessionStore();
	const [step, setStep] = useState<'phone' | 'code' | 'password'>('phone');
	const [phone, setPhoneVal] = useState('');
	const [code, setCode] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		initFromStorage();
	}, [initFromStorage]);

	useEffect(() => {
		if (isAuthenticated) navigate(redirectTo);
	}, [isAuthenticated, navigate, redirectTo]);

	async function onSendCode() {
		try {
			setError(null);
			setLoading(true);
			const { phoneCodeHash } = await sendCode(phone);
			setPhone(phone);
			setPhoneCodeHash(phoneCodeHash);
			setStep('code');
		} catch (e: any) {
			setError(e?.message ?? 'Failed to send code');
		} finally {
			setLoading(false);
		}
	}

	async function onSignIn() {
		try {
			setError(null);
			setLoading(true);
			const state = useSessionStore.getState();
			await signIn(state.phoneNumber!, code, state.phoneCodeHash!, password || undefined);
			const client = await getClient();
			const sessionStr = (client.session as any).save() as string;
			setSessionString(sessionStr);
			const me: any = await getMe();
			setUser({ id: Number(me.id), firstName: me.firstName, lastName: me.lastName, username: me.username });
			navigate(redirectTo);
		} catch (e: any) {
			if (e?.errorMessage === 'SESSION_PASSWORD_NEEDED') {
				setStep('password');
				return;
			}
			setError(e?.message ?? 'Failed to sign in');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="content" style={{ gridTemplateColumns: '1fr' }}>
			<div className="main">
				<div className="card" style={{ maxWidth: 420, margin: '40px auto', padding: 16 }}>
					<h2>Login</h2>
					{step === 'phone' && (
						<div className="col">
							<label className="label">Phone number</label>
							<input className="input" placeholder="+1 555 555 5555" value={phone} onChange={(e) => setPhoneVal(e.target.value)} />
							<button className="btn primary" onClick={onSendCode} disabled={loading || !phone}>Send Code</button>
						</div>
					)}
					{step === 'code' && (
						<div className="col">
							<label className="label">Code</label>
							<input className="input" placeholder="12345" value={code} onChange={(e) => setCode(e.target.value)} />
							<button className="btn primary" onClick={onSignIn} disabled={loading || !code}>Sign in</button>
						</div>
					)}
					{step === 'password' && (
						<div className="col">
							<label className="label">Password (2FA)</label>
							<input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
							<button className="btn primary" onClick={onSignIn} disabled={loading || !password}>Sign in</button>
						</div>
					)}
					{error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
				</div>
			</div>
		</div>
	);
}