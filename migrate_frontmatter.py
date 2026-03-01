import os
import re

def migrate_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.splitlines()
    has_frontmatter = content.startswith('---')
    title = None
    new_lines = []
    
    if has_frontmatter:
        # Check if title exists in frontmatter
        frontmatter_end_idx = -1
        for i in range(1, len(lines)):
            if lines[i].strip() == '---':
                frontmatter_end_idx = i
                break
        
        if frontmatter_end_idx > 0:
            frontmatter_lines = lines[1:frontmatter_end_idx]
            for line in frontmatter_lines:
                if line.strip().startswith('title:'):
                    print(f"Skipping {filepath}: Title already in frontmatter")
                    return

            # No title in frontmatter, look for h1 after frontmatter
            body_start_idx = frontmatter_end_idx + 1
            for i in range(body_start_idx, len(lines)):
                line = lines[i]
                if line.startswith('# '):
                    title = line[2:].strip()
                    # Remove the h1 line
                    # We reconstruct the file: frontmatter + title + body (minus h1)
                    new_frontmatter = lines[0:frontmatter_end_idx]
                    new_frontmatter.append(f'title: {title}')
                    new_frontmatter.append('---')
                    new_lines = new_frontmatter + lines[frontmatter_end_idx+1:i] + lines[i+1:]
                    break
            
            if not title:
                print(f"Warning {filepath}: No h1 found after frontmatter, and no title in frontmatter")
                return

    else:
        # No frontmatter, look for h1
        for i, line in enumerate(lines):
            if line.startswith('# '):
                title = line[2:].strip()
                # Create frontmatter
                new_lines = ['---', f'title: {title}', '---', ''] + lines[:i] + lines[i+1:]
                break
        
        if not title:
            print(f"Warning {filepath}: No h1 found and no frontmatter")
            # Maybe use filename?
            return

    if new_lines:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines) + '\n')
        print(f"Migrated {filepath}: Added title '{title}'")

def main():
    root_dir = 'src/content/docs'
    for dirpath, dirnames, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.endswith('.md') or filename.endswith('.mdx'):
                migrate_file(os.path.join(dirpath, filename))

if __name__ == "__main__":
    main()
