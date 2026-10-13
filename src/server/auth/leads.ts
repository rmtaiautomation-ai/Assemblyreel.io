import { z } from "zod";
import { emailSchema } from "./policy";

export const leadSchema = z.object({
  email: emailSchema,
  requestType: z.enum(["early_access", "demo"]),
  name: z.string().trim().max(100).default(""),
  channelUrl: z.string().trim().max(500).default(""),
  videoLength: z.enum(["5-10m", "10-20m", "20m+"]),
  challenge: z.string().trim().max(2000).default(""),
  updatesConsent: z.boolean().default(false),
});
