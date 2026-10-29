import type { GameEntry, GameFormValues } from '../types/domain.ts';
import type { UserRole } from '../types/auth.ts';

// Cópia da hub pós-login por papel: membro vê texto de jogador; admin
// (dono/editor) vê o texto de publicação.
const HUB_COPY = {
  member: {
    progressTitle: 'Sua coleção está esquentando.',
    progressText: 'Nenhum jogo no ar ainda. Do arcade 8-bit ao neon infinito: escolha um jogo publicado e seu progresso fica salvo na sua conta.',
    empty: 'Nenhum jogo no ar agora — o arcade aquece por aqui.',
  },
  admin: {
    progressTitle: 'Seus jogos, em breve.',
    progressText: 'Nenhum jogo no catálogo ainda. Os jogos que você publicar aparecerão aqui; o progresso de cada jogador fica na própria conta.',
    empty: 'Nenhum jogo no catálogo ainda — publique pelo painel acima.',
  },
} as const;
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
  /** publica (editingId nulo) ou salva edição de um jogo do catálogo */
  saveGame?: (values: GameFormValues, editingId: string | null) => void | Promise<void>;
  deleteGame?: (id: string) => void | Promise<void>;
  toggleAvailable?: (game: GameEntry) => void | Promise<void>;
}

export interface AuthViewOptions {
  template: string;
  configured?: boolean;
  configurationMessage?: string;
}

export default class AuthView {
  private readonly root: HTMLElement;
  private readonly doc: Document;
  private readonly configured: boolean;
  private readonly abort = new AbortController();
  private readonly nodes: Record<string, HTMLElement>;
  private readonly tabs: HTMLButtonElement[];
  private handlers: AuthHandlers = {};
  private mode: AuthMode | null = null;
  private editingGameId: string | null = null;
  private adminGames: GameEntry[] = [];
  private games: GameEntry[] = [];
  private gameRole: UserRole = 'member';
  private readonly audioControls: HTMLElement;

  constructor(root: HTMLElement, { template, configured = true, configurationMessage = '' }: AuthViewOptions) {
    root.innerHTML = template; // Template estático do projeto; dados do usuário usam textContent.
    this.root = root;
    this.doc = root.ownerDocument ?? document;
    this.configured = configured;
    this.nodes = Object.fromEntries([...root.querySelectorAll('[id]')].map((node) => [node.id, node as HTMLElement]));
    this.tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-auth-mode]')];
    this.audioControls = root.querySelector<HTMLElement>('.auth-audio-controls')!;
    this.on('dashboard-search', 'input', () => this.renderGames(this.games, this.gameRole));
    this.on('dashboard-menu-toggle', 'click', () => {
      const entry = this.el('auth-entry');
      const open = entry.classList.toggle('is-menu-open');
      this.button('dashboard-menu-toggle').setAttribute('aria-expanded', String(open));
      this.button('dashboard-menu-toggle').setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    });
    this.on('dashboard-sidebar', 'click', (event) => {
      if ((event.target as Element).closest('a')) {
        this.el('auth-entry').classList.remove('is-menu-open');
        this.button('dashboard-menu-toggle').setAttribute('aria-expanded', 'false');
      }
    });
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
    this.on('auth-admin-form', 'submit', (event) => {
      event.preventDefault();
      const result = this.handlers.saveGame?.(this.gameValues(), this.editingGameId);
      if (result === undefined) return;
      void Promise.resolve(result)
        .then(() => this.resetGameForm())
        .catch(() => undefined);
    });
    this.on('auth-admin-cancel', 'click', () => this.resetGameForm());
    this.on('auth-admin-list', 'click', (event) => this.onAdminListClick(event));
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
    const badge = this.el('auth-role-badge');
    badge.hidden = true;
    badge.textContent = '';
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

