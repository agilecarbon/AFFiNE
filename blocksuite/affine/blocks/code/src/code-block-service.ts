import { ColorScheme } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { LifeCycleWatcher } from '@blocksuite/std';
import { type Signal, signal } from '@preact/signals-core';
import {
  createHighlighterCore,
  createOnigurumaEngine,
  type HighlighterCore,
  type MaybeGetter,
} from 'shiki';
import getWasm from 'shiki/wasm';

import { CodeBlockConfigExtension } from './code-block-config.js';
import {
  CODE_BLOCK_DEFAULT_DARK_THEME,
  CODE_BLOCK_DEFAULT_LIGHT_THEME,
} from './highlight/const.js';

type WorkerHighlighterState = {
  highlighter: HighlighterCore | null;
  promise: Promise<HighlighterCore> | null;
};

const workerHighlighterState: WorkerHighlighterState = {
  highlighter: null,
  promise: null,
};

const getWorkerScopedHighlighter = async (): Promise<HighlighterCore> => {
  if (workerHighlighterState.highlighter) {
    return workerHighlighterState.highlighter;
  }
  if (!workerHighlighterState.promise) {
    workerHighlighterState.promise = createHighlighterCore({
      engine: createOnigurumaEngine(() => getWasm),
    }).then(highlighter => {
      workerHighlighterState.highlighter = highlighter;
      return highlighter;
    });
  }
  return workerHighlighterState.promise;
};

export class CodeBlockHighlighter extends LifeCycleWatcher {
  static override key = 'code-block-highlighter';

  private _darkThemeKey: string | undefined;
  private _lightThemeKey: string | undefined;
  private _isMounted = false;

  highlighter$: Signal<HighlighterCore | null> = signal(null);

  get themeKey() {
    const theme = this.std.get(ThemeProvider).theme$.value;
    return theme === ColorScheme.Dark
      ? this._darkThemeKey
      : this._lightThemeKey;
  }

  private readonly _loadTheme = async (
    highlighter: HighlighterCore
  ): Promise<void> => {
    if (!this._isMounted) {
      return;
    }

    const config = this.std.getOptional(CodeBlockConfigExtension.identifier);
    const darkTheme = config?.theme?.dark ?? CODE_BLOCK_DEFAULT_DARK_THEME;
    const lightTheme = config?.theme?.light ?? CODE_BLOCK_DEFAULT_LIGHT_THEME;
    this._darkThemeKey = (await normalizeGetter(darkTheme)).name;
    this._lightThemeKey = (await normalizeGetter(lightTheme)).name;
    await highlighter.loadTheme(darkTheme, lightTheme);
    if (this._isMounted) {
      this.highlighter$.value = highlighter;
    }
  };

  override mounted(): void {
    super.mounted();

    this._isMounted = true;

    getWorkerScopedHighlighter()
      .then(this._loadTheme)
      .catch(console.error);
  }

  override unmounted(): void {
    this._isMounted = false;
    this.highlighter$.value = null;

    super.unmounted();
  }
}

/**
 * https://github.com/shikijs/shiki/blob/933415cdc154fe74ccfb6bbb3eb6a7b7bf183e60/packages/core/src/internal.ts#L31
 */
export async function normalizeGetter<T>(p: MaybeGetter<T>): Promise<T> {
  return Promise.resolve(typeof p === 'function' ? (p as any)() : p).then(
    r => r.default || r
  );
}
