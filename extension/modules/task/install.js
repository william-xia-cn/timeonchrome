import { activateOptionalModule } from '../../runtime/optional-module-host.js';
import { createOptionalModule } from './index.js';

void activateOptionalModule(createOptionalModule());