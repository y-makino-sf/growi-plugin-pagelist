import { growiReact } from '@growi/pluginkit/dist/v4/client';
import React from 'react';
import type { PluggableList } from 'unified';
import { createSubordinatedPageList } from './src/components/SubordinatedPageList';
import { remarkPageListPlugin } from './src/remark-pagelist';

export const PLUGIN_NAME = 'growi-plugin-pagelist';
interface RendererOptions {
  remarkPlugins?: PluggableList;
  components?: Record<string, unknown>;
  [key: string]: unknown;
}
type Generator = (...args: unknown[]) => RendererOptions;
interface OptionsGenerators {
  customGenerateViewOptions?: Generator;
  generateViewOptions?: Generator;
  customGeneratePreviewOptions?: Generator;
  generatePreviewOptions?: Generator;
}
declare global {
  interface Window {
    pluginActivators?: Record<string, { activate: () => void; deactivate: () => void }>;
  }
}

// 差し替え前の参照を保持し、無効化時には他プラグインの変更を上書きせず復元します。
let restore: (() => void) | undefined;
export const activate = (): void => {
  if (typeof window === 'undefined' || restore) return;
  const generators = window.growiFacade?.markdownRenderer?.optionsGenerators as OptionsGenerators | undefined;
  if (!generators) return;
  const ReactInstance = growiReact(React) ?? window.growiFacade?.react ?? React;
  const Component = createSubordinatedPageList(ReactInstance);
  const restorations: (() => void)[] = [];
  for (const mode of ['View', 'Preview'] as const) {
    const customKey = `customGenerate${mode}Options` as const;
    const previous = generators[customKey];
    const original = previous ?? generators[`generate${mode}Options`];
    const wrapped: Generator = function (...args) {
      const options = original?.apply(generators, args) ?? {};
      return {
        ...options,
        remarkPlugins: [...(options.remarkPlugins ?? []).filter((plugin) => plugin !== remarkPageListPlugin), remarkPageListPlugin],
        components: { ...options.components, 'growi-pagelist': Component },
      };
    };
    generators[customKey] = wrapped;
    restorations.push(() => {
      if (generators[customKey] !== wrapped) return;
      if (previous) generators[customKey] = previous;
      else delete generators[customKey];
    });
  }
  restore = () => restorations.forEach((restoreGenerator) => restoreGenerator());
};
export const deactivate = (): void => { restore?.(); restore = undefined; };

// GROWIのスクリプトローダーが呼び出す固定識別子で登録します。
if (typeof window !== 'undefined') {
  window.pluginActivators ??= {};
  window.pluginActivators[PLUGIN_NAME] = { activate, deactivate };
}