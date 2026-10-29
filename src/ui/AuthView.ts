import { listGames } from '../games/catalog.ts';
import type { GameEntry } from '../types/domain.ts';
import type {
  AuthFieldError,
  AuthFormValues,
  AuthMode,
  AuthTone,
  AuthUser,
} from '../types/auth.ts';

const COPY: Record<AuthMode, readonly [string, string, string, string]> = Object.freeze({
  signin: ['// BEM-VINDO DE VOLTA', 'Acesse sua conta', 'Entre para continuar sua conexão com o Mundo Digital.', 'ENTRAR NO MUNDO DIGITAL'],
  signup: ['// UMA NOVA JORNADA', 'Crie sua conta', 'Seu primeiro passo começa aqui. Confirme seu e-mail para liberar o acesso.', 'CRIAR CONTA'],
  recovery: ['// RECUPERAR CONEXÃO', 'Esqueceu sua senha?', 'Enviaremos as instruções de recuperação, se o endereço estiver apto.', 'ENVIAR INSTRUÇÕES'],
  'new-password': ['// REDEFINIÇÃO SEGURA', 'Defina sua nova senha', 'Escolha uma senha nova para a conta verificada pelo link de recuperação.', 'SALVAR NOVA SENHA'],
  confirmation: ['// CONFIRA SEU E-MAIL', 'O próximo passo é confirmar', 'Siga as instruções enviadas pelo serviço de autenticação.', ''],
  checking: ['// CONEXÃO EM ANDAMENTO', 'Verificando acesso', 'Aguarde a validação segura da sua sessão.', ''],
  'callback-error': ['// NÃO FOI POSSÍVEL CONECTAR', 'Revise seu link de acesso', 'Solicite um novo link ou retorne ao acesso para verificar sua sessão.', ''],
  authenticated: ['// ACESSO AUTORIZADO', 'Conexão estabelecida', 'Bem-vindo ao ReGenesis Arcade.', ''],
  'logout-error': ['// SAÍDA EM ANDAMENTO', 'Acesso encerrado', 'Confirme novamente a saída antes de iniciar outro acesso.', ''],
  'session-error': ['// SESSÃO NÃO VERIFICADA', 'Vamos reconectar sua conta', 'Tente validar sua sessão ou saia para entrar novamente.', ''],
});

const FIELD_TARGETS: Record<AuthFieldError['field'], string> = {
  email: 'auth-email',
  password: 'auth-password',
  confirmPassword: 'auth-confirm',
};

export interface AuthHandlers {
  submit?: (values: AuthFormValues) => void | Promise<void>;
  navigate?: (mode: AuthMode) => void;
  google?: () => void | Promise<void>;
  back?: () => void;
  logout?: () => void | Promise<void>;
  retrySession?: () => void | Promise<void>;
}

export interface AuthViewOptions {
  template: string;
  configured?: boolean;
  configurationMessage?: string;
}

export default class AuthView {
  private readonly root: HTMLElement;
  private readonly configured: boolean;
  private readonly abort = new AbortController();
  private readonly nodes: Record<string, HTMLElement>;
  private readonly tabs: HTMLButtonElement[];
  private handlers: AuthHandlers = {};
  private mode: AuthMode | null = null;

