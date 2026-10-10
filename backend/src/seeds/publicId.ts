import { createHash } from "node:crypto";

/** A public row's id follows from its key, so every environment and every import agrees on it. */
export function publicId(key: string) {
  const h = createHash("sha1").update(`dash-public:${key}`).digest("hex");
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
