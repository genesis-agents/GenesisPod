import { promises as fs } from "fs";
import * as path from "path";
import { Prisma, PrismaClient } from "@prisma/client";

interface TemplateFile {
  id: string;
  name: string;
  category: string;
  version: number;
  description?: string;
  schema: Prisma.InputJsonValue;
  promptConfig: Prisma.InputJsonValue;
}

const prisma = new PrismaClient();
const templatesDir = path.resolve(__dirname, "../configs/templates");

async function seedTemplates() {
  console.log(
    "================================================================================",
  );
  console.log("🧩 Report Template Seeder");
  console.log(
    "================================================================================\n",
  );

  try {
    const entries = await fs.readdir(templatesDir);
    const templateFiles = entries.filter((file) => file.endsWith(".json"));

    if (templateFiles.length === 0) {
      console.warn(
        "⚠️  No template files found. Please add JSON templates to backend/src/configs/templates first.",
      );
      return;
    }

    for (const fileName of templateFiles) {
      const filePath = path.join(templatesDir, fileName);
      const raw = await fs.readFile(filePath, "utf-8");
      let data: TemplateFile;

      try {
        data = JSON.parse(raw) as TemplateFile;
      } catch (error) {
        console.error(`❌ Failed to parse template file ${fileName}:`, error);
        continue;
      }

      if (
        !data.id ||
        !data.name ||
        !data.category ||
        !data.schema ||
        !data.promptConfig
      ) {
        console.error(
          `❌ Template file ${fileName} missing required fields (id/name/category/schema/promptConfig).`,
        );
        continue;
      }

      await prisma.reportTemplate.upsert({
        where: { id: data.id },
        update: {
          name: data.name,
          category: data.category,
          version: data.version ?? 1,
          description: data.description,
          schema: data.schema,
          promptConfig: data.promptConfig,
          updatedAt: new Date(),
        },
        create: {
          id: data.id,
          name: data.name,
          category: data.category,
          version: data.version ?? 1,
          description: data.description,
          schema: data.schema,
          promptConfig: data.promptConfig,
        },
      });

      console.log(`✅ Seeded template: ${data.id} (${data.name})`);
    }

    console.log("\n🎉 All templates processed successfully.");
  } catch (error) {
    console.error("❌ Failed to seed report templates:", error);
    throw error;
  }
}

seedTemplates()
  .catch((error) => {
    console.error("❌ Seeder exited with error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
