import './style.css';
import { Engine } from './engine/Engine';
import { effects } from './effects/registry';
import { createControls } from './ui/Controls';

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

const engine = new Engine(app);
engine.start();
createControls({ engine, effects });