  private renderGames(games: readonly GameEntry[], role: UserRole): void {
    this.games = games.filter((game) => game.available);
    this.gameRole = role;
    const copy = HUB_COPY[role];
    this.el('auth-progress-title').textContent = copy.progressTitle;
    this.el('auth-progress-copy').textContent = copy.progressText;
    this.el('auth-games-empty').textContent = copy.empty;
    const list = this.el('auth-games-list') as HTMLUListElement;
    list.replaceChildren();
    const query = this.input('dashboard-search').value.trim().toLocaleLowerCase('pt-BR');
    const visible = this.games.filter((game) =>
      `${game.title} ${game.description} ${game.slug}`.toLocaleLowerCase('pt-BR').includes(query));
    for (const [index, game] of visible.entries()) {
      const item = this.doc.createElement('li');
      item.className = 'auth-game-card';
      const poster = this.doc.createElement('div');
      poster.className = `dashboard-game-poster dashboard-game-poster--${index % 4}`;
      poster.setAttribute('aria-hidden', 'true');
      const posterName = this.doc.createElement('span');
      posterName.textContent = game.title;
      poster.append(posterName);
      const title = this.doc.createElement('h3');
      title.textContent = game.title;
      const description = this.doc.createElement('p');
      description.textContent = game.description;
      item.append(poster, title, description);
      const href = this.safeEntryHref(game.entry);
      if (href) {
        const play = this.doc.createElement('a');
        play.className = 'auth-game-play';
        play.href = href;
        play.textContent = 'JOGAR';
        item.append(play);
      } else {
        const status = this.doc.createElement('span');
        status.className = 'auth-game-status';
        status.textContent = 'EM BREVE';
        item.append(status);
      }
      list.append(item);
    }
    list.hidden = visible.length === 0;
    this.el('auth-games-empty').hidden = visible.length > 0 || (this.games.length === 0 && !query);
    this.el('auth-games-empty').textContent = query ? 'Nenhum jogo corresponde à busca.' : copy.empty;
    this.el('dashboard-empty-shelf').hidden = this.games.length > 0 || query !== '';
    this.el('auth-progress-note').hidden = this.games.length > 0 || query !== '';
    this.el('dashboard-published-count').textContent = String(this.games.length);
    const featured = this.games.find((game) => this.safeEntryHref(game.entry)) ?? this.games[0];
    this.el('dashboard-feature-tag').textContent = featured ? 'EM DESTAQUE' : 'SEU ARCADE';
    this.el('dashboard-feature-title').textContent = featured?.title ?? 'SEU ARCADE COMEÇA AQUI';
    this.el('dashboard-feature-description').textContent = featured?.description || 'Histórias e desafios com espírito de locadora, cores neon e uma coleção feita para você.';
    const href = featured ? this.safeEntryHref(featured.entry) : null;
    const play = this.el('dashboard-feature-play') as HTMLAnchorElement;
    play.hidden = !href;
    if (href) play.href = href;
    this.el('dashboard-feature-pending').hidden = !!href;
  }

