import { authController } from "./auth.controller";
import { swaggerController } from "./swagger.controller";

export function controllers() {
  authController();
  // Make sure this is the last because it needs the registered routes
  swaggerController();
}
