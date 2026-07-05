import type { Context, Next } from "hono";

import { auth } from "../auth.ts";

interface RequireAdminOptions {
  mode?: "api" | "html";
}

export const requireAdmin = (options: RequireAdminOptions = {}) => {
  const mode = options.mode ?? "api";

  return async (c: Context, next: Next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      if (mode === "html") {
        return c.redirect("/admin/login");
      }
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("session", session);
    return next();
  };
};
