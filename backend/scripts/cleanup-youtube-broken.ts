/**
 * One-shot cleanup script for stale YouTube resources.
 *
 * Sweeps every Resource whose sourceUrl is on YouTube, hits the oEmbed
 * endpoint to determine availability, marks dead videos BROKEN, and physically
 * deletes BROKEN entries with no notes/comments. Resources with user
 * attachments (notes/comments) are kept but flipped to ARCHIVED so the new
 * EXCLUDE_DEAD_LINKS filter hides them from the feed.
 *
 * Usage:
 *   railway run npx ts-node scripts/cleanup-youtube-broken.ts
 *   railway run npx ts-node scripts/cleanup-youtube-broken.ts --dry-run
 *   DATABASE_URL=postgresql://... npx ts-node scripts/cleanup-youtube-broken.ts
 *
 * Flags:
 *   --dry-run            don't write to DB, only print what would change
 *   --batch-size=200     how many resources to fetch per page (default 200)
 *   --concurrency=5      parallel oEmbed requests (default 5; YouTube tolerates this)
 *   --delay-ms=200       inter-batch sleep (default 200ms)
 */

import * as dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import axios from "axios";

const prisma = new PrismaClient();

interface Args {
  dryRun: boolean;
  batchSize: number;
  concurrency: number;
  delayMs: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (key: string, def: number) => {
    const m = argv.find((a) => a.startsWith(`--${key}=`));
    return m ? Number(m.split("=")[1]) : def;
  };
  return {
    dryRun: argv.includes("--dry-run"),
    batchSize: get("batch-size", 200),
    concurrency: get("concurrency", 5),
    delayMs: get("delay-ms", 200),
  };
}

async function checkOneYoutubeUrl(
  url: string,
): Promise<"healthy" | "dead" | "ambiguous"> {
  try {
    const res = await axios.get(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { timeout: 10_000, validateStatus: () => true },
    );
    if (res.status === 200) return "healthy";
    if (res.status === 401 || res.status === 404) return "dead";
    return "ambiguous";
  } catch {
    return "ambiguous";
  }
}

async function checkBatch(
  urls: Array<{ id: string; sourceUrl: string }>,
  concurrency: number,
): Promise<Map<string, "healthy" | "dead" | "ambiguous">> {
  const result = new Map<string, "healthy" | "dead" | "ambiguous">();
  for (let i = 0; i < urls.length; i += concurrency) {
    const slice = urls.slice(i, i + concurrency);
    const verdicts = await Promise.all(
      slice.map((u) => checkOneYoutubeUrl(u.sourceUrl)),
    );
    slice.forEach((u, idx) => result.set(u.id, verdicts[idx]));
  }
  return result;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs();
  console.log("=== YouTube Resource Cleanup ===");
  console.log(JSON.stringify(args, null, 2));

  // Fetch all YouTube resources currently visible to users (HEALTHY/UNKNOWN)
  // BROKEN/ARCHIVED already get filtered by EXCLUDE_DEAD_LINKS — handle them separately.
  const total = await prisma.resource.count({
    where: {
      sourceUrl: { contains: "youtube.com" },
      linkHealth: { in: ["HEALTHY", "UNKNOWN", null as never] },
    },
  });
  console.log(`Found ${total} live YouTube resources to verify`);

  let cursor: string | undefined;
  let processed = 0;
  let markedBroken = 0;
  let confirmedHealthy = 0;
  let ambiguous = 0;

  while (true) {
    const page = await prisma.resource.findMany({
      where: {
        sourceUrl: { contains: "youtube.com" },
        linkHealth: { in: ["HEALTHY", "UNKNOWN"] },
      },
      select: {
        id: true,
        sourceUrl: true,
        linkHealth: true,
        linkCheckFailCount: true,
      },
      take: args.batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (page.length === 0) break;

    const checkable = page.filter(
      (r): r is typeof r & { sourceUrl: string } => !!r.sourceUrl,
    );
    const verdicts = await checkBatch(
      checkable.map((r) => ({ id: r.id, sourceUrl: r.sourceUrl })),
      args.concurrency,
    );

    for (const r of checkable) {
      const v = verdicts.get(r.id);
      if (v === "dead") {
        markedBroken++;
        if (!args.dryRun) {
          await prisma.resource.update({
            where: { id: r.id },
            data: {
              linkHealth: "BROKEN",
              lastHealthCheckAt: new Date(),
              linkCheckFailCount: r.linkCheckFailCount + 1,
            },
          });
        }
      } else if (v === "healthy") {
        confirmedHealthy++;
        if (!args.dryRun && r.linkHealth !== "HEALTHY") {
          await prisma.resource.update({
            where: { id: r.id },
            data: {
              linkHealth: "HEALTHY",
              lastHealthCheckAt: new Date(),
              linkCheckFailCount: 0,
            },
          });
        }
      } else {
        ambiguous++;
      }
    }

    processed += page.length;
    cursor = page[page.length - 1].id;
    console.log(
      `  ...progress ${processed}/${total} (broken=${markedBroken} healthy=${confirmedHealthy} ambiguous=${ambiguous})`,
    );
    await sleep(args.delayMs);
  }

  // Now sweep the BROKEN pool (including ones we just marked) and split them.
  const brokenAll = await prisma.resource.findMany({
    where: {
      sourceUrl: { contains: "youtube.com" },
      linkHealth: "BROKEN",
    },
    select: { id: true, _count: { select: { notes: true, comments: true } } },
  });

  const deletable = brokenAll
    .filter((r) => r._count.notes === 0 && r._count.comments === 0)
    .map((r) => r.id);
  const archivable = brokenAll
    .filter((r) => r._count.notes > 0 || r._count.comments > 0)
    .map((r) => r.id);

  console.log("\n=== Disposal plan ===");
  console.log(`  delete (BROKEN, no notes/comments): ${deletable.length}`);
  console.log(`  archive (BROKEN with attachments):  ${archivable.length}`);

  if (!args.dryRun) {
    if (deletable.length > 0) {
      const del = await prisma.resource.deleteMany({
        where: { id: { in: deletable } },
      });
      console.log(`  deleted ${del.count} resources`);
    }
    if (archivable.length > 0) {
      const arch = await prisma.resource.updateMany({
        where: { id: { in: archivable } },
        data: { linkHealth: "ARCHIVED" },
      });
      console.log(`  archived ${arch.count} resources`);
    }
  } else {
    console.log("  [dry-run] no DB writes performed");
  }

  console.log("\n=== Done ===");
  console.log(
    `  processed=${processed} broken=${markedBroken} healthy=${confirmedHealthy} ambiguous=${ambiguous}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
