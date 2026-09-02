import os
import re
import glob

paths = [
    'src/ui/components/**/*.tsx',
    'src/components/**/*.tsx',
    'src/app/(marketing)/**/*.tsx',
]

files = []
for p in paths:
    files.extend(glob.glob(p, recursive=True))

def clean_class_string(class_str):
    # Check if this class string contains the brutalist signature
    # (micro text, uppercase, tracking)
    
    classes = class_str.split()
    
    brutalist_markers = 0
    new_classes = []
    
    for c in classes:
        if re.match(r'text-\[?\d+px\]?', c) and c not in ['text-[14px]', 'text-[12px]']:
            brutalist_markers += 1
            continue
        if c in ['uppercase', 'font-black']:
            brutalist_markers += 1
            continue
        if c.startswith('tracking-') and c not in ['tracking-tight', 'tracking-normal', 'tracking-tighter']:
            brutalist_markers += 1
            continue
            
        new_classes.append(c)
    
    if brutalist_markers > 0:
        # It had brutalist classes, so let's inject a sane default if we removed the size
        # Let's add text-xs font-medium if we removed the text size
        # Actually, let's also downgrade font-bold to font-medium if it was part of a brutalist block
        if 'font-bold' in new_classes:
            new_classes.remove('font-bold')
            new_classes.append('font-medium')
            
        new_classes.append('text-xs font-medium')
        
    # Remove duplicates
    seen = set()
    deduped = []
    for c in new_classes:
        if c not in seen:
            seen.add(c)
            deduped.append(c)
            
    return " ".join(deduped)

def replace_classes(match):
    prefix = match.group(1) # className=" or className={`
    class_str = match.group(2)
    suffix = match.group(3)
    
    cleaned = clean_class_string(class_str)
    return f"{prefix}{cleaned}{suffix}"

for file_path in set(files):
    if not os.path.isfile(file_path): continue
    
    with open(file_path, 'r') as f:
        content = f.read()
        
    # Find all className="..." or className={`...`}
    # This regex is a bit simplistic, it might not catch complex template literals perfectly
    # but it's good enough for strings and simple template literals.
    
    # We will match className="<anything>"
    new_content = re.sub(r'(className=")([^"]+)(")', replace_classes, content)
    
    # We will match className={`<anything>`} 
    # Actually className={`...`} can contain variables, e.g. ${isActive ? 'foo' : 'bar'}
    # It's better to just regex replace the specific tokens globally in the file instead!
    
    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Updated {file_path}")

print("Done phase 1")

# Second pass for template literals className={`...`}
# Replace text-[9px] etc with text-xs
for file_path in set(files):
    if not os.path.isfile(file_path): continue
    with open(file_path, 'r') as f:
        content = f.read()

    new_content = re.sub(r'text-\[\d+px\]', 'text-xs', content)
    new_content = re.sub(r'font-black', 'font-medium', new_content)
    new_content = re.sub(r'tracking-\[.*?\]', 'tracking-normal', new_content)
    new_content = re.sub(r'tracking-widest', 'tracking-normal', new_content)
    new_content = re.sub(r'uppercase', '', new_content)
    
    # We still have `font-bold` inside some `text-xs` which we want to turn to `font-medium`
    # Let's replace `text-xs font-bold` with `text-xs font-medium`
    new_content = re.sub(r'text-xs\s+font-bold', 'text-xs font-medium', new_content)
    new_content = re.sub(r'font-bold\s+text-xs', 'text-xs font-medium', new_content)
    
    # Clean up multiple spaces
    new_content = re.sub(r'\s{2,}', ' ', new_content)
    new_content = re.sub(r'className="\s+', 'className="', new_content)
    new_content = re.sub(r'\s+"', '"', new_content)
    
    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Updated pass 2: {file_path}")

print("Done phase 2")
