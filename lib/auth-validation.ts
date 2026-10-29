import { z } from "zod";

const password = z.string().min(10, "Use at least 10 characters").max(128);
const email = z.string().trim().toLowerCase().email().max(254);
const phone = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use international phone format, e.g. +2348012345678");

export const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(70),
  accountType: z.enum(["person", "page"]).default("person"),
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, "Handle must be 3–24 letters, numbers or underscores"),
  contactType: z.enum(["email", "phone"]),
  email: email.optional(),
  phone: phone.optional(),
  password,
}).superRefine((value, ctx) => {
  if (value.contactType === "email" && !value.email) ctx.addIssue({ code: "custom", path: ["email"], message: "Enter your email address" });
  if (value.contactType === "phone" && !value.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter your phone number with country code" });
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});
