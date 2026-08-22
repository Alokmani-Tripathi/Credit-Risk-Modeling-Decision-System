export type NavItem = {
  href: string;
  label: string;
  description?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  href: string;
  tagline: string;
  items: NavItem[];
};

export function isGroupActive(group: NavGroup, pathname: string) {
  return group.href === "/" ? pathname === "/" : pathname === group.href || pathname.startsWith(`/${group.id}`);
}

export function activeGroup(pathname: string) {
  return NAV.find((g) => isGroupActive(g, pathname)) ?? NAV[0];
}

export const NAV: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/",
    tagline: "Portfolio command center",
    items: [{ href: "/", label: "Lifecycle home", description: "Champion, KPIs, alerts" }],
  },
  {
    id: "build",
    label: "Build",
    href: "/build/business",
    tagline: "Target, data quality, features, models",
    items: [
      { href: "/build/business", label: "Business & target" },
      { href: "/build/data-quality", label: "Data quality & EDA" },
      { href: "/build/features", label: "Features (IV / VIF)" },
      { href: "/build/models", label: "Model development" },
    ],
  },
  {
    id: "validate",
    label: "Validate",
    href: "/validate/evaluation",
    tagline: "Performance, calibration, explainability",
    items: [
      { href: "/validate/evaluation", label: "Evaluation" },
      { href: "/validate/calibration", label: "Calibration" },
      { href: "/validate/explainability", label: "Explainability" },
      { href: "/validate/scorecard", label: "Scorecard" },
      { href: "/validate/quantification", label: "PD / LGD / EAD" },
      { href: "/validate/checklist", label: "Validation checklist" },
    ],
  },
  {
    id: "decide",
    label: "Decide",
    href: "/decide/single",
    tagline: "Scorecard, policy, origination decision",
    items: [
      { href: "/decide/single", label: "Decision engine" },
      { href: "/decide/batch", label: "Batch scoring & drift" },
      { href: "/decide/policy", label: "Policy overlay" },
    ],
  },
  {
    id: "portfolio",
    label: "Credit Portfolio",
    href: "/monitor/portfolio",
    tagline: "Cumulative credit portfolio monitoring",
    items: [],
  },
  {
    id: "stress-testing",
    label: "Stress Testing",
    href: "/monitor/stress-testing",
    tagline: "Portfolio stress and scenario analysis",
    items: [],
  },
  {
    id: "monitor",
    label: "Monitor",
    href: "/monitor/dashboard",
    tagline: "Vintages, drift, production alerts",
    items: [
      { href: "/monitor/dashboard", label: "Monitoring dashboard" },
      { href: "/monitor/alerts", label: "Alerts" },
      { href: "/monitor/drift", label: "Drift deep-dive" },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    href: "/governance/registry",
    tagline: "Registry, inventory, model risk pack",
    items: [
      { href: "/governance/registry", label: "Model registry" },
      { href: "/governance/docs", label: "Governance pack" },
    ],
  },
];

export const LIFECYCLE = [
  { phase: 1, name: "Business & risk strategy", workspace: "Build" },
  { phase: 2, name: "Target / default definition", workspace: "Build" },
  { phase: 3, name: "Data acquisition", workspace: "Build" },
  { phase: 4, name: "Data quality & EDA", workspace: "Build" },
  { phase: 5, name: "Feature engineering", workspace: "Build" },
  { phase: 6, name: "Feature selection", workspace: "Build" },
  { phase: 7, name: "Model development", workspace: "Build" },
  { phase: 8, name: "Model evaluation", workspace: "Validate" },
  { phase: 9, name: "Explainability", workspace: "Validate" },
  { phase: 10, name: "PD / LGD / EAD", workspace: "Validate" },
  { phase: 11, name: "Calibration & validation", workspace: "Validate" },
  { phase: 12, name: "Decision engine", workspace: "Decide" },
  { phase: 13, name: "Deployment / registry", workspace: "Governance" },
  { phase: 14, name: "Monitoring & lifecycle", workspace: "Monitor" },
];
