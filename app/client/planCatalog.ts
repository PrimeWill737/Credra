/** Display pricing — amounts in NGN; cycles match bank transfer flow. */
export type PlanCard = {
  id: string;
  name: string;
  blurb: string;
  cycle: string;
  amountNgn: number;
  durationLabel: string;
  features: string[];
};

export const PLAN_CARDS: PlanCard[] = [
  {
    id: "starter",
    name: "Starter",
    blurb: "Try CREDRA on a short runway — ideal for pilots.",
    cycle: "weekly",
    amountNgn: 2000,
    durationLabel: "1 week",
    features: [
      "Live sandbox (no production API access)",
      "Bank linking test flow (Mono)",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "Full monthly access for growing teams.",
    cycle: "monthly",
    amountNgn: 25000,
    durationLabel: "1 month",
    features: [
      "Production API key included",
      "Limited to 5 production API calls per plan period",
      "Usage logging + priority review queue",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    blurb: "Annual commitment with the best per-month value.",
    cycle: "yearly",
    amountNgn: 270000,
    durationLabel: "1 year",
    features: [
      "Production API key included",
      "Limited to 100 production API calls per year",
      "Extend usage: +100 calls for +10% of original annual cost per extension",
      "Yearly invoicing + dedicated success check-ins",
    ],
  },
];
