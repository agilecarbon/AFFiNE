import { PrismaClient } from '@prisma/client';

export class WorkspaceFolders1774119925519 {
  static async up(db: PrismaClient) {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "workspace_folders" (
        "workspace_id" VARCHAR NOT NULL,
        "id" VARCHAR NOT NULL,
        "parent_id" VARCHAR,
        "type" VARCHAR NOT NULL,
        "data" VARCHAR NOT NULL,
        "index" VARCHAR NOT NULL,
        "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
        CONSTRAINT "workspace_folders_pkey" PRIMARY KEY ("workspace_id", "id"),
        CONSTRAINT "workspace_folders_workspace_id_fkey"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id")
          ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT "workspace_folders_parent_fkey"
          FOREIGN KEY ("workspace_id", "parent_id") REFERENCES "workspace_folders" ("workspace_id", "id")
          ON UPDATE CASCADE ON DELETE CASCADE
      );
    `);

    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "workspace_folders_parent_idx"
      ON "workspace_folders" ("workspace_id", "parent_id");
    `);

    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "workspace_folders_type_idx"
      ON "workspace_folders" ("workspace_id", "type");
    `);
  }

  static async down(db: PrismaClient) {
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS "workspace_folders" CASCADE;');
  }
}
