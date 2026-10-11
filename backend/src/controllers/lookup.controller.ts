import { validateBody, validateParams } from "@danielsharp/typeline-http";
import { barcodeResponseSchema, iconGroups, iconsResponseSchema, importRequestSchema, importResponseSchema, productResponseSchema, type IconGroup } from "@dash/core";
import { z } from "zod";
import { jsonSend, ok, weakEtag } from "../http/respond";
import { authedRouter } from "../routers";
import { lookupBarcode, productForBarcode } from "../services/barcode.service";
import { importExport } from "../services/import.service";

const icons = {
  icons: (Object.entries(iconGroups) as [IconGroup, (typeof iconGroups)[IconGroup]][]).flatMap(([group, g]) =>
    g.icons.map((d) => ({ icon: d.icon, group, names: d.names })),
  ),
};
const iconsEtag = weakEtag("icons", icons);
const codeParams = z.object({ code: z.string().regex(/^[0-9A-Za-z-]{1,64}$/) });

export function lookupController() {
  const r = authedRouter.use({ metadata: { tags: ["Lookups"] } });

  r.get("/barcodes/:code", (line) =>
    line
      .pipe(validateParams(codeParams))
      .pipe(async ({ auth, params }) => ok(await lookupBarcode(auth.userId, params.code)))
      .pipe(jsonSend(barcodeResponseSchema, 200)),
  );

  r.get("/barcodes/:code/product", (line) =>
    line
      .pipe(validateParams(codeParams))
      .pipe(async ({ params }) => ok(await productForBarcode(params.code)))
      .pipe(jsonSend(productResponseSchema, 200)),
  );

  r.get("/icons", (line) => line.pipe(() => ok(icons, iconsEtag)).pipe(jsonSend(iconsResponseSchema, 200)));

  r.post("/import", (line) =>
    line
      .pipe(validateBody(importRequestSchema))
      .pipe(async ({ auth, body }) => ok(await importExport(auth.userId, body)))
      .pipe(jsonSend(importResponseSchema, 200)),
  );
}
