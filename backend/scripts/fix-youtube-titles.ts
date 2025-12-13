import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Extract YouTube video ID from URL
 */
function extractYoutubeVideoId(url: string): string | null {
  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to extract video ID from: ${url}`, error);
    return null;
  }
}

/**
 * Fetch YouTube video title via oEmbed API
 */
async function fetchYoutubeTitle(videoId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );

    if (!response.ok) {
      console.warn(
        `Failed to fetch YouTube title for ${videoId}: ${response.status}`,
      );
      return null;
    }

    const data = (await response.json()) as { title?: string };
    return data.title || null;
  } catch (error) {
    console.warn(`Failed to fetch video title via oEmbed: ${String(error)}`);
    return null;
  }
}

async function fixYoutubeTitles() {
  console.log("🔍 Searching for YouTube videos with incorrect titles...\n");

  // Find all YouTube videos
  const youtubeVideos = await prisma.resource.findMany({
    where: {
      type: "YOUTUBE_VIDEO",
    },
    select: {
      id: true,
      title: true,
      sourceUrl: true,
    },
  });

  console.log(`Found ${youtubeVideos.length} YouTube videos\n`);

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (const video of youtubeVideos) {
    console.log(`\n📹 Processing: ${video.title}`);
    console.log(`   URL: ${video.sourceUrl}`);

    // Skip if title looks valid (not "watch" or "YouTube Video")
    if (
      video.title &&
      video.title !== "watch" &&
      !video.title.startsWith("YouTube Video")
    ) {
      console.log(`   ✓ Title looks valid, skipping`);
      skippedCount++;
      continue;
    }

    // Extract video ID
    const videoId = extractYoutubeVideoId(video.sourceUrl || "");
    if (!videoId) {
      console.log(`   ✗ Failed to extract video ID`);
      failureCount++;
      continue;
    }

    // Fetch real title
    const realTitle = await fetchYoutubeTitle(videoId);
    if (!realTitle) {
      console.log(`   ✗ Failed to fetch title from YouTube`);
      failureCount++;
      continue;
    }

    // Update database
    try {
      await prisma.resource.update({
        where: { id: video.id },
        data: { title: realTitle },
      });
      console.log(`   ✓ Updated to: "${realTitle}"`);
      successCount++;
    } catch (error) {
      console.log(`   ✗ Failed to update database: ${error}`);
      failureCount++;
    }

    // Rate limiting: wait 100ms between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 Migration Summary:");
  console.log(`   Total videos: ${youtubeVideos.length}`);
  console.log(`   ✓ Successfully updated: ${successCount}`);
  console.log(`   ⊘ Skipped (valid titles): ${skippedCount}`);
  console.log(`   ✗ Failed: ${failureCount}`);
  console.log("=".repeat(60) + "\n");
}

fixYoutubeTitles()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
