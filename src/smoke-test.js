import { runSmokeScenario } from './smoke/scenarios.js';

const scenario = process.argv[2] || 'single';
await runSmokeScenario(scenario);
