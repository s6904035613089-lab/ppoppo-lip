# -*- coding: utf-8 -*-
"""
gen_images.py — สร้างรูปสินค้า SVG ตั้งต้นให้แบรนด์ ppoppo
รันด้วย: python3 tools/gen_images.py
ผลลัพธ์ไปอยู่ที่ assets/images/products/
"""
import os, colorsys

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "images", "products")
os.makedirs(OUT, exist_ok=True)


def shade(hex_color, factor):
    """ปรับความสว่างของสี factor>1 สว่างขึ้น, <1 เข้มลง"""
    hex_color = hex_color.lstrip("#")
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = max(0.0, min(1.0, l * factor))
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255))


# ---------------------------------------------------------------- ชิ้นส่วนร่วม
def backdrop(bg1, bg2):
    return f"""
  <rect width="600" height="600" fill="url(#bgGrad)"/>
  <circle cx="300" cy="300" r="215" fill="{bg2}" opacity=".55"/>
  <circle cx="300" cy="300" r="168" fill="#ffffff" opacity=".45"/>
  <circle cx="126" cy="120" r="16" fill="#ffffff" opacity=".7"/>
  <circle cx="480" cy="150" r="9"  fill="#ffffff" opacity=".8"/>
  <circle cx="452" cy="470" r="13" fill="#ffffff" opacity=".6"/>
  <circle cx="140" cy="452" r="7"  fill="#ffffff" opacity=".8"/>"""


def defs(color, bg1, bg2):
    return f"""
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{bg1}"/><stop offset="100%" stop-color="{bg2}"/>
    </linearGradient>
    <linearGradient id="lipGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="{shade(color, .78)}"/>
      <stop offset="42%"  stop-color="{color}"/>
      <stop offset="62%"  stop-color="{shade(color, 1.22)}"/>
      <stop offset="100%" stop-color="{shade(color, .86)}"/>
    </linearGradient>
    <linearGradient id="tubeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#d8d2cd"/>
      <stop offset="18%"  stop-color="#ffffff"/>
      <stop offset="50%"  stop-color="#f7f3ef"/>
      <stop offset="78%"  stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#cfc8c2"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#c9974d"/>
      <stop offset="30%"  stop-color="#f6dfae"/>
      <stop offset="55%"  stop-color="#e3b871"/>
      <stop offset="100%" stop-color="#b8853c"/>
    </linearGradient>
    <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="{shade(color, 1.35)}" stop-opacity=".92"/>
      <stop offset="100%" stop-color="{shade(color, .82)}"  stop-opacity=".95"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="{shade(color, .6)}" flood-opacity=".28"/>
    </filter>
  </defs>"""


# ------------------------------------------------------------------- ทรงสินค้า
def body_tint(color):
    """ลิปทินท์ทรงสลิม ฝาใส"""
    return f"""
  <g filter="url(#soft)">
    <rect x="252" y="196" width="96" height="230" rx="16" fill="url(#tubeGrad)"/>
    <rect x="252" y="196" width="96" height="230" rx="16" fill="none" stroke="#e6ded7" stroke-width="2"/>
    <rect x="252" y="330" width="96" height="96"  rx="16" fill="url(#lipGrad)" opacity=".92"/>
    <rect x="252" y="330" width="96" height="14" fill="{shade(color, .7)}" opacity=".35"/>
    <rect x="266" y="212" width="14" height="196" rx="7" fill="#ffffff" opacity=".55"/>
    <rect x="262" y="150" width="76" height="58" rx="14" fill="url(#glassGrad)"/>
    <rect x="262" y="150" width="76" height="58" rx="14" fill="none" stroke="#ffffff" stroke-width="3" opacity=".65"/>
    <rect x="272" y="160" width="10" height="38" rx="5" fill="#ffffff" opacity=".6"/>
    <rect x="256" y="204" width="88" height="10" rx="5" fill="url(#goldGrad)"/>
  </g>"""


def body_bullet(color):
    """ลิปสติกแท่งคลาสสิก เปิดฝาโชว์เนื้อสี"""
    return f"""
  <g filter="url(#soft)">
    <path d="M266 168 Q300 150 336 176 L334 250 L268 250 Z" fill="url(#lipGrad)"/>
    <path d="M266 168 Q300 150 336 176 L322 182 Q296 164 272 180 Z" fill="{shade(color, 1.34)}"/>
    <path d="M268 178 L288 172 L286 250 L268 250 Z" fill="#ffffff" opacity=".16"/>
    <rect x="258" y="248" width="84" height="26" rx="6" fill="url(#goldGrad)"/>
    <rect x="252" y="272" width="96" height="164" rx="14" fill="url(#tubeGrad)"/>
    <rect x="252" y="272" width="96" height="164" rx="14" fill="none" stroke="#e6ded7" stroke-width="2"/>
    <rect x="266" y="288" width="14" height="132" rx="7" fill="#ffffff" opacity=".55"/>
    <rect x="252" y="400" width="96" height="36" rx="14" fill="url(#goldGrad)" opacity=".9"/>
  </g>"""


