import { ApplicationStatus } from "@prisma/client";
import { z } from "zod";

export const APPLICATION_STATUSES = Object.values(ApplicationStatus);

const statusCounts = z.object(
  Object.fromEntries(
    APPLICATION_STATUSES.map((s) => [s, z.number().int().min(0)]),
  ) as Record<ApplicationStatus, z.ZodNumber>,
);

export const dashboardStatsSchema = z.object({
  totals: z.object({
    applications: z.number().int().min(0),
    activePipeline: z.number().int().min(0),
  }),
  byStatus: statusCounts,
  rates: z.object({
    offerRate: z.number().min(0).max(1),
    rejectionRate: z.number().min(0).max(1),
    terminalCount: z.number().int().min(0),
  }),
  interviews: z.object({
    upcoming: z.number().int().min(0),
    completed: z.number().int().min(0),
  }),
  monthlyCreated: z
    .array(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        count: z.number().int().min(0),
      }),
    )
    .length(6),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
