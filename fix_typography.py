import os
import re
import glob

# Paths to modify
paths = [
    'src/ui/components/**/*.tsx',
    'src/components/**/*.tsx',
    'src/app/(marketing)/**/*.tsx',
]

files = []
for p in paths:
    files.extend(glob.glob(p, recursive=True))

patterns_to_remove = [
    r'text-\[8px\]',
    r'text-\[9px\]',
    r'text-\[10px\]',
    r'text-\[11px\]',
    r'text-\[12px\]',
    r'tracking-widest',
    r'tracking-\[0\.[2-4]em\]',
    r'tracking-\[0\.25em\]',
    r'tracking-wider',
    r'tracking-tight',
    r'tracking-tighter',
    r'uppercase',
    r'font-black',
    r'font-bold'
]

# Create a master regex pattern
# We want to match any of these tokens, surrounded by spaces or quotes/backticks
token_pattern = r'(?<!-)\b(?:' + '|'.join(patterns_to_remove) + r')\b'

def replace_classes(content):
    def replacer(match):
        return ''
    
    # We apply the token pattern
    # It might leave multiple spaces, so we'll clean them up later
    new_content = re.sub(token_pattern, '', content)
    
    # After removing, we might have lost some text sizes and weights, so we can optionally 
    # find elements that have no text- size and add text-sm, but that's complex.
    # Actually, just removing them might leave them default size. Let's just replace them 
    # with `text-sm font-medium` if they were tiny.
    return new_content

def replace_tiny_text(match):
    classes = match.group(1).split()
    new_classes = []
    has_tiny = False
    for c in classes:
        if re.match(r'^text-\[?\d+px\]?$', c) or c in ['text-xs', 'text-sm', 'uppercase', 'font-black', 'font-bold'] or c.startswith('tracking-'):
            has_tiny = True
        else:
            new_classes.append(c)
    
    if has_tiny:
        new_classes.append('text-sm font-medium')
        
    return 'className="' + ' '.join(new_classes) + '"'

for file_path in set(files):
    if not os.path.isfile(file_path): continue
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Let's do a smart regex replacement on className="..." and className={`...`}
    # Actually, it's easier to just do a global replace of the specific tokens and then replace `  +` with ` `
    
    new_content = content
    for pattern in patterns_to_remove:
        # replace the class if it has space before/after or quote
        new_content = re.sub(r'(?<=[\s"\'`])' + pattern + r'(?=[\s"\'`])', '', new_content)
    
    # Then replace text-[9px] and font-bold etc with text-sm
    # But wait, some places might already have text-sm.
    # It's safer to just replace them to text-sm and font-medium, or text-xs
    
    # Clean up double spaces in classNames
    new_content = re.sub(r'className=(["\'`])\s+', r'className=\1', new_content)
    new_content = re.sub(r'\s+(["\'`])', r'\1', new_content)
    new_content = re.sub(r'\s{2,}', ' ', new_content)
    
    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Updated {file_path}")

print("Done")