  constructor(root: HTMLElement, { template, configured = true, configurationMessage = '' }: AuthViewOptions) {
    root.innerHTML = template; // Template estático do projeto; dados do usuário usam textContent.
    this.root = root;
    this.configured = configured;
    this.nodes = Object.fromEntries([...root.querySelectorAll('[id]')].map((node) => [node.id, node as HTMLElement]));
    this.tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-auth-mode]')];
    this.on('auth-form', 'submit', (event) => {
      event.preventDefault();
      this.handlers.submit?.(this.values());
    });
    for (const tab of this.tabs) {
      tab.addEventListener(
        'click',
        () => {
          const mode = tab.dataset.authMode;
          if (mode === 'signin' || mode === 'signup') this.handlers.navigate?.(mode);
        },
        { signal: this.abort.signal },
      );
      tab.addEventListener(
        'keydown',
        (event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const target = event.key === 'Home'
            ? this.tabs[0]
            : event.key === 'End'
              ? this.tabs[1]
              : this.tabs.find((button) => button !== tab);
          if (target && !target.disabled) {
            const mode = target.dataset.authMode;
            if (mode === 'signin' || mode === 'signup') this.handlers.navigate?.(mode);
            target.focus();
          }
        },
        { signal: this.abort.signal },
      );
    }
    this.on('auth-forgot', 'click', () => this.handlers.navigate?.('recovery'));
    this.on('auth-google', 'click', () => {
      void this.handlers.google?.();
    });
    this.on('auth-back', 'click', () => this.handlers.back?.());
    this.on('auth-retry-session', 'click', () => {
      void this.handlers.retrySession?.();
    });
    for (const id of ['auth-logout', 'auth-cancel-recovery', 'auth-retry-logout', 'auth-session-logout']) {
      this.on(id, 'click', () => {
        void this.handlers.logout?.();
      });
    }
    this.on('auth-password-toggle', 'click', () => {
      const input = this.input('auth-password');
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      this.button('auth-password-toggle').setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
      this.button('auth-password-toggle').setAttribute('aria-pressed', String(visible));
    });
    this.on('auth-form', 'input', (event) => {
      (event.target as HTMLElement).removeAttribute('aria-invalid');
    });
    if (!configured) {
      this.el('auth-configuration').hidden = false;
      this.el('auth-configuration').textContent =
        configurationMessage ||
        'Configure VITE_SUPABASE_URL e uma chave pública do projeto game-ia em .env.local. Consulte AUTENTICACAO.md.';
    }
  }

  private el(id: string): HTMLElement {
    return this.nodes[id];
  }

  private input(id: string): HTMLInputElement {
    return this.nodes[id] as HTMLInputElement;
  }

  private button(id: string): HTMLButtonElement {
    return this.nodes[id] as HTMLButtonElement;
  }

  private on(id: string, event: string, handler: (event: Event) => void): void {
    this.nodes[id].addEventListener(event, handler, { signal: this.abort.signal });
  }

  bind(handlers: AuthHandlers): void {
    this.handlers = handlers;
  }

  values(): AuthFormValues {
    return {
      email: this.input('auth-email').value,
      password: this.input('auth-password').value,
      confirmPassword: this.input('auth-confirm').value,
    };
  }

  clearPasswords(): void {
    for (const id of ['auth-password', 'auth-confirm']) this.input(id).value = '';
    this.input('auth-password').type = 'password';
    this.button('auth-password-toggle').setAttribute('aria-label', 'Mostrar senha');
    this.button('auth-password-toggle').setAttribute('aria-pressed', 'false');
  }

  clearIdentity(): void {
    this.clearPasswords();
    this.input('auth-email').value = '';
    this.el('auth-user-email').textContent = '';
  }

  fieldError({ field, message }: AuthFieldError): void {
    const target = this.input(FIELD_TARGETS[field]);
    target.setAttribute('aria-invalid', 'true');
    this.message(message, 'error');
    target.focus();
  }

  message(text: string, tone: AuthTone): void {
    const node = this.el('auth-message');
    node.textContent = text;
    node.hidden = !text;
    node.dataset.tone = tone;
    node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  }

  private renderCatalog(games: readonly GameEntry[]): void {
    const list = this.el('auth-games-list') as HTMLUListElement;
    list.replaceChildren();
    for (const game of games) {
      const item = document.createElement('li');
      item.className = 'auth-game-card';
      const title = document.createElement('h3');
      title.textContent = game.title;
      const description = document.createElement('p');
      description.textContent = game.description;
      const status = document.createElement('span');
      status.className = 'auth-game-status';
      status.textContent = game.entry ? 'NO CATÁLOGO' : 'EM BREVE';
      item.append(title, description, status);
      list.append(item);
    }
    list.hidden = games.length === 0;
    this.el('auth-games-empty').hidden = games.length > 0;
    this.el('auth-progress-note').hidden = games.length > 0;
  }

  render({ mode, busy = false, user = null, message = '', tone = 'info' }: {
    mode: AuthMode;
    busy?: boolean;
    user?: AuthUser | null;
    message?: string;
    tone?: AuthTone;
  }): void {
    const changed = mode !== this.mode;
    if (changed) {
      this.clearPasswords();
      for (const input of this.root.querySelectorAll('input')) input.removeAttribute('aria-invalid');
    }
    this.mode = mode;
    const [kicker, title, description, submit] = COPY[mode];
    this.el('auth-kicker').textContent = kicker;
    this.el('auth-title').textContent = title;
    this.el('auth-description').textContent = description;
    this.button('auth-submit').firstElementChild!.textContent = busy ? 'AGUARDE...' : submit;
    const credentials = ['signin', 'signup', 'recovery', 'new-password'].includes(mode);
    const choosing = ['signin', 'signup'].includes(mode);
    const newPassword = ['signup', 'new-password'].includes(mode);
    this.el('auth-tabs').hidden = !choosing;
    for (const tab of this.tabs) {
      const active = tab.dataset.authMode === mode;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    const panel = this.el('auth-form-panel');
    panel.hidden = !credentials;
    if (choosing) {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `auth-tab-${mode}`);
    } else {
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-labelledby', 'auth-title');
    }
    this.el('auth-email-field').hidden = mode === 'new-password';
    this.input('auth-email').required = mode !== 'new-password';
    this.input('auth-email').disabled = busy || mode === 'new-password';
    this.el('auth-password-field').hidden = mode === 'recovery';
    this.input('auth-password').required = mode !== 'recovery';
    this.input('auth-password').disabled = busy || mode === 'recovery';
    this.input('auth-password').autocomplete = newPassword ? 'new-password' : 'current-password';
    this.el('auth-password-hint').hidden = !newPassword;
    this.el('auth-confirm-field').hidden = !newPassword;
    this.input('auth-confirm').required = newPassword;
    this.input('auth-confirm').disabled = busy || !newPassword;
    this.el('auth-forgot').hidden = mode !== 'signin';
    this.el('auth-google-section').hidden = !choosing;
    this.el('auth-entry').hidden = mode !== 'authenticated';
    this.el('auth-user-email').textContent = user?.email ?? '';
    this.el('auth-checking').hidden = mode !== 'checking';
    this.el('auth-back').hidden = !['recovery', 'confirmation', 'callback-error'].includes(mode);
    this.el('auth-cancel-recovery').hidden = mode !== 'new-password';
    this.el('auth-retry-logout').hidden = mode !== 'logout-error';
    this.el('auth-session-actions').hidden = mode !== 'session-error';
    if (mode === 'authenticated') this.renderCatalog(listGames());
    this.root.setAttribute('aria-busy', String(busy));
    for (const button of this.root.querySelectorAll('button')) button.disabled = busy;
    this.button('auth-submit').disabled = busy || !this.configured;
    this.button('auth-google').disabled = busy || !this.configured;
    this.message(message, tone);
    if (changed && mode !== 'checking') {
      this.el('auth-title').tabIndex = -1;
      this.el('auth-title').focus({ preventScroll: true });
    }
  }

  destroy(): void {
    this.abort.abort();
    this.handlers = {};
    this.root.replaceChildren();
  }
}
