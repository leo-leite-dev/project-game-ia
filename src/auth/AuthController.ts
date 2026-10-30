import {
  authErrorCode,
  authErrorMessage,
  CONFIRMATION_MESSAGE,
  RECOVERY_MESSAGE,
  validateAuthFields,
} from './authErrors.ts';
import type { AuthService } from './authService.ts';
import type { AuthReturn } from './authReturn.ts';
import type { CatalogService, GameEntry, GameFormValues } from '../types/domain.ts';
import type {
  AuthFieldError,
  AuthFormValues,
  AuthMode,
  AuthSessionState,
  AuthTone,
  AuthViewState,
} from '../types/auth.ts';

interface AuthViewLike {
  render(state: AuthViewState): void;
  clearIdentity(): void;
  clearPasswords(): void;
  fieldError(error: AuthFieldError): void;
}

export interface AuthControllerOptions {
  service: AuthService;
  view: AuthViewLike;
  catalog?: CatalogService;
  navigateExternal?: (url: string) => void;
  now?: () => number;
}

type ExpiryTimerHandle = ReturnType<typeof setTimeout> & { unref?: () => void };

const ACTIONABLE_EVENTS = ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY'];

export default class AuthController {
  private readonly service: AuthService;
  private readonly view: AuthViewLike;
  private readonly catalog: CatalogService | null;
  private readonly navigateExternal: (url: string) => void;
  private readonly now: () => number;
  private epoch = 0;
  private expiryTimer: ExpiryTimerHandle | null = null;
  private signingOut = false;
  private destroyed = false;
  private started = false;
  private unsubscribe: (() => void) | undefined;
  state: AuthViewState = {
    mode: 'checking',
    busy: true,
    user: null,
    message: 'Verificando sua sessão...',
    tone: 'info',
    games: [],
    adminGames: [],
    catalogMessage: '',
    catalogBusy: false,
  };

  constructor({ service, view, catalog, navigateExternal = (url) => globalThis.location.assign(url), now = Date.now }: AuthControllerOptions) {
    this.service = service;
    this.view = view;
    this.catalog = catalog ?? null;
    this.navigateExternal = navigateExternal;
    this.now = now;
  }

  render(patch: Partial<AuthViewState>): void {
    this.state = { ...this.state, ...patch };
    this.view.render(this.state);
  }

