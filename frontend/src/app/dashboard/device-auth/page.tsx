'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'denied' | 'error' | 'invalid';

function DeviceAuthContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const code = searchParams.get('code') ?? '';

    const [status, setStatus] = useState<Status>('idle');
    const [message, setMessage] = useState('');

    const handleAction = async (action: 'approve' | 'deny') => {
        setStatus('loading');
        try {
            const res = await fetch('/api/auth/device/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userCode: code, action }),
            });

            const data = await res.json();

            if (!res.ok) {
                setStatus('error');
                setMessage(data.message ?? 'Error desconocido al procesar la solicitud.');
                return;
            }

            if (action === 'deny') {
                setStatus('denied');
                setMessage('Has denegado el acceso al dispositivo.');
            } else {
                setStatus('success');
                setMessage('¡Dispositivo autorizado! Puedes cerrar esta pestaña o volver al panel.');
            }
        } catch (err) {
            setStatus('error');
            setMessage('No se pudo conectar con el servidor. Intenta de nuevo.');
        }
    };

    if (!code) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.icon}>⚠️</div>
                    <h1 style={styles.title}>Código inválido</h1>
                    <p style={styles.subtitle}>No se encontró ningún código de dispositivo en la URL.</p>
                    <button style={styles.btnPrimary} onClick={() => router.push('/dashboard')}>
                        Volver al panel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.glowA} />
            <div style={styles.glowB} />
            <div style={styles.card}>
                <div style={styles.securityLine}>
                    <span style={styles.securityDot} />
                    Flujo seguro de autorización de dispositivo
                </div>
                {status === 'idle' && (
                    <>
                        <h1 style={styles.title}>Autorizar dispositivo de escritorio</h1>
                        <p style={styles.subtitle}>
                            Se detectó una solicitud para conectar una app local a tu cuenta de <strong>Cloud Shakes</strong>.
                        </p>
                        <div style={styles.infoGrid}>
                            <div style={styles.infoCard}>
                                <div style={styles.infoLabel}>Aplicación</div>
                                <div style={styles.infoValue}>Cloud Shakes VFS</div>
                            </div>
                            <div style={styles.infoCard}>
                                <div style={styles.infoLabel}>Permisos</div>
                                <div style={styles.infoValue}>Sincronización de archivos</div>
                            </div>
                        </div>
                        <div style={styles.codeBox}>
                            {code.toUpperCase()}
                        </div>
                        <p style={styles.hint}>
                            Verifica que este código coincida exactamente con el de la app de escritorio. Si no coincide, pulsa <strong>Denegar</strong>.
                        </p>
                        <div style={styles.stepsBox}>
                            <div style={styles.step}>1. Comprueba el código en tu aplicación local.</div>
                            <div style={styles.step}>2. Confirma que tú iniciaste este acceso.</div>
                            <div style={styles.step}>3. Autoriza solo si reconoces el dispositivo.</div>
                        </div>
                        <div style={styles.btnRow}>
                            <button style={styles.btnDanger} onClick={() => handleAction('deny')}>
                                ❌ Denegar
                            </button>
                            <button style={styles.btnPrimary} onClick={() => handleAction('approve')}>
                                ✅ Autorizar Dispositivo
                            </button>
                        </div>
                    </>
                )}

                {status === 'loading' && (
                    <>
                        <div style={styles.icon}>⏳</div>
                        <h1 style={styles.title}>Procesando...</h1>
                        <p style={styles.subtitle}>Un momento, estamos procesando tu solicitud.</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div style={styles.icon}>✅</div>
                        <h1 style={styles.title}>¡Autorizado!</h1>
                        <p style={styles.subtitle}>{message}</p>
                        <button style={styles.btnPrimary} onClick={() => router.push('/dashboard')}>
                            Volver al Panel
                        </button>
                    </>
                )}

                {status === 'denied' && (
                    <>
                        <div style={styles.icon}>🚫</div>
                        <h1 style={styles.title}>Acceso Denegado</h1>
                        <p style={styles.subtitle}>{message}</p>
                        <button style={styles.btnPrimary} onClick={() => router.push('/dashboard')}>
                            Volver al Panel
                        </button>
                    </>
                )}

                {(status === 'error' || status === 'invalid') && (
                    <>
                        <div style={styles.icon}>❌</div>
                        <h1 style={styles.title}>Error</h1>
                        <p style={styles.subtitle}>{message}</p>
                        <button style={styles.btnPrimary} onClick={() => setStatus('idle')}>
                            Intentar de nuevo
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function DeviceAuthPage() {
    return (
        <Suspense>
            <DeviceAuthContent />
        </Suspense>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 20% 10%, #f8fbff 0%, #f2f6fc 45%, #eef3f9 100%)',
        padding: '24px',
    },
    glowA: {
        position: 'absolute',
        width: '420px',
        height: '420px',
        borderRadius: '999px',
        filter: 'blur(90px)',
        background: '#60a5fa33',
        top: '-120px',
        left: '-100px',
    },
    glowB: {
        position: 'absolute',
        width: '360px',
        height: '360px',
        borderRadius: '999px',
        filter: 'blur(90px)',
        background: '#93c5fd2b',
        bottom: '-120px',
        right: '-100px',
    },
    card: {
        position: 'relative',
        zIndex: 1,
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
        borderRadius: '22px',
        border: '1px solid #d9e4f2',
        padding: '48px',
        maxWidth: '560px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 30px 70px rgba(21, 54, 99, 0.14)',
    },
    securityLine: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        border: '1px solid #d2e4ff',
        color: '#1d4ed8',
        background: '#eff6ff',
        borderRadius: '999px',
        fontSize: '12px',
        padding: '6px 12px',
        marginBottom: '14px',
        fontFamily: "'Inter', system-ui, sans-serif",
    },
    securityDot: {
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: '#2563eb',
    },
    icon: {
        fontSize: '56px',
        marginBottom: '16px',
    },
    title: {
        fontSize: '28px',
        fontWeight: 700,
        color: '#0f172a',
        margin: '0 0 12px 0',
        fontFamily: "'Inter', system-ui, sans-serif",
    },
    subtitle: {
        fontSize: '15px',
        color: '#475569',
        lineHeight: 1.6,
        margin: '0 0 24px 0',
        fontFamily: "'Inter', system-ui, sans-serif",
    },
    hint: {
        fontSize: '13px',
        color: '#64748b',
        margin: '0 0 28px 0',
        fontFamily: "'Inter', system-ui, sans-serif",
    },
    codeBox: {
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: '34px',
        fontWeight: 600,
        letterSpacing: '6px',
        background: '#ffffff',
        border: '1px solid #c7ddfb',
        borderRadius: '12px',
        padding: '20px',
        color: '#1e40af',
        margin: '0 0 16px 0',
    },
    infoGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        marginBottom: '16px',
    },
    infoCard: {
        textAlign: 'left',
        borderRadius: '12px',
        border: '1px solid #dbe7f7',
        background: '#f8fbff',
        padding: '12px',
    },
    infoLabel: {
        color: '#64748b',
        fontSize: '11px',
        marginBottom: '6px',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        fontFamily: "'Inter', system-ui, sans-serif",
    },
    infoValue: {
        color: '#0f172a',
        fontSize: '13px',
        fontWeight: 600,
        fontFamily: "'Inter', system-ui, sans-serif",
    },
    stepsBox: {
        border: '1px solid #dbe7f7',
        background: '#f8fbff',
        borderRadius: '12px',
        padding: '12px',
        margin: '0 0 24px 0',
        textAlign: 'left',
    },
    step: {
        color: '#334155',
        fontSize: '13px',
        lineHeight: 1.6,
        fontFamily: "'Inter', system-ui, sans-serif",
    },
    btnRow: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        flexWrap: 'wrap',
    },
    btnPrimary: {
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '14px 28px',
        fontSize: '15px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'transform 0.15s, opacity 0.15s',
        fontFamily: "'Inter', system-ui, sans-serif",
    },
    btnDanger: {
        background: '#ffffff',
        color: '#dc2626',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        padding: '14px 28px',
        fontSize: '15px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: "'Inter', system-ui, sans-serif",
    },
};
