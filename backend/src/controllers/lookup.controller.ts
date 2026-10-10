import { validateBody, validateParams } from "@danielsharp/typeline-http";
import { barcodeResponseSchema, iconGroups, iconsResponseSchema, importRequestSchema, importResponseSchema, type IconGroup } from "@dash/core";
import { z } from "zod";
import { jsonSend, ok, weakEtag } from "../http/respond";
import { authedRouter } from "../routers";
import { lookupBarcode } from "../services/barcode.service";
import { importExport } from "../services/import.service";

const icons = {
  icons: (Object.entries(iconGroups) as [IconGroup, (typeof iconGroups)[IconGroup]][]).flatMap(([group, g]) =>
    g.icons.map((d) => ({ icon: d.icon, group, names: d.names })),
  ),
};
const iconsEtag = weakEtag("icons", icons);

export function lookupController() {
  const r = authedRouter.use({ metadata: { tags: ["Lookups"] } });

  r.get("/barcodes/:code", (line) =>
    line
      .pipe(validateParams(z.object({ code: z.string().regex(/^[0-9A-Za-z-]{1,64}$/) })))
      .pipe(async ({ auth, params }) => ok(await lookupBarcode(auth.userId, params.code)))
      .pipe(jsonSend(barcodeResponseSchema, 200)),
  );

  r.get("/icons", (line) => line.pipe(() => ok(icons, iconsEtag)).pipe(jsonSend(iconsResponseSchema, 200)));

  r.post("/import", (line) =>
    line
      .pipe(validateBody(importRequestSchema))
      .pipe(async ({ auth, body }) => ok(await importExport(auth.userId, body)))
      .pipe(jsonSend(importResponseSchema, 200)),
  );
}
