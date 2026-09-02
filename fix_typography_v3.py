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
        if 'font-bold' in new_classes:
            new_classes.remove('font-bold')
            new_classes.append('font-medium')
            
        new_classes.append('text-xs font-medium')
        
    seen = set()
    deduped = []
    for c in new_classes:
        if c not in seen:
            seen.add(c)
            deduped.append(c)
            
    return " ".join(deduped)

def replace_classes(match):
    prefix = match.group(1)
    class_str = match.group(2)
    suffix = match.group(3)
    cleaned = clean_class_string(class_str)
    return f"{prefix}{cleaned}{suffix}"

for file_path in set(files):
    if not os.path.isfile(file_path): continue
    with open(file_path, 'r') as f:
        content = f.read()
        
    new_content = re.sub(r'(className=")([^"]+)(")', replace_classes, content)
    
    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)

# Phase 2
for file_path in set(files):
    if not os.path.isfile(file_path): continue
    with open(file_path, 'r') as f:
        content = f.read()

    new_content = re.sub(r'text-\[\d+px\]', 'text-xs', content)
    new_content = re.sub(r'font-black', 'font-medium', new_content)
    new_content = re.sub(r'tracking-\[.*?\]', 'tracking-normal', new_content)
    new_content = re.sub(r'tracking-widest', 'tracking-normal', new_content)
    new_content = re.sub(r'uppercase', '', new_content)
    
    new_content = re.sub(r'text-xs[ \t]+font-bold', 'text-xs font-medium', new_content)
    new_content = re.sub(r'font-bold[ \t]+text-xs', 'text-xs font-medium', new_content)
    
    # Safe space cleanup
    new_content = re.sub(r'[ \t]{2,}', ' ', new_content)
    new_content = re.sub(r'className="[ \t]+', 'className="', new_content)
    new_content = re.sub(r'[ \t]+"', '"', new_content)
    
    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)

print("Done phase 3")
