import "server-only";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { entrypoint, task } from "@langchain/langgraph";

import { createChatModel } from "@/lib/ai/provider";
import {
  CaseAnalysisSchema,
  type CaseAnalysis,
  type CaseInput,
  SpecialistOutputSchema,
  type SpecialistOutput,
} from "./schemas";

const specialistPrompts = {
  contract:
    "Analyze commercial terms, contractual language, price mechanisms, obligations, remedies, and negotiation leverage. Do not provide legal advice; flag clauses that require qualified legal review.",
  operations:
    "Analyze supply continuity, capacity, lead time, quality, logistics, switching constraints, and operational mitigations.",
  risk:
    "Challenge the case. Identify unsupported claims, concentration risk, downside scenarios, compliance concerns, and what would change the recommendation.",
  negotiation:
    "Develop objectives, BATNA, walk-away conditions, concessions, sequencing, questions, and a credible communication strategy.",
} as const;

type SpecialistRole = keyof typeof specialistPrompts;

function renderCase(input: CaseInput) {
  const evidence = input.evidence.length
    ? input.evidence
        .map(
          (document) =>
            `SOURCE ${document.id} — ${document.name}\n${document.text}`,
        )
        .join("\n\n")
    : "No documents were provided. Treat all document-dependent conclusions as assumptions or evidence gaps.";

  return [
    `CASE BRIEF\n${input.brief}`,
    input.objective ? `OBJECTIVE\n${input.objective}` : "",
    `EVIDENCE\n${evidence}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const runSpecialist = task(
  { name: "supply_chain_specialist", retry: { maxAttempts: 2 } },
  async (role: SpecialistRole, input: CaseInput): Promise<SpecialistOutput> => {
    const model = createChatModel().withStructuredOutput(SpecialistOutputSchema, {
      name: `${role}_analysis`,
    });

    return model.invoke([
      new SystemMessage(
        [
          "You are one specialist on a supply-chain decision team.",
          specialistPrompts[role],
          "Separate facts from inference. Cite only source IDs that exist in the supplied evidence. Never invent a source, number, commitment, or contractual term. Make uncertainties explicit and keep recommendations decision-ready.",
          `Set role to exactly: ${role}.`,
        ].join(" "),
      ),
      new HumanMessage(renderCase(input)),
    ]);
  },
);

const synthesize = task(
  { name: "case_lead_synthesis", retry: { maxAttempts: 2 } },
  async (
    input: CaseInput,
    specialistOutputs: SpecialistOutput[],
  ): Promise<CaseAnalysis> => {
    const model = createChatModel().withStructuredOutput(CaseAnalysisSchema, {
      name: "case_strategy",
    });

    return model.invoke([
      new SystemMessage(
        [
          "You are the case lead for a high-stakes supply-chain decision.",
          "Synthesize the specialist work into one defensible strategy. Resolve contradictions explicitly, prefer evidence over confidence, preserve material uncertainty, and never manufacture facts.",
          "The draft response must be professional, concise, editable, and must not promise terms or authority that the case brief does not grant.",
          "Return all specialist outputs unchanged in specialistOutputs so the user can audit the recommendation.",
          "Field length rules, because these render as compact UI elements, not paragraphs: recommendedPosition is a single headline sentence under 18 words naming the position — put every condition, mechanism, and next step in executiveSummary or priorityActions instead, never in recommendedPosition. Each priorityActions.timing is a short label of 2-4 words (e.g. 'Today', 'Within 48h', 'This week') — any condition or nuance about timing belongs in that action's reason, not in timing. Each alternatives.tradeoffs is one short phrase under 12 words.",
        ].join(" "),
      ),
      new HumanMessage(
        `${renderCase(input)}\n\nSPECIALIST OUTPUTS\n${JSON.stringify(specialistOutputs, null, 2)}`,
      ),
    ]);
  },
);

export const caseAnalysisGraph = entrypoint(
  "pactline_case_analysis",
  async (input: CaseInput) => {
    const roles = Object.keys(specialistPrompts) as SpecialistRole[];
    const specialistOutputs = await Promise.all(
      roles.map((role) => runSpecialist(role, input)),
    );

    return synthesize(input, specialistOutputs);
  },
);
