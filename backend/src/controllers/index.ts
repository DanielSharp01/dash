import { authController } from "./auth.controller";
import { frontendController } from "./frontend.controller";
import { swaggerController } from "./swagger.controller";

export function controllers() {
  authController();
  frontendController();
  // Make sure this is the last because it needs the registered routes
  swaggerController();
}
