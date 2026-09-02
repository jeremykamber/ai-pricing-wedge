import Link from 'next/link';
import { MinimalCard } from '@/components/custom/MinimalCard';
import { PersonaAvatar } from '@/components/custom/PersonaAvatar';
import { StatusBadge } from '@/components/custom/StatusBadge';

export default function MarketingPage() {
  return (
    <div className="flex flex-col items-center w-full">
      {/* Hero Section */}
      <section className="w-full relative overflow-hidden py-32 md:py-48 flex flex-col items-center justify-center text-center px-4 md:px-8">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-8">
          <StatusBadge variant="secondary" className="px-4 py-1.5 text-sm mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            Introducing Kynd
          </StatusBadge>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-balance leading-[1.1] animate-in fade-in slide-in-from-bottom-6 duration-1000">
            Know your user before you build.
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl text-balance leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150">
            Generate highly realistic AI user personas from minimal input. Test your landing pages, chat with your market, and validate pricing in minutes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-8 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
            <Link
              href="/dashboard"
              className="inline-flex h-14 items-center justify-center rounded-md bg-primary px-10 text-base font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Start Generating
            </Link>
            <Link
              href="#features"
              className="inline-flex h-14 items-center justify-center rounded-md border border-border/60 bg-transparent px-10 text-base font-semibold text-foreground transition-all hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              See How It Works
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Showcase */}
      <section id="features" className="w-full py-24 md:py-32 bg-secondary/20 overflow-hidden">
        <div className="container max-w-screen-xl mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row gap-16 lg:gap-24 items-center">

            <div className="flex-1 flex flex-col gap-6">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-balance">
                Instant market feedback.
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Stop guessing what your customers think. Provide a brief description of your target audience, and Kynd generates a set of distinct, highly opinionated AI personas ready to critique your product.
              </p>
              <ul className="flex flex-col gap-4 mt-4">
                {['Deep psychological profiling', 'Realistic conversational chat', 'Simulated visual gaze analysis'].map(feature => (
                  <li key={feature} className="flex items-center gap-3 text-foreground font-medium">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-1 w-full relative">
              <div className="grid gap-6 relative">
                {/* Floating Mock Components */}
                <MinimalCard className="relative md:translate-x-8 md:rotate-2 z-20" hoverable>
                  <div className="flex items-start gap-4 flex-wrap">
                    <PersonaAvatar name="Sarah Jenkins" size="lg" className="border-primary/20 shrink-0" />
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <span className="font-semibold text-lg">Sarah Jenkins</span>
                        <StatusBadge variant="default">Skeptical</StatusBadge>
                      </div>
                      <span className="text-sm text-muted-foreground uppercase tracking-wider">VP of Engineering</span>
                      <p className="text-sm mt-3 text-foreground/80 leading-relaxed">
                        &quot;The pricing page is confusing. I need to know exactly how many compute hours are included in the Pro tier before I commit my team.&quot;
                      </p>
                    </div>
                  </div>
                </MinimalCard>

                <MinimalCard className="relative md:-translate-x-8 md:-rotate-1 z-10 opacity-90" hoverable>
                  <div className="flex items-start gap-4 flex-wrap">
                    <PersonaAvatar name="Marcus Chen" size="lg" className="shrink-0" />
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <span className="font-semibold text-lg">Marcus Chen</span>
                        <StatusBadge variant="outline">Enthusiastic</StatusBadge>
                      </div>
                      <span className="text-sm text-muted-foreground uppercase tracking-wider">Startup Founder</span>
                    </div>
                  </div>
                </MinimalCard>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-32 flex flex-col items-center justify-center text-center px-4 border-t border-border/40">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-8">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
            Ready to meet your customers?
          </h2>
          <p className="text-xl text-muted-foreground text-balance">
            Jump straight into the dashboard. No credit card required.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex h-14 items-center justify-center rounded-md bg-foreground px-10 text-base font-semibold text-background transition-all hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Go to Dashboard &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
