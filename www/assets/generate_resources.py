# ═══════════════════════════════════════════════════════════════
# CineVerse: Conversor de imágenes para iconos de Capacitor (Pillow)
# Ubicación: /assets/generate_resources.py
# ═══════════════════════════════════════════════════════════════

import os
from PIL import Image

assets_dir = '/home/lorenzobuten/Documentos/CineVerse/assets'
img_path = os.path.join(assets_dir, 'cineverse.jpeg')

if not os.path.exists(img_path):
    # Fallback al directorio img
    img_path = '/home/lorenzobuten/Documentos/CineVerse/img/cineverse.jpeg'

if not os.path.exists(img_path):
    print("Error: No se encontró cineverse.jpeg en assets/ ni en img/.")
    exit(1)

print(f"Cargando imagen original desde: {img_path}")
logo = Image.open(img_path)

# Asegurar que esté en formato RGB para redimensionar
if logo.mode != 'RGB':
    logo = logo.convert('RGB')

# 1. Crear icon.png e icon-only.png (1024x1024)
icon = logo.resize((1024, 1024), Image.Resampling.LANCZOS)
icon.save(os.path.join(assets_dir, 'icon.png'), 'PNG')
icon.save(os.path.join(assets_dir, 'icon-only.png'), 'PNG')
print("✓ Creados icon.png e icon-only.png (1024x1024)")

# 2. Crear icon-background.png (1024x1024, fondo oscuro uniforme #111111)
bg = Image.new('RGB', (1024, 1024), color='#111111')
bg.save(os.path.join(assets_dir, 'icon-background.png'), 'PNG')
print("✓ Creado icon-background.png (1024x1024)")

# 3. Crear icon-foreground.png (1024x1024, logo centrado con fondo transparente)
# Creamos un lienzo transparente
fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
# Logo con esquinas no redondeadas de 600x600
logo_resized = logo.resize((600, 600), Image.Resampling.LANCZOS)
# Pegar centrado: (1024 - 600) / 2 = 212
fg.paste(logo_resized, (212, 212))
fg.save(os.path.join(assets_dir, 'icon-foreground.png'), 'PNG')
print("✓ Creado icon-foreground.png (1024x1024)")

# 4. Crear splash.png y splash-dark.png (2732x2732, fondo oscuro con logo centrado de 512x512)
splash = Image.new('RGB', (2732, 2732), color='#111111')
logo_splash = logo.resize((512, 512), Image.Resampling.LANCZOS)
# Pegar centrado: (2732 - 512) / 2 = 1110
splash.paste(logo_splash, (1110, 1110))
splash.save(os.path.join(assets_dir, 'splash.png'), 'PNG')
splash.save(os.path.join(assets_dir, 'splash-dark.png'), 'PNG')
print("✓ Creados splash.png y splash-dark.png (2732x2732)")

print("¡Todas las imágenes base de origen listas para generar recursos native!")
