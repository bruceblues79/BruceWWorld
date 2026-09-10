# 从既有 GB2312 子集 woff 母体（public/assets/fonts/panel_comm_font.woff，
# Noto Sans SC 子集，见 cjk-font-subset 流程），产出 uikit(MSDF) 用的按需子集 TTF。
#
# 用法：venv 内有 fonttools 后执行
#   C:/Users/bruce/.workbuddy/binaries/python/envs/default/Scripts/python.exe scripts/generate-uikit-ttf.py
# 加字：把新字加进 CHARSET 重跑，随后再跑 generate-uikit-msdf.mjs。
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/assets/fonts/panel_comm_font.woff"
OUT = ROOT / "public/assets/fonts/uikit_cn.ttf"

# 「点击打开」 + ASCII 0x20..0x7E + 全角空格与常用全角标点
CHARS = "点击打开"
CHARS += "".join(chr(c) for c in range(0x20, 0x7F))
CHARS += "\u3000，。！？：；（）《》“”‘’…—·、"
CHARS = "".join(dict.fromkeys(CHARS))


def main() -> None:
    opts = subset.Options()
    opts.flavor = None  # 输出 TrueType (.ttf)
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.recalc_bounds = True

    font = subset.load_font(str(SRC), opts)
    ss = subset.Subsetter(options=opts)
    ss.populate(text=CHARS)
    ss.subset(font)
    subset.save_font(font, str(OUT), opts)

    # 验证：cmap 里必须含目标文案
    from fontTools.ttLib import TTFont

    cmap = TTFont(str(OUT)).getBestCmap()
    missing = [ch for ch in "点击打开" if ord(ch) not in cmap]
    print(f"chars={len(CHARS)} missing={missing or 'none'}")
    print(f"OK -> {OUT}")


if __name__ == "__main__":
    main()
