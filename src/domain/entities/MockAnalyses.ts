import { PricingAnalysis } from "./PricingAnalysis";

export const MOCK_ANALYSES: Record<string, PricingAnalysis> = {
  "mock-1": {
    id: "mock-analysis-1",
    url: "https://linear.app/pricing",
    screenshotBase64: "/mock-linear.png",
    gutReaction: "This is surprisingly transparent. $10/user for Basic is reasonable for where we are.",
    thoughts: "Linear's pricing model is refreshing and aligns well with our current growth phase. The 'Business' tier at $16/user/month seems like the sweet spot for a scaling startup, especially since it offers unlimited teams and guests. I'm particularly interested in the 'Triage Intelligence' and 'Issue SLAs'—those are the kind of operational efficiencies that justify the jump from $10 to $16.\n\nHowever, I'm already mentally calculating the burn as we scale from 10 to 50 engineers. $800/month is manageable, but I'll be keeping a close eye on the value we get from specifically the 'Insights' and 'Asks' features. The 'Enterprise' wall is a bit intimidating, but the transparency on the first three tiers builds a lot of trust.",
    scores: {
      clarity: 9,
      clarityReason: "The tier structure is clearly laid out with feature breakdowns and per-user pricing visible at a glance.",
      valuePerception: 8,
      valuePerceptionReason: "At $10-16/user the pricing is in line with similar tools, and the unlimited issues on paid tiers adds real value.",
      trust: 9,
      trustReason: "Transparent pricing with no hidden fees and a generous free tier builds confidence in the brand.",
      explorationIntent: 9,
      explorationIntentReason: "The clean layout and clear feature differentiation makes me want to explore the integrations and docs pages.",
      analysisIntent: 8,
      analysisIntentReason: "I'd run a pilot with my team — the pricing is reasonable enough to justify a trial without board approval.",
      buyIntent: 8,
      buyIntentReason: "For a growing startup, this fits our budget and needs. I'd likely start with a small team and expand.",
    },
    risks: [
      "The price jump to Business might feel steep for smaller teams that only need one specific feature like SLAs.",
      "The Enterprise tier is 'Contact Sales', which creates a friction point for future scaling.",
      "Dependencies on Zendesk/Intercom integrations might make migration harder."
    ],
    recommendations: [
      "Add a clear price or starting price for the Enterprise tier to reduce friction for growing teams.",
      "Highlight the ROI of Triage Intelligence and Issue SLAs more prominently to justify the Business tier upgrade.",
      "Consider a monthly billing option that shows checked by default to reduce perceived commitment."
    ],
    aiSuggestion: "The Business tier's Triage Intelligence and Issue SLAs are compelling, but their value isn't clear at a glance. Add a one-line ROI calculator or case study snippet next to the price to justify the $6/user jump from Basic.",
    gazePoints: [
      { x: 50, y: 15, focusLabel: "Main Pricing Headline" },
      { x: 55, y: 45, focusLabel: "Business Tier Price ($16)" },
      { x: 55, y: 65, focusLabel: "Business Feature: Triage Intelligence" },
      { x: 55, y: 85, focusLabel: "Business CTA: Get Started" }
    ],
    rawAnalysis: "Initial scan: Clean UI. Tiers are well-defined. Free tier is actually usable (unlimited members, wow). Basic at $10 is standard. Business at $16 for 'Triage Intelligence'—need to know more about that. Contact Sales for Enterprise is expected but always annoying. Overall, it feels like a tool built by product people for product people. The value is clear."
  },
  "mock-2": {
    id: "mock-analysis-2",
    url: "https://linear.app/pricing",
    screenshotBase64: "/mock-linear.png",
    gutReaction: "Finally, a site that doesn't hide the price. $10/mo for unlimited issues is a no-brainer.",
    thoughts: "The technical vibe of this page is perfect. It's high-contrast, no-fluff, and the feature list is granular. For my client projects, the 'Free' tier is actually robust enough to get started without hitting a wall in 2 weeks. $10 for unlimited issues is exactly what I need to see—no artificial caps on the core utility of the product.\n\nI like that billing 'Yearly' is the default but 'Monthly' is visible (implied or toggle-able). The 'Admin roles' coming in at the $10 tier is great for handoffs to my clients. My main gripe is usually missing features in the middle tiers, but Linear seems to have balanced the 'Business' features well. I'd definitely recommend this over Jira for a greenfield project.",
    scores: {
      clarity: 10,
      clarityReason: "Everything is visible on one page — tiers, prices, features. No scrolling through hidden sections.",
      valuePerception: 9,
      valuePerceptionReason: "Unlimited issues for $10 is rare and the yearly discount makes it even more compelling for freelancers.",
      trust: 10,
      trustReason: "Complete pricing transparency with no 'contact us' until Enterprise. This is how B2B should work.",
      explorationIntent: 10,
      explorationIntentReason: "I'm already clicking through to check the API docs and integration pages in my mind.",
      analysisIntent: 9,
      analysisIntentReason: "I'd spin up a trial project immediately. The free tier is generous enough to do real testing.",
      buyIntent: 10,
      buyIntentReason: "For $10/user with unlimited issues, this is an easy decision. I'd sign up today for my next project.",
    },
    risks: [
      "Slack/GitHub integration on Free: check the limits.",
      "Doesn't explicitly highlight API rate limits on this page.",
      "Might be too minimalist for less technical clients."
    ],
    recommendations: [
      "Add a note about API rate limits on the pricing page to address developer concerns proactively.",
      "Consider a 'Team' tier between Basic and Business for small groups that don't need premium features.",
      "Highlight the integration ecosystem more prominently to differentiate from competitors."
    ],
    aiSuggestion: "The free tier is strong enough for real evaluation, but the 250-issue cap isn't clearly called out as a hard limit. Add a visible 'Free tier includes 250 active issues' badge to set expectations upfront and reduce friction when teams hit the cap.",
    gazePoints: [
      { x: 30, y: 45, focusLabel: "Free Tier: $0" },
      { x: 30, y: 65, focusLabel: "Free Feature: 250 issues" },
      { x: 42, y: 45, focusLabel: "Basic Tier: $10" },
      { x: 42, y: 65, focusLabel: "Basic Feature: Unlimited issues" }
    ],
    rawAnalysis: "Scan process: Dark mode default (nice). Primary CTA is 'Get started'—low friction. Features are listed as checkmarks, very standard. Unlimited file uploads on Basic is a huge plus. The focus on 'Triage' and 'Insights' shows they care about systemic workflow, not just checkboxes. It feels high-tech and reliable."
  },
  "mock-3": {
    id: "mock-analysis-3",
    url: "https://linear.app/pricing",
    screenshotBase64: "/mock-linear.png",
    gutReaction: "It feels very... technical. I'm worried my non-dev stakeholders will find the UI too dark.",
    thoughts: "While the price points are competitive, the presentation feels very 'developer-first' in a way that might alienate my marketing and success teams. At $16/user, I'm expecting a much higher level of dedicated support than what's mentioned here. It says 'Support' is available, but it doesn't shout 'White Glove' until you reach the Enterprise tier.\n\nThe 'Free' tier being 'Unlimited members' is a red flag for me—how do they make money then? I worry about the stability of 'freemium' tools that are this generous. Also, the lack of a clear 'Customer Success Manager' mentioned in the lower tiers makes me nervous about the onboarding burden for my department. I'd need a demo before I could ever pitch this to my VP.",
    scores: {
      clarity: 7,
      clarityReason: "The layout is clean but the dark theme and technical language make it less accessible for non-engineers.",
      valuePerception: 5,
      valuePerceptionReason: "The value is unclear for non-technical teams. The features seem engineering-focused without explaining cross-team benefits.",
      trust: 6,
      trustReason: "The generous free tier raises questions about business model stability, and support SLAs aren't clearly defined.",
      explorationIntent: 7,
      explorationIntentReason: "I'd explore to see if there's a 'non-dev' mode or if the UI can be customized for broader teams.",
      analysisIntent: 5,
      analysisIntentReason: "I'd need to see a demo and understand the onboarding process before committing to a pilot.",
      buyIntent: 4,
      buyIntentReason: "The risk of low adoption among non-technical team members makes me hesitant to purchase without more info.",
    },
    risks: [
      "Onboarding seems self-serve, which might be a burden for non-technical teams.",
      "Support responsiveness isn't clearly defined for the Business tier.",
      "The UI might feel 'sterile' or 'uninviting' to non-engineers."
    ],
    recommendations: [
      "Add a 'Customer Success' mention to the Business tier to reassure non-technical buyers.",
      "Include screenshots or testimonials from non-engineering teams to broaden appeal.",
      "Consider a guided demo CTA for enterprise prospects rather than self-serve only."
    ],
    aiSuggestion: "The dark theme and developer-focused language create a perception that this tool isn't for cross-functional teams. Adding a screenshot showing how marketing or design teams use Linear — even just a testimonial — would broaden the appeal without changing the product.",
    gazePoints: [
      { x: 70, y: 45, focusLabel: "Enterprise Tier: Contact Us" },
      { x: 70, y: 65, focusLabel: "Enterprise Feature: Migration Support" },
      { x: 55, y: 75, focusLabel: "Business Feature: Issue SLAs" },
      { x: 55, y: 35, focusLabel: "Monthly/Yearly Toggle" }
    ],
    rawAnalysis: "Visual scan: Very dark. Almost hard to read some of the subtext. $16 is on par with Notion business, but Notion feels more 'bubbly' and accessible. This looks like a terminal. I'm looking for 'Security' and it's mostly hidden in 'Advanced security' at the Enterprise level. That's a concern for our compliance department."
  }
};
