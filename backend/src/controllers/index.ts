import { activityController } from "./activity.controller";
import { authController } from "./auth.controller";
import { commandController } from "./command.controller";
import { entryController } from "./entry.controller";
import { foodController } from "./food.controller";
import { frontendController } from "./frontend.controller";
import { lookupController } from "./lookup.controller";
import { recapController } from "./recap.controller";
import { settingsController } from "./settings.controller";
import { swaggerController } from "./swagger.controller";

export function controllers() {
  authController();
  settingsController();
  foodController();
  activityController();
  entryController();
  commandController();
  lookupController();
  recapController();
  // Make sure this is the last because it needs the registered routes
  swaggerController();
  // After swagger, so the page routes stay out of the API document.
  frontendController();
}
