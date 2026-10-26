import { TAMER_NAME } from '../config/tamer.js';
import { validateTamerName } from '../services/tamerStorage.js';

export default class TamerUI {
  constructor({ onSubmit, onContinue, onSelectPedestal, onStepPedestal }) {
    this.onSubmit = onSubmit;
    this.onContinue = onContinue;
    this.onSelectPedestal = onSelectPedestal;
    this.onStepPedestal = onStepPedestal;
    this.savedTamer = null;
    this.toastTimer = 0;
    this.transitionTimer = 0;
    this.activeTab = 'general';

    this.loadingScreen = document.querySelector('#loading-screen');
    this.loadingLabel = document.querySelector('#loading-label');
    this.loadingBar = document.querySelector('#loading-bar');
    this.loadingPercent = document.querySelector('#loading-percent');
    this.loadingTrack = this.loadingBar?.parentElement ?? null;
    this.creationPanel = document.querySelector('#creation-panel');
    this.savedCard = document.querySelector('#saved-tamer');
    this.savedName = document.querySelector('#saved-name');
    this.savedDivider = document.querySelector('#saved-divider');
    this.continueButton = document.querySelector('#continue-button');
    this.form = document.querySelector('#tamer-form');
    this.nameInput = document.querySelector('#tamer-name');
    this.nameCount = document.querySelector('#name-count');
    this.nameError = document.querySelector('#name-error');
    this.confirmButton = document.querySelector('#confirm-button');
    this.modelNote = document.querySelector('#model-note');
    this.transitionOverlay = document.querySelector('#transition-overlay');
    this.transitionTitle = document.querySelector('#transition-title');
    this.transitionName = document.querySelector('#transition-name');
    this.transitionNote = document.querySelector('#transition-note');
    this.roomUI = document.querySelector('#room-ui');
    this.roomTamerName = document.querySelector('#room-tamer-name');
    this.roomSyncLabel = document.querySelector('#room-sync-label');
    this.toast = document.querySelector('#toast');

    this.digimonPanel = document.querySelector('#digimon-panel');
    this.digimonRegistry = document.querySelector('#digimon-registry');
    this.digimonEmpty = document.querySelector('#digimon-empty');
    this.digimonEmptyPedestal = document.querySelector('#digimon-empty-pedestal');
    this.digimonName = document.querySelector('#digimon-name');
    this.digimonKana = document.querySelector('#digimon-kana');
    this.digimonNumber = document.querySelector('#digimon-number');
    this.digimonLevelTag = document.querySelector('#digimon-level-tag');
    this.digimonTypeTag = document.querySelector('#digimon-type-tag');
    this.digimonAttributeTag = document.querySelector('#digimon-attribute-tag');
    this.fieldLevel = document.querySelector('#field-level');
    this.fieldType = document.querySelector('#field-type');
    this.fieldAttribute = document.querySelector('#field-attribute');
    this.fieldAttack = document.querySelector('#field-attack');
    this.fieldAttackOriginal = document.querySelector('#field-attack-original');
    this.evolutionPrevious = document.querySelector('#evolution-previous');
    this.evolutionCurrent = document.querySelector('#evolution-current');
    this.evolutionNext = document.querySelector('#evolution-next');
    this.evolutionNote = document.querySelector('#evolution-note');
    this.digimonDescription = document.querySelector('#digimon-description');
    this.digimonSource = document.querySelector('#digimon-source');
    this.carouselPrev = document.querySelector('#carousel-prev');
    this.carouselNext = document.querySelector('#carousel-next');
    this.carouselDots = document.querySelector('#carousel-dots');
    this.tabButtons = Array.from(document.querySelectorAll('[data-digimon-tab]'));
    this.tabPanels = Array.from(document.querySelectorAll('[data-digimon-panel]'));
    this.statValues = Array.from(document.querySelectorAll('[data-stat]'));

    this.nameInput.maxLength = TAMER_NAME.max;
    this.nameInput.minLength = TAMER_NAME.min;
    this.updateNameCounter();

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitForm();
    });

    this.nameInput.addEventListener('input', () => {
      this.updateNameCounter();

      if (this.nameError.textContent) {
        this.nameError.textContent = '';
      }
    });

    this.continueButton.addEventListener('click', () => {
      if (!this.savedTamer || this.continueButton.disabled) return;
      this.onContinue?.(this.savedTamer);
    });

    for (const button of this.tabButtons) {
      button.addEventListener('click', () => {
        this.setActiveTab(button.dataset.digimonTab);
      });
    }

    this.carouselPrev.addEventListener('click', () => {
      this.onStepPedestal?.(-1);
    });

    this.carouselNext.addEventListener('click', () => {
      this.onStepPedestal?.(1);
    });

    this.carouselDots.addEventListener('click', (event) => {
      const button = event.target.closest('[data-carousel-index]');
      if (!button) return;
      this.onSelectPedestal?.(Number(button.dataset.carouselIndex));
    });
  }

  updateNameCounter() {
    const length = Array.from(this.nameInput.value).length;
    this.nameCount.textContent = `${length}/${TAMER_NAME.max}`;
  }

  submitForm() {
    const result = validateTamerName(this.nameInput.value);

    if (!result.valid) {
      this.showNameError(result.error);
      return;
    }

    this.nameInput.value = result.name;
    this.nameError.textContent = '';
    this.onSubmit?.(result.name);
  }

  showNameError(message) {
    this.nameError.textContent = message;
    this.nameInput.focus();
  }

  setLoadingProgress(progress, label = 'SINCRONIZANDO TAMER') {
    this.loadingLabel.textContent = label;

    if (!Number.isFinite(progress) || progress <= 0) {
      this.loadingTrack.classList.add('is-indeterminate');
      this.loadingBar.style.width = '';
      this.loadingPercent.textContent = '...';
      return;
    }

    const percent = Math.min(100, Math.round(progress * 100));
    this.loadingTrack.classList.remove('is-indeterminate');
    this.loadingBar.style.width = `${percent}%`;
    this.loadingPercent.textContent = `${percent}%`;
  }

  setLoadingLabel(label) {
    this.loadingLabel.textContent = label;
  }

  finishLoading() {
    this.loadingScreen.hidden = true;
    this.creationPanel.hidden = false;

    if (this.savedTamer) {
      this.showSavedTamer(this.savedTamer);
    }
  }

  showSavedTamer(tamer) {
    this.savedTamer = tamer;
    this.savedName.textContent = tamer.name;
    this.savedCard.hidden = false;
    this.savedDivider.hidden = false;
  }

  setReady({ savedTamer = null } = {}) {
    if (savedTamer) {
      this.showSavedTamer(savedTamer);
    }

    this.finishLoading();
  }

  showModelFallback(message) {
    this.modelNote.textContent = message;
    this.modelNote.hidden = false;
    this.showToast(message, { error: true, duration: 6500 });
  }

  setBusy(isBusy) {
    this.nameInput.disabled = isBusy;
    this.confirmButton.disabled = isBusy;
    this.continueButton.disabled = isBusy;
  }

  beginTransition({ title, name, note }) {
    this.setBusy(true);
    this.creationPanel.hidden = true;
    this.transitionTitle.textContent = title;
    this.transitionName.textContent = name;
    this.transitionNote.textContent = note;
    this.transitionOverlay.hidden = false;
    document.body.classList.add('is-transitioning');

    window.clearTimeout(this.transitionTimer);
    requestAnimationFrame(() => {
      this.transitionOverlay.classList.add('is-visible');
    });
  }

  endTransition() {
    this.transitionOverlay.classList.remove('is-visible');
    this.transitionTimer = window.setTimeout(() => {
      this.transitionOverlay.hidden = true;
    }, 600);
  }

  showRoom(name) {
    this.roomTamerName.textContent = name;
    this.roomUI.hidden = false;
    this.digimonPanel.hidden = false;
    this.endTransition();
    document.body.classList.remove('is-transitioning');
    document.body.classList.add('is-room');

    requestAnimationFrame(() => {
      this.roomUI.classList.add('is-visible');
    });
  }

  setActiveTab(tab) {
    const nextTab = this.tabButtons.some(
      (button) => button.dataset.digimonTab === tab,
    )
      ? tab
      : 'general';

    this.activeTab = nextTab;

    for (const button of this.tabButtons) {
      const active = button.dataset.digimonTab === nextTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }

    for (const panel of this.tabPanels) {
      panel.hidden = panel.dataset.digimonPanel !== nextTab;
    }
  }

  showPedestal({ index, total, number, digimon }) {
    const paddedNumber = String(number).padStart(2, '0');
    const paddedTotal = String(total).padStart(2, '0');

    this.carouselDots
      .querySelectorAll('[data-carousel-index]')
      .forEach((button) => {
        const active = Number(button.dataset.carouselIndex) === index;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-current', active ? 'true' : 'false');
      });

    this.roomSyncLabel.textContent = digimon
      ? `PEDESTAL ${paddedNumber}/${paddedTotal} · ${digimon.name.toUpperCase()}`
      : `PEDESTAL ${paddedNumber}/${paddedTotal} · AGUARDANDO REGISTRO`;

    if (!digimon) {
      this.digimonRegistry.hidden = true;
      this.digimonEmpty.hidden = false;
      this.digimonEmptyPedestal.textContent = `PEDESTAL ${paddedNumber}`;
      return;
    }

    this.digimonEmpty.hidden = true;
    this.digimonRegistry.hidden = false;
    this.digimonName.textContent = digimon.name;
    this.digimonKana.textContent = digimon.kana;
    this.digimonNumber.textContent = paddedNumber;
    this.digimonLevelTag.textContent = digimon.levelStage;
    this.digimonTypeTag.textContent = digimon.type;
    this.digimonAttributeTag.textContent = digimon.attribute;

    this.fieldLevel.textContent = `${digimon.level} (${digimon.levelStage})`;
    this.fieldType.textContent = `${digimon.type} · ${digimon.typeOriginal}`;
    this.fieldAttribute.textContent =
      `${digimon.attribute} · ${digimon.attributeOriginal}`;
    this.fieldAttack.textContent = digimon.attack.name;
    this.fieldAttackOriginal.textContent =
      `${digimon.attack.original} · ${digimon.attack.romaji}`;

    for (const element of this.statValues) {
      const value = digimon.stats[element.dataset.stat];
      element.textContent = Number.isFinite(value) ? String(value) : '—';
    }

    this.evolutionPrevious.textContent = digimon.evolution.previous;
    this.evolutionCurrent.textContent = digimon.name;
    this.evolutionNext.textContent = digimon.evolution.next;
    this.evolutionNote.textContent = digimon.evolution.note;
    this.digimonDescription.textContent = digimon.description;

    const source = digimon.sources[0];
    this.digimonSource.href = source.url;
    this.digimonSource.textContent = source.label;

    this.setActiveTab(this.activeTab);
  }

  showToast(message, { error = false, duration = 3600 } = {}) {
    window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.classList.toggle('is-error', error);
    this.toast.hidden = false;

    requestAnimationFrame(() => {
      this.toast.classList.add('is-visible');
    });

    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('is-visible');
      window.setTimeout(() => {
        this.toast.hidden = true;
      }, 260);
    }, duration);
  }
}
