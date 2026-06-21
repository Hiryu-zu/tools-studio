import { Pane } from 'tweakpane';
import type { Engine } from '../engine/Engine';
import type { EffectEntry } from '../engine/types';

/**
 * Tweakpane による共通UI。
 * - エフェクト選択（ドロップダウン）
 * - 再生/一時停止、リセット
 * - 選択中エフェクトの params をフォルダに自動表示（effect.buildControls 経由）
 */
export function createControls(opts: { engine: Engine; effects: EffectEntry[] }): void {
  const { engine, effects } = opts;
  const pane = new Pane({ title: 'Generative Design Studio' });
  const state = { effect: effects[0].id, running: true };
  let paramFolder: ReturnType<Pane['addFolder']> | null = null;

  function loadEffect(id: string): void {
    const entry = effects.find((e) => e.id === id) ?? effects[0];
    const inst = entry.create();
    engine.setEffect(inst);
    if (paramFolder) paramFolder.dispose();
    paramFolder = pane.addFolder({ title: entry.title });
    inst.buildControls?.(paramFolder);
  }

  pane.addBinding(state, 'effect', {
    label: 'エフェクト',
    options: Object.fromEntries(effects.map((e) => [e.title, e.id])),
  }).on('change', (ev) => loadEffect(ev.value as string));

  pane.addBinding(state, 'running', { label: '再生' })
    .on('change', (ev) => engine.setRunning(ev.value as boolean));

  pane.addButton({ title: 'リセット' }).on('click', () => engine.reset());

  loadEffect(state.effect);
}
