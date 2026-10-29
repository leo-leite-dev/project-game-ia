import { readAuthConfig, authRedirectUrl } from './auth/authConfig.ts';
import { captureAuthReturn } from './auth/authReturn.ts';
import { createAuthMetadata } from './auth/authMetadata.ts';
import { createGameAuthClient } from './auth/supabaseClient.ts';
import { createAuthService } from './auth/authService.ts';
import { createCatalogService } from './games/catalogService.ts';
import AuthController from './auth/AuthController.ts';
import AuthView from './ui/AuthView.ts';
import authTemplate from './ui/authScreen.html?raw';
import { AudioController } from './audio/AudioController.ts';
import type { AuthMode } from './types/auth.ts';
import type { AuthConfig } from './auth/authConfig.ts';
import type { StorageLike } from './types/domain.ts';
import './styles/main.scss';

const authReturn = captureAuthReturn(window.location.href, (path) => history.replaceState(null, '', path));
let config: AuthConfig | null = null;
let configurationMessage = '';
try {
  config = readAuthConfig({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
  if (config) authRedirectUrl(window.location.origin);
} catch (error) {
  config = null;
  configurationMessage = error instanceof Error ? error.message : 'Configuração inválida do projeto Supabase.';
}
const view = new AuthView(document.querySelector('#auth-root') as HTMLElement, {
  template: authTemplate,
  configured: config !== null,
  configurationMessage,
});

function readLocalStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    storage.getItem('game-ia:probe');
    return storage;
  } catch {
    return null;
  }
}

const audioStorage = readLocalStorage();
const audio = new AudioController(audioStorage ? { storage: audioStorage } : {});
const audioToggle = document.getElementById('auth-audio-toggle') as HTMLButtonElement | null;
const audioVolume = document.getElementById('auth-audio-volume') as HTMLInputElement | null;

function syncAudioControls(): void {
  const radioStatus = document.getElementById('dashboard-audio-status');
  if (radioStatus) radioStatus.textContent = audio.isMusicPlaying ? 'TOCANDO' : 'PAUSADO';
  if (audioToggle) {
    const playing = audio.isMusicPlaying;
    audioToggle.setAttribute('aria-pressed', String(playing));
    audioToggle.setAttribute('aria-label', playing ? 'Desligar música' : 'Ligar música');
    audioToggle.textContent = playing ? '♫' : '♪';
  }
  if (audioVolume && document.activeElement !== audioVolume) {
    audioVolume.value = String(Math.round(audio.musicVolume * 100));
  }
}

const startMusicFromGesture = (): void => {
  if (!audio.muted && !audio.isMusicPlaying) audio.startMusic();
  syncAudioControls();
};
const handleDocumentClick = (event: Event): void => {
  const target = event.target instanceof Element ? event.target.closest('button, a') : null;
  if (target) audio.playSfx('click');
};
const toggleMusic = (): void => {
  audio.toggleMusic();
  syncAudioControls();
};
const changeVolume = (event: Event): void => {
  const input = event.target;
  if (input instanceof HTMLInputElement) {
    audio.setMusicVolume(Number(input.value) / 100);
    syncAudioControls();
  }
};

audioToggle?.addEventListener('click', toggleMusic);
audioVolume?.addEventListener('input', changeVolume);
document.addEventListener('pointerdown', startMusicFromGesture);
document.addEventListener('click', handleDocumentClick);
syncAudioControls();

function teardown(): void {
  audio.stopMusic();
  audio.dispose();
}

window.addEventListener('pagehide', teardown, { once: true });

if (!config) {
  const render = (mode: AuthMode) => view.render({ mode, busy: false });
  view.bind({ navigate: render, back: () => render('signin') });
  render('signin');
} else {
  const activeConfig = config;
  let metadataStorage: StorageLike;
  const existingStorage = readLocalStorage();
  if (existingStorage) {
    metadataStorage = existingStorage;
  } else {
    const memory = new Map<string, string>();
    metadataStorage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    };
  }
  const metadata = createAuthMetadata(metadataStorage, activeConfig.storageKey);
  const authClient = createGameAuthClient(activeConfig);
  const service = createAuthService({
    client: authClient,
    metadata,
    origin: window.location.origin,
    projectUrl: activeConfig.url,
    withCallbackLock: (operation) =>
      navigator.locks ? navigator.locks.request(`${activeConfig.storageKey}:callback`, operation) : operation(),
  });
  const catalog = createCatalogService(authClient.supabase);
  const controller = new AuthController({ service, view, catalog });
  view.bind({
    submit: (values) => controller.submit(values),
    navigate: (mode) => controller.navigate(mode),
    google: () => controller.google(),
    back: () => (controller.state.mode === 'callback-error' ? controller.refresh() : controller.navigate('signin')),
    logout: () => controller.logout(),
    retrySession: () => controller.refresh(),
    saveGame: (values, editingId) => (editingId ? controller.updateGame(editingId, values) : controller.publishGame(values)),
    deleteGame: (id) => {
      const game = controller.state.adminGames.find((entry) => entry.id === id);
      if (game) return controller.deleteGame(game);
      return Promise.resolve();
    },
    toggleAvailable: (game) => controller.toggleGameAvailability(game),
  });
  void controller.start(authReturn);
  const refresh = () => {
    if (!document.hidden && !controller.state.busy && controller.state.user) void controller.refresh();
  };
  const checkLogout = (event: StorageEvent) => {
    if (event.key === `${activeConfig.storageKey}:logout-pending` && metadata.logoutPending()) {
      controller.signedOut('A saída foi solicitada em outra aba.');
    }
  };
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('storage', checkLogout);
  window.addEventListener(
    'pagehide',
    () => {
      controller.destroy();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('storage', checkLogout);
    },
    { once: true },
  );
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) window.location.reload();
  });
}
