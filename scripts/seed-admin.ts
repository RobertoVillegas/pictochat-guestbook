import { eq } from "drizzle-orm";

import { auth } from "../src/auth.ts";
import { db } from "../src/db/client.ts";
import { surfaces, user } from "../src/db/schema.ts";
import { env } from "../src/env.ts";

const seedSurface = (): void => {
  const existing = db
    .select()
    .from(surfaces)
    .where(eq(surfaces.slug, "roberto-guestbook"))
    .get();

  if (existing) {
    console.log("Surface roberto-guestbook already exists");
    return;
  }

  db.insert(surfaces)
    .values({
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      mode: "guestbook",
      moderationMode: "manual",
      slug: "roberto-guestbook",
      title: "Roberto's Guestbook",
    })
    .run();

  console.log("Seeded surface roberto-guestbook");
};

const seedAdmin = async (): Promise<void> => {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD are required for seeding");
    process.exit(1);
  }

  const existing = db
    .select()
    .from(user)
    .where(eq(user.email, env.ADMIN_EMAIL))
    .get();

  if (existing) {
    console.log(`Admin user ${env.ADMIN_EMAIL} already exists`);
    return;
  }

  const ctx = await auth.$context;
  const hashedPassword = await ctx.password.hash(env.ADMIN_PASSWORD);
  const created = await ctx.internalAdapter.createUser({
    email: env.ADMIN_EMAIL,
    emailVerified: true,
    name: "Admin",
  });

  if (!created) {
    console.error("Failed to create admin user");
    process.exit(1);
  }

  await ctx.internalAdapter.linkAccount({
    accountId: created.id,
    password: hashedPassword,
    providerId: "credential",
    userId: created.id,
  });

  console.log(`Seeded admin user ${env.ADMIN_EMAIL}`);
};

seedSurface();
await seedAdmin();