def body_gloss(color):
    """ลิปกลอสขวดอ้วน ฝาโดม"""
    return f"""
  <g filter="url(#soft)">
    <path d="M256 250 h88 a18 18 0 0 1 18 18 v138 a22 22 0 0 1 -22 22 h-80 a22 22 0 0 1 -22 -22 v-138 a18 18 0 0 1 18 -18 z"
          fill="url(#glassGrad)"/>
    <path d="M256 250 h88 a18 18 0 0 1 18 18 v138 a22 22 0 0 1 -22 22 h-80 a22 22 0 0 1 -22 -22 v-138 a18 18 0 0 1 18 -18 z"
          fill="none" stroke="#ffffff" stroke-width="3" opacity=".6"/>
    <rect x="268" y="266" width="16" height="128" rx="8" fill="#ffffff" opacity=".5"/>
    <rect x="316" y="278" width="8" height="60" rx="4" fill="#ffffff" opacity=".35"/>
    <rect x="270" y="188" width="60" height="66" rx="12" fill="url(#tubeGrad)"/>
    <path d="M270 200 a30 30 0 0 1 60 0 v-4 a30 30 0 0 0 -60 0 z" fill="#ffffff" opacity=".7"/>
    <rect x="266" y="242" width="68" height="12" rx="6" fill="url(#goldGrad)"/>
  </g>"""


def body_balm(color):
    """ลิปบาล์มแท่งอ้วนน่ารัก"""
    return f"""
  <g filter="url(#soft)">
    <path d="M268 186 h64 v52 h-64 z" fill="url(#lipGrad)"/>
    <path d="M268 186 q32 -20 64 0 v6 q-32 -18 -64 0 z" fill="{shade(color, 1.32)}"/>
    <rect x="262" y="236" width="76" height="18" rx="8" fill="url(#goldGrad)"/>
    <rect x="248" y="252" width="104" height="182" rx="26" fill="url(#tubeGrad)"/>
    <rect x="248" y="252" width="104" height="182" rx="26" fill="none" stroke="#e6ded7" stroke-width="2"/>
    <rect x="264" y="270" width="16" height="146" rx="8" fill="#ffffff" opacity=".55"/>
    <circle cx="300" cy="344" r="30" fill="{color}" opacity=".2"/>
    <path d="M300 358 c-16 -12 -24 -20 -24 -30 a12 12 0 0 1 24 -6 a12 12 0 0 1 24 6 c0 10 -8 18 -24 30 z"
          fill="{color}" opacity=".85"/>
  </g>"""


SHAPES = {"tint": body_tint, "bullet": body_bullet, "gloss": body_gloss, "balm": body_balm}


def label(no, name):
    return f"""
  <g>
    <rect x="196" y="486" width="208" height="60" rx="30" fill="#ffffff" opacity=".92"/>
    <text x="300" y="510" text-anchor="middle" font-family="'Trebuchet MS',sans-serif"
          font-size="17" font-weight="700" fill="#8a6b74" letter-spacing="3">{no}</text>
    <text x="300" y="533" text-anchor="middle" font-family="'Trebuchet MS',sans-serif"
          font-size="17" font-weight="700" fill="#3f2e34">{name}</text>
  </g>"""


def make(code, name, color, shape, bg1, bg2):
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600" role="img" aria-label="{name}">
  <title>ppoppo {code} {name}</title>{defs(color, bg1, bg2)}{backdrop(bg1, bg2)}{SHAPES[shape](color)}{label(code, name)}
</svg>
"""
    path = os.path.join(OUT, f"{code.lower()}-{name.lower().replace(' ', '-')}.svg")
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)
    return os.path.basename(path)


PRODUCTS = [
    ("P01", "Peach Ppoppo",    "#F79A7E", "tint",   "#FFF3EC", "#FFD9C7"),
    ("P02", "Strawberry Milk", "#F2879C", "tint",   "#FFF0F4", "#FFD3DE"),
    ("P03", "Cherry Coke",     "#B23A48", "bullet", "#FBEDEE", "#F0C7CB"),
    ("P04", "Mandarin Pop",    "#F4703A", "tint",   "#FFF2E8", "#FFD2B4"),
    ("P05", "Rose Latte",      "#C08574", "bullet", "#FAF1EC", "#EBD2C6"),
    ("P06", "Grape Jelly",     "#8E5B87", "gloss",  "#F6EFF7", "#DCC6E2"),
    ("P07", "Coral Sunset",    "#F2705F", "gloss",  "#FFF0EE", "#FFCFC7"),
    ("P08", "Red Velvet",      "#C2213A", "bullet", "#FCECEF", "#F3C3CC"),
    ("P09", "Cotton Candy",    "#F6A8C6", "balm",   "#FFF2F7", "#FFD6E7"),
    ("P10", "Honey Nude",      "#CE9A6E", "balm",   "#FDF4EA", "#F0DAC1"),
    ("P11", "Watermelon Fizz", "#EE5372", "gloss",  "#FFEFF2", "#FFC9D4"),
    ("P12", "Choco Mousse",    "#8A5A44", "bullet", "#F7EFEA", "#E3CDBE"),
]

if __name__ == "__main__":
    for p in PRODUCTS:
        print("created:", make(*p))
    print(f"\nรวม {len(PRODUCTS)} ไฟล์ ที่ {os.path.abspath(OUT)}")