  dropIdentity(): void {
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer);
    this.view.clearIdentity();
    this.state.user = null;
    this.state.games = [];
    this.state.adminGames = [];
    this.state.catalogMessage = '';
  }

  signedOut(message = ''): void {
    ++this.epoch;
    this.dropIdentity();
    this.service.metadata.clearRecovery();
    this.render({ mode: 'signin', busy: false, user: null, message, tone: 'info' });
  }

  applySession(session: AuthSessionState | null, recovery = false): void {
    if (!session) {
      this.signedOut(this.state.user ? 'Sua sessão terminou. Entre novamente. Seus salvamentos locais foram preservados.' : '');
      return;
    }
    const sameOwner = this.state.user?.id === session.user.id;
    if (!sameOwner || recovery) this.dropIdentity();
    const mode: AuthMode = recovery ? 'new-password' : 'authenticated';
    this.render({ user: session.user, mode, busy: false, message: '', tone: 'info' });
    if (mode === 'authenticated') void this.loadCatalog();
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer);
    const expiresAt = session.expiresAt;
    if (expiresAt) {
      this.expiryTimer = setTimeout(
        () => {
          void this.refresh();
        },
        Math.min(2147483647, Math.max(1000, expiresAt * 1000 - this.now() + 100)),
      ) as ExpiryTimerHandle;
      this.expiryTimer.unref?.();
    }
  }

  async start(authReturn: AuthReturn | null = null): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.unsubscribe = this.service.subscribe((event, userId) => this.onAuthEvent(event, userId));
    this.render(this.state);
    if (this.service.metadata.logoutPending()) return this.logout();
    if (!authReturn) return this.refresh();
    await this.run(
      'callback',
      async () => this.service.finishReturn(authReturn),
      (session) => {
        this.applySession(session, session.recovery);
      },
      'callback-error',
    );
  }

  onAuthEvent(event: string, userId: string | null): void {
    if (this.destroyed || event === 'INITIAL_SESSION') return;
    if (event === 'SIGNED_OUT') {
      if (!this.signingOut && (this.state.user || this.state.busy)) {
        this.signedOut('Sua sessão terminou. Entre novamente. Seus salvamentos locais foram preservados.');
      }
      return;
    }
    if (this.state.user && userId && this.state.user.id !== userId) {
      ++this.epoch;
      this.dropIdentity();
      this.render({ mode: 'checking', busy: false, message: 'Verificando a troca de conta...' });
    }
    if (this.state.busy || this.signingOut) return;
    if (ACTIONABLE_EVENTS.includes(event)) {
      void this.refresh(event === 'PASSWORD_RECOVERY');
    }
  }

  async refresh(recoveryEvent = false): Promise<void> {
    if (this.destroyed || this.signingOut) return;
    const epoch = ++this.epoch;
    const previousUser = this.state.user;
    if (!previousUser) this.render({ mode: 'checking', busy: true });
    try {
      const session = await this.service.verifiedSession();
      if (this.destroyed || epoch !== this.epoch) return;
      if (session && recoveryEvent) this.service.metadata.setRecovery(session.user.id);
      const recovery = session !== null && this.service.metadata.recoveryUser() === session.user.id;
      if (session && !recovery) this.service.metadata.clearRecovery();
      this.applySession(session, recovery);
    } catch (error) {
      if (this.destroyed || epoch !== this.epoch) return;
      this.dropIdentity();
      this.render({ mode: 'session-error', busy: false, message: authErrorMessage(error), tone: 'error' });
    }
  }

  navigate(mode: AuthMode): void {
    if (this.state.busy || this.state.user || !['signin', 'signup', 'recovery'].includes(mode)) return;
    ++this.epoch;
    this.view.clearPasswords();
    this.render({ mode, message: '', tone: 'info' });
  }

  async run<T>(
    action: string,
    operation: () => Promise<T>,
    success: (result: T) => void | Promise<void>,
    errorMode: AuthMode = this.state.mode,
  ): Promise<void> {
    if (this.state.busy && this.state.mode !== 'checking') return;
    const epoch = ++this.epoch;
    this.render({ busy: true, message: '', tone: 'info' });
    this.view.clearPasswords();
    try {
      const result = await operation();
      if (!this.destroyed && epoch === this.epoch) await success(result);
    } catch (error) {
      if (!this.destroyed && epoch === this.epoch) {
        const code = authErrorCode(error);
        const accountChanged = ['already-signed-in', 'account-changed'].includes(code ?? '');
        if (accountChanged) this.dropIdentity();
        const mode: AuthMode = accountChanged
          ? 'session-error'
          : code === 'logout-pending'
            ? 'logout-error'
            : errorMode;
        const tone: AuthTone = 'error';
        this.render({ mode, busy: false, message: authErrorMessage(error, action), tone });
      }
    } finally {
      if (!this.destroyed && epoch === this.epoch && this.state.busy) this.render({ busy: false });
    }
  }

  submit(values: AuthFormValues): Promise<void> | undefined {
    const mode = this.state.mode;
    if (this.state.busy || !['signin', 'signup', 'recovery', 'new-password'].includes(mode)) return undefined;
    const invalid = validateAuthFields(mode, values);
    if (invalid) {
      this.view.fieldError(invalid);
      return undefined;
    }
    const email = String(values.email ?? '').trim();
    if (mode === 'signin') {
      return this.run(mode, () => this.service.signIn(email, values.password ?? ''), (session) => this.applySession(session));
    }
    if (mode === 'signup') {
      return this.run(mode, () => this.service.signUp(email, values.password ?? ''), (session) => {
        if (session) this.applySession(session);
        else this.render({ mode: 'confirmation', busy: false, message: CONFIRMATION_MESSAGE, tone: 'success' });
      });
    }
    if (mode === 'recovery') {
      return this.run(mode, () => this.service.requestRecovery(email), () => {
        this.render({ busy: false, message: RECOVERY_MESSAGE, tone: 'success' });
      });
    }
    const owner = this.state.user?.id;
    return this.run(mode, () => this.service.updatePassword(owner, values.password ?? ''), async () => {
      await this.logout('Senha atualizada. Entre com sua nova senha.');
    });
  }

  google(): Promise<void> | undefined {
    if (this.state.user) return undefined;
    return this.run('google', () => this.service.googleUrl(), (url) => this.navigateExternal(url));
  }

  async logout(message = 'Você saiu da conta. Seus salvamentos locais foram preservados.'): Promise<void> {
    const epoch = ++this.epoch;
    this.signingOut = true;
    this.dropIdentity();
    this.render({ mode: 'checking', busy: true, message: 'Encerrando acesso...' });
    try {
      await this.service.signOut();
      if (!this.destroyed && epoch === this.epoch) this.render({ mode: 'signin', busy: false, message, tone: 'success' });
    } catch (error) {
      if (!this.destroyed && epoch === this.epoch) {
        this.render({ mode: 'logout-error', busy: false, message: authErrorMessage(error, 'signout'), tone: 'error' });
      }
    } finally {
      this.signingOut = false;
    }
  }

  async loadCatalog(): Promise<void> {
    const user = this.state.user;
    if (!this.catalog || !user || this.state.mode !== 'authenticated' || this.destroyed) return;
    const epoch = this.epoch;
    try {
      let games: GameEntry[];
      let adminGames = this.state.adminGames;
      if (user.role === 'admin') {
        adminGames = await this.catalog.listFor('admin');
        games = adminGames.filter((game) => game.available);
      } else {
        games = await this.catalog.listFor('member');
      }
      if (this.destroyed || epoch !== this.epoch) return;
      this.render({ games, adminGames, catalogMessage: '' });
    } catch {
      if (this.destroyed || epoch !== this.epoch) return;
      this.render({ catalogMessage: 'Não foi possível carregar o catálogo. Verifique a conexão e tente novamente.' });
    }
  }

  private async runCatalogAction(operation: () => Promise<unknown>, successMessage: string): Promise<void> {
    const catalog = this.catalog;
    const user = this.state.user;
    if (!catalog || !user || user.role !== 'admin' || this.state.catalogBusy) return;
    this.render({ catalogBusy: true, catalogMessage: '' });
    try {
      await operation();
      const adminGames = await catalog.listFor('admin');
      if (this.destroyed) return;
      this.render({
        games: adminGames.filter((game) => game.available),
        adminGames,
        catalogBusy: false,
        catalogMessage: successMessage,
      });
    } catch (error) {
      if (this.destroyed) return;
      this.render({
        catalogBusy: false,
        catalogMessage: error instanceof Error ? error.message : 'Falha no catálogo. Tente novamente.',
      });
      throw error;
    }
  }

  publishGame(values: GameFormValues): Promise<void> {
    return this.runCatalogAction(
      async () => {
        if (!this.catalog) throw new Error('Catálogo indisponível.');
        // Capa primeiro: se o envio falhar, nada é criado no catálogo.
        const coverPath = values.cover ? await this.catalog.uploadCover(values.cover) : undefined;
        await this.catalog.create({
          slug: values.slug,
          title: values.title,
          description: values.description,
          entry: values.entry,
          available: values.available,
          sortOrder: 0,
          ...(coverPath ? { coverPath } : {}),
        });
      },
      'Jogo salvo no catálogo.',
    );
  }

  updateGame(id: string, values: GameFormValues): Promise<void> {
    return this.runCatalogAction(
      async () => {
        if (!this.catalog) throw new Error('Catálogo indisponível.');
        const coverPath = values.cover ? await this.catalog.uploadCover(values.cover) : undefined;
        await this.catalog.update(id, {
          slug: values.slug,
          title: values.title,
          description: values.description,
          entry: values.entry,
          available: values.available,
          ...(coverPath ? { coverPath } : {}),
        });
      },
      'Alterações salvas.',
    );
  }

  toggleGameAvailability(game: GameEntry): Promise<void> {
    return this.runCatalogAction(
      () => {
        if (!this.catalog) throw new Error('Catálogo indisponível.');
        return this.catalog.update(game.id, { available: !game.available });
      },
      game.available ? `"${game.title}" saiu do catálogo público.` : `"${game.title}" está publicado.`,
    );
  }

  deleteGame(game: GameEntry): Promise<void> {
    return this.runCatalogAction(
      () => {
        if (!this.catalog) throw new Error('Catálogo indisponível.');
        return this.catalog.remove(game.id);
      },
      `"${game.title}" foi excluído do catálogo.`,
    );
  }

  destroy(): void {
    this.destroyed = true;
    ++this.epoch;
    this.unsubscribe?.();
    this.dropIdentity();
  }
}
