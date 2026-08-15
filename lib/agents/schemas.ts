import { z } from "zod";

export const EvidenceDocumentSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(240),
  text: z.string().min(1).max(120_000),
});

export const CaseInputSchema = z.object({
  brief: z.string().min(30).max(30_000),
  objective: z.string().max(4_000).optional(),
  evidence: z.array(EvidenceDocumentSchema).max(30).default([]),
});

export const FindingSchema = z.object({
  claim: z.string(),
  status: z.enum(["verified", "inferred", "assumed", "disputed"]),
  sourceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const SpecialistOutputSchema = z.object({
  role: z.string(),
  findings: z.array(FindingSchema),
  risks: z.array(z.string()),
  openQuestions: z.array(z.string()),
  recommendations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const CaseAnalysisSchema = z.object({
  executiveSummary: z.string(),
  recommendedPosition: z.string(),
  confidence: z.number().min(0).max(1),
  alternatives: z.array(
    z.object({
      name: z.string(),
      whenToUse: z.string(),
      tradeoffs: z.string(),
    }),
  ),
  priorityActions: z.array(
    z.object({
      action: z.string(),
      owner: z.string(),
      timing: z.string(),
      reason: z.string(),
    }),
  ),
  evidenceGaps: z.array(z.string()),
  draftResponse: z.string(),
  specialistOutputs: z.array(SpecialistOutputSchema),
});

export type CaseInput = z.infer<typeof CaseInputSchema>;
export type SpecialistOutput = z.infer<typeof SpecialistOutputSchema>;
export type CaseAnalysis = z.infer<typeof CaseAnalysisSchema>;
