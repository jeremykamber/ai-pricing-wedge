#!/bin/bash
# Phase 1
sed -i '' 's/@import url('\''https:\/\/fonts.googleapis.com\/css2?family=Inter:wght@400;500;600;700&display=swap'\'');//g' src/app/globals.css
sed -i '' 's/--font-sans: '\''Inter'\'', sans-serif;/--font-sans: var(--font-geist-sans);/g' src/app/globals.css
sed -i '' '/\/\* Amplify border widths generally \*\//,/^$/d' src/app/globals.css
sed -i '' '/\.border {/,/^}/d' src/app/globals.css
sed -i '' '/\.border-t {/,/^}/d' src/app/globals.css
sed -i '' '/\.border-b {/,/^}/d' src/app/globals.css
sed -i '' '/\.border-l {/,/^}/d' src/app/globals.css
sed -i '' '/\.border-r {/,/^}/d' src/app/globals.css
sed -i '' 's/width: 5px;/width: 4px;/g' src/app/globals.css
sed -i '' 's/border-radius: 10px;/border-radius: 4px;/g' src/app/globals.css
sed -i '' 's/background: oklch(0.65 0.1 264 \/ 0.4);/background: var(--muted-foreground);/g' src/app/globals.css

# Phase 2
sed -i '' 's/border border-border py-4 shadow-sm/border-white\/5 border shadow-sm/g' src/components/ui/card.tsx
sed -i '' 's/border border-border hover:bg-muted transition-colors/border border-white\/5 hover:bg-white\/5 transition-colors/g' src/components/ui/card.tsx
sed -i '' 's/flex flex-col gap-4 rounded-lg/rounded-xl/g' src/components/ui/card.tsx
sed -i '' 's/gap-2 px-6/gap-2 p-8 pb-4/g' src/components/ui/card.tsx
sed -i '' 's/className={cn("px-6", className)}/className={cn("p-8", className)}/g' src/components/ui/card.tsx
sed -i '' 's/px-6 \[\.border-t/p-8 pt-0 \[\.border-t/g' src/components/ui/card.tsx

# Phase 3
sed -i '' 's/text-base font-bold tracking-widest text-white uppercase text-\[12px\]/text-base font-medium text-foreground/g' src/app/\(marketing\)/layout.tsx
sed -i '' 's/text-\[10px\] font-bold text-muted-foreground\/60 hover:text-white transition-colors tracking-widest uppercase/text-sm font-medium text-muted-foreground hover:text-foreground transition-colors/g' src/app/\(marketing\)/layout.tsx
sed -i '' 's/rounded-lg px-5 h-8 font-bold text-\[10px\] uppercase tracking-widest/rounded-lg px-5 h-8 font-medium text-sm/g' src/app/\(marketing\)/layout.tsx
sed -i '' 's/text-\[9px\] font-bold uppercase tracking-\[0.3em\] text-white\/40/text-sm font-semibold text-foreground/g' src/app/\(marketing\)/layout.tsx
sed -i '' 's/text-xs text-muted-foreground\/60 hover:text-white transition-colors font-medium/text-sm text-muted-foreground hover:text-foreground transition-colors font-medium/g' src/app/\(marketing\)/layout.tsx
sed -i '' 's/text-\[10px\] text-muted-foreground\/20 font-bold uppercase tracking-widest/text-sm text-muted-foreground font-medium/g' src/app/\(marketing\)/layout.tsx

# Dashboard changes from Phase 4
sed -i '' 's/text-xl font-bold tracking-tight text-foreground whitespace-nowrap uppercase tracking-widest text-\[14px\]/text-lg font-semibold text-foreground whitespace-nowrap/g' src/ui/components/Dashboard.tsx
sed -i '' 's/text-\[10px\] font-bold uppercase tracking-widest border border-white\/10 hover:border-white\/20 data-\[state=active\]:border-primary\/50 data-\[state=active\]:bg-primary\/5/text-sm font-medium border border-transparent hover:bg-white\/5 data-[state=active]:bg-white\/10 data-[state=active]:text-foreground/g' src/ui/components/Dashboard.tsx
sed -i '' '/<span className="size-4 rounded-sm border border-current flex items-center justify-center text-\[8px\] mr-2 md:mr-2.5 opacity-30">[1-3]<\/span>/d' src/ui/components/Dashboard.tsx
sed -i '' 's/p-4 md:p-8 md:pt-4/p-8 md:p-12 md:pt-8/g' src/ui/components/Dashboard.tsx
