import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <main style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: '#1a1f2e',
        borderRadius: '12px',
        padding: '40px',
        border: '1px solid #2d3748',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#00ff88',
            letterSpacing: '-0.5px',
            marginBottom: '8px',
          }}>
            ⬡ CPMind
          </div>
          <div style={{
            fontSize: '14px',
            color: '#718096',
          }}>
            Панель аналитика
          </div>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}