import {
  ApplicationStatus,
  InterviewStatus,
  InterviewType,
  PrismaClient,
} from "@prisma/client";
import { hashPassword } from "../src/modules/auth/password.js";

const prisma = new PrismaClient();

/** Stable local login — documented in README. */
export const DEMO_EMAIL = "demo@nextrole.local";
export const DEMO_PASSWORD = "password12";
export const DEMO_NAME = "Demo User";

type AppSeed = {
  company: string;
  title: string;
  status: ApplicationStatus;
  monthsAgo: number;
  interviews?: Array<{
    status: InterviewStatus;
    type: InterviewType;
    daysFromNow: number;
  }>;
};

const DEMO_APPS: AppSeed[] = [
  {
    company: "Northwind",
    title: "Frontend Engineer",
    status: ApplicationStatus.APPLIED,
    monthsAgo: 0,
  },
  {
    company: "Contoso",
    title: "Full-Stack Developer",
    status: ApplicationStatus.SCREENING,
    monthsAgo: 0,
    interviews: [
      {
        status: InterviewStatus.SCHEDULED,
        type: InterviewType.PHONE,
        daysFromNow: 5,
      },
    ],
  },
  {
    company: "Fabrikam",
    title: "React Engineer",
    status: ApplicationStatus.INTERVIEW,
    monthsAgo: 1,
    interviews: [
      {
        status: InterviewStatus.COMPLETED,
        type: InterviewType.VIDEO,
        daysFromNow: -10,
      },
      {
        status: InterviewStatus.SCHEDULED,
        type: InterviewType.ONSITE,
        daysFromNow: 12,
      },
    ],
  },
  {
    company: "Adventure Works",
    title: "Platform Engineer",
    status: ApplicationStatus.TECHNICAL_INTERVIEW,
    monthsAgo: 1,
  },
  {
    company: "Litware",
    title: "Software Engineer",
    status: ApplicationStatus.OFFER,
    monthsAgo: 2,
  },
  {
    company: "Tailspin Toys",
    title: "Backend Engineer",
    status: ApplicationStatus.REJECTED,
    monthsAgo: 2,
  },
  {
    company: "Wide World Importers",
    title: "SWE Intern",
    status: ApplicationStatus.WITHDRAWN,
    monthsAgo: 3,
  },
  {
    company: "Alpine Ski House",
    title: "UI Engineer",
    status: ApplicationStatus.SAVED,
    monthsAgo: 3,
  },
  {
    company: "Blue Yonder",
    title: "DevOps Engineer",
    status: ApplicationStatus.APPLIED,
    monthsAgo: 4,
  },
  {
    company: "Proseware",
    title: "TypeScript Engineer",
    status: ApplicationStatus.REJECTED,
    monthsAgo: 5,
  },
];

function monthsAgoUtc(n: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 12, 10, 0, 0),
  );
}

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      passwordHash,
    },
    update: {
      name: DEMO_NAME,
      passwordHash,
    },
  });

  const existing = await prisma.application.count({
    where: { userId: user.id },
  });

  if (existing > 0) {
    console.log(
      `Demo user already has ${existing} application(s) — left intact.`,
    );
  } else {
    for (const app of DEMO_APPS) {
      const created = await prisma.application.create({
        data: {
          userId: user.id,
          company: app.company,
          title: app.title,
          status: app.status,
          createdAt: monthsAgoUtc(app.monthsAgo),
          employmentType: "FULL_TIME",
          workplaceType: "REMOTE",
          priority: "MEDIUM",
        },
      });

      for (const iv of app.interviews ?? []) {
        await prisma.interview.create({
          data: {
            applicationId: created.id,
            type: iv.type,
            status: iv.status,
            scheduledAt: daysFromNow(iv.daysFromNow),
          },
        });
      }
    }
    console.log(`Seeded ${DEMO_APPS.length} applications for demo user.`);
  }

  console.log("");
  console.log("Demo login (persists until DB reset):");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
