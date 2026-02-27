import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import axios from "axios";
import { prisma } from "../db/prisma.js";

function base64url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeVerifier() {
  return base64url(crypto.randomBytes(32));
}

function makeChallenge(verifier: string) {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}

interface StartQuery {
  userId?: string;
}

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface TeslaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function teslaAuthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: StartQuery }>("/auth/tesla/start", async (req, reply) => {
    const userId = req.query.userId;

    if (!userId) {
      return reply.code(400).send({ ok: false, error: "missing userId" });
    }

    const verifier = makeVerifier();
    const challenge = makeChallenge(verifier);
    const state = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.teslaOAuthSession.create({
      data: {
        state,
        verifier,
        userId,
        expiresAt,
      },
    });

    const params = new URLSearchParams({
      client_id: process.env.TESLA_CLIENT_ID!,
      redirect_uri: process.env.TESLA_REDIRECT_URI!,
      response_type: "code",
      scope: process.env.TESLA_SCOPES ?? "openid offline_access",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    const authUrl = `${process.env.TESLA_AUTH_URL!}?${params.toString()}`;
    return reply.redirect(authUrl);
  });

  app.get<{ Querystring: CallbackQuery }>("/auth/tesla/callback", async (req, reply) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return reply.redirect(
        `${process.env.APP_DEEP_LINK}?linked=0&error=${encodeURIComponent(
          error_description ?? error
        )}`
      );
    }

    req.log.info(
      {
        hasCode: Boolean(code),
        hasState: Boolean(state),
      },
      "tesla oauth callback query check"
    );

    if (!code || !state) {
      return reply.code(400).send({ ok: false, error: "invalid oauth state" });
    }

    const session = await prisma.teslaOAuthSession.findUnique({
      where: { state },
    });

    req.log.info(
      {
        hasSession: Boolean(session),
        hasVerifier: Boolean(session?.verifier),
        hasUserId: Boolean(session?.userId),
        expired: session ? session.expiresAt.getTime() < Date.now() : null,
      },
      "tesla oauth callback session lookup"
    );

    if (!session) {
      return reply.code(400).send({ ok: false, error: "invalid oauth state" });
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.teslaOAuthSession.delete({ where: { state } });
      return reply.code(400).send({ ok: false, error: "oauth session expired" });
    }

    try {
      const tokenRes = await axios.post(
        process.env.TESLA_TOKEN_URL!,
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: process.env.TESLA_CLIENT_ID!,
          client_secret: process.env.TESLA_CLIENT_SECRET!,
          redirect_uri: process.env.TESLA_REDIRECT_URI!,
          code,
          code_verifier: session.verifier,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token, refresh_token, expires_in } =
        tokenRes.data as TeslaTokenResponse;

      const expiresAt = new Date(Date.now() + Number(expires_in) * 1000);

      await prisma.teslaAccount.upsert({
        where: { userId: session.userId },
        update: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt,
        },
        create: {
          userId: session.userId,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt,
        },
      });

      await prisma.teslaOAuthSession.delete({
        where: { state },
      });

      return reply.redirect(`${process.env.APP_DEEP_LINK}?linked=1`);
    } catch (err) {
      req.log.error(err, "Tesla token exchange failed");
      return reply.redirect(
        `${process.env.APP_DEEP_LINK}?linked=0&error=token_exchange_failed`
      );
    }
  });
}
