import { validateQuery } from "@danielsharp/typeline-http";
import { authedRouter } from "../routers";
import { entryQuery } from "../schemas/entry.schema";

export function entryController() {
  authedRouter.get("/entries", (line) => line.pipe(validateQuery(entryQuery)));
}
