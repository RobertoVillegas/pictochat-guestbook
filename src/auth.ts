import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "./db/client.ts";
import * as schema from "./db/schema.ts";
import { env, requireAuthSecret } from "./env.ts";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      account: schema.account,
      session: schema.session,
      user: schema.user,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    disableSignUp: true,
    enabled: true,
  },
  secret: requireAuthSecret(),
});
