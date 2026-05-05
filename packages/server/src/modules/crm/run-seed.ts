import { seedCRM } from './seed-crm';

seedCRM().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