  /** Só caminhos internos ou http(s) viram link — bloqueia javascript: e afins. */
  private safeEntryHref(entry: string): string | null {
    const value = entry.trim();
    if (value === '') return null;
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    if (/^https?:\/\//i.test(value)) return value;
    return null;
  }

  /**
   * O painel admin não fica escondido no DOM de usuários comuns: ele é
   * REMOVIDO da árvore quando o papel não é admin e reinserido quando é.
   * A autoridade continua sendo o RLS no servidor; aqui só espelhamos.
   */
  private showAdminPanel(visible: boolean): HTMLElement | null {
    const panel = this.nodes['auth-admin'];
    const nav = this.nodes['dashboard-admin-nav'];
    if (visible) {
      if (!panel.isConnected) this.el('dashboard-admin-slot').append(panel);
      if (!nav.isConnected) this.el('dashboard-sidebar').insertBefore(nav, this.root.querySelector('.dashboard-sidebar-quote'));
      panel.hidden = false;
      nav.hidden = false;
      return panel;
    }
    if (panel.isConnected) panel.remove();
    if (nav.isConnected) nav.remove();
    return null;
  }

  private renderAdminPanel(adminGames: readonly GameEntry[], message: string, busy: boolean, visible: boolean): void {
    this.adminGames = [...adminGames];
    const panel = this.showAdminPanel(visible);
    if (!panel) return;
    const messageNode = this.el('auth-admin-message');
    messageNode.textContent = message;
    messageNode.hidden = !message;
    const list = this.el('auth-admin-list') as HTMLUListElement;
    list.replaceChildren();
    for (const game of adminGames) {
      const item = this.doc.createElement('li');
      item.className = 'auth-admin-row';
      const info = this.doc.createElement('div');
      info.className = 'auth-admin-row-info';
      const title = this.doc.createElement('strong');
      title.textContent = game.title;
      const meta = this.doc.createElement('span');
      meta.textContent = `${game.slug} · ${game.available ? 'PUBLICADO' : 'RASCUNHO'}`;
      meta.className = game.available ? 'auth-admin-badge is-published' : 'auth-admin-badge';
      info.append(title, meta);
      const actions = this.doc.createElement('div');
      actions.className = 'auth-admin-row-actions';
      for (const [label, action] of [['Editar', 'edit'], ['Despublicar/Publicar', 'toggle'], ['Excluir', 'delete']] as const) {
        const control = this.doc.createElement('button');
        control.type = 'button';
        control.className = 'auth-admin-action';
        control.textContent = label;
        control.disabled = busy;
        control.dataset.gameAction = action;
        control.dataset.gameId = game.id;
        actions.append(control);
      }
      item.append(info, actions);
      list.append(item);
    }
    for (const control of panel.querySelectorAll('button, input')) {
      (control as HTMLButtonElement).disabled = busy;
    }
    this.el('auth-admin-cancel').hidden = this.editingGameId === null || busy;
  }

  private gameValues(): GameFormValues {
    return {
      slug: this.input('game-slug').value.trim(),
      title: this.input('game-title').value.trim(),
      description: this.input('game-description').value.trim(),
      entry: this.input('game-entry').value.trim(),
      available: this.input('game-available').checked,
    };
  }

  private resetGameForm(): void {
    this.input('game-slug').value = '';
    this.input('game-title').value = '';
    this.input('game-description').value = '';
    this.input('game-entry').value = '';
    this.input('game-available').checked = false;
    this.editingGameId = null;
    this.button('auth-admin-submit').firstElementChild!.textContent = 'PUBLICAR JOGO';
    this.el('auth-admin-cancel').hidden = true;
  }

  private fillGameForm(game: GameEntry): void {
    this.input('game-slug').value = game.slug;
    this.input('game-title').value = game.title;
    this.input('game-description').value = game.description;
    this.input('game-entry').value = game.entry;
    this.input('game-available').checked = game.available;
    this.editingGameId = game.id;
    this.button('auth-admin-submit').firstElementChild!.textContent = 'SALVAR ALTERAÇÕES';
    this.el('auth-admin-cancel').hidden = false;
  }

  private onAdminListClick(event: Event): void {
    const target = event.target as Element | null;
    const control = target?.closest?.('[data-game-action]') as { dataset: { gameAction?: string; gameId?: string } } | null;
    const action = control?.dataset.gameAction;
    const id = control?.dataset.gameId;
    if (!action || !id) return;
    const game = this.adminGames.find((entry) => entry.id === id);
    if (!game) return;
    if (action === 'edit') {
      this.fillGameForm(game);
      return;
    }
    if (action === 'toggle') {
      void this.handlers.toggleAvailable?.(game);
      return;
    }
    if (action === 'delete' && globalThis.confirm(`Excluir "${game.title}" do catálogo?`)) {
      void this.handlers.deleteGame?.(game.id);
    }
  }

  render({ mode, busy = false, user = null, message = '', tone = 'info', games = [], adminGames = [], catalogMessage = '', catalogBusy = false }: {
    mode: AuthMode;
    busy?: boolean;
    user?: AuthUser | null;
    message?: string;
    tone?: AuthTone;
    games?: readonly GameEntry[];
    adminGames?: readonly GameEntry[];
    catalogMessage?: string;
    catalogBusy?: boolean;
  }): void {
    const changed = mode !== this.mode;
    const authenticated = mode === 'authenticated';
    this.root.classList.toggle('is-dashboard', authenticated);
    (authenticated ? this.el('dashboard-audio-slot') : this.el('auth-footer-audio-slot')).append(this.audioControls);
    if (changed) {
      this.clearPasswords();
      this.resetGameForm();
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
    const avatar = (user?.email?.trim().charAt(0) || 'R').toLocaleUpperCase('pt-BR');
    this.el('dashboard-avatar').textContent = avatar;
    this.el('dashboard-top-avatar').textContent = avatar;
    const badge = this.el('auth-role-badge');
    if (user) {
      badge.hidden = false;
      badge.dataset.role = user.role;
      badge.textContent = user.role === 'admin' ? 'PAPEL: ADMIN' : 'PAPEL: MEMBRO';
    } else {
      badge.hidden = true;
      badge.textContent = '';
      delete badge.dataset.role;
    }
    this.el('auth-checking').hidden = mode !== 'checking';
    this.el('auth-back').hidden = !['recovery', 'confirmation', 'callback-error'].includes(mode);
    this.el('auth-cancel-recovery').hidden = mode !== 'new-password';
    this.el('auth-retry-logout').hidden = mode !== 'logout-error';
    this.el('auth-session-actions').hidden = mode !== 'session-error';
    if (mode === 'authenticated') {
      this.renderGames(games, user?.role ?? 'member');
    } else {
      this.showAdminPanel(false);
      this.el('auth-entry').classList.remove('is-menu-open');
    }
    this.root.setAttribute('aria-busy', String(busy));
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = busy || button.classList.contains('dashboard-nav-item');
    }
    this.button('auth-submit').disabled = busy || !this.configured;
    this.button('auth-google').disabled = busy || !this.configured;
    if (authenticated) this.renderAdminPanel(adminGames, catalogMessage, catalogBusy || busy, user?.role === 'admin');
    this.message(message, tone);
    if (changed && mode !== 'checking') {
      const heading = authenticated ? this.el('dashboard-feature-title') : this.el('auth-title');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  destroy(): void {
    this.abort.abort();
    this.handlers = {};
    this.root.replaceChildren();
  }
}
