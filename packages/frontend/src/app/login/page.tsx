import { LoginForm } from '@/components/LoginForm';
import styles from '@/styles/login.module.css';

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>
            CP<span className={styles.logoAccent}>Mind</span>
          </div>
          <div className={styles.subtitle}>Панель аналитики</div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}