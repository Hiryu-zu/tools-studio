
import { Engine } from './engine/Engine.js';
import { effects } from './effects/registry.js';
import { createControls } from './ui/Controls.js';
const app = document.getElementById('app');
if (!app)
    throw new Error('#app not found');
const engine = new Engine(app);
engine.start();
createControls({ engine, effects });
