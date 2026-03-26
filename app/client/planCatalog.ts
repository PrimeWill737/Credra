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
    features: ["Sandbox + limited API calls", "Email support", "Mono test linking"],
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "Full monthly access for growing teams.",
    cycle: "monthly",
    amountNgn: 25000,
    durationLabel: "1 month",
    features: ["Production API", "Usage logging", "Priority review queue"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    blurb: "Annual commitment with the best per-month value.",
    cycle: "yearly",
    amountNgn: 270000,
    durationLabel: "1 year",
    features: ["Everything in Pro", "Yearly invoicing", "Dedicated success check-ins"],
  },
];
