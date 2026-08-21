import Link from 'next/link';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen selection:bg-primary/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 max-w-screen-xl items-center justify-between px-4 md:px-8">
          <Link href="/" className="flex items-center space-x-2 shrink-0">
            <img src="/kynd_logo.svg" alt="Kynd" className="h-8 w-8" />
            <span className="font-bold tracking-tight text-lg select-none">
              Kynd
            </span>
          </Link>
          <nav className="flex items-center space-x-4 md:space-x-6 text-sm font-medium overflow-x-auto whitespace-nowrap">
            <Link
              href="#features"
              className="transition-colors hover:text-primary text-muted-foreground"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              className="transition-colors hover:text-primary text-muted-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/dashboard"
              className="transition-colors text-foreground hover:text-primary font-semibold"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
      <footer className="border-t border-border/40 py-12 bg-background">
        <div className="container mx-auto max-w-screen-xl px-6 md:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start">
            <div className="flex items-center gap-2">
              <img src="/kynd_logo.svg" alt="Kynd" className="h-6 w-6" />
              <span className="font-bold tracking-tight text-lg select-none">
                Kynd
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2 text-center md:text-left">
              &copy; {new Date().getFullYear()} Kynd. All rights reserved.
            </p>
          </div>
          <div className="flex space-x-6 text-sm text-muted-foreground">
            <Link href="#" className="hover:text-primary transition-colors">
              Privacy
            </Link>
            <Link href="#" className="hover:text-primary transition-colors">
              Terms
            </Link>
            <Link href="#" className="hover:text-primary transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
