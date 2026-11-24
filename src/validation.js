import { z } from "zod";
const url = z
  .string()
  .url()
  .max(2048)
  .refine((s) => /^https?:\/\//i.test(s), "HTTP(S) image URL required");
export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    photo: z
      .union([url, z.literal("")])
      .optional()
      .default(""),
    password: z
      .string()
      .min(6)
      .max(128)
      .regex(/[A-Z]/, "Needs uppercase letter")
      .regex(/[a-z]/, "Needs lowercase letter"),
  })
  .strict();
export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1),
  })
  .strict();
export const studioSchema = z
  .object({
    title: z.string().trim().min(5).max(90),
    category: z.enum([
      "Photo Studio",
      "Film Stage",
      "Podcast Lounge",
      "Music Suite",
      "Workshop",
    ]),
    rate: z.number().positive().max(100000),
    deposit: z.number().min(0).max(100000),
    capacity: z.number().int().min(1).max(10000),
    location: z.string().trim().min(3).max(250),
    image: url,
    gallery: z.array(url).min(1).max(20),
    amenities: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
    overview: z.string().trim().min(25).max(3000),
  })
  .strict();
export const bookingSchema = z
  .object({
    studioId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();
export function parse(schema, body) {
  return schema.safeParse(body);
}
export function slots(start, end) {
  const min = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const a = min(start),
    b = min(end);
  if (b <= a || a % 15 || b % 15) return null;
  return Array.from({ length: (b - a) / 15 }, (_, i) => a + i * 15);
}
