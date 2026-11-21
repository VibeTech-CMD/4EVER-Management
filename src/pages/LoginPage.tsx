import React, { useState } from 'react';
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { Eye, EyeOff, Lock, Mail, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { FourEverFullLogo, Monogram4E } from '../components/BrandMarks';

interface LoginPageProps {
  accessDeniedMessage?: string | null;
  onClearAccessDenied?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  accessDeniedMessage,
  onClearAccessDenied,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha inválidos. Verifique suas credenciais e tente novamente.';
      case 'auth/invalid-email':
        return 'O formato do e-mail informado é inválido.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar novamente.';
      case 'auth/operation-not-allowed':
      case 'auth/configuration-not-found':
        return 'Login por e-mail/senha ainda não está habilitado no Firebase Console (Authentication → Sign-in method). Use o botão "Entrar com Google" ou habilite o provedor E-mail/Senha no Console.';
      case 'auth/popup-closed-by-user':
        return 'A janela de autenticação Google foi fechada antes da conclusão.';
      case 'auth/popup-blocked':
        return 'O navegador bloqueou o pop-up do Google. Permita pop-ups para este domínio e tente novamente.';
      default:
        return err instanceof Error ? err.message : 'Não foi possível concluir o acesso.';
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    onClearAccessDenied?.();

    if (!email.trim() || !password) {
      setErrorMsg('Informe seu e-mail e senha.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    onClearAccessDenied?.();
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    if (!email.trim()) {
      setErrorMsg('Digite seu e-mail no campo acima para receber o link de recuperação de senha.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfoMsg(`E-mail de redefinição enviado para ${email.trim()}. Verifique sua caixa de entrada.`);
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F3EE] flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-5xl w-full mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 bg-white border border-[#D6CEC1] rounded-xl overflow-hidden">
        {/* Left Brand Panel */}
        <div className="lg:col-span-5 bg-[#30483B] text-[#F5F3EE] p-8 sm:p-10 flex flex-col justify-between gap-8">
          <div className="space-y-6 text-center flex flex-col items-center">
            <div className="py-2 flex justify-center w-full">
              <FourEverFullLogo variant="light-on-dark" className="h-16 sm:h-20 w-auto" />
            </div>
            <div className="h-px bg-[#A99A83]/35 w-20 mx-auto" />
            <div className="space-y-2.5 max-w-sm">
              <h1 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F3EE] leading-snug lining-nums">
                4EVER Management
              </h1>
              <p className="text-sm text-[#F5F3EE]/85 leading-relaxed">
                Plataforma interna da 4EVER Assessoria e Cerimonial para operação de casamentos, simulação de orçamentos, controle financeiro e gestão de equipe.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t border-[#F5F3EE]/15">
            <div className="flex items-center gap-3.5">
              <Monogram4E variant="on-dark" size={38} />
              <div>
                <p className="text-xs font-semibold text-[#F5F3EE]">Acesso Restrito à Equipe</p>
                <p className="text-xs text-[#A99A83]">
                  Controle por perfis e auditoria ativa
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Authentication Form Panel */}
        <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-center">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <h2 className="font-sans text-2xl font-bold tracking-tight text-[#1F2A24]">
                Entrar na plataforma
              </h2>
              <p className="text-sm text-[#5C554C] mt-1">
                Autentique-se com sua conta corporativa autorizada.
              </p>
            </div>

            {(errorMsg || accessDeniedMessage) && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 bg-[#FCEEEE] border border-[#A6342F]/25 rounded-lg text-xs text-[#A6342F]"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{accessDeniedMessage || errorMsg}</span>
              </div>
            )}

            {infoMsg && (
              <div
                role="status"
                className="flex items-start gap-2.5 p-3.5 bg-[#ECF6F0] border border-[#1F6E43]/25 rounded-lg text-xs text-[#1F6E43]"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{infoMsg}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#30483B] text-white text-sm font-medium rounded-lg hover:bg-[#24372D] disabled:opacity-60 transition-colors cursor-pointer"
            >
              <span>{loading ? 'Autenticando...' : 'Entrar com Google'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-[#D6CEC1]" />
              <span className="shrink-0 mx-3 text-xs text-[#5C554C]">ou acesse com e-mail e senha</span>
              <div className="flex-grow border-t border-[#D6CEC1]" />
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-[#594634] mb-1.5">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#A99A83] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@4ever.com.br"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-[#D6CEC1] rounded-lg text-sm text-[#1F2A24] placeholder:text-[#A99A83] focus:border-[#30483B] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-xs font-medium text-[#594634]">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-xs font-medium text-[#30483B] hover:underline cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#A99A83] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-[#D6CEC1] rounded-lg text-sm text-[#1F2A24] placeholder:text-[#A99A83] focus:border-[#30483B] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5C554C] hover:text-[#1F2A24] cursor-pointer"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#F5F3EE] text-[#30483B] border border-[#30483B]/30 text-sm font-semibold rounded-lg hover:bg-[#E8E3D9] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {loading ? 'Validando acesso...' : 'Entrar com e-mail'}
              </button>
            </form>
          </div>
        </div>
      </div>

      <footer className="max-w-5xl w-full mx-auto pt-4 grid grid-cols-1 sm:grid-cols-3 items-center gap-2 text-xs text-[#5C554C]">
        <span className="text-center sm:text-left">Uso Exclusivo da 4EVER</span>
        <span className="text-center">
          App by{' '}
          <a
            href="https://vibetech-cmd.github.io/VIBETECH/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold tracking-wider text-[#594634] hover:text-[#30483B] underline underline-offset-2 transition-colors"
          >
            VibeTech|CMD
          </a>
        </span>
        <span className="hidden sm:block" />
      </footer>
    </div>
  );
};
