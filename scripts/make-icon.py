from PIL import Image, ImageDraw

S = 1024
MARGIN = 64                      # macOS 图标留白
RADIUS = 200
ACCENT_TOP = (183, 78, 20)
ACCENT_BOTTOM = (128, 53, 8)
CREAM = (255, 247, 237)
KEY = (167, 68, 16)

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

# 背景渐变
grad = Image.new('RGB', (S, S))
gd = ImageDraw.Draw(grad)
for y in range(S):
    t = y / (S - 1)
    gd.line([(0, y), (S, y)], fill=tuple(
        round(ACCENT_TOP[i] + (ACCENT_BOTTOM[i] - ACCENT_TOP[i]) * t) for i in range(3)))

# 圆角遮罩
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    [MARGIN, MARGIN, S - MARGIN, S - MARGIN], radius=RADIUS, fill=255)
img.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(img)

# 键盘外壳
body = [196, 330, 828, 694]
d.rounded_rectangle(body, radius=64, fill=CREAM)

# 键位布局：前三排 7 键，末排 2 + 空格 + 2
left, right = 244, 780
top, bottom = 382, 646
gap = 14
rows = 4
key_h = (bottom - top - gap * (rows - 1)) / rows

def key_box(x, y, w, h):
    d.rounded_rectangle([x, y, x + w, y + h], radius=12, fill=KEY)

for r in range(3):
    y = top + r * (key_h + gap)
    key_w = (right - left - gap * 6) / 7
    for c in range(7):
        key_box(left + c * (key_w + gap), y, key_w, key_h)

y = top + 3 * (key_h + gap)
# 末排：左右各两键，中间空格；侧键取与上排同宽，空格吸收余量，避免出现细缝
side_w = key_w
space_w = (right - left) - 4 * side_w - 4 * gap
for i in range(2):
    key_box(left + i * (side_w + gap), y, side_w, key_h)
space_x = left + 2 * (side_w + gap)
key_box(space_x, y, space_w, key_h)
for i in range(2):
    key_box(space_x + space_w + gap + i * (side_w + gap), y, side_w, key_h)

img.save('build/icon.png')
print('icon.png', img.size)