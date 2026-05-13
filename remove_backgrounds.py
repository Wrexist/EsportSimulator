"""
Background Removal Script for Tournament Assets
Uses rembg to remove backgrounds and create true PNG transparency
"""
import os
from pathlib import Path
from rembg import remove
from PIL import Image
import io

# Define images to process
IMAGES_TO_PROCESS = [
    "public/assets/weapons/weapon_aug.png",
    "public/assets/weapons/weapon_famas.png",
    "public/assets/weapons/weapon_fiveseven.png",
    "public/assets/weapons/weapon_galil.png",
    "public/assets/weapons/weapon_glock.png",
    "public/assets/weapons/weapon_m4a1s.png",
    "public/assets/weapons/weapon_mac10.png",
    "public/assets/weapons/weapon_mag7.png",
    "public/assets/weapons/weapon_mp7.png",
    "public/assets/weapons/weapon_mp9.png",
    "public/assets/weapons/weapon_p250.png",
    "public/assets/weapons/weapon_p90.png",
    "public/assets/weapons/weapon_usp.png",
    "public/assets/weapons/weapon_xm1014.png",
]

def remove_background(input_path: str) -> bool:
    """Remove background from image and save with transparency"""
    try:
        path = Path(input_path)
        if not path.exists():
            print(f"  ⚠️  File not found: {input_path}")
            return False
            
        # Read input image
        with open(path, 'rb') as f:
            input_data = f.read()
        
        # Remove background
        output_data = remove(input_data)
        
        # Save with transparency
        img = Image.open(io.BytesIO(output_data))
        img = img.convert("RGBA")
        img.save(path, "PNG")
        
        print(f"  ✅ {path.name}")
        return True
        
    except Exception as e:
        print(f"  ❌ Error processing {input_path}: {e}")
        return False

def main():
    print("=" * 50)
    print("Background Removal - Tournament Assets")
    print("=" * 50)
    
    base_dir = Path(__file__).parent
    success_count = 0
    
    for img_path in IMAGES_TO_PROCESS:
        full_path = base_dir / img_path
        if remove_background(str(full_path)):
            success_count += 1
    
    print("=" * 50)
    print(f"Processed {success_count}/{len(IMAGES_TO_PROCESS)} images")
    print("=" * 50)

if __name__ == "__main__":
    main()
