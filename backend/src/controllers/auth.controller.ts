import { randomUUID } from "node:crypto";
import {
  resRedirect,
  validateCookies,
  validateQuery,
} from "@danielsharp/typeline-http";
import { stop, selectInput, tapInput } from "@danielsharp/typeline";
import { rootRouter } from "../routers";
import z from "zod";
import { authCookie, google, session } from "../providers/auth";
import { db } from "../providers/db";
import { UserRepository } from "../repositories/user.repo";
import { ensureProfile } from "../repositories/settings.repo";
import { issuePkce, OAuthError } from "@danielsharp/auth";
import { env } from "../config/env";

const users = new UserRepository(db);
// Built from configuration, not the request, so a proxy in front can't change where Google sends the code.
const googleCallback = `${env.API_HOST}/auth/google/callback`;

export function authController() {
  rootRouter.get("/auth/google/authorize", (line) =>
    line
      .pipe(validateQuery(z.object({ returnTo: z.string().default("/") })))
      .pipe(({ query }, { res }) => {
        const { codeVerifier, codeChallenge } = issuePkce();
        const nonce = randomUUID();
        res.cookie(
          "__Host-auth-google",
          JSON.stringify({
            codeVerifier,
            nonce,
          }),
          {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 5 * 60 * 1000,
          },
        );
        res.redirect(
          google.getAuthorizationUrl({
            redirectUri: googleCallback,
            state: query.returnTo,
            codeChallenge,
            nonce,
          }),
        );
      }),
  );

  rootRouter.get("/auth/google/callback", (line) =>
    line
      .pipe(
        validateCookies(
          z.object({
            "__Host-auth-google": z
              .string()
              .transform((val) => JSON.parse(val))
              .pipe(
                z.object({
                  codeVerifier: z.string(),
                  nonce: z.string(),
                }),
              ),
          }),
        ),
      )
      .pipe(
        validateQuery(
          z.union([
            z.object({
              code: z.string(),
              state: z.string(),
            }),
            z.object({ error: z.string(), error_description: z.string() }),
          ]),
        ),
      )
      .pipe(
        async (
          { cookies: { "__Host-auth-google": authGoogle }, query },
          { res },
        ) => {
          res.clearCookie("__Host-auth-google", { path: "/", secure: true });
          if ("error" in query) {
            res.redirect(
              "/login?error=" + encodeURIComponent(query.error_description),
            );
            return stop();
          }
          const { codeVerifier, nonce } = authGoogle;
          try {
            const identity = await google.getIdentity({
              code: query.code,
              codeVerifier,
              redirectUri: googleCallback,
              nonce,
            });
            const user = await users.upsertFromGoogle(identity);
            await ensureProfile(db, user.id);
            return { session: await session.issue({ userId: user.id, google: identity }), returnTo: query.state };
          } catch (error) {
            if (OAuthError.is(error)) {
              res.redirect("/login?error=oauth_error");
              return stop();
            }
            res.redirect("/login?error=unknown_error");
            return stop();
          }
        },
      )
      .pipe(tapInput(selectInput((x) => x.session, authCookie.set)))
      .pipe(selectInput((x) => x.returnTo, resRedirect(302))),
  );

  rootRouter.get("/auth/logout", (line) =>
    line
      .pipe(async (_, ctx) => {
        const sessionId = await authCookie.read(ctx);
        if (sessionId) {
          await session.revoke(sessionId);
        }
      })
      .pipe((_, ctx) => authCookie.clear(ctx))
      .pipe(selectInput(() => "/login", resRedirect(302))),
  );
}
